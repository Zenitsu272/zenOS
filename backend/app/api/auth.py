from datetime import timedelta

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.core.config import get_settings
from app.core.security import create_access_token, get_password_hash, verify_password
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, RequestCode, Token, UserRead, VerifyCode
from app.services import email_otp


router = APIRouter(tags=["auth"])


def require_auth_mode(mode):
    settings = get_settings()
    if settings.auth_mode != mode:
        message = "Use an email sign-in code instead of a password" if mode == "password" else "Email code sign-in is not enabled"
        raise HTTPException(409, message)
    return settings


@router.get("/auth/config")
def auth_config():
    return {"method": "email_otp" if get_settings().auth_mode == "otp" else "password"}


@router.post("/auth/request-code")
def request_login_code(payload: RequestCode, request: Request, db: DbSession):
    settings = require_auth_mode("otp")
    # Read the server's socket/trusted-proxy peer only, never arbitrary XFF input.
    peer_ip = request.client.host if request.client else "unknown"
    return email_otp.request_code(db, payload.email, peer_ip, settings)


@router.post("/auth/verify-code", response_model=Token)
def verify_login_code(payload: VerifyCode, request: Request, db: DbSession):
    settings = require_auth_mode("otp")
    peer_ip = request.client.host if request.client else "unknown"
    user = email_otp.verify_code(db, payload.email, payload.code, peer_ip, settings)
    return Token(access_token=create_access_token(
        subject=user.id, expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    ))


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: DbSession) -> Token:
    require_auth_mode("password")
    existing = db.scalar(select(User).where(User.email == payload.email.lower()))
    if existing:
        raise HTTPException(status_code=409, detail="Email is already registered")

    user = User(email=payload.email.lower(), hashed_password=get_password_hash(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    settings = get_settings()
    access_token = create_access_token(
        subject=user.id, expires_delta=timedelta(minutes=settings.access_token_expire_minutes)
    )
    return Token(access_token=access_token)


@router.post("/login", response_model=Token)
def login(payload: LoginRequest, db: DbSession) -> Token:
    require_auth_mode("password")
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")

    settings = get_settings()
    access_token = create_access_token(
        subject=user.id, expires_delta=timedelta(minutes=settings.access_token_expire_minutes)
    )
    return Token(access_token=access_token)


@router.get("/me", response_model=UserRead)
def me(current_user: CurrentUser) -> User:
    return current_user
