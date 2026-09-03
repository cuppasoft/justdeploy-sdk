from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any, Literal, cast
from urllib.parse import quote, urlsplit

import httpx

from ._auth import SDK_HEADER, AsyncAuthManager, AuthSession, SyncAuthManager
from .errors import JustDeployError, JustDeployValidationError
from .types import AsyncUploadBody, SyncUploadBody

Method = Literal["GET", "POST", "PUT", "DELETE"]
API_TIMEOUT_SECONDS = 30.0
TRANSFER_FORBIDDEN_HEADERS = ("authorization", "x-justdeploy-sdk", "cookie")


def _api_error(response: httpx.Response, payload: object) -> JustDeployError:
    details = payload if isinstance(payload, dict) else {}
    message = details.get("message")
    if not isinstance(message, str) or not message:
        message = f"JustDeploy request failed with status {response.status_code}."
    retry_after = details.get("retryAfter")
    request_id = details.get("requestId")
    if not isinstance(request_id, str):
        request_id = response.headers.get("x-request-id")
    return JustDeployError(
        message,
        status=response.status_code,
        retry_after=retry_after if isinstance(retry_after, int) and not isinstance(retry_after, bool) else None,
        request_id=request_id,
        details=cast(Mapping[str, Any], details),
    )


def _payload(response: httpx.Response) -> object:
    if not response.content:
        return None
    try:
        return response.json()
    except (ValueError, UnicodeDecodeError):
        raise JustDeployError("JustDeploy returned a response that was not valid JSON.", status=response.status_code) from None


def _json_content(value: object) -> bytes:
    try:
        return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode()
    except (TypeError, ValueError, UnicodeEncodeError):
        raise JustDeployValidationError("The request contains a value that cannot be encoded as JSON.") from None


def _validate_presigned_url(url: str) -> str:
    try:
        parsed = urlsplit(url)
        _ = parsed.port
    except (TypeError, ValueError):
        raise JustDeployError("JustDeploy returned an invalid file URL.") from None
    if parsed.scheme != "https" or not parsed.hostname or parsed.username is not None or parsed.password is not None or parsed.fragment:
        raise JustDeployError("JustDeploy returned an invalid file URL.")
    return url


def _api_url(session: AuthSession, path: str) -> str:
    if not path.startswith("/") or path.startswith("//") or "://" in path or "\\" in path:
        raise RuntimeError("Invalid internal JustDeploy API path.")
    organization_id = quote(session.organization_id, safe="")
    return f"{session.api_origin}/organizations/{organization_id}{path}"


class SyncTransport:
    def __init__(self, client: httpx.Client, auth: SyncAuthManager) -> None:
        self.client = client
        self.auth = auth

    def organization_request(
        self,
        method: Method,
        path: str,
        *,
        json_body: object = None,
        headers: Mapping[str, str] | None = None,
    ) -> object:
        session = self.auth.get_session()
        return self._send(method, path, session, json_body=json_body, headers=headers, replayed=False)

    def _send(
        self,
        method: Method,
        path: str,
        session: AuthSession,
        *,
        json_body: object,
        headers: Mapping[str, str] | None,
        replayed: bool,
    ) -> object:
        request_headers = {"accept": "application/json", "authorization": f"Bearer {session.token}", "x-justdeploy-sdk": SDK_HEADER}
        for name, value in (headers or {}).items():
            if name.lower() in {"authorization", "host", "x-justdeploy-sdk"}:
                raise RuntimeError(f"The internal header {name} cannot be overridden.")
            request_headers[name.lower()] = value
        content = _json_content(json_body) if json_body is not None else None
        if content is not None:
            request_headers["content-type"] = "application/json"
        try:
            url = _api_url(session, path)
            response = self.client.request(
                method,
                url,
                headers=request_headers,
                content=content,
                timeout=API_TIMEOUT_SECONDS,
                follow_redirects=False,
            )
        except httpx.HTTPError:
            raise JustDeployError("The JustDeploy request failed before the server returned a response.") from None
        if response.status_code == 401 and method == "GET" and not replayed:
            response.close()
            refreshed = self.auth.refresh_after_unauthorized(session.token)
            return self._send(method, path, refreshed, json_body=json_body, headers=headers, replayed=True)
        payload = _payload(response)
        if not response.is_success:
            raise _api_error(response, payload)
        return payload

    def presigned_upload(self, url: str, *, mime: str, data: SyncUploadBody, size: int) -> httpx.Response:
        validated_url = _validate_presigned_url(url)
        try:
            request = self.client.build_request(
                "PUT",
                validated_url,
                headers={"content-type": mime, "content-length": str(size)},
                content=data,
            )
            for name in TRANSFER_FORBIDDEN_HEADERS:
                request.headers.pop(name, None)
            return self.client.send(request, follow_redirects=False)
        except Exception:
            raise JustDeployError("The file transfer failed before the server returned a response.") from None

    def presigned_download(self, url: str) -> httpx.Response:
        validated_url = _validate_presigned_url(url)
        try:
            request = self.client.build_request("GET", validated_url)
            for name in TRANSFER_FORBIDDEN_HEADERS:
                request.headers.pop(name, None)
            return self.client.send(request, stream=True, follow_redirects=False)
        except Exception:
            raise JustDeployError("The file transfer failed before the server returned a response.") from None


