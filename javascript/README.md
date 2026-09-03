# `@justdeploy/sdk`

The official JustDeploy SDK for server-side Node.js 22 and 24. The package includes ESM, CommonJS, and TypeScript declarations.

> SDK authentication is currently enabled only for deployed projects in the Development Playground. Local SDK Credential exchange and deployed Production SDK calls remain disabled until the separate Production rollout.

## Install

```bash
npm install @justdeploy/sdk@0.1.0
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

After the Production rollout, local development sets both `JUSTDEPLOY_ACCESS_KEY` and `JUSTDEPLOY_SECRET_KEY` in the process environment, while a deployed JustDeploy application needs no SDK configuration. Today, only the no-configuration path of a project deployed in the Development Playground is enabled. If a deployed application explicitly keeps both variables, the SDK accepts and prioritizes them; build feedback will recommend the simpler automatic deployment identity without blocking the build.

## Database

```ts
const databases = await justdeploy.databases.list();
const result = await justdeploy.databases.query(databaseId, 'SELECT * FROM orders');

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

## Storage

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

Use a stable, unique `idempotencyKey` when a caller might retry a mail request after losing the response. A successful send response means accepted, not delivered; check `mail.status` later if delivery matters.

## Errors and cancellation

All SDK and API failures extend `JustDeployError`. API errors expose `status`, `retryAfter`, `requestId`, and `details`. Request bodies, SQL, file content, and authentication values are not retained in SDK errors.

Methods that accept request options support an `AbortSignal`:

```ts
const controller = new AbortController();
const databases = await justdeploy.databases.list({ signal: controller.signal });
```

The SDK may refresh authentication and repeat one failed `GET` once. It never automatically repeats a mutation.
