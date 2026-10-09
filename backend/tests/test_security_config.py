import pytest
from pydantic import ValidationError

from app.core.config import Settings


@pytest.mark.parametrize("secret", ["", "change-me-before-deploying", "short-secret"])
def test_production_requires_a_nondefault_secret_of_sufficient_length(secret):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, environment="production", secret_key=secret)


def test_explicit_production_secret_and_local_development_settings_are_valid():
    production = Settings(_env_file=None, environment="production", secret_key="test-only-random-looking-secret-at-least-32-characters")
    assert production.environment == "production"
    local = Settings(_env_file=None, environment="development", secret_key="change-me-before-deploying")
    assert local.environment == "development"
