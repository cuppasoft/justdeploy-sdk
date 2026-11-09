from __future__ import annotations

import importlib.util
from contextlib import nullcontext
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest


def fixture(monkeypatch: pytest.MonkeyPatch, *, fail_at: str | None = None) -> tuple[Any, list[Any]]:
    path = Path(__file__).parents[2] / "examples/playground/python-cron/main.py"
    spec = importlib.util.spec_from_file_location("playground", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    calls: list[Any] = []
    row: dict[str, Any] | None = None
    payload = b"JustDeploy SDK streaming check"

    def query(database: str, sql: str, *, params: list[Any]) -> dict[str, Any]:
        nonlocal row
        assert database == "database"
        assert "`sdk_checks`" in sql
        operation = sql.split(" ")[0]
        calls.append(operation)
        if operation == "INSERT":
            row = {"label": params[0], "value": params[1]}
            return {"id": 42}
        assert params[-1] == 42, "Only this run's row may be read or changed"
        if operation == "DELETE":
            row = None
            return {}
        if operation == "UPDATE":
            row = {"label": params[0], "value": params[1]}
            return {}
        assert operation == "SELECT"
        if fail_at == "query":
            raise RuntimeError("query failed")
        return {"rows": [row] if row else []}

    def upload(storage: str, **kwargs: Any) -> dict[str, str]:
        assert storage == "storage"
        assert kwargs["size"] == len(payload)
        assert b"".join(kwargs["data"]) == payload
        calls.append("upload")
        return {"id": "own-file"}

    def download(storage: str, file_id: str) -> Any:
        assert (storage, file_id) == ("storage", "own-file")
        calls.append("download")
        if fail_at == "download":
            raise RuntimeError("download failed")
        return nullcontext(SimpleNamespace(iter_bytes=lambda **_kwargs: iter([payload])))

    def delete_file(storage: str, file_id: str) -> None:
        assert (storage, file_id) == ("storage", "own-file")
        calls.append("delete_file")

    def send(**kwargs: Any) -> dict[str, str]:
        assert kwargs["to"] == "success@simulator.amazonses.com"
        calls.append(kwargs)
        return {"id": "own-mail"}

    sdk = SimpleNamespace(
        databases=SimpleNamespace(query=query),
        storages=SimpleNamespace(upload=upload, download=download, delete_file=delete_file),
        mail=SimpleNamespace(send=send),
    )
    monkeypatch.setattr(module, "JustDeploy", lambda: nullcontext(sdk))
    for key, value in {
        "JUSTDEPLOY_DATABASE_ID": "database",
        "JUSTDEPLOY_STORAGE_ID": "storage",
        "SDK_TEST_FROM": "test@example.com",
    }.items():
        monkeypatch.setenv(key, value)
    return module.handler, calls


def test_playground_uses_prepared_resources_and_only_its_own_data(monkeypatch: pytest.MonkeyPatch) -> None:
    run, calls = fixture(monkeypatch)
    assert run(None, None) == {"sdk": "python/0.2.2", "databaseDml": True, "storageStreaming": True, "mailIdempotency": True}
    assert calls.count("DELETE") == 1
    assert calls[-1] == "delete_file"
    mails = [call for call in calls if isinstance(call, dict)]
    assert len(mails) == 2
    assert mails[0] == mails[1]


@pytest.mark.parametrize("key", ["JUSTDEPLOY_DATABASE_ID", "JUSTDEPLOY_STORAGE_ID", "SDK_TEST_FROM"])
def test_playground_requires_setup_before_sdk_calls(monkeypatch: pytest.MonkeyPatch, key: str) -> None:
    run, calls = fixture(monkeypatch)
    monkeypatch.delenv(key)
    with pytest.raises(RuntimeError, match="preparing the Playground resources through MCP"):
        run(None, None)
    assert calls == []


@pytest.mark.parametrize("fail_at", ["query", "download"])
def test_playground_cleans_only_known_resources_after_failure(monkeypatch: pytest.MonkeyPatch, fail_at: str) -> None:
    run, calls = fixture(monkeypatch, fail_at=fail_at)
    with pytest.raises(RuntimeError, match=f"{fail_at} failed"):
        run(None, None)
    assert calls[-1] == ("DELETE" if fail_at == "query" else "delete_file")
    assert calls.count("DELETE") == 1
    assert not any(isinstance(call, dict) for call in calls)
