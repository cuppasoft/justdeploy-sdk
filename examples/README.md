# Examples

These examples use placeholders and contain no Credential. Authentication is currently enabled only for projects deployed in the Development Playground. After the separate Production rollout, local use will set both `JUSTDEPLOY_ACCESS_KEY` and `JUSTDEPLOY_SECRET_KEY` in the process environment and replace the resource IDs. Do not copy a Credential into an example or commit a local `.env` file.

Install the published `0.1.0` package using the [JavaScript](../javascript/README.md) or [Python](../python/README.md) instructions.

`playground/` contains release-validation cron fixtures whose dependencies resolve directly from npm and PyPI. No local SDK archive needs to be copied into a project.

| Runtime      | Example                                               |
| ------------ | ----------------------------------------------------- |
| Node.js ESM  | [`javascript/database.mjs`](javascript/database.mjs)  |
| Node.js CJS  | [`javascript/mail.cjs`](javascript/mail.cjs)          |
| Python sync  | [`python/database.py`](python/database.py)             |
| Python async | [`python/storage_async.py`](python/storage_async.py)   |
