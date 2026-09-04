from __future__ import annotations

import asyncio
import base64
import json
import os
import re
import stat
import threading
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Final
from urllib.parse import urlsplit

import httpx
from cryptography.exceptions import UnsupportedAlgorithm
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import load_der_private_key

from ._version import __version__
from .errors import JustDeployAuthenticationError, JustDeployConfigurationError

DEFAULT_API_ORIGIN: Final = "https://api.justdeploy.net"
DEFAULT_IDENTITY_PATH: Final = Path("/opt/justdeploy/identity.json")
REFRESH_WINDOW_SECONDS: Final = 3 * 60
AUTH_TIMEOUT_SECONDS: Final = 10.0
MAX_IDENTITY_BYTES: Final = 16 * 1024
SDK_HEADER: Final = f"python/{__version__}"
BUILD_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)
PLATFORM_ID = re.compile(r"^[a-z0-9]{16}$")


@dataclass(frozen=True, slots=True)
class IdentityDocument:
    protocol_version: int
    build_id: str
    private_key: str
    api_origin: str


@dataclass(frozen=True, slots=True)
class AuthSession:
    token: str
    organization_id: str
    expires_at: float
    api_origin: str


@dataclass(frozen=True, slots=True)
class ResolvedAuthentication:
    api_origin: str
    credentials: tuple[str, str] | None
    identity: IdentityDocument | None


def _validate_api_origin(value: object) -> str:
    if not isinstance(value, str):
        raise JustDeployConfigurationError("The JustDeploy API URL in the deployment identity is invalid.")
    try:
        parsed = urlsplit(value)
        _ = parsed.port
    except ValueError as error:
        raise JustDeployConfigurationError("The JustDeploy API URL in the deployment identity is invalid.") from error
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path not in ("", "/")
        or parsed.query
        or parsed.fragment
    ):
        raise JustDeployConfigurationError("The JustDeploy API URL in the deployment identity must be an HTTPS origin.")
    return f"https://{parsed.netloc.lower()}"


def _read_identity(path: Path) -> dict[str, Any] | None:
    try:
        initial_metadata = os.lstat(path)
    except FileNotFoundError:
        return None
    except OSError as error:
        raise JustDeployConfigurationError("The JustDeploy deployment identity could not be inspected.") from error
    if not stat.S_ISREG(initial_metadata.st_mode) or stat.S_ISLNK(initial_metadata.st_mode):
        raise JustDeployConfigurationError("The JustDeploy deployment identity must be a regular file, not a link or directory.")

    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
    except FileNotFoundError:
        return None
    except OSError as error:
        raise JustDeployConfigurationError("The JustDeploy deployment identity could not be opened safely.") from error

    try:
        metadata = os.fstat(descriptor)
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_dev != initial_metadata.st_dev or metadata.st_ino != initial_metadata.st_ino:
            raise JustDeployConfigurationError("The JustDeploy deployment identity must be a regular file, not a link or directory.")
        permissions = stat.S_IMODE(metadata.st_mode)
        if permissions & 0o333 or not permissions & 0o444:
            raise JustDeployConfigurationError(
                "The JustDeploy deployment identity must be readable and have no write or execute permissions."
            )
        if metadata.st_size <= 0 or metadata.st_size > MAX_IDENTITY_BYTES:
            raise JustDeployConfigurationError("The JustDeploy deployment identity has an invalid size.")
        chunks = bytearray()
        while len(chunks) <= metadata.st_size:
            chunk = os.read(descriptor, metadata.st_size + 1 - len(chunks))
            if not chunk:
                break
            chunks.extend(chunk)
        if len(chunks) != metadata.st_size:
            raise JustDeployConfigurationError("The JustDeploy deployment identity changed while it was being read.")
        raw = bytes(chunks)
    finally:
        os.close(descriptor)

    try:
        value = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise JustDeployConfigurationError("The JustDeploy deployment identity is not valid JSON.") from error
    if not isinstance(value, dict):
        raise JustDeployConfigurationError("The JustDeploy deployment identity is invalid.")
    return value


def _parse_identity(path: Path, *, require_build_key: bool) -> IdentityDocument | None:
    value = _read_identity(path)
    if value is None:
        return None
    protocol_version = value.get("protocolVersion")
    if type(protocol_version) is not int or protocol_version != 1:
        raise JustDeployConfigurationError("The JustDeploy deployment identity protocol is not supported by this SDK.")
    build_id = value.get("buildId", "")
    private_key = value.get("privateKey", "")
    if require_build_key and (
        not isinstance(build_id, str) or BUILD_UUID.fullmatch(build_id) is None or not isinstance(private_key, str) or not private_key
    ):
        raise JustDeployConfigurationError("The JustDeploy deployment identity is missing a valid build key.")
    return IdentityDocument(protocol_version, str(build_id), str(private_key), _validate_api_origin(value.get("apiBaseUrl")))


