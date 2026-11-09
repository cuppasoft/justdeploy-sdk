import os
import uuid
from collections.abc import Iterator

from justdeploy import JustDeploy


def _upload_chunks() -> Iterator[bytes]:
    yield b"JustDeploy "
    yield b"SDK streaming check"


def handler(_event: object, _context: object) -> dict[str, object]:
    file_id: str | None = None
    row_id: int | None = None

    database_id = os.environ.get("JUSTDEPLOY_DATABASE_ID")
    storage_id = os.environ.get("JUSTDEPLOY_STORAGE_ID")
    sender = os.environ.get("SDK_TEST_FROM")
    if not database_id or not storage_id or not sender:
        raise RuntimeError(
            "Set JUSTDEPLOY_DATABASE_ID, JUSTDEPLOY_STORAGE_ID and SDK_TEST_FROM after preparing the Playground resources through MCP."
        )

    with JustDeploy() as justdeploy:
        payload = b"JustDeploy SDK streaming check"

        try:
            inserted = justdeploy.databases.query(
                database_id,
                "INSERT INTO `sdk_checks` (`label`, `value`) VALUES (?, ?)",
                params=["before", 1],
            )
            inserted_id = inserted.get("id")
            if not isinstance(inserted_id, int) or isinstance(inserted_id, bool):
                raise RuntimeError("The insert did not return a row ID.")
            row_id = inserted_id
            selected = justdeploy.databases.query(
                database_id,
                "SELECT `label`, `value` FROM `sdk_checks` WHERE `id` = ?",
                params=[row_id],
            )
            if selected.get("rows") != [{"label": "before", "value": 1}]:
                raise RuntimeError("Unexpected inserted row.")

            justdeploy.databases.query(
                database_id,
                "UPDATE `sdk_checks` SET `label` = ?, `value` = ? WHERE `id` = ?",
                params=["after", 2, row_id],
            )
            updated = justdeploy.databases.query(
                database_id,
                "SELECT `label`, `value` FROM `sdk_checks` WHERE `id` = ?",
                params=[row_id],
            )
            if updated.get("rows") != [{"label": "after", "value": 2}]:
                raise RuntimeError("Unexpected updated row.")

            justdeploy.databases.query(database_id, "DELETE FROM `sdk_checks` WHERE `id` = ?", params=[row_id])
            deleted = justdeploy.databases.query(
                database_id,
                "SELECT `id` FROM `sdk_checks` WHERE `id` = ?",
                params=[row_id],
            )
            if deleted.get("rows") != []:
                raise RuntimeError("The database row was not deleted.")
            row_id = None

            stored = justdeploy.storages.upload(
                storage_id,
                name="justdeploy-sdk-streaming-check.txt",
                mime="text/plain",
                data=_upload_chunks(),
                size=len(payload),
            )
            file_id = stored["id"]
            with justdeploy.storages.download(storage_id, file_id) as download:
                downloaded = b"".join(download.iter_bytes(chunk_size=4))
            if downloaded != payload:
                raise RuntimeError("The downloaded storage content did not match the upload.")

            idempotency_key = f"python-sdk-check-{uuid.uuid4()}"
            mail_input = {
                "sender": sender,
                "to": "success@simulator.amazonses.com",
                "subject": "JustDeploy Python SDK development check",
                "text": "This message validates the development-only SDK path.",
                "tag": "sdk-development-check",
                "idempotency_key": idempotency_key,
            }
            first_mail = justdeploy.mail.send(**mail_input)
            replayed_mail = justdeploy.mail.send(**mail_input)
            if first_mail["id"] != replayed_mail["id"]:
                raise RuntimeError("The same mail idempotency key created two messages.")

            result = {
                "sdk": "python/0.2.2",
                "databaseDml": True,
                "storageStreaming": True,
                "mailIdempotency": True,
            }
            print(result)
            return result
        finally:
            try:
                if file_id is not None:
                    justdeploy.storages.delete_file(storage_id, file_id)
            finally:
                if row_id is not None:
                    justdeploy.databases.query(database_id, "DELETE FROM `sdk_checks` WHERE `id` = ?", params=[row_id])
