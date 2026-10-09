from datetime import datetime, timedelta, timezone
from itertools import count
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from test_team_workspaces import client, setup

from app.core.config import get_settings
from app.main import app
from app.models.user import User


@pytest.fixture(autouse=True)
def delivery(monkeypatch):
    """No test in this module can send real email, even if credentials exist locally."""
    from app.services import email_otp

    sent = []
    monkeypatch.setattr(email_otp, "send_login_code", lambda email, code, settings: sent.append((email, code)))
    generated = count(120000)
    monkeypatch.setattr(email_otp.secrets, "randbelow", lambda bound: next(generated) % bound)
    return sent


def use_otp(monkeypatch):
    from app.services import email_otp

    monkeypatch.setattr(get_settings(), "auth_mode", "otp")
    clock = SimpleNamespace(now=datetime(2026, 10, 10, 10, 0, tzinfo=timezone.utc))
    monkeypatch.setattr(email_otp, "utc_now", lambda: clock.now)
    return clock


@pytest.fixture()
def otp(client, monkeypatch, delivery):
    return SimpleNamespace(client=client, clock=use_otp(monkeypatch), sent=delivery)


def request_code(client, email):
    return client.post("/auth/request-code", json={"email": email})


def verify_code(client, email, code):
    return client.post("/auth/verify-code", json={"email": email, "code": code})


def test_email_otp_only_creates_a_normalized_account_after_valid_verification(otp, caplog):
    from app.models.auth import OTPChallenge

    client, sent = otp.client, otp.sent
    assert client.get("/auth/config").json()["method"] == "email_otp"
    response = request_code(client, " New.Person@Example.COM ")
    assert response.status_code == 200, response.text
    assert set(response.json()) == {"message", "expires_in", "resend_after"}
    assert response.json()["expires_in"] == 600
    assert response.json()["resend_after"] == 60
    assert len(sent) == 1
    email, code = sent[0]
    assert email == "new.person@example.com"
    assert len(code) == 6 and code.isdigit()
    assert code not in response.text
    with client.session_factory() as db:
        assert list(db.scalars(select(User))) == []
        challenge = db.get(OTPChallenge, email)
        assert challenge is not None
        assert challenge.code_hash != code
        assert not any(str(value) == code for value in vars(challenge).values())
    response = verify_code(client, "NEW.Person@EXAMPLE.com", code)
    assert response.status_code == 200, response.text
    assert response.json()["token_type"] == "bearer"
    assert response.json()["access_token"]
    headers = {"Authorization": "Bearer " + response.json()["access_token"]}
    assert client.get("/me", headers=headers).json()["email"] == email
    assert client.get("/teams", headers=headers).json() == []
    assert client.get("/categories", headers=headers).json() == []
    assert client.get("/tasks", headers=headers).json() == []
    with client.session_factory() as db:
        assert len(list(db.scalars(select(User)))) == 1
    assert code not in caplog.text
    assert verify_code(client, email, code).status_code == 400


def test_email_otp_reuses_existing_account_memberships_and_personal_work(client, setup, monkeypatch, delivery):
    admin, member, outsider, team = setup
    user_id = client.get("/me", headers=admin).json()["id"]
    folder = client.post("/categories", headers=admin, json={"name": "Keep my work"}).json()
    task_list = client.post("/subbranches", headers=admin, json={"name": "This week", "category_id": folder["id"]}).json()
    task = client.post("/tasks", headers=admin, json={"title": "Existing personal task", "category_id": folder["id"], "subbranch_id": task_list["id"]}).json()
    with client.session_factory() as db:
        original_hash = db.get(User, user_id).hashed_password
    use_otp(monkeypatch)
    existing = request_code(client, "ADMIN@example.com")
    new = request_code(client, "not-registered@example.com")
    assert existing.status_code == new.status_code == 200
    assert existing.json() == new.json()
    code = next(code for email, code in delivery if email == "admin@example.com")
    response = verify_code(client, "Admin@Example.COM", code)
    assert response.status_code == 200, response.text
    signed_in = {"Authorization": "Bearer " + response.json()["access_token"]}
    assert client.get("/me", headers=signed_in).json()["id"] == user_id
    assert {space["id"] for space in client.get("/teams", headers=signed_in).json()} == {team["id"]}
    assert client.get("/tasks", headers=signed_in).json()[0]["id"] == task["id"]
    assert client.get(f"/teams/{team['id']}/workspace", headers=signed_in).json()["team"]["owner_id"] == user_id
    with client.session_factory() as db:
        assert db.get(User, user_id).hashed_password == original_hash
        assert len(list(db.scalars(select(User)))) == 3


