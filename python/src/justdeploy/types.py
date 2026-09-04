from collections.abc import AsyncIterable, Iterable
from dataclasses import dataclass, field
from typing import IO, Literal, NotRequired, TypedDict

import httpx

from .errors import JustDeployError

type JsonPrimitive = str | int | float | bool | None
type JsonValue = JsonPrimitive | list[JsonValue] | dict[str, JsonValue]
type JsonObject = dict[str, JsonValue]


class Database(TypedDict):
    id: str
    name: str
    stage: Literal["production", "development"]
    createdAt: str
    updatedAt: str


type ColumnType = Literal["string", "text", "integer", "float", "boolean", "date", "json"]


class ColumnDefinition(TypedDict):
    name: str
    type: ColumnType
    nullable: NotRequired[bool]
    unique: NotRequired[bool]
    default: NotRequired[str | int | float | bool | None]
    comment: NotRequired[str]


class Column(TypedDict):
    name: str
    type: ColumnType
    nullable: bool
    unique: bool
    default: str | int | float | bool | None
    comment: str | None


class Table(TypedDict):
    name: str
    comment: str | None
    columns: list[Column]


class CreateTableInput(TypedDict):
    name: str
    columns: list[ColumnDefinition]
    comment: NotRequired[str]


RenameDefinition = TypedDict("RenameDefinition", {"from": str, "to": str})


class UpdateTableInput(TypedDict):
    add: NotRequired[list[ColumnDefinition]]
    modify: NotRequired[list[ColumnDefinition]]
    rename: NotRequired[list[RenameDefinition]]
    drop: NotRequired[list[str]]
    reorder: NotRequired[list[str]]
    comment: NotRequired[str | None]


class RowsResult(TypedDict):
    rows: list[JsonObject]


class InsertResult(TypedDict):
    id: int


type QueryResult = RowsResult | InsertResult


class Storage(TypedDict):
    id: str
    name: str
    status: Literal["active", "deleting", "deleted"]
    createdAt: str
    updatedAt: str


class StoredFile(TypedDict):
    id: str
    name: str
    path: str
    mime: str
    size: int
    # Metadata state: a completed upload may still be pending while its bytes are already readable.
    status: Literal["pending", "active", "deleted"]
    error: str | None
    createdAt: str
    updatedAt: str


class FileInfo(StoredFile):
    # Short-lived download URL: use for browser redirects, or download() for server-side reads.
    url: str


class UploadUrl(TypedDict):
    fileId: str
    # Temporary bearer permission. Never log/store it or attach organization credentials.
    url: str
    method: Literal["PUT"]
    headers: dict[str, str]
    # Latest server-reported expiry; may become invalid earlier. Not a one-time URL.
    expiresAt: str


class FilePage(TypedDict):
    files: list[StoredFile]
    nextCursor: int | None


type SyncUploadBody = bytes | Iterable[bytes] | IO[bytes]
type AsyncUploadBody = bytes | AsyncIterable[bytes]


type MailStatus = Literal["sent", "delivered", "bounced", "complained", "rejected", "failed"]


Mail = TypedDict(
    "Mail",
    {
        "id": str,
        "from": str,
        "to": str,
        "status": MailStatus,
        "tag": str | None,
        # Recipient server acceptance, not proof of inbox placement.
        "deliveredAt": str | None,
        # Tracking-image activity, not proof a person read the mail; clients may block or preload it.
        "openedAt": str | None,
        "error": str | None,
        "createdAt": str,
        "updatedAt": str,
    },
)


class MailPage(TypedDict):
    mails: list[Mail]
    nextCursor: int | None


@dataclass(frozen=True, slots=True)
class FileDownload:
    file: StoredFile
    content_type: str | None
    content_length: int | None
    _response: httpx.Response = field(repr=False, compare=False)

    def iter_bytes(self, chunk_size: int | None = None) -> Iterable[bytes]:
        try:
            yield from self._response.iter_bytes(chunk_size)
        except httpx.HTTPError:
            raise JustDeployError("The file transfer was interrupted.") from None

    def close(self) -> None:
        self._response.close()

    def __enter__(self) -> "FileDownload":
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()


@dataclass(frozen=True, slots=True)
class AsyncFileDownload:
    file: StoredFile
    content_type: str | None
    content_length: int | None
    _response: httpx.Response = field(repr=False, compare=False)

    def aiter_bytes(self, chunk_size: int | None = None) -> AsyncIterable[bytes]:
        async def iterate() -> AsyncIterable[bytes]:
            try:
                async for chunk in self._response.aiter_bytes(chunk_size):
                    yield chunk
            except httpx.HTTPError:
                raise JustDeployError("The file transfer was interrupted.") from None

        return iterate()

    async def aclose(self) -> None:
        await self._response.aclose()

    async def __aenter__(self) -> "AsyncFileDownload":
        return self

    async def __aexit__(self, *_args: object) -> None:
        await self.aclose()
