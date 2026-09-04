# `@justdeploy/sdk`

The official JustDeploy SDK for server-side Node.js 22 and 24. The package includes ESM, CommonJS, and TypeScript declarations.

Production supports local Credential authentication and automatic identity in deployed web, API, and cron applications. Development SDK access remains limited to Playground.

## Install

```bash
npm install @justdeploy/sdk@0.2.0
```

## Client

Create one client and reuse it. It accepts no arguments.

```ts
import { JustDeploy } from '@justdeploy/sdk';

const justdeploy = new JustDeploy();
```

For CommonJS:

```js
const { JustDeploy } = require('@justdeploy/sdk');

const justdeploy = new JustDeploy();
```

For local development, set both `JUSTDEPLOY_ACCESS_KEY` and `JUSTDEPLOY_SECRET_KEY` in the process environment, using a Production Credential and resource IDs from the same organization. Deployed JustDeploy applications need no SDK configuration. A local client cannot use Development Credentials; test a Development organization in its deployed Playground app. If a deployed application explicitly keeps both variables, the SDK accepts and prioritizes them; build feedback recommends the simpler automatic deployment identity without blocking the build.

## Database

```ts
const databases = await justdeploy.databases.list();
const result = await justdeploy.databases.query(databaseId,
  'SELECT * FROM orders WHERE customer = ?', { params: [customer] });

const tables = await justdeploy.databases.listTables(databaseId);
const table = await justdeploy.databases.createTable(databaseId, {
  name: 'orders',
  columns: [{ name: 'customer', type: 'string', nullable: false }],
});
await justdeploy.databases.updateTable(databaseId, 'orders', {
  add: [{ name: 'paid', type: 'boolean', default: false }],
});
await justdeploy.databases.deleteTable(databaseId, 'orders');
```

`query` accepts only the data statements allowed by the JustDeploy API. Use the table methods for schema changes.

Prepare schema once before starting the application. A read returns `{ rows }`; a write returns `{ id }`, not `affectedRows`. Separate calls do not share a transaction.

Pass input values in `params`, using one unquoted `?` per value. Strings, finite numbers, booleans and null are supported. Send integers outside ±9,007,199,254,740,991 and exact decimals as strings; serialize dates and JSON explicitly. Objects, nested arrays and undefined are rejected. Never interpolate user input or quote the placeholders yourself.

Placeholders cannot replace table/column names or SQL fragments. Keep identifiers fixed or use an app-owned allowlist. `LIMIT ?` is not supported; validate a bounded integer before placing a LIMIT number in SQL. Calls without parameters and the existing `signal` option remain supported.

## Storage

### Browser files: direct upload

On your app server, authenticate the user and check upload permission before calling:

```ts
const upload = await justdeploy.storages.createUploadUrl(storageId, {
  name: 'image.jpg', mime: 'image/jpeg',
});
// Return only upload to that browser, with Cache-Control: no-store.
```

It returns `{ fileId, url, method: 'PUT', headers, expiresAt }`. In the browser:

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

```ts
const storages = await justdeploy.storages.list();

const file = await justdeploy.storages.upload(storageId, {
  name: 'hello.txt',
  mime: 'text/plain',
  data: new TextEncoder().encode('hello'),
});

const page = await justdeploy.storages.listFiles(storageId, { limit: 50 });
const info = await justdeploy.storages.getFile(storageId, file.id);

const download = await justdeploy.storages.download(storageId, file.id);
for await (const chunk of download.stream) {
  // Process each Uint8Array chunk without buffering the whole file.
}

await justdeploy.storages.deleteFile(storageId, file.id);
```

`upload` accepts a string, `Blob`, byte array, web stream, or async byte iterable. Upload and download bytes stream directly to the signed Storage URL without a JustDeploy authentication header.
For a web stream or async iterable, also pass the exact byte length as `size`; sized values such as strings, blobs, and byte arrays are measured automatically.
If a download races with a still-finishing upload, retry after the SDK's clear pending-upload error.

Upload results have no signed URL. `file.size` is the number of bytes successfully transferred. After PUT succeeds, the file can be read without waiting for `active`; metadata may still be `pending`. Before PUT succeeds, `pending` alone does not prove bytes exist. Use `getFile` again only when final metadata is needed. Save the file ID, not the expiring URL. When redirecting a browser, use `(await justdeploy.storages.getFile(storageId, fileId)).url` without buffering the download.

For pagination, pass `page.nextCursor` as the next call's `cursor` until it is null.

## Mail

```ts
const mail = await justdeploy.mail.send({
  sender: 'hello@your-verified-domain.example',
  to: 'user@example.com',
  subject: 'Welcome',
  text: 'Thanks for joining.',
  idempotencyKey: 'welcome-user-123',
});

const page = await justdeploy.mail.list({ limit: 50 });
const current = await justdeploy.mail.get(mail.id);
```

Use one `idempotencyKey` per operation. A retry keeps its key and content; each new password reset needs a new key. The same key with different content is rejected with 409. SDK input uses `sender`; REST input and returned records use `from`. `delivered` means the receiving server accepted the message, not inbox placement. See the shared [Mail and tracking rules](../README.md#request-behavior).

## Errors and cancellation

Handle SDK failures with `JustDeployError`. API errors expose `status`, `retryAfter`, `requestId`, and `details`. For diagnostics, record only `status` and `requestId`, not the whole error, request, SQL, file contents, or credentials. Cancellation does not prove a write was rolled back. Authentication and API time limits are separate; see [request behavior](../README.md#request-behavior).

Methods that accept request options support an `AbortSignal`:

```ts
const controller = new AbortController();
const databases = await justdeploy.databases.list({ signal: controller.signal });
```

The SDK may refresh authentication and repeat one failed `GET` once. It never automatically repeats a mutation.
