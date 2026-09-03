# `justdeploy-sdk`

The official JustDeploy SDK for server-side CPython 3.12, 3.13, and 3.14. Import it as `justdeploy`.

> This package has not been published yet.
>
> SDK authentication is currently enabled only for deployed projects in the Development Playground. Local SDK Credential exchange and deployed Production SDK calls remain disabled until the separate Production rollout.

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

async with AsyncJustDeploy() as justdeploy:
    result = await justdeploy.databases.query("your-database-id", "SELECT * FROM orders")
```

After the Production rollout, local development sets both `JUSTDEPLOY_ACCESS_KEY` and `JUSTDEPLOY_SECRET_KEY` in the process environment, while a deployed JustDeploy application needs no SDK configuration. Today, only the no-configuration path of a project deployed in the Development Playground is enabled. If a deployed application explicitly keeps both variables, the SDK accepts and prioritizes them; build feedback will recommend the simpler automatic deployment identity without blocking the build.

## Database

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

The async download uses `async with` and `async for chunk in download.aiter_bytes()`. Upload and download bytes stream directly to the signed Storage URL without a JustDeploy authentication header.
When upload data is an iterator or async iterator, pass its exact byte length as `size`. Byte strings and seekable binary files are measured automatically.
If a download races with a still-finishing upload, retry after the SDK's clear pending-upload error.

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
