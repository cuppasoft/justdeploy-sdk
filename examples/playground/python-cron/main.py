import os
import uuid
from collections.abc import Iterator

from justdeploy import JustDeploy


def _upload_chunks() -> Iterator[bytes]:
    yield b"JustDeploy "
    yield b"SDK streaming check"


def handler(_event: object, _context: object) -> dict[str, object]:
    table_name = f"jd_sdk_verify_{uuid.uuid4().hex[:12]}"
    file_id: str | None = None
    table_created = False

    with JustDeploy() as justdeploy:
        databases = justdeploy.databases.list()
        storages = justdeploy.storages.list()
        if not databases or not storages:
            raise RuntimeError("The Playground organization needs at least one database and one storage.")

        database_id = databases[0]["id"]
        storage_id = storages[0]["id"]
        payload = b"JustDeploy SDK streaming check"

        try:
            justdeploy.databases.create_table(
                database_id,
                {
                    "name": table_name,
                    "columns": [
                        {"name": "label", "type": "string", "nullable": False},
                        {"name": "value", "type": "integer", "nullable": False},
                    ],
                },
            )
            table_created = True
            inserted = justdeploy.databases.query(
                database_id,
                f"INSERT INTO `{table_name}` (`label`, `value`) VALUES ('before', 1)",
            )
            row_id = inserted["id"]
            selected = justdeploy.databases.query(
                database_id,
                f"SELECT `label`, `value` FROM `{table_name}` WHERE `id` = {row_id}",
            )
            if selected["rows"] != [{"label": "before", "value": 1}]:
                raise RuntimeError(f"Unexpected inserted row: {selected['rows']!r}")

            justdeploy.databases.query(
                database_id,
                f"UPDATE `{table_name}` SET `label` = 'after', `value` = 2 WHERE `id` = {row_id}",
            )
            updated = justdeploy.databases.query(
                database_id,
                f"SELECT `label`, `value` FROM `{table_name}` WHERE `id` = {row_id}",
            )
            if updated["rows"] != [{"label": "after", "value": 2}]:
                raise RuntimeError(f"Unexpected updated row: {updated['rows']!r}")

            justdeploy.databases.query(database_id, f"DELETE FROM `{table_name}` WHERE `id` = {row_id}")
            deleted = justdeploy.databases.query(
                database_id,
                f"SELECT `id` FROM `{table_name}` WHERE `id` = {row_id}",
            )
            if deleted["rows"]:
                raise RuntimeError("The database row was not deleted.")

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

            sender = os.environ["SDK_TEST_FROM"]
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
                "sdk": "python/0.1.1",
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
                if table_created:
                    justdeploy.databases.delete_table(database_id, table_name)
