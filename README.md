# JustDeploy SDK

Official server-side SDKs for [JustDeploy](https://justdeploy.ai).

> Version `0.1.1` was published to [npm](https://www.npmjs.com/package/@justdeploy/sdk/v/0.1.1) and [PyPI](https://pypi.org/project/justdeploy-sdk/0.1.1/) on 2026-09-04 through GitHub Trusted Publishing. Package availability and Production authentication rollout are separate milestones.
>
> Production SDK authentication is enabled as of 2026-09-04. Local applications use Credential environment variables; deployed web, API, and cron applications can use automatic identity. Development remains limited to Playground.

Version `0.1.1` fixes Python 3.14 method inspection and reports the transferred byte size immediately after a successful upload.

## Supported runtimes

| Language              | Runtime                     | Package                                    |
| --------------------- | --------------------------- | ------------------------------------------ |
| JavaScript/TypeScript | Node.js 22 and 24           | npm `@justdeploy/sdk`                      |
| Python                | CPython 3.12, 3.13 and 3.14 | PyPI `justdeploy-sdk`, import `justdeploy` |

Both packages cover Database, Storage, and Mail. They are for server applications only; Browser, Edge Runtime, Deno, Bun, Java, Go, and Rust are not supported. There is no JustDeploy CLI, separate SDK login, configuration file, proxy, or generic raw API client.

## Install

```bash
npm install @justdeploy/sdk@0.1.1
```

```bash
python -m pip install justdeploy-sdk==0.1.1
```

## Quick start

The examples below use `0.1.1`. For local development, use a Credential from the Production JustDeploy console and resource IDs from that same organization:

```bash
export JUSTDEPLOY_ACCESS_KEY="<access-key>"
export JUSTDEPLOY_SECRET_KEY="<secret-key>"
```

Do not put those values in source code or include a local `.env` file in a deployment. The SDK itself does not read `.env` files.

In a deployed JustDeploy application, use the same argument-free client without setting either variable. The SDK uses the deployment identity that JustDeploy places in the image. This works in Production and the Development Playground. A local client always uses Production; Development Credentials cannot authenticate there.

```ts
import { JustDeploy } from '@justdeploy/sdk';

const justdeploy = new JustDeploy();
const result = await justdeploy.databases.query('your-database-id', 'SELECT * FROM orders');
```

```python
from justdeploy import JustDeploy

with JustDeploy() as justdeploy:
    result = justdeploy.databases.query("your-database-id", "SELECT * FROM orders")
```

See the language guides for the complete small API:

- [JavaScript and TypeScript](javascript/README.md)
- [Python](python/README.md)
- [Runnable examples](examples/README.md)

## Authentication behavior

The client has no configuration arguments and follows one fixed order:

1. If both Credential environment variables exist, exchange them through `POST /auth/credential` for a 10-minute session.
2. Otherwise, use `/opt/justdeploy/identity.json`, which JustDeploy adds during deployment.
3. If neither source exists, stop with a clear authentication error.

One missing or empty Credential variable is an error. A rejected Credential never falls back to the deployment identity. The identity path signs `POST /auth/build` to obtain the same 10-minute session; it does not use AWS STS or cloud-specific credentials. Sessions stay in memory. A request made within three minutes of expiry refreshes the session, and concurrent requests on the same client share that exchange. There is no background refresh loop.

The identity file's `apiBaseUrl` selects the deployment's API origin even when Credential environment variables take priority. Without an identity file, the client always uses `https://api.justdeploy.net`. There is no API URL override or constructor Credential argument, and the SDK does not load `.env` files.

A deployed application may keep explicit Credential environment variables; the SDK will continue to use them. JustDeploy CI/CD does not remove them or block the build. When it confirms that an application uses this SDK and directly supplies a Credential, build feedback recommends the simpler automatic deployment identity without exposing the Credential value.

In Production and the Development Playground, sessions can access every External API in their own organization, including Credential creation. The SDK's three resource groups do not narrow server permissions, and resources are not bound to an individual project. Other Development organizations are not enabled for SDK authentication.

## Request behavior

- Authentication is attached only to SDK-created JustDeploy API requests. Other hosts and presigned Storage upload/download requests never receive the Credential, session token, or SDK header.
- Authentication exchanges have a 10-second timeout; ordinary JustDeploy API requests have a 30-second timeout. Node.js accepts `AbortSignal`, and Python async calls use normal task cancellation.
- After a 401, only a GET may refresh the session and repeat once. Database queries, Mail sends, and file mutations are never automatically repeated.
- File transfers stream without collecting the entire file in memory. A transfer that has started is not interrupted just because the session expires. For stream inputs, provide the exact byte count as described in the language guides.
- A successful upload returns the transferred `size`. Server metadata may still be `pending`; read it again after it becomes `active` if the final record is needed. A download requested too early returns a clear retry-later error. Failed or canceled uploads try to remove the pending file record while preserving the original error or cancellation.
- Mail uses the argument `sender` in both languages and sends it as the API's `from` field. Use a stable idempotency key if the caller retries; an accepted send is not proof of delivery.

Language-specific errors and streaming examples are in the [Node.js](javascript/README.md) and [Python](python/README.md) guides. Do not log authentication values, signatures, SQL, or file contents.

## Development

JavaScript and TypeScript:

```bash
cd javascript
npm ci --no-audit
npm audit --audit-level=high
npm run typecheck
npm test
npm run pack:check
```

Python:

```bash
cd python
uv sync --all-groups --frozen
uv run ruff format --check . ../examples/python
uv run ruff check . ../examples/python
uv run mypy src tests ../examples/python
uv run pytest
uv run pip-audit
uv build
```

The [CI workflow](.github/workflows/ci.yml) audits the shared JavaScript dependency lockfile once, on Node.js 24. That step allows 120 seconds per npm request and at most three audit attempts, with 10 seconds between attempts; other npm steps retain their 30-second request timeout. A high-severity finding or unavailable audit still fails CI and blocks publishing. An audit connection timeout is not a clean security result and does not require registry login. Recorded results are in the [release checklist](docs/release-checklist.md).

See [CONTRIBUTING.md](CONTRIBUTING.md) before changing both language surfaces, and report security issues through [SECURITY.md](SECURITY.md).

## Publishing (operator only)

Publishing requires explicit approval and the [release checklist](docs/release-checklist.md). Use the manually dispatched [Publish SDK workflow](https://github.com/cuppasoft/justdeploy-sdk/actions/workflows/publish.yml) on `main`. A push, tag, pull request, or GitHub release never publishes a package. This workflow does not deploy the JustDeploy server.

The one-time registry setup authorizes only `cuppasoft/justdeploy-sdk` → `publish.yml` as a Trusted Publisher, with no GitHub environment name. On npm, allow direct `npm publish`, not just staged publishing. Keep account two-factor authentication enabled. Do not add `NPM_TOKEN`, `PYPI_API_TOKEN`, or registry login commands to GitHub Actions.

After updating both package versions and committing the reviewed source:

```bash
# Test and build only; this is also the workflow's default.
gh workflow run publish.yml --repo cuppasoft/justdeploy-sdk --ref main \
  -f version=<version> -F publish=false

# Only after publication approval, with the same reviewed main commit:
gh workflow run publish.yml --repo cuppasoft/justdeploy-sdk --ref main \
  -f version=<version> -F publish=true
```

The workflow checks all five supported runtimes, validates versions and package contents, and keeps the three archives plus their SHA-256 checksums as a release artifact. The publishing jobs use those exact archives and authenticate through GitHub; no registry token or routine browser confirmation is needed. A final check downloads all three public files without authentication and compares their checksums.

After a partial failure, inspect what is already public and rerun only the failed jobs. Do not overwrite or delete an existing version, or restart a successful npm publish. If a published release has a defect, obtain approval to deprecate it on npm or yank it on PyPI, then publish a new patch version. After both registries pass verification, clean-install by public package name, then update this README, example pins, and Development guides together.

## License

Apache License 2.0. See [LICENSE](LICENSE).
