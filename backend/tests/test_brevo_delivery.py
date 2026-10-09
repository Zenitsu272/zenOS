"""Provider adapter tests: every HTTP transport is mocked; no email is sent."""
import io
import json
import ssl
import traceback
from email.message import Message
from urllib.error import HTTPError, URLError
from urllib.request import HTTPHandler, HTTPSHandler, build_opener as urllib_build_opener
from urllib.response import addinfourl

import pytest

from app.core.config import Settings
from app.services import email_otp


ENDPOINT = "https://api.brevo.com/v3/smtp/email"
API_KEY = "unit-test-provider-key-never-a-real-secret"
EMAIL = "recipient@example.com"
CODE = "084291"


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("Provider tests must install a fake HTTP transport")
    monkeypatch.setattr(email_otp, "build_opener", forbidden)


@pytest.fixture()
def settings(monkeypatch):
    monkeypatch.delenv("BREVO_SENDER_NAME", raising=False)
    return Settings(
        _env_file=None, environment="test", auth_mode="otp",
        secret_key="unit-test-signing-key-at-least-32-characters",
        brevo_api_key=API_KEY, brevo_sender_email="signin@example.com",
    )


class Response:
    def __init__(self, status):
        self.status = status
        self.closed = False

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.closed = True

    def read(self, *args):
        raise AssertionError("Provider bodies may contain private details and are unnecessary here")


def test_delivery_uses_fixed_https_endpoint_brand_and_private_header(monkeypatch, settings, caplog, capsys):
    requests = []
    handlers = []
    response = Response(201)

    class Opener:
        def open(self, request, timeout):
            requests.append((request, timeout))
            return response

    def create_opener(*items):
        handlers.extend(items)
        return Opener()

    monkeypatch.setattr(email_otp, "build_opener", create_opener)
    assert email_otp.send_login_code(EMAIL, CODE, settings) is None
    assert len(requests) == 1
    request, timeout = requests[0]
    assert request.full_url == ENDPOINT
    assert request.get_method() == "POST"
    assert timeout == 10
    headers = {name.lower(): value for name, value in request.header_items()}
    assert headers["api-key"] == API_KEY
    assert headers["content-type"] == "application/json"
    assert headers["accept"] == "application/json"
    payload = json.loads(request.data)
    assert payload["sender"] == {"email": "signin@example.com", "name": "ZenOS"}
    assert payload["to"] == [{"email": EMAIL}]
    assert payload["subject"] == "Your ZenOS sign-in code"
    assert CODE not in payload["subject"]
    assert CODE in payload["textContent"] and CODE in payload["htmlContent"]
    assert "ZenOS" in payload["textContent"] and "ZenOS" in payload["htmlContent"]
    assert "10 minutes" in payload["textContent"]
    assert API_KEY not in request.data.decode()
    tls = next(handler for handler in handlers if isinstance(handler, HTTPSHandler))
    assert tls._context.verify_mode == ssl.CERT_REQUIRED
    assert tls._context.check_hostname is True
    assert response.closed
    assert not caplog.text
    captured = capsys.readouterr()
    assert not captured.out and not captured.err


@pytest.mark.parametrize("failure", [
    TimeoutError(f"Timeout with {API_KEY} and {CODE}"),
    URLError(f"Private transport details {API_KEY} {EMAIL} {CODE}"),
    HTTPError(ENDPOINT, 403, f"Rejected {API_KEY}", {}, io.BytesIO(f"Private body {EMAIL} {CODE}".encode())),
    ValueError(f"Invalid header value {API_KEY}"),
])
def test_transport_errors_hide_provider_details(monkeypatch, settings, failure, caplog, capsys):
    class Opener:
        def open(self, request, timeout):
            raise failure

    monkeypatch.setattr(email_otp, "build_opener", lambda *handlers: Opener())
    with pytest.raises(email_otp.CodeDeliveryError) as caught:
        email_otp.send_login_code(EMAIL, CODE, settings)
    assert str(caught.value) == "Email sign-in is temporarily unavailable"
    visible = "".join(traceback.format_exception(caught.value)) + caplog.text
    captured = capsys.readouterr()
    visible += captured.out + captured.err
    for private in [API_KEY, EMAIL, CODE, "Private body", "Private transport details"]:
        assert private not in visible
    assert caught.value.__suppress_context__ is True


def test_non_success_response_is_closed_without_reading_its_body(monkeypatch, settings):
    response = Response(503)

    class Opener:
        def open(self, request, timeout):
            return response

    monkeypatch.setattr(email_otp, "build_opener", lambda *handlers: Opener())
    with pytest.raises(email_otp.CodeDeliveryError, match="temporarily unavailable"):
        email_otp.send_login_code(EMAIL, CODE, settings)
    assert response.closed


def test_redirect_never_forwards_api_key_or_recipient(monkeypatch, settings):
    requests = []

    class FakeHTTPS(HTTPSHandler):
        def https_open(self, request):
            requests.append(request)
            headers = Message()
            headers["Location"] = "https://capture.invalid/collect"
            response = addinfourl(io.BytesIO(b"private provider redirect body"), headers, request.full_url, 302)
            response.msg = "Found"
            return response

    class BlockHTTP(HTTPHandler):
        def http_open(self, request):
            raise AssertionError("No unencrypted HTTP request is permitted")

    def local_opener(*handlers):
        # Keep the application's redirect policy while substituting both network
        # transports. Even a regression cannot make an external request here.
        return urllib_build_opener(FakeHTTPS(), BlockHTTP(), *[
            handler for handler in handlers if not isinstance(handler, HTTPSHandler)
        ])

    monkeypatch.setattr(email_otp, "build_opener", local_opener)
    with pytest.raises(email_otp.CodeDeliveryError, match="temporarily unavailable"):
        email_otp.send_login_code(EMAIL, CODE, settings)
    assert [request.full_url for request in requests] == [ENDPOINT]


@pytest.mark.parametrize("missing", ["brevo_api_key", "brevo_sender_email"])
def test_missing_sender_configuration_never_attempts_http(settings, missing):
    from pydantic import SecretStr

    setattr(settings, missing, SecretStr("") if missing == "brevo_api_key" else None)
    with pytest.raises(email_otp.CodeDeliveryError, match="temporarily unavailable"):
        email_otp.send_login_code(EMAIL, CODE, settings)


@pytest.mark.parametrize("control", ["\r\n", "\x00", "\t", "\x7f"])
def test_malformed_api_key_is_rejected_before_http_without_echoing_input(settings, control, caplog):
    from pydantic import SecretStr

    settings.brevo_api_key = SecretStr(API_KEY + control + CODE)
    with pytest.raises(email_otp.CodeDeliveryError) as caught:
        email_otp.send_login_code(EMAIL, CODE, settings)
    assert str(caught.value) == "Email sign-in is temporarily unavailable"
    assert API_KEY not in str(caught.value) + caplog.text
    assert CODE not in str(caught.value) + caplog.text


def test_production_validation_errors_do_not_echo_raw_configuration():
    from pydantic import ValidationError

    with pytest.raises(ValidationError) as caught:
        Settings(
            _env_file=None, environment="production", auth_mode="otp",
            secret_key="short-private-secret", brevo_api_key=API_KEY,
            brevo_sender_email="signin@example.com",
        )
    assert "Set SECRET_KEY" in str(caught.value)
    assert API_KEY not in str(caught.value) + repr(caught.value)
    assert "short-private-secret" not in str(caught.value) + repr(caught.value)
