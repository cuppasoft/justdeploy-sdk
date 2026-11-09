# Examples

These examples use placeholders and contain no Credential. Production and deployed Development Playground apps support automatic authentication. For local use, set both `JUSTDEPLOY_ACCESS_KEY` and `JUSTDEPLOY_SECRET_KEY` in the process environment using a Production Credential, and replace the resource IDs with IDs from that same organization. Local clients cannot use Development Credentials. Do not copy a Credential into an example or commit a local `.env` file.

Install the matching package using the [JavaScript](../javascript/README.md) or [Python](../python/README.md) instructions.

`playground/` contains operator-only release-validation cron fixtures whose dependencies
resolve directly from npm and PyPI. No local SDK archive needs to be copied into a project.
Prepare their resources through MCP before running them; the fixtures do not list
resources, create tables, or delete tables through the SDK.

For a deployed Development Playground validation, ask your connected AI to:

1. Select the intended database and storage in the Playground organization.
2. Create a dedicated `sdk_checks` table with `label` (string, non-nullable) and `value`
   (integer, non-nullable); JustDeploy supplies `id` and timestamps. Reuse this table
   across runs. Other application tables must not be used for validation.
3. Set `JUSTDEPLOY_DATABASE_ID`, `JUSTDEPLOY_STORAGE_ID`, and `SDK_TEST_FROM` (a verified
   sender) on the validation project, then deploy the fixture and run it once. The
   fixture sends a test message only to Amazon SES’s success simulator.

Each run uses its own row, file, and mail idempotency key. It removes only its known row
and file on exit, including after a later operation fails. Email is not retractable;
inspect a failed or uncertain send before rerunning. This setup is for an explicitly
authorized release test, not an application startup task. Use
[Console → AI Plugin](https://console.justdeploy.ai/console/mcp) if the AI is not connected.

A lost insert or upload response may have created data without returning its ID.
Inspect that test resource through MCP before retrying; the fixture cannot safely
remove an unknown record.

| Runtime      | Example                                               |
| ------------ | ----------------------------------------------------- |
| Node.js ESM  | [`javascript/database.mjs`](javascript/database.mjs)  |
| Node.js CJS  | [`javascript/mail.cjs`](javascript/mail.cjs)          |
| Python sync  | [`python/database.py`](python/database.py)             |
| Python async | [`python/storage_async.py`](python/storage_async.py)   |
