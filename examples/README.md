# Examples

These examples use placeholders and contain no Credential. For local use, place both `JUSTDEPLOY_ACCESS_KEY` and `JUSTDEPLOY_SECRET_KEY` in the process environment, then replace the resource IDs. Do not copy a Credential into an example or commit a local `.env` file.

The packages are not published yet, so install each package from this repository before running an example.

`playground/` contains release-validation cron fixtures. Copy the locally packed npm archive or Python wheel into the matching directory before zipping it; the archives are intentionally not committed.

| Runtime      | Example                                               |
| ------------ | ----------------------------------------------------- |
| Node.js ESM  | [`javascript/database.mjs`](javascript/database.mjs)  |
| Node.js CJS  | [`javascript/mail.cjs`](javascript/mail.cjs)          |
| Python sync  | [`python/database.py`](python/database.py)             |
| Python async | [`python/storage_async.py`](python/storage_async.py)   |
