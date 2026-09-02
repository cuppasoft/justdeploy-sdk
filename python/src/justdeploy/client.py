from types import TracebackType

import httpx

from ._auth import AsyncAuthManager, SyncAuthManager
from ._transport import AsyncTransport, SyncTransport
from .databases import AsyncDatabases, Databases
from .mail import AsyncMailClient, MailClient
from .storages import AsyncStorages, Storages


class JustDeploy:
    def __init__(self) -> None:
        self._client = httpx.Client(follow_redirects=False, timeout=30.0)
        transport = SyncTransport(self._client, SyncAuthManager(self._client))
        self.databases = Databases(transport)
        self.storages = Storages(transport)
        self.mail = MailClient(transport)

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "JustDeploy":
        return self

    def __exit__(
        self,
        _exception_type: type[BaseException] | None,
        _exception: BaseException | None,
        _traceback: TracebackType | None,
    ) -> None:
        self.close()


class AsyncJustDeploy:
    def __init__(self) -> None:
        self._client = httpx.AsyncClient(follow_redirects=False, timeout=30.0)
        transport = AsyncTransport(self._client, AsyncAuthManager(self._client))
        self.databases = AsyncDatabases(transport)
        self.storages = AsyncStorages(transport)
        self.mail = AsyncMailClient(transport)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> "AsyncJustDeploy":
        return self

    async def __aexit__(
        self,
        _exception_type: type[BaseException] | None,
        _exception: BaseException | None,
        _traceback: TracebackType | None,
    ) -> None:
        await self.aclose()
