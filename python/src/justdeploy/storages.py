from contextlib import suppress
from typing import cast

import httpx

from ._transport import AsyncTransport, SyncTransport
from ._validation import page_query, path_segment
from .errors import JustDeployError, JustDeployValidationError
from .types import AsyncFileDownload, AsyncUploadBody, FileDownload, FileInfo, FilePage, Storage, StoredFile, SyncUploadBody


def _without_url(file: FileInfo) -> StoredFile:
    stored = dict(file)
    stored.pop("url", None)
    return cast(StoredFile, stored)


def _content_length(response: httpx.Response) -> int | None:
    raw = response.headers.get("content-length")
    if raw is None:
        return None
    try:
        value = int(raw)
    except ValueError:
        return None
    return value if value >= 0 else None


def _known_upload_size(data: SyncUploadBody | AsyncUploadBody) -> int | None:
    if isinstance(data, bytes):
        return len(data)
    if not hasattr(data, "tell") or not hasattr(data, "seek"):
        return None

    stream = cast(object, data)
    position: int | None = None
    try:
        position = stream.tell()  # type: ignore[attr-defined]
        stream.seek(0, 2)  # type: ignore[attr-defined]
        end = stream.tell()  # type: ignore[attr-defined]
        return end - position if isinstance(position, int) and isinstance(end, int) and end >= position else None
    except (OSError, TypeError, ValueError):
        return None
    finally:
        if position is not None:
            with suppress(OSError, TypeError, ValueError):
                stream.seek(position)  # type: ignore[attr-defined]


def _upload_size(data: SyncUploadBody | AsyncUploadBody, supplied: int | None) -> int:
    if supplied is not None and (isinstance(supplied, bool) or not isinstance(supplied, int) or supplied < 0):
        raise JustDeployValidationError("upload size must be a non-negative integer.")

    known = _known_upload_size(data)
    if known is not None:
        if supplied is not None and supplied != known:
            raise JustDeployValidationError(f"upload size {supplied} does not match the {known}-byte data.")
        return known
    if supplied is None:
        raise JustDeployValidationError("upload size is required when data is streamed. Provide the exact byte length.")
    return supplied


class Storages:
    def __init__(self, transport: SyncTransport) -> None:
        self._transport = transport

    def list(self) -> list[Storage]:
        result = cast(dict[str, list[Storage]], self._transport.organization_request("GET", "/storages"))
        return result["storages"]

    def list_files(self, storage_id: str, *, limit: int | None = None, cursor: int | None = None) -> FilePage:
        return cast(
            FilePage,
            self._transport.organization_request(
                "GET",
                f"/storages/{path_segment(storage_id, 'storage_id')}/files{page_query(limit=limit, cursor=cursor, max_limit=200)}",
            ),
        )

    def get_file(self, storage_id: str, file_id: str) -> FileInfo:
        result = cast(
            dict[str, FileInfo],
            self._transport.organization_request(
                "GET",
                f"/storages/{path_segment(storage_id, 'storage_id')}/files/{path_segment(file_id, 'file_id')}",
            ),
        )
        return result["file"]

    def upload(self, storage_id: str, *, name: str, mime: str, data: SyncUploadBody, size: int | None = None) -> StoredFile:
        if not isinstance(name, str) or not name:
            raise JustDeployValidationError("upload name must be a non-empty string.")
        if not isinstance(mime, str) or not mime:
            raise JustDeployValidationError("upload mime must be a non-empty string.")
        # S3 presigned PUT rejects HTTP chunked transfer. Validate before creating
        # the pending file record so an invalid stream cannot leave an orphaned row.
        content_length = _upload_size(data, size)
        result = cast(
            dict[str, list[FileInfo]],
            self._transport.organization_request(
                "POST",
                f"/storages/{path_segment(storage_id, 'storage_id')}/files",
                json_body={"files": [{"name": name, "mime": mime}]},
            ),
        )
        files = result.get("files", [])
        if not files or not isinstance(files[0].get("url"), str):
            raise JustDeployError("JustDeploy returned an invalid file upload response.")
        file = files[0]
        try:
            response = self._transport.presigned_upload(file["url"], mime=mime, data=data, size=content_length)
        except JustDeployError:
            self._cleanup_failed_upload(storage_id, file["id"])
            raise
        if not response.is_success:
            response.close()
            self._cleanup_failed_upload(storage_id, file["id"])
            raise JustDeployError(f"The file upload failed with status {response.status_code}.", status=response.status_code)
        response.close()
        return _without_url(file)

    def download(self, storage_id: str, file_id: str) -> FileDownload:
        file = self.get_file(storage_id, file_id)
        response = self._transport.presigned_download(file["url"])
        if not response.is_success:
            response.close()
            raise JustDeployError(f"The file download failed with status {response.status_code}.", status=response.status_code)
        return FileDownload(_without_url(file), response.headers.get("content-type"), _content_length(response), response)

    def delete_file(self, storage_id: str, file_id: str) -> None:
        self._transport.organization_request(
            "DELETE",
            f"/storages/{path_segment(storage_id, 'storage_id')}/files/{path_segment(file_id, 'file_id')}",
        )

    def _cleanup_failed_upload(self, storage_id: str, file_id: str) -> None:
        # Preserve the transfer failure. A remaining pending record is safer than
        # replacing the actionable error with a cleanup failure.
        with suppress(JustDeployError):
            self.delete_file(storage_id, file_id)