def _resolve_authentication(env: Mapping[str, str], identity_path: Path) -> ResolvedAuthentication:
    access = env.get("JUSTDEPLOY_ACCESS_KEY")
    secret = env.get("JUSTDEPLOY_SECRET_KEY")
    has_access = access is not None
    has_secret = secret is not None
    if has_access != has_secret or (has_access and (not access or not secret)):
        raise JustDeployAuthenticationError("Set both JUSTDEPLOY_ACCESS_KEY and JUSTDEPLOY_SECRET_KEY to non-empty values.")

    identity = _parse_identity(identity_path, require_build_key=not has_access)
    api_origin = identity.api_origin if identity else DEFAULT_API_ORIGIN
    if has_access and has_secret:
        assert access is not None and secret is not None
        return ResolvedAuthentication(api_origin, (access, secret), identity)
    if identity is None:
        raise JustDeployAuthenticationError(
            "JustDeploy authentication is not configured. Set JUSTDEPLOY_ACCESS_KEY and JUSTDEPLOY_SECRET_KEY for local development; "
            "deployed JustDeploy applications receive an identity automatically."
        )
    return ResolvedAuthentication(api_origin, None, identity)


def _build_request(resolved: ResolvedAuthentication, now: float) -> tuple[str, dict[str, str], dict[str, object]]:
    common_headers = {"accept": "application/json", "content-type": "application/json", "x-justdeploy-sdk": SDK_HEADER}
    if resolved.credentials:
        access, secret = resolved.credentials
        return (
            f"{resolved.api_origin}/auth/credential",
            {**common_headers, "authorization": f"Bearer {access}:{secret}"},
            {},
        )

    identity = resolved.identity
    if identity is None:  # pragma: no cover - guarded by _resolve_authentication
        raise JustDeployAuthenticationError("JustDeploy authentication is not configured.")
    issued_at = int(now)
    signing_input = f"justdeploy-build-auth-v1\n{resolved.api_origin}\nPOST\n/auth/build\n{identity.build_id}\n{issued_at}".encode()
    try:
        encoded_key = base64.b64decode(identity.private_key, validate=True)
        private_key = load_der_private_key(encoded_key, password=None)
        if not isinstance(private_key, Ed25519PrivateKey):
            raise ValueError
        signature = base64.urlsafe_b64encode(private_key.sign(signing_input)).rstrip(b"=").decode("ascii")
    except (TypeError, ValueError, UnsupportedAlgorithm):
        raise JustDeployConfigurationError("The JustDeploy deployment identity contains an invalid Ed25519 private key.") from None
    return (
        f"{resolved.api_origin}/auth/build",
        {**common_headers, "x-justdeploy-build-signature": signature},
        {"buildId": identity.build_id, "issuedAt": issued_at},
    )


def _session_from_response(response: httpx.Response, api_origin: str, now: float) -> AuthSession:
    if not response.is_success:
        message = "JustDeploy authentication was rejected."
        details: dict[str, Any] = {}
        try:
            payload = response.json()
            if isinstance(payload, dict):
                details = payload
                if isinstance(payload.get("message"), str) and payload["message"]:
                    message = payload["message"]
        except (ValueError, UnicodeDecodeError):
            pass
        retry_after = details.get("retryAfter")
        request_id = details.get("requestId")
        raise JustDeployAuthenticationError(
            message,
            status=response.status_code,
            retry_after=retry_after if isinstance(retry_after, int) and not isinstance(retry_after, bool) else None,
            request_id=request_id if isinstance(request_id, str) else response.headers.get("x-request-id"),
            details=details,
        )
    try:
        payload = response.json()
        token = payload["token"]
        organization_id = payload["organizationId"]
        raw_expiry = payload["expiresAt"]
        if not isinstance(raw_expiry, str):
            raise ValueError
        parsed_expiry = datetime.fromisoformat(raw_expiry.replace("Z", "+00:00"))
        if parsed_expiry.tzinfo is None or parsed_expiry.utcoffset() is None:
            raise ValueError
        expires_at = parsed_expiry.timestamp()
    except (KeyError, TypeError, ValueError, UnicodeDecodeError):
        raise JustDeployAuthenticationError(
            "JustDeploy returned an invalid authentication response.",
            status=response.status_code,
            request_id=response.headers.get("x-request-id"),
        ) from None
    if (
        not isinstance(token, str)
        or not token
        or not isinstance(organization_id, str)
        or PLATFORM_ID.fullmatch(organization_id) is None
        or expires_at <= now
    ):
        raise JustDeployAuthenticationError(
            "JustDeploy returned an invalid authentication response.",
            status=response.status_code,
            request_id=response.headers.get("x-request-id"),
        )
    return AuthSession(token, organization_id, expires_at, api_origin)