def test_expired_codes_and_unissued_codes_do_not_create_accounts(otp):
    client = otp.client
    email = "expired@example.com"
    assert verify_code(client, email, "123456").status_code == 400
    assert request_code(client, email).status_code == 200
    code = otp.sent[-1][1]
    otp.clock.now += timedelta(seconds=601)
    assert verify_code(client, email, code).status_code == 400
    with client.session_factory() as db:
        assert list(db.scalars(select(User))) == []


def test_resending_invalidates_old_codes_and_does_not_reset_failed_attempts(otp):
    client = otp.client
    email = "resend@example.com"
    assert request_code(client, email).status_code == 200
    first_code = otp.sent[-1][1]
    for _ in range(2):
        assert verify_code(client, email, "999999").status_code == 400
    too_soon = request_code(client, email)
    assert too_soon.status_code == 429
    assert int(too_soon.headers["Retry-After"]) > 0
    assert len(otp.sent) == 1
    otp.clock.now += timedelta(seconds=61)
    assert request_code(client, email).status_code == 200
    second_code = otp.sent[-1][1]
    assert first_code != second_code
    assert verify_code(client, email, first_code).status_code == 400
    assert verify_code(client, email, "999999").status_code == 400
    locked = verify_code(client, email, "999999")
    assert locked.status_code == 429
    assert int(locked.headers["Retry-After"]) > 0
    assert verify_code(client, email, second_code).status_code == 429
    otp.clock.now += timedelta(seconds=61)
    assert request_code(client, email).status_code == 429
    assert len(otp.sent) == 2
    with client.session_factory() as db:
        assert list(db.scalars(select(User))) == []
    otp.clock.now += timedelta(seconds=901)
    assert request_code(client, email).status_code == 200
    assert verify_code(client, email, otp.sent[-1][1]).status_code == 200


def test_send_limits_persist_in_database_across_requests_and_hourly_windows(otp):
    from app.models.auth import AuthRateLimit

    client, email = otp.client, "send-limits@example.com"
    for _ in range(5):
        assert request_code(client, email).status_code == 200
        otp.clock.now += timedelta(seconds=61)
    # A different HTTP client and DB session must not bypass accumulated limits.
    with TestClient(app) as another_client:
        assert request_code(another_client, email).status_code == 429
    daily_email = "daily-send-limits@example.com"
    for _ in range(3):
        for _ in range(5):
            assert request_code(client, daily_email).status_code == 200
            otp.clock.now += timedelta(seconds=61)
        otp.clock.now += timedelta(hours=1, seconds=1)
    assert len(otp.sent) == 20
    assert request_code(client, daily_email).status_code == 429
    with client.session_factory() as db:
        rows = list(db.scalars(select(AuthRateLimit)))
        assert rows
        assert any(row.count >= 15 for row in rows)
        assert all(email not in row.key for row in rows)
        assert list(db.scalars(select(User))) == []


def test_verify_limits_apply_even_when_no_code_was_issued(otp):
    client, email = otp.client, "guessing@example.com"
    for _ in range(30):
        assert verify_code(client, email, "123456").status_code == 400
    with TestClient(app) as another_client:
        limited = verify_code(another_client, email, "123456")
    assert limited.status_code == 429
    assert int(limited.headers["Retry-After"]) > 0
    assert otp.sent == []
    with client.session_factory() as db:
        assert list(db.scalars(select(User))) == []


def test_provider_failure_cannot_leave_a_usable_code_or_account(otp, monkeypatch, caplog):
    from app.services import email_otp

    attempts = []

    def unavailable(email, code, settings):
        attempts.append((email, code))
        raise email_otp.CodeDeliveryError("temporary provider outage")

    monkeypatch.setattr(email_otp, "send_login_code", unavailable)
    response = request_code(otp.client, "provider-failure@example.com")
    assert response.status_code == 503, response.text
    assert "access_token" not in response.json()
    assert len(attempts) == 1
    email, code = attempts[0]
    assert code not in response.text
    assert code not in caplog.text
    assert verify_code(otp.client, email, code).status_code == 400
    with otp.client.session_factory() as db:
        assert list(db.scalars(select(User))) == []