class AsyncStorages:
    def __init__(self, transport: AsyncTransport) -> None:
        self._transport = transport

    async def list(self) -> list[Storage]:
        result = cast(dict[str, list[Storage]], await self._transport.organization_request("GET", "/storages"))
        return result["storages"]

    async def list_files(self, storage_id: str, *, limit: int | None = None, cursor: int | None = None) -> FilePage:
        return cast(
            FilePage,
            await self._transport.organization_request(
                "GET",
                f"/storages/{path_segment(storage_id, 'storage_id')}/files{page_query(limit=limit, cursor=cursor, max_limit=200)}",
            ),
        )

    async def get_file(self, storage_id: str, file_id: str) -> FileInfo:
        result = cast(
            dict[str, FileInfo],
            await self._transport.organization_request(
                "GET",
                f"/storages/{path_segment(storage_id, 'storage_id')}/files/{path_segment(file_id, 'file_id')}",
            ),
        )
        return result["file"]

    async def upload(self, storage_id: str, *, name: str, mime: str, data: AsyncUploadBody, size: int | None = None) -> StoredFile:
        if not isinstance(name, str) or not name:
            raise JustDeployValidationError("upload name must be a non-empty string.")
        if not isinstance(mime, str) or not mime:
            raise JustDeployValidationError("upload mime must be a non-empty string.")
        content_length = _upload_size(data, size)
        result = cast(
            dict[str, list[FileInfo]],
            await self._transport.organization_request(
                "POST",
                f"/storages/{path_segment(storage_id, 'storage_id')}/files",
                json_body={"files": [{"name": name, "mime": mime}]},
            ),
        )
        files = result.get("files", [])
        if not files or not isinstance(files[0].get("url"), str):
            raise JustDeployError("JustDeploy returned an invalid file upload response.")
        file = files[0]
        try:
            response = await self._transport.presigned_upload(file["url"], mime=mime, data=data, size=content_length)
        except JustDeployError:
            await self._cleanup_failed_upload(storage_id, file["id"])
            raise
        if not response.is_success:
            await response.aclose()
            await self._cleanup_failed_upload(storage_id, file["id"])
            raise JustDeployError(f"The file upload failed with status {response.status_code}.", status=response.status_code)
        await response.aclose()
        return _without_url(file)

    async def download(self, storage_id: str, file_id: str) -> AsyncFileDownload:
        file = await self.get_file(storage_id, file_id)
        response = await self._transport.presigned_download(file["url"])
        if not response.is_success:
            await response.aclose()
            raise JustDeployError(f"The file download failed with status {response.status_code}.", status=response.status_code)
        return AsyncFileDownload(_without_url(file), response.headers.get("content-type"), _content_length(response), response)

    async def delete_file(self, storage_id: str, file_id: str) -> None:
        await self._transport.organization_request(
            "DELETE",
            f"/storages/{path_segment(storage_id, 'storage_id')}/files/{path_segment(file_id, 'file_id')}",
        )

    async def _cleanup_failed_upload(self, storage_id: str, file_id: str) -> None:
        with suppress(JustDeployError):
            await self.delete_file(storage_id, file_id)
