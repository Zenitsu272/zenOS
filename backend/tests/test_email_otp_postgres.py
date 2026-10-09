"""Opt-in concurrency checks against a disposable PostgreSQL database.

Set ZENOS_TEST_POSTGRES_URL to a dedicated database whose name ends in _test.
Each test migrates a fresh, uniquely named schema and removes only that schema.
Email delivery is always mocked; these tests never contact an email provider.
"""
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Barrier, Event, Lock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

from test_team_workspaces import app

from app.core.config import get_settings
from app.db.session import get_db
from app.models.user import User


@pytest.fixture()
def postgres_otp(monkeypatch):
    raw_url = os.environ.get("ZENOS_TEST_POSTGRES_URL")
    if not raw_url:
        pytest.skip("Set ZENOS_TEST_POSTGRES_URL to run isolated PostgreSQL OTP races")
    url = make_url(raw_url)
    if not url.database or not url.database.endswith("_test"):
        pytest.fail("PostgreSQL OTP tests require a dedicated database ending in _test")
    schema = "zenos_otp_test_" + uuid4().hex
    administrator = create_engine(url)
    with administrator.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    scoped_url = url.update_query_dict({"options": f"-csearch_path={schema}"})
    engine = create_engine(scoped_url)
    factory = sessionmaker(bind=engine)
    try:
        backend = Path(__file__).resolve().parents[1]
        env = {**os.environ, "DATABASE_URL": scoped_url.render_as_string(hide_password=False), "ENVIRONMENT": "test", "AUTH_MODE": "password"}
        for args in [("upgrade", "head"), ("check",)]:
            result = subprocess.run([sys.executable, "-m", "alembic", *args], cwd=backend, env=env, capture_output=True, text=True)
            assert result.returncode == 0, result.stderr
        with engine.connect() as connection:
            assert connection.scalar(text("SELECT current_schema()")) == schema

        def override_db():
            with factory() as session:
                yield session

        from app.services import email_otp
        delivered = []
        mail_lock = Lock()

        def fake_sender(email, code, settings):
            with mail_lock:
                delivered.append((email, code))

        monkeypatch.setattr(email_otp, "send_login_code", fake_sender)
        monkeypatch.setattr(get_settings(), "auth_mode", "otp")
        app.dependency_overrides[get_db] = override_db
        with TestClient(app) as test_client:
            yield test_client, delivered, factory
    finally:
        app.dependency_overrides.clear()
        engine.dispose()
        with administrator.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        administrator.dispose()


def together(action):
    ready = Barrier(2)

    def run():
        ready.wait(timeout=10)
        return action()

    with ThreadPoolExecutor(max_workers=2) as workers:
        return list(workers.map(lambda _: run(), range(2)))


def test_postgres_parallel_first_requests_send_only_one_code(postgres_otp):
    client, delivered, factory = postgres_otp
    responses = together(lambda: client.post("/auth/request-code", json={"email": "concurrent-send@example.com"}))
    assert sorted(response.status_code for response in responses) == [200, 429]
    assert len(delivered) == 1
    with factory() as session:
        assert list(session.scalars(select(User))) == []


def test_postgres_one_code_cannot_be_verified_twice_concurrently(postgres_otp):
    client, delivered, factory = postgres_otp
    email = "concurrent-verify@example.com"
    assert client.post("/auth/request-code", json={"email": email}).status_code == 200
    code = delivered[0][1]
    responses = together(lambda: client.post("/auth/verify-code", json={"email": email, "code": code}))
    assert sorted(response.status_code for response in responses) == [200, 400]
    assert sum("access_token" in response.json() for response in responses) == 1
    with factory() as session:
        users = list(session.scalars(select(User).where(User.email == email)))
        assert len(users) == 1


def test_postgres_cleanup_does_not_delete_a_code_refreshed_while_waiting_for_its_lock(postgres_otp):
    from app.models.auth import OTPChallenge
    from app.services import email_otp

    client, delivered, factory = postgres_otp
    now = datetime.now(timezone.utc)
    email = "cleanup-race@example.com"
    with factory() as db:
        db.add(OTPChallenge(email=email, nonce="old-nonce", code_hash="old-digest", failed_attempts=0, updated_at=now - timedelta(days=2)))
        db.commit()

    cleaner_ready = Event()
    cleaner_pid = []

    def clean():
        with factory() as db:
            cleaner_pid.append(db.scalar(text("SELECT pg_backend_pid()")))
            cleaner_ready.set()
            email_otp._prune_expired(db, now)
            db.commit()

    with ThreadPoolExecutor(max_workers=1) as workers:
        with factory() as writer:
            challenge = writer.scalar(select(OTPChallenge).where(OTPChallenge.email == email).with_for_update())
            challenge.nonce = "fresh-nonce"
            challenge.code_hash = "fresh-digest"
            challenge.updated_at = now
            writer.flush()
            cleanup = workers.submit(clean)
            assert cleaner_ready.wait(timeout=5)
            try:
                # Observe the exact blocking condition instead of hoping two threads overlap.
                waiting = False
                deadline = time.monotonic() + 5
                while time.monotonic() < deadline:
                    with factory() as observer:
                        waiting = observer.scalar(text("SELECT wait_event_type='Lock' FROM pg_stat_activity WHERE pid=:pid"), {"pid": cleaner_pid[0]})
                    if waiting:
                        break
                    time.sleep(0.02)
                assert waiting, "Cleanup must reach the row lock before the writer commits"
                writer.commit()
            except BaseException:
                writer.rollback()
                raise
            cleanup.result(timeout=10)
    with factory() as db:
        kept = db.get(OTPChallenge, email)
        assert kept is not None
        assert kept.nonce == "fresh-nonce"
        assert kept.code_hash == "fresh-digest"
        assert kept.updated_at == now