def test_authentication_modes_cannot_bypass_each_other(client, monkeypatch, delivery):
    assert client.get("/auth/config").json()["method"] == "password"
    assert request_code(client, "password-mode@example.com").status_code == 409
    assert verify_code(client, "password-mode@example.com", "123456").status_code == 409
    use_otp(monkeypatch)
    assert client.get("/auth/config").json()["method"] == "email_otp"
    credentials = {"email": "bypass@example.com", "password": "test-password-123"}
    assert client.post("/register", json=credentials).status_code == 409
    assert client.post("/login", json=credentials).status_code == 409
    assert delivery == []
    with client.session_factory() as db:
        assert list(db.scalars(select(User))) == []


def test_otp_payload_validation_happens_before_delivery_or_account_creation(otp):
    assert request_code(otp.client, "not-an-email").status_code == 422
    for code in ["12345", "1234567", "abcdef", 123456]:
        assert verify_code(otp.client, "valid@example.com", code).status_code == 422
    assert otp.sent == []
    with otp.client.session_factory() as db:
        assert list(db.scalars(select(User))) == []


@pytest.mark.parametrize("action", ["send", "verify"])
def test_ip_rate_limits_cannot_be_bypassed_with_forwarded_headers(otp, monkeypatch, action):
    from app.services import email_otp

    rules = dict(email_otp.RATE_LIMITS)
    rules[action] = tuple((scope, seconds, 2 if scope == "ip" and seconds == 3600 else limit) for scope, seconds, limit in rules[action])
    monkeypatch.setattr(email_otp, "RATE_LIMITS", rules)
    for index in range(3):
        endpoint = "/auth/request-code" if action == "send" else "/auth/verify-code"
        payload = {"email": f"ip-test-{index}@example.com"}
        if action == "verify":
            payload["code"] = "123456"
        response = otp.client.post(endpoint, json=payload, headers={"X-Forwarded-For": f"203.0.113.{index + 1}"})
        expected = 429 if index == 2 else 200 if action == "send" else 400
        assert response.status_code == expected, response.text
    assert len(otp.sent) == (2 if action == "send" else 0)


def test_cooldown_spam_does_not_consume_other_peoples_global_send_budget(otp, monkeypatch):
    monkeypatch.setattr(get_settings(), "otp_daily_send_limit", 2)
    assert request_code(otp.client, "cooldown@example.com").status_code == 200
    for _ in range(20):
        assert request_code(otp.client, "cooldown@example.com").status_code == 429
    assert request_code(otp.client, "another-person@example.com").status_code == 200
    assert len(otp.sent) == 2
    assert request_code(otp.client, "over-daily-budget@example.com").status_code == 429


def test_saturated_email_cannot_exhaust_other_peoples_global_send_budget(otp, monkeypatch):
    monkeypatch.setattr(get_settings(), "otp_daily_send_limit", 6)
    for _ in range(5):
        assert request_code(otp.client, "saturated@example.com").status_code == 200
        otp.clock.now += timedelta(seconds=61)
    for _ in range(20):
        assert request_code(otp.client, "saturated@example.com").status_code == 429
    assert request_code(otp.client, "unrelated-person@example.com").status_code == 200
    assert len(otp.sent) == 6


def test_verified_new_email_account_can_join_only_the_invited_space(client, setup, monkeypatch, delivery):
    owner, member, outsider, team = setup
    root = f"/teams/{team['id']}"
    task = client.post(root + "/issues", headers=owner, json={"title": "Work visible after joining"}).json()
    other = client.post("/teams", headers=owner, json={"name": "Private other space", "key": "PVT"}).json()
    preview = client.get(f"/teams/invites/{team['invite_code']}")
    assert preview.status_code == 200
    assert preview.json()["id"] == team["id"]
    use_otp(monkeypatch)
    email = "invited-new-member@example.com"
    assert request_code(client, email).status_code == 200
    response = verify_code(client, email, delivery[-1][1])
    assert response.status_code == 200, response.text
    invited = {"Authorization": "Bearer " + response.json()["access_token"]}
    assert client.get("/teams", headers=invited).json() == []
    assert client.get(root + "/workspace", headers=invited).status_code == 404
    joined = client.post("/teams/join", headers=invited, json={"code": team["invite_code"]})
    assert joined.status_code == 200, joined.text
    assert joined.json()["role"] == "member"
    assert joined.json()["invite_code"] is None
    assert [space["id"] for space in client.get("/teams", headers=invited).json()] == [team["id"]]
    workspace = client.get(root + "/workspace", headers=invited)
    assert workspace.status_code == 200
    assert workspace.json()["issues"][0]["id"] == task["id"]
    assert client.get(f"/teams/{other['id']}/workspace", headers=invited).status_code == 404
