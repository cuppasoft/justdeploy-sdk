# `justdeploy-sdk`

The official JustDeploy SDK for server-side CPython 3.12, 3.13, and 3.14. Import it as `justdeploy`.

Production supports local Credential authentication and automatic identity in deployed web, API, and cron applications. Development SDK access remains limited to Playground.

## Setup through your AI

Use **AI Plugin** in [Console](https://console.justdeploy.ai/console/mcp) to connect
your desktop AI, then ask it to prepare your app’s resources and table structure.
The SDK runs in your app; the Plugin runs in your AI. Never reuse personal Plugin
credentials in application code. See the [shared setup and API boundary](../README.md#application-api-scope)
and the [application API reference](https://www.justdeploy.ai/docs/api).

In Development, resource lists and table-management methods return `403`. Production
retains those existing methods. The runtime examples below use IDs supplied through
server environment variables and tables already prepared through MCP.

## Install

```bash
python -m pip install justdeploy-sdk==0.2.2
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
result = justdeploy.databases.query(database_id, "SELECT * FROM orders WHERE customer = ?", params=[customer])
```

`query` accepts only the data statements allowed by the JustDeploy API. Ask your
connected AI to change the schema through MCP; do not create tables on app startup.
Add `await` to each call when using `AsyncJustDeploy`.

A read returns `{"rows": [...]}`; a write returns `{"id": ...}`, not `affectedRows`. Separate calls do not share a transaction.

Pass input values in `params` (a list or tuple), using one unquoted `?` per value. Strings, finite numbers, booleans and None are supported. Send integers outside ±9,007,199,254,740,991 and exact decimals as strings; serialize dates and JSON explicitly. Objects and nested arrays are rejected. Never interpolate user input or quote the placeholders yourself.

Placeholders cannot replace table/column names or SQL fragments. Keep identifiers fixed or use an app-owned allowlist. `LIMIT ?` is not supported; validate a bounded integer before placing a LIMIT number in SQL. Existing calls without parameters remain supported.

## Storage

### Browser files: direct upload

On your app server, authenticate the user and check upload permission before calling:

```python
upload = justdeploy.storages.create_upload_url(storage_id, name="image.jpg", mime="image/jpeg")
# Return only upload to that browser, with Cache-Control: no-store.
# AsyncJustDeploy uses the same arguments with await.
```

It returns `{fileId, url, method: "PUT", headers, expiresAt}`. In the browser:

```js
const response = await fetch(upload.url, {
  method: upload.method, headers: upload.headers, body: selectedFile,
  credentials: 'omit', redirect: 'error',
});
if (!response.ok) throw new Error(`Upload failed (${response.status}).`);
// Save upload.fileId through your app API. No active-state wait is needed.
```

File bytes go directly to Storage. Do not install the SDK in the browser or send it a Credential/session token. Do not add Authorization or Content-Length. The platform manages browser access; no bucket/origin configuration is required.

The URL is temporary bearer permission: do not log, cache or persist it. `expiresAt` is the latest permitted expiry and revocation can invalidate it earlier. It is not one-time and can overwrite the same file while valid. App-side size checks are not an enforced upload-size limit.

Every call prepares a **new file** and is never automatically retried. A lost response may already have created a file; do not blindly create another. For explicit cancellation, delete the file if its ID is known. Platform cleanup covers abandoned pending files; this method cannot observe browser failures or clean them up immediately.

### Server files: upload bytes or a stream

```python
file = justdeploy.storages.upload(
    storage_id,
    name="hello.txt",
    mime="text/plain",
    data=b"hello",
)

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

Upload results have no signed URL. `file["size"]` is the number of bytes successfully transferred. After PUT succeeds, the file can be read without waiting for `active`; metadata may still be `pending`. Before PUT succeeds, `pending` alone does not prove bytes exist. Use `get_file` again only when final metadata is needed. Save the file ID, not the expiring URL.

Returned JSON keys stay camelCase in Python. Keep the file ID returned by upload
for later reads and deletion; do not list files to rediscover it.

Transfer failures are safe SDK errors, not unchanged exceptions from your byte source. Failed uploads try to remove the pending record; cleanup failure does not replace the transfer error or cancellation.

A successful delete accepts the deletion. GET/list metadata may update later; an immediate stale read does not make the delete a failure. For cleanup verification, recheck the same ID after a short delay.

## Mail

```python
mail = justdeploy.mail.send(
    sender="hello@your-verified-domain.example",
    to="user@example.com",
    subject="Welcome",
    text="Thanks for joining.",
    idempotency_key="welcome-user-123",
)

current = justdeploy.mail.get(mail["id"])
```

Use one `idempotency_key` per operation. A retry keeps its key and content; each new password reset needs a new key. The same key with different content is rejected with 409. SDK input uses `sender`; REST input and returned records use `from`. `delivered` means the receiving server accepted the message, not inbox placement. See the shared [Mail and tracking rules](../README.md#request-behavior).

## Existing Production management methods

These methods remain available in the published SDK for existing Production apps.
They return `403` in Development. Use MCP for new resource-discovery and schema workflows.
Async clients expose the same methods with `await`.

```python
databases = justdeploy.databases.list()
tables = justdeploy.databases.list_tables(database_id)
table = justdeploy.databases.create_table(
    database_id,
    {"name": "orders", "columns": [{"name": "customer", "type": "string", "nullable": False}]},
)
justdeploy.databases.update_table(database_id, "orders", {"add": [{"name": "paid", "type": "boolean", "default": False}]})
justdeploy.databases.delete_table(database_id, "orders")
storages = justdeploy.storages.list()
files = justdeploy.storages.list_files(storage_id, limit=50)
mails = justdeploy.mail.list(limit=50)
```

For lists that support pagination, pass `nextCursor` as `cursor` until it is None;
there is no `next_cursor` response key.

## Errors and cancellation

Handle SDK failures with `JustDeployError`. API errors expose `status`, `retry_after`, `request_id`, and `details`. For diagnostics, record only `status` and `request_id`, not the whole error, request, SQL, file contents, or credentials. Cancellation does not prove a write was rolled back. Authentication and API time limits are separate; see [request behavior](../README.md#request-behavior).

Authentication and API errors prefer valid JSON diagnostics and fall back to `Retry-After` and `X-Request-Id` headers. `retry_after` is a positive integer in seconds within JavaScript's safe integer range, or `None`; HTTP-date values are not used. `request_id` is a validated identifier, or `None`. Non-JSON errors keep valid header diagnostics without exposing the response body. A delay does not trigger an automatic retry.

Async calls use normal Python task cancellation. Cancel the task with `task.cancel()`; a canceled upload also tries to remove its pending file record. Authentication exchanges have a 10-second timeout; ordinary JustDeploy API requests have a 30-second timeout.

The SDK may refresh authentication and repeat one failed `GET` once. It never automatically repeats a mutation.
