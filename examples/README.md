# Examples

These examples use placeholders and contain no Credential. Production and deployed Development Playground apps support automatic authentication. For local use, set both `JUSTDEPLOY_ACCESS_KEY` and `JUSTDEPLOY_SECRET_KEY` in the process environment using a Production Credential, and replace the resource IDs with IDs from that same organization. Local clients cannot use Development Credentials. Do not copy a Credential into an example or commit a local `.env` file.

Install the published `0.2.0` package using the [JavaScript](../javascript/README.md) or [Python](../python/README.md) instructions.

`playground/` contains release-validation cron fixtures whose dependencies resolve directly from npm and PyPI. No local SDK archive needs to be copied into a project.

| Runtime      | Example                                               |
| ------------ | ----------------------------------------------------- |
| Node.js ESM  | [`javascript/database.mjs`](javascript/database.mjs)  |
| Node.js CJS  | [`javascript/mail.cjs`](javascript/mail.cjs)          |
| Python sync  | [`python/database.py`](python/database.py)             |
| Python async | [`python/storage_async.py`](python/storage_async.py)   |