class AsyncTransport:
    def __init__(self, client: httpx.AsyncClient, auth: AsyncAuthManager) -> None:
        self.client = client
        self.auth = auth

    async def organization_request(
        self,
        method: Method,
        path: str,
        *,
        json_body: object = None,
        headers: Mapping[str, str] | None = None,
    ) -> object:
        session = await self.auth.get_session()
        return await self._send(method, path, session, json_body=json_body, headers=headers, replayed=False)

    async def _send(
        self,
        method: Method,
        path: str,
        session: AuthSession,
        *,
        json_body: object,
        headers: Mapping[str, str] | None,
        replayed: bool,
    ) -> object:
        request_headers = {"accept": "application/json", "authorization": f"Bearer {session.token}", "x-justdeploy-sdk": SDK_HEADER}
        for name, value in (headers or {}).items():
            if name.lower() in {"authorization", "host", "x-justdeploy-sdk"}:
                raise RuntimeError(f"The internal header {name} cannot be overridden.")
            request_headers[name.lower()] = value
        content = _json_content(json_body) if json_body is not None else None
        if content is not None:
            request_headers["content-type"] = "application/json"
        try:
            url = _api_url(session, path)
            response = await self.client.request(
                method,
                url,
                headers=request_headers,
                content=content,
                timeout=API_TIMEOUT_SECONDS,
                follow_redirects=False,
            )
        except httpx.HTTPError:
            raise JustDeployError("The JustDeploy request failed before the server returned a response.") from None
        if response.status_code == 401 and method == "GET" and not replayed:
            await response.aclose()
            refreshed = await self.auth.refresh_after_unauthorized(session.token)
            return await self._send(method, path, refreshed, json_body=json_body, headers=headers, replayed=True)
        payload = _payload(response)
        if not response.is_success:
            raise _api_error(response, payload)
        return payload

    async def presigned_upload(self, url: str, *, mime: str, data: AsyncUploadBody, size: int) -> httpx.Response:
        validated_url = _validate_presigned_url(url)
        try:
            request = self.client.build_request(
                "PUT",
                validated_url,
                headers={"content-type": mime, "content-length": str(size)},
                content=data,
            )
            for name in TRANSFER_FORBIDDEN_HEADERS:
                request.headers.pop(name, None)
            return await self.client.send(request, follow_redirects=False)
        except Exception:
            raise JustDeployError("The file transfer failed before the server returned a response.") from None

    async def presigned_download(self, url: str) -> httpx.Response:
        validated_url = _validate_presigned_url(url)
        try:
            request = self.client.build_request("GET", validated_url)
            for name in TRANSFER_FORBIDDEN_HEADERS:
                request.headers.pop(name, None)
            return await self.client.send(request, stream=True, follow_redirects=False)
        except Exception:
            raise JustDeployError("The file transfer failed before the server returned a response.") from None
