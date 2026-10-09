import pytest
from pydantic import ValidationError

from app.core.config import Settings


@pytest.mark.parametrize("secret", ["", "change-me-before-deploying", "short-secret"])
def test_production_requires_a_nondefault_secret_of_sufficient_length(secret):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, environment="production", secret_key=secret, auth_mode="password")


def test_explicit_production_secret_and_local_development_settings_are_valid():
    production = Settings(_env_file=None, environment="production", secret_key="test-only-random-looking-secret-at-least-32-characters", auth_mode="password")
    assert production.environment == "production"
    local = Settings(_env_file=None, environment="development", secret_key="change-me-before-deploying", auth_mode="password")
    assert local.environment == "development"


@pytest.mark.parametrize("api_key,sender", [("", None), ("test-provider-key", None), ("", "signin@example.com"), ("   ", "signin@example.com")])
def test_production_otp_requires_provider_key_and_sender_address(api_key, sender):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, environment="production", auth_mode="otp", secret_key="test-only-signing-secret-at-least-32-characters", brevo_api_key=api_key, brevo_sender_email=sender)


def test_valid_otp_configuration_keeps_provider_key_out_of_public_representation():
    settings = Settings(_env_file=None, environment="production", auth_mode="otp", secret_key="test-only-signing-secret-at-least-32-characters", brevo_api_key="not-a-real-provider-key", brevo_sender_email="signin@example.com", brevo_sender_name="ZenOS")
    assert settings.auth_mode == "otp"
    assert str(settings.brevo_sender_email) == "signin@example.com"
    assert "not-a-real-provider-key" not in str(settings)
    assert "not-a-real-provider-key" not in settings.model_dump_json()


def test_invalid_auth_modes_sender_addresses_and_blank_sender_names_are_rejected():
    for invalid in [{"auth_mode": "anything"}, {"brevo_sender_email": "not-an-email"}, {"brevo_sender_name": "   "}, {"otp_daily_send_limit": 0}]:
        with pytest.raises(ValidationError):
            Settings(_env_file=None, environment="test", **{"auth_mode": "password", **invalid})
