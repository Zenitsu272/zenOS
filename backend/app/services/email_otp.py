"""Email possession checks with database-backed, cross-worker abuse protection."""
import hashlib
import hmac
import json
import math
import secrets
import ssl
from http.client import HTTPException as ProviderHTTPError
from datetime import datetime, timedelta, timezone
from urllib.error import URLError
from urllib.request import HTTPRedirectHandler, HTTPSHandler, Request, build_opener

from fastapi import HTTPException
from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.core.security import get_password_hash
from app.models.auth import AuthRateLimit, OTPChallenge
from app.models.user import User


CODE_LIFETIME_SECONDS = 600
RESEND_SECONDS = 60
MAX_FAILED_ATTEMPTS = 5
LOCK_SECONDS = 900

# Each rule is (scope, fixed UTC window in seconds, maximum attempts).
# Sends reserve all quotas atomically only after cooldown checks. Verification
# attempts consume quota even when the code is wrong, expired, or already used.
# Peer-IP limits are intentionally generous for hosting behind shared proxies.
RATE_LIMITS = {
    "send": (
        ("email", 3600, 5), ("email", 86400, 15),
        ("ip", 3600, 200), ("ip", 86400, 1000),
        ("global", 3600, 500),
    ),
    "verify": (
        ("email", 3600, 30), ("email", 86400, 100),
        ("ip", 3600, 1000), ("ip", 86400, 5000),
        ("global", 3600, 3000), ("global", 86400, 15000),
    ),
}


class CodeDeliveryError(Exception):
    """Delivery failed; provider response bodies must never reach users or logs."""


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Never forward the API key to a redirect destination.
        return None


def utc_now():
    return datetime.now(timezone.utc)


def _utc(value):
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _hmac(settings, value):
    return hmac.new(settings.secret_key.encode(), value.encode(), hashlib.sha256).hexdigest()


def _code_hash(settings, email, nonce, code):
    return _hmac(settings, f"zenos-email-otp\0{email}\0{nonce}\0{code}")


def _insert(db, model):
    dialect = db.get_bind().dialect.name
    if dialect == "postgresql":
        return pg_insert(model)
    if dialect == "sqlite":
        return sqlite_insert(model)
    raise RuntimeError("Email sign-in requires PostgreSQL or SQLite")


def _reject(db, status_code, detail, retry_after=None):
    # Persist counters and failed guesses even when the HTTP request is rejected.
    db.commit()
    headers = {"Retry-After": str(max(1, math.ceil(retry_after)))} if retry_after is not None else None
    raise HTTPException(status_code, detail, headers=headers)


def _reserve_rates(db, settings, action, email, peer_ip, now):
    rules = list(RATE_LIMITS[action])
    if action == "send":
        rules.append(("global", 86400, settings.otp_daily_send_limit))
    buckets = []
    identities = {"email": email, "ip": peer_ip, "global": "all"}
    for scope, seconds, limit in rules:
        start = int(now.timestamp()) // seconds * seconds
        end = datetime.fromtimestamp(start + seconds, timezone.utc)
        key = _hmac(settings, f"zenos-otp-rate\0{action}\0{scope}\0{identities[scope]}\0{seconds}\0{start}")
        buckets.append((key, end, limit))
    # Consistent lock order avoids deadlocks across overlapping email/IP quotas.
    for key, end, limit in sorted(buckets):
        statement = _insert(db, AuthRateLimit).values(key=key, count=1, expires_at=end)
        statement = statement.on_conflict_do_update(
            index_elements=[AuthRateLimit.key],
            set_={"count": AuthRateLimit.count + 1},
            where=AuthRateLimit.count < limit,
        ).returning(AuthRateLimit.count)
        if db.scalar(statement) is None:
            # A rejected email/IP bucket must never burn another bucket's quota
            # (particularly the shared provider daily budget).
            db.rollback()
            raise HTTPException(
                429, "Too many attempts. Please wait before trying again",
                headers={"Retry-After": str(max(1, math.ceil((end - now).total_seconds())))},
            )