class SyncAuthManager:
    def __init__(
        self,
        client: httpx.Client,
        *,
        env: Mapping[str, str] | None = None,
        identity_path: Path = DEFAULT_IDENTITY_PATH,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self._client = client
        self._env = dict(os.environ if env is None else env)
        self._identity_path = identity_path
        self._clock = clock
        self._session: AuthSession | None = None
        self._credential_authentication: ResolvedAuthentication | None = None
        self._lock = threading.Lock()

    def _valid_session(self) -> AuthSession | None:
        if self._session and self._session.expires_at - self._clock() > REFRESH_WINDOW_SECONDS:
            return self._session
        return None

    def get_session(self) -> AuthSession:
        if session := self._valid_session():
            return session
        with self._lock:
            if session := self._valid_session():
                return session
            self._session = self._exchange()
            return self._session

    def refresh_after_unauthorized(self, stale_token: str) -> AuthSession:
        with self._lock:
            if self._session and self._session.token != stale_token and (session := self._valid_session()):
                return session
            self._session = self._exchange()
            return self._session

    def _exchange(self) -> AuthSession:
        resolved = self._resolve()
        url, headers, body = _build_request(resolved, self._clock())
        try:
            response = self._client.post(url, headers=headers, json=body, timeout=AUTH_TIMEOUT_SECONDS, follow_redirects=False)
        except httpx.TimeoutException:
            raise JustDeployAuthenticationError("JustDeploy authentication timed out.") from None
        except httpx.HTTPError:
            raise JustDeployAuthenticationError("JustDeploy authentication failed before the server returned a response.") from None
        return _session_from_response(response, resolved.api_origin, self._clock())

    def _resolve(self) -> ResolvedAuthentication:
        if self._credential_authentication:
            return self._credential_authentication
        resolved = _resolve_authentication(self._env, self._identity_path)
        if resolved.credentials:
            self._credential_authentication = ResolvedAuthentication(resolved.api_origin, resolved.credentials, None)
            return self._credential_authentication
        return resolved


class AsyncAuthManager:
    def __init__(
        self,
        client: httpx.AsyncClient,
        *,
        env: Mapping[str, str] | None = None,
        identity_path: Path = DEFAULT_IDENTITY_PATH,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self._client = client
        self._env = dict(os.environ if env is None else env)
        self._identity_path = identity_path
        self._clock = clock
        self._session: AuthSession | None = None
        self._credential_authentication: ResolvedAuthentication | None = None
        self._lock = asyncio.Lock()

    def _valid_session(self) -> AuthSession | None:
        if self._session and self._session.expires_at - self._clock() > REFRESH_WINDOW_SECONDS:
            return self._session
        return None

    async def get_session(self) -> AuthSession:
        if session := self._valid_session():
            return session
        async with self._lock:
            if session := self._valid_session():
                return session
            self._session = await self._exchange()
            return self._session

    async def refresh_after_unauthorized(self, stale_token: str) -> AuthSession:
        async with self._lock:
            if self._session and self._session.token != stale_token and (session := self._valid_session()):
                return session
            self._session = await self._exchange()
            return self._session

    async def _exchange(self) -> AuthSession:
        resolved = self._resolve()
        url, headers, body = _build_request(resolved, self._clock())
        try:
            response = await self._client.post(url, headers=headers, json=body, timeout=AUTH_TIMEOUT_SECONDS, follow_redirects=False)
        except httpx.TimeoutException:
            raise JustDeployAuthenticationError("JustDeploy authentication timed out.") from None
        except httpx.HTTPError:
            raise JustDeployAuthenticationError("JustDeploy authentication failed before the server returned a response.") from None
        return _session_from_response(response, resolved.api_origin, self._clock())

    def _resolve(self) -> ResolvedAuthentication:
        if self._credential_authentication:
            return self._credential_authentication
        resolved = _resolve_authentication(self._env, self._identity_path)
        if resolved.credentials:
            self._credential_authentication = ResolvedAuthentication(resolved.api_origin, resolved.credentials, None)
            return self._credential_authentication
        return resolved
