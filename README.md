# JustDeploy SDK

Official server-side SDKs for [JustDeploy](https://justdeploy.ai).

> Version `0.1.0` was published to [npm](https://www.npmjs.com/package/@justdeploy/sdk) and [PyPI](https://pypi.org/project/justdeploy-sdk/0.1.0/) on 2026-09-04. Package availability and Production authentication rollout are separate milestones.
>
> SDK authentication is currently enabled only for deployed projects in the Development Playground. A local client with Credential environment variables connects to Production, and Production SDK authentication is not enabled yet. Both paths will be announced only after the separate Production rollout.

This checkout prepares **0.1.1 (publication approved, not published yet)**: Python 3.14 method inspection works, and successful uploads report the transferred byte size immediately. The language READMEs describe that candidate and pin 0.1.1 for package review. The public installation commands and runnable examples below stay on 0.1.0 until publication is verified.

## Supported runtimes

| Language              | Runtime                     | Package                                    |
| --------------------- | --------------------------- | ------------------------------------------ |
| JavaScript/TypeScript | Node.js 22 and 24           | npm `@justdeploy/sdk`                      |
| Python                | CPython 3.12, 3.13 and 3.14 | PyPI `justdeploy-sdk`, import `justdeploy` |

Both packages cover Database, Storage, and Mail. They are for server applications only; Browser, Edge Runtime, Deno, Bun, Java, Go, and Rust are not supported. This repository does not provide a CLI or a generic raw API client.

## Install

```bash
npm install @justdeploy/sdk@0.1.0
```

```bash
python -m pip install justdeploy-sdk==0.1.0
```

## Quick start (after Production rollout)

The examples below are the stable `0.1.0` contract. They are not a usable local setup until the Production authentication rollout is announced; today, only an application deployed in the Development Playground can exercise the automatic identity path.

After that rollout, local development uses a Credential from the JustDeploy console:

```bash
export JUSTDEPLOY_ACCESS_KEY="<access-key>"
export JUSTDEPLOY_SECRET_KEY="<secret-key>"
```

Do not put those values in source code or include a local `.env` file in a deployment. The SDK itself does not read `.env` files.

In a deployed JustDeploy application, use the same argument-free client without setting either variable. The SDK uses the deployment identity that JustDeploy places in the image. This no-configuration path is currently active only in the Development Playground.

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

1. If both Credential environment variables exist, exchange them for a short-lived session.
2. Otherwise, use `/opt/justdeploy/identity.json`, which JustDeploy adds during deployment.
3. If neither source exists, stop with a clear authentication error.

One missing or empty Credential variable is an error. A rejected Credential never falls back to the deployment identity. Sessions stay in memory, are refreshed near expiration, and are shared by concurrent requests.

A deployed application may keep explicit Credential environment variables; the SDK will continue to use them. JustDeploy CI/CD does not remove them or block the build. When it confirms that an application uses this SDK and directly supplies a Credential, build feedback recommends the simpler automatic deployment identity without exposing the Credential value.

Authentication is attached only to the configured JustDeploy API. Presigned Storage upload and download requests never receive the Credential, session token, or SDK header.
If a file is requested while its upload is still finishing, the SDK returns a clear retry-later error instead of exposing the Storage transfer response.

## Development

JavaScript and TypeScript:

```bash
cd javascript
npm ci
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

After a partial failure, inspect what is already public and rerun only the failed jobs. Do not overwrite an existing version or restart a successful npm publish. After both registries pass verification, clean-install by public package name, then update this README, example pins, and Development guides together.

## License

Apache License 2.0. See [LICENSE](LICENSE).