def _challenge_for_update(db, email, now):
    # Upsert also establishes a SQLite write lock. PostgreSQL adds an explicit
    # row lock, making first requests and single-use verification safe in parallel.
    db.execute(_insert(db, OTPChallenge).values(
        email=email, failed_attempts=0, updated_at=now,
    ).on_conflict_do_nothing(index_elements=[OTPChallenge.email]))
    return db.scalar(select(OTPChallenge).where(OTPChallenge.email == email).with_for_update())


def _prune_expired(db, now):
    old_limits = select(AuthRateLimit.key).where(AuthRateLimit.expires_at <= now).limit(200)
    db.execute(delete(AuthRateLimit).where(AuthRateLimit.key.in_(old_limits), AuthRateLimit.expires_at <= now))
    cutoff = now - timedelta(days=1)
    old_challenges = select(OTPChallenge.email).where(OTPChallenge.updated_at < cutoff).limit(200)
    # Recheck the timestamp on the row being deleted, not just in the ID subquery:
    # PostgreSQL must preserve a challenge refreshed while cleanup waits for it.
    db.execute(delete(OTPChallenge).where(OTPChallenge.email.in_(old_challenges), OTPChallenge.updated_at < cutoff))


def send_login_code(email, code, settings):
    """Send through the fixed Brevo HTTPS endpoint; never echo delivery details."""
    api_key = settings.brevo_api_key.get_secret_value().strip()
    if not api_key or any(ord(char) < 32 or ord(char) == 127 for char in api_key) or not settings.brevo_sender_email:
        raise CodeDeliveryError("Email sign-in is temporarily unavailable")
    payload = {
        "sender": {"email": str(settings.brevo_sender_email), "name": settings.brevo_sender_name},
        "to": [{"email": email}],
        "subject": "Your ZenOS sign-in code",
        "textContent": (
            f"Your ZenOS sign-in code is {code}.\n\n"
            "This code expires in 10 minutes and can be used once. "
            "Do not share it. If you did not request it, ignore this email."
        ),
        "htmlContent": (
            "<html><body><h1>Sign in to ZenOS</h1><p>Your sign-in code is:</p>"
            f'<p style="font-size:32px;font-weight:bold;letter-spacing:6px">{code}</p>'
            "<p>This code expires in 10 minutes and can be used once. Do not share it.</p>"
            "<p>If you did not request it, ignore this email.</p></body></html>"
        ),
    }
    request = Request(
        "https://api.brevo.com/v3/smtp/email", data=json.dumps(payload).encode(), method="POST",
        headers={"api-key": api_key, "Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        opener = build_opener(HTTPSHandler(context=ssl.create_default_context()), _NoRedirect())
        with opener.open(request, timeout=10) as response:
            if not 200 <= response.status < 300:
                raise CodeDeliveryError("Email sign-in is temporarily unavailable")
    except (URLError, OSError, TimeoutError, ProviderHTTPError, ValueError):
        raise CodeDeliveryError("Email sign-in is temporarily unavailable") from None


def request_code(db, email, peer_ip, settings):
    email = str(email).strip().lower()
    now = utc_now()
    _prune_expired(db, now)
    # Cleanup locks must be released before acquiring quota/challenge locks.
    db.commit()
    challenge = _challenge_for_update(db, email, now)
    now = utc_now()
    if challenge.locked_until and _utc(challenge.locked_until) > now:
        _reject(db, 429, "Too many incorrect codes. Please wait before requesting another", (_utc(challenge.locked_until) - now).total_seconds())
    if challenge.sent_at and _utc(challenge.sent_at) + timedelta(seconds=RESEND_SECONDS) > now:
        _reject(db, 429, "Please wait before requesting another code", (_utc(challenge.sent_at) + timedelta(seconds=RESEND_SECONDS) - now).total_seconds())
    _reserve_rates(db, settings, "send", email, peer_ip, now)
    now = utc_now()
    # Resending never replenishes guesses. Only a completed lockout or a quiet
    # period resets the counter when a NEW challenge is requested.
    if (challenge.locked_until and _utc(challenge.locked_until) <= now) or (
        challenge.last_failed_at and _utc(challenge.last_failed_at) + timedelta(seconds=LOCK_SECONDS) <= now
    ):
        challenge.failed_attempts = 0
        challenge.locked_until = None
        challenge.last_failed_at = None
    code = f"{secrets.randbelow(1000000):06d}"
    nonce = secrets.token_urlsafe(32)
    challenge.nonce = nonce
    challenge.code_hash = _code_hash(settings, email, nonce, code)
    challenge.expires_at = now + timedelta(seconds=CODE_LIFETIME_SECONDS)
    challenge.sent_at = now
    challenge.consumed_at = None
    challenge.updated_at = now
    # Reserve quotas/cooldown durably before network I/O. No database lock is held
    # while Brevo responds, and another worker cannot send an overlapping code.
    db.commit()
    try:
        send_login_code(email, code, settings)
    except CodeDeliveryError:
        # Invalidate only this request, never a newer challenge created later.
        db.execute(update(OTPChallenge).where(
            OTPChallenge.email == email, OTPChallenge.nonce == nonce,
        ).values(code_hash=None, updated_at=utc_now()))
        db.commit()
        retry_after = max(1, math.ceil((now + timedelta(seconds=RESEND_SECONDS) - utc_now()).total_seconds()))
        raise HTTPException(
            503, "We couldn't send your code right now. Please try again later",
            headers={"Retry-After": str(retry_after)},
        ) from None
    elapsed = (utc_now() - now).total_seconds()
    return {
        "message": "A sign-in code is on its way. Check your email.",
        "expires_in": max(0, math.ceil(CODE_LIFETIME_SECONDS - elapsed)),
        "resend_after": max(0, math.ceil(RESEND_SECONDS - elapsed)),
    }


def verify_code(db, email, code, peer_ip, settings):
    email = str(email).strip().lower()
    now = utc_now()
    _prune_expired(db, now)
    db.commit()
    challenge = _challenge_for_update(db, email, now)
    now = utc_now()
    # Both endpoints acquire one email row before sorted quota rows, preventing
    # cross-endpoint lock-order inversions on PostgreSQL.
    _reserve_rates(db, settings, "verify", email, peer_ip, now)
    now = utc_now()
    if challenge.locked_until and _utc(challenge.locked_until) > now:
        _reject(db, 429, "Too many incorrect codes. Please wait before trying again", (_utc(challenge.locked_until) - now).total_seconds())
    if not challenge.code_hash or not challenge.nonce or not challenge.expires_at or _utc(challenge.expires_at) <= now or challenge.consumed_at:
        _reject(db, 400, "That code is invalid or expired. Check the latest email or request a new code")
    digest = _code_hash(settings, email, challenge.nonce, code)
    if not hmac.compare_digest(challenge.code_hash, digest):
        challenge.failed_attempts += 1
        challenge.last_failed_at = now
        challenge.updated_at = now
        if challenge.failed_attempts >= MAX_FAILED_ATTEMPTS:
            challenge.locked_until = now + timedelta(seconds=LOCK_SECONDS)
            challenge.code_hash = None
            _reject(db, 429, "Too many incorrect codes. Please wait before requesting another", LOCK_SECONDS)
        _reject(db, 400, "That code is invalid or expired. Check the latest email or request a new code")
    # The challenge lock remains held until account creation and consumption are
    # committed together. A second request cannot exchange the same code again.
    challenge.code_hash = None
    challenge.consumed_at = now
    challenge.failed_attempts = 0
    challenge.last_failed_at = None
    challenge.locked_until = None
    challenge.updated_at = now
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        # Keep the existing non-null password schema without setting a usable or
        # exposed password. Existing users' hashes and IDs are never changed.
        db.execute(_insert(db, User).values(
            email=email, hashed_password=get_password_hash(secrets.token_urlsafe(48)),
        ).on_conflict_do_nothing(index_elements=[User.email]))
        user = db.scalar(select(User).where(User.email == email))
    db.commit()
    return user
