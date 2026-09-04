# `justdeploy-sdk`

The official JustDeploy SDK for server-side CPython 3.12, 3.13, and 3.14. Import it as `justdeploy`.

> SDK 0.1.1 is public. Production supports local Credential authentication and automatic identity in deployed web, API, and cron applications. Development SDK access remains limited to Playground.

## Install

```bash
python -m pip install justdeploy-sdk==0.1.1
```

## Client

Create one client and reuse it. It accepts no arguments. A context manager closes its connection pool.

```python
from justdeploy import JustDeploy

with JustDeploy() as justdeploy:
    result = justdeploy.databases.query("your-database-id", "SELECT * FROM orders")
```

Async applications use the matching API:

```python
from justdeploy import AsyncJustDeploy


async def read_orders() -> None:
    async with AsyncJustDeploy() as justdeploy:
        result = await justdeploy.databases.query("your-database-id", "SELECT * FROM orders")
```

For local development, set both `JUSTDEPLOY_ACCESS_KEY` and `JUSTDEPLOY_SECRET_KEY` in the process environment, using a Production Credential and resource IDs from the same organization. Deployed JustDeploy applications need no SDK configuration. A local client cannot use Development Credentials; test a Development organization in its deployed Playground app. If a deployed application explicitly keeps both variables, the SDK accepts and prioritizes them; build feedback recommends the simpler automatic deployment identity without blocking the build.

## Database

The examples below run inside an open `with JustDeploy() as justdeploy:` block, using your existing resource IDs. Prepare schema once before starting the application, not on each startup.

```python
databases = justdeploy.databases.list()
result = justdeploy.databases.query(database_id, "SELECT * FROM orders")

tables = justdeploy.databases.list_tables(database_id)
table = justdeploy.databases.create_table(
    database_id,
    {
        "name": "orders",
        "columns": [{"name": "customer", "type": "string", "nullable": False}],
    },
)
justdeploy.databases.update_table(
    database_id,
    "orders",
    {
        "add": [{"name": "paid", "type": "boolean", "default": False}],
    },
)
justdeploy.databases.delete_table(database_id, "orders")
```

`query` accepts only the data statements allowed by the JustDeploy API. Use the table methods for schema changes. Add `await` to each call when using `AsyncJustDeploy`.

A read returns `{"rows": [...]}`; a write returns `{"id": ...}`, not `affectedRows`. The SQL argument is a string, not a parameter array; follow your `DATABASE.md` for safe text values.

## Storage

```python
storages = justdeploy.storages.list()
file = justdeploy.storages.upload(
    storage_id,
    name="hello.txt",
    mime="text/plain",
    data=b"hello",
)

page = justdeploy.storages.list_files(storage_id, limit=50)
info = justdeploy.storages.get_file(storage_id, file["id"])

with justdeploy.storages.download(storage_id, file["id"]) as download:
    for chunk in download.iter_bytes():
        # Process each chunk without buffering the whole file.
        pass

justdeploy.storages.delete_file(storage_id, file["id"])
```

The async download must be awaited before entering its context:

```python
async def stream_file(storage_id: str, file_id: str) -> None:
    async with AsyncJustDeploy() as justdeploy:
        async with await justdeploy.storages.download(storage_id, file_id) as download:
            async for chunk in download.aiter_bytes():
                pass
```

Upload and download bytes stream directly to the signed Storage URL without a JustDeploy authentication header.
When upload data is an iterator or async iterator, pass its exact byte length as `size`. Byte strings and seekable binary files are measured automatically.
If a download races with a still-finishing upload, retry after the SDK's clear pending-upload error.

Upload results have no signed URL. In 0.1.1, `file["size"]` is the number of bytes successfully transferred; 0.1.0 returns the initial `0`. Recorded metadata may remain `pending` briefly: use `get_file` after it becomes `active` for the final server record. Save the file ID, not the expiring URL.

Returned JSON keys stay camelCase in Python. For pagination, pass `page["nextCursor"]` as the next call's `cursor` until it is null; there is no `next_cursor` response key.

## Mail

```python
mail = justdeploy.mail.send(
    sender="hello@your-verified-domain.example",
    to="user@example.com",
    subject="Welcome",
    text="Thanks for joining.",
    idempotency_key="welcome-user-123",
)

page = justdeploy.mail.list(limit=50)
current = justdeploy.mail.get(mail["id"])
```

Use a stable, unique `idempotency_key` when a caller might retry a mail request after losing the response. A successful send response means accepted, not delivered; check `mail["status"]` later if delivery matters.

## Errors and cancellation

All SDK and API failures extend `JustDeployError`. API errors expose `status`, `retry_after`, `request_id`, and `details`. Request bodies, SQL, file content, and authentication values are not retained in SDK errors.

Async calls use normal Python task cancellation. Cancel the task with `task.cancel()`; a canceled upload also tries to remove its pending file record. Sync calls and all API requests have a 30-second timeout.

The SDK may refresh authentication and repeat one failed `GET` once. It never automatically repeats a mutation.
