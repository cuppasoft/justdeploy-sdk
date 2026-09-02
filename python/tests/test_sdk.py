from __future__ import annotations

import asyncio
import base64
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from threading import Lock
from typing import Any

import httpx
import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, NoEncryption, PrivateFormat

from justdeploy import (
    AsyncJustDeploy,
    JustDeploy,
    JustDeployAuthenticationError,
    JustDeployConfigurationError,
    JustDeployError,
)
from justdeploy._auth import AsyncAuthManager, SyncAuthManager
from justdeploy._transport import AsyncTransport, SyncTransport
from justdeploy.databases import AsyncDatabases, Databases
from justdeploy.mail import AsyncMailClient, MailClient
from justdeploy.storages import AsyncStorages, Storages

API = "https://api.justdeploy.net"
ORG = "abcdefghijklmnop"
EXPIRY = "2099-01-01T00:00:00.000Z"
ENV = {"JUSTDEPLOY_ACCESS_KEY": "ak_test", "JUSTDEPLOY_SECRET_KEY": "sk_test"}


def response(payload: object, status: int = 200, *, headers: dict[str, str] | None = None) -> httpx.Response:
    return httpx.Response(status, json=payload, headers=headers)


def session(token: str = "session-token") -> httpx.Response:
    return response({"token": token, "organizationId": ORG, "expiresAt": EXPIRY})


def sync_stack(handler: Any) -> tuple[httpx.Client, SyncTransport]:
    client = httpx.Client(transport=httpx.MockTransport(handler), follow_redirects=False)
    auth = SyncAuthManager(client, env=ENV, identity_path=Path("/does/not/exist"))
    return client, SyncTransport(client, auth)


def async_stack(handler: Any) -> tuple[httpx.AsyncClient, AsyncTransport]:
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler), follow_redirects=False)
    auth = AsyncAuthManager(client, env=ENV, identity_path=Path("/does/not/exist"))
    return client, AsyncTransport(client, auth)


def test_public_clients_construct_without_network_io() -> None:
    with JustDeploy() as client:
        assert client.databases
        assert client.storages
        assert client.mail


async def test_public_async_client_constructs_without_network_io() -> None:
    async with AsyncJustDeploy() as client:
        assert client.databases
        assert client.storages
        assert client.mail


def test_credential_exchange_and_data_session_headers() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return session() if request.url.path == "/auth/credential" else response({"databases": []})

    client, transport = sync_stack(handler)
    with client:
        assert Databases(transport).list() == []

    assert len(requests) == 2
    assert str(requests[0].url) == f"{API}/auth/credential"
    assert requests[0].headers["authorization"] == "Bearer ak_test:sk_test"
    assert json.loads(requests[0].content) == {}
    assert str(requests[1].url) == f"{API}/organizations/{ORG}/databases"
    assert requests[1].headers["authorization"] == "Bearer session-token"
    assert requests[1].headers["x-justdeploy-sdk"] == "python/0.1.0"


@pytest.mark.parametrize(
    "env",
    [
        {"JUSTDEPLOY_ACCESS_KEY": "ak_test"},
        {"JUSTDEPLOY_SECRET_KEY": "sk_test"},
        {"JUSTDEPLOY_ACCESS_KEY": "", "JUSTDEPLOY_SECRET_KEY": "sk_test"},
    ],
)
def test_partial_or_empty_credentials_never_fall_back(env: dict[str, str]) -> None:
    client = httpx.Client(transport=httpx.MockTransport(lambda _request: session()))
    with client:
        auth = SyncAuthManager(client, env=env, identity_path=Path("/does/not/exist"))
        with pytest.raises(JustDeployAuthenticationError):
            auth.get_session()


