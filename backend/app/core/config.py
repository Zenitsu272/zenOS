from functools import lru_cache
from typing import Literal

from pydantic import EmailStr, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "zenOS API"
    environment: str = "development"
    database_url: str = "sqlite:///./zenos.db"
    secret_key: str = "change-me-before-deploying"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7
    backend_cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    auth_mode: Literal["password", "otp"] = "password"
    brevo_api_key: SecretStr = SecretStr("")
    brevo_sender_email: EmailStr | None = None
    brevo_sender_name: str = Field(default="ZenOS", min_length=1, max_length=120)
    otp_daily_send_limit: int = Field(default=200, ge=1, le=100000)

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore", hide_input_in_errors=True)

    @model_validator(mode="after")
    def require_production_secret(self):
        if self.environment == "production" and (
            len(self.secret_key) < 32 or self.secret_key == "change-me-before-deploying"
        ):
            raise ValueError("Set SECRET_KEY to a private random value of at least 32 characters before running in production")
        if self.environment == "production" and self.auth_mode == "otp" and (
            not self.brevo_api_key.get_secret_value().strip() or not self.brevo_sender_email
        ):
            raise ValueError("Set BREVO_API_KEY and BREVO_SENDER_EMAIL before enabling production email sign-in")
        return self

    @field_validator("brevo_sender_name", mode="before")
    @classmethod
    def trim_sender_name(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("brevo_sender_email", mode="before")
    @classmethod
    def empty_sender_email(cls, value):
        return None if isinstance(value, str) and not value.strip() else value

    @field_validator("database_url")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        if value.startswith("postgres://"):
            return value.replace("postgres://", "postgresql+psycopg://", 1)
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+psycopg://", 1)
        return value

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.backend_cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