def test_build_identity_signs_exact_request_and_uses_its_origin(tmp_path: Path) -> None:
    build_id = "123e4567-e89b-12d3-a456-426614174000"
    origin = "https://api.dev.justdeploy.test"
    issued_at = 1_800_000_000
    private_key = Ed25519PrivateKey.generate()
    encoded_key = private_key.private_bytes(Encoding.DER, PrivateFormat.PKCS8, NoEncryption())
    identity_path = tmp_path / "identity.json"
    identity_path.write_text(
        json.dumps(
            {
                "protocolVersion": 1,
                "buildId": build_id,
                "privateKey": base64.b64encode(encoded_key).decode(),
                "apiBaseUrl": origin,
            }
        )
    )
    os.chmod(identity_path, 0o444)

    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == f"{origin}/auth/build"
        body = json.loads(request.content)
        assert body == {"buildId": build_id, "issuedAt": issued_at}
        signing_input = f"justdeploy-build-auth-v1\n{origin}\nPOST\n/auth/build\n{build_id}\n{issued_at}".encode()
        signature = base64.urlsafe_b64decode(request.headers["x-justdeploy-build-signature"] + "==")
        private_key.public_key().verify(signature, signing_input)
        assert "authorization" not in request.headers
        return session("build-token")

    client = httpx.Client(transport=httpx.MockTransport(handler), follow_redirects=False)
    with client:
        auth = SyncAuthManager(client, env={}, identity_path=identity_path, clock=lambda: float(issued_at))
        result = auth.get_session()
    assert result.api_origin == origin
    assert result.token == "build-token"


def test_deployed_credentials_use_identity_origin_and_unsafe_identity_files_fail(tmp_path: Path) -> None:
    origin = "https://api-dev.justdeploy.net"
    identity_path = tmp_path / "identity.json"
    identity_path.write_text(json.dumps({"protocolVersion": 1, "apiBaseUrl": origin}))
    os.chmod(identity_path, 0o444)

    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == f"{origin}/auth/credential"
        return session()

    client = httpx.Client(transport=httpx.MockTransport(handler))
    with client:
        auth = SyncAuthManager(client, env=ENV, identity_path=identity_path)
        assert auth.get_session().api_origin == origin

    os.chmod(identity_path, 0o644)
    client = httpx.Client(transport=httpx.MockTransport(handler))
    with client, pytest.raises(JustDeployConfigurationError):
        SyncAuthManager(client, env={}, identity_path=identity_path).get_session()

    os.chmod(identity_path, 0o444)
    link = tmp_path / "identity-link.json"
    link.symlink_to(identity_path)
    client = httpx.Client(transport=httpx.MockTransport(handler))
    with client, pytest.raises(JustDeployConfigurationError):
        SyncAuthManager(client, env={}, identity_path=link).get_session()


def test_credential_failure_does_not_try_another_authentication_source() -> None:
    calls = 0

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return response({"message": "Rejected", "retryAfter": 2, "requestId": "auth-request", "reason": "invalid"}, 401)

    client, transport = sync_stack(handler)
    with client, pytest.raises(JustDeployAuthenticationError) as raised:
        transport.auth.get_session()
    assert raised.value.status == 401
    assert raised.value.retry_after == 2
    assert raised.value.request_id == "auth-request"
    assert raised.value.details["reason"] == "invalid"
    assert calls == 1


def test_sync_refresh_is_collapsed_and_runs_inside_three_minutes() -> None:
    exchanges = 0
    now = 1_700_000_000.0
    counter_lock = Lock()

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal exchanges
        with counter_lock:
            exchanges += 1
            number = exchanges
        time.sleep(0.01)
        expires_at = datetime.fromtimestamp(now + 10 * 60, UTC).isoformat().replace("+00:00", "Z")
        return response({"token": f"token-{number}", "organizationId": ORG, "expiresAt": expires_at})

    client = httpx.Client(transport=httpx.MockTransport(handler))
    auth = SyncAuthManager(client, env=ENV, identity_path=Path("/does/not/exist"), clock=lambda: now)
    with client, ThreadPoolExecutor(max_workers=3) as executor:
        results = list(executor.map(lambda _index: auth.get_session(), range(3)))
        assert exchanges == 1
        assert all(item.token == "token-1" for item in results)
        now += 7 * 60 + 1
        assert auth.get_session().token == "token-2"
        assert exchanges == 2


async def test_async_refresh_is_collapsed() -> None:
    exchanges = 0

    async def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal exchanges
        exchanges += 1
        await asyncio.sleep(0)
        return session(f"token-{exchanges}")

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    async with client:
        auth = AsyncAuthManager(client, env=ENV, identity_path=Path("/does/not/exist"))
        results = await asyncio.gather(auth.get_session(), auth.get_session(), auth.get_session())
    assert exchanges == 1
    assert all(item.token == "token-1" for item in results)


def test_get_replays_once_after_401_but_mutation_does_not() -> None:
    exchanges = 0
    data_calls = 0

    def get_handler(request: httpx.Request) -> httpx.Response:
        nonlocal exchanges, data_calls
        if request.url.path == "/auth/credential":
            exchanges += 1
            return session(f"token-{exchanges}")
        data_calls += 1
        return response({"message": "expired"}, 401) if data_calls == 1 else response({"databases": []})

    client, transport = sync_stack(get_handler)
    with client:
        assert Databases(transport).list() == []
    assert (exchanges, data_calls) == (2, 2)

    mutation_calls = 0

    def mutation_handler(request: httpx.Request) -> httpx.Response:
        nonlocal mutation_calls
        if request.url.path == "/auth/credential":
            return session()
        mutation_calls += 1
        return response({"message": "expired"}, 401)

    client, transport = sync_stack(mutation_handler)
    with client, pytest.raises(JustDeployError) as raised:
        Databases(transport).query("database-id", "SELECT 1")
    assert raised.value.status == 401
    assert mutation_calls == 1


def test_database_and_mail_paths_bodies_and_pagination() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path == "/auth/credential":
            return session()
        if request.url.path.endswith("/query"):
            return response({"rows": [{"value": 1}]})
        if request.url.path.endswith("/tables") and request.method == "GET":
            return response({"tables": []})
        if request.url.path.endswith("/tables") and request.method == "POST":
            return response({"table": {"name": "orders", "columns": [], "comment": None}}, 201)
        if request.url.path.endswith("/tables/orders") and request.method == "PUT":
            return response({"table": {"name": "orders", "columns": [], "comment": "updated"}})
        if request.url.path.endswith("/tables/orders") and request.method == "DELETE":
            return response({"table": "orders"})
        if request.url.path.endswith("/mails") and request.method == "POST":
            return response({"mail": {"id": "mail-id"}}, 201)
        if request.url.path.endswith("/mails"):
            return response({"mails": [], "nextCursor": None})
        if request.url.path.endswith("/mails/mail-id"):
            return response({"mail": {"id": "mail-id"}})
        raise AssertionError(f"Unexpected request: {request.method} {request.url}")

    client, transport = sync_stack(handler)
    databases = Databases(transport)
    mail = MailClient(transport)
    with client:
        assert databases.query("db/id", "SELECT 1") == {"rows": [{"value": 1}]}
        databases.list_tables("db/id")
        databases.create_table("db/id", {"name": "orders", "columns": []})
        databases.update_table("db/id", "orders", {"comment": "updated"})
        databases.delete_table("db/id", "orders")
        mail.send(
            from_address="hello@example.com",
            to="user@example.net",
            subject="Hello",
            text="Hi",
            idempotency_key="welcome-1",
        )
        mail.list(limit=20, cursor=42)
        mail.get("mail-id")

    data_requests = requests[1:]
    assert str(data_requests[0].url) == f"{API}/organizations/{ORG}/databases/db%2Fid/query"
    assert json.loads(data_requests[0].content) == {"query": "SELECT 1"}
    assert data_requests[5].headers["idempotency-key"] == "welcome-1"
    assert json.loads(data_requests[5].content) == {
        "from": "hello@example.com",
        "to": "user@example.net",
        "subject": "Hello",
        "text": "Hi",
    }
    assert str(data_requests[6].url) == f"{API}/organizations/{ORG}/mails?limit=20&cursor=42"


async def test_async_database_and_mail_surface_matches_sync() -> None:
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path == "/auth/credential":
            return session()
        if request.url.path.endswith("/query"):
            return response({"id": 7})
        return response({"mail": {"id": "mail-id"}}, 201)

    client, transport = async_stack(handler)
    async with client:
        assert await AsyncDatabases(transport).query("database-id", "INSERT INTO items (name) VALUES ('a')") == {"id": 7}
        assert (
            await AsyncMailClient(transport).send(
                from_address="hello@example.com",
                to="user@example.net",
                subject="Hello",
                text="Hi",
            )
        )["id"] == "mail-id"
    assert [request.method for request in requests] == ["POST", "POST", "POST"]


def test_presigned_transfers_never_receive_justdeploy_authentication() -> None:
    requests: list[httpx.Request] = []
    upload_url = "https://uploads.example.test/object?signature=upload"
    download_url = "https://files.example.test/object?signature=download"
    file = {
        "id": "file-id",
        "name": "hello.txt",
        "path": "file-id",
        "mime": "text/plain",
        "size": 5,
        "status": "active",
        "error": None,
        "createdAt": "2026-01-01T00:00:00.000Z",
        "updatedAt": "2026-01-01T00:00:00.000Z",
    }

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        url = str(request.url)
        if request.url.path == "/auth/credential":
            return session()
        if request.url.path.endswith("/files") and request.method == "POST":
            return response({"files": [{**file, "status": "pending", "url": upload_url}]}, 201)
        if url == upload_url:
            return httpx.Response(200)
        if request.url.path.endswith("/files/file-id"):
            return response({"file": {**file, "url": download_url}})
        if url == download_url:
            return httpx.Response(200, content=b"hello", headers={"content-type": "text/plain", "content-length": "5"})
        raise AssertionError(f"Unexpected request: {request.method} {request.url}")

    client, transport = sync_stack(handler)
    client.headers.update({"authorization": "Bearer must-not-leak", "x-justdeploy-sdk": "must-not-leak", "cookie": "must-not-leak=1"})
    storages = Storages(transport)
    with client:
        uploaded = storages.upload("storage-id", name="hello.txt", mime="text/plain", data=b"hello")
        assert "url" not in uploaded
        with storages.download("storage-id", "file-id") as downloaded:
            assert b"".join(downloaded.iter_bytes()) == b"hello"
            assert downloaded.content_length == 5
            assert "url" not in downloaded.file

    transfer_requests = [request for request in requests if request.url.host in {"uploads.example.test", "files.example.test"}]
    assert len(transfer_requests) == 2
    for request in transfer_requests:
        assert "authorization" not in request.headers
        assert "x-justdeploy-sdk" not in request.headers
        assert "cookie" not in request.headers


async def test_async_presigned_transfers_are_streamed_without_authentication() -> None:
    requests: list[httpx.Request] = []
    upload_url = "https://uploads.example.test/object?signature=upload"
    download_url = "https://files.example.test/object?signature=download"
    file = {
        "id": "file-id",
        "name": "hello.txt",
        "path": "file-id",
        "mime": "text/plain",
        "size": 5,
        "status": "active",
        "error": None,
        "createdAt": "2026-01-01T00:00:00.000Z",
        "updatedAt": "2026-01-01T00:00:00.000Z",
    }

    async def chunks() -> Any:
        yield b"hello"

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        url = str(request.url)
        if request.url.path == "/auth/credential":
            return session()
        if request.url.path.endswith("/files") and request.method == "POST":
            return response({"files": [{**file, "status": "pending", "url": upload_url}]}, 201)
        if url == upload_url:
            assert await request.aread() == b"hello"
            return httpx.Response(200)
        if request.url.path.endswith("/files/file-id"):
            return response({"file": {**file, "url": download_url}})
        if url == download_url:
            return httpx.Response(200, content=b"hello")
        raise AssertionError(f"Unexpected request: {request.method} {request.url}")

    client, transport = async_stack(handler)
    client.headers.update({"authorization": "Bearer must-not-leak", "x-justdeploy-sdk": "must-not-leak", "cookie": "must-not-leak=1"})
    storages = AsyncStorages(transport)
    async with client:
        uploaded = await storages.upload("storage-id", name="hello.txt", mime="text/plain", data=chunks())
        assert "url" not in uploaded
        async with await storages.download("storage-id", "file-id") as downloaded:
            assert b"".join([chunk async for chunk in downloaded.aiter_bytes()]) == b"hello"

    for request in requests:
        if request.url.host in {"uploads.example.test", "files.example.test"}:
            assert "authorization" not in request.headers
            assert "x-justdeploy-sdk" not in request.headers
            assert "cookie" not in request.headers


def test_structured_error_keeps_api_fields_but_not_request_body() -> None:
    secret_sql = "SELECT 'private-value'"

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/auth/credential":
            return session()
        return response(
            {"status": 503, "message": "Database is temporarily unavailable.", "retryAfter": 2, "requestId": "request-1", "reason": "busy"},
            503,
        )

    client, transport = sync_stack(handler)
    with client, pytest.raises(JustDeployError) as raised:
        Databases(transport).query("database-id", secret_sql)
    error = raised.value
    assert error.status == 503
    assert error.retry_after == 2
    assert error.request_id == "request-1"
    assert error.details["reason"] == "busy"
    assert secret_sql not in repr(vars(error))
