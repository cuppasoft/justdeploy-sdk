# JustDeploy SDK

Official server-side SDKs for [JustDeploy](https://justdeploy.ai).

> The SDK code is implemented. The server-side authentication rollout and Playground checks are still pending, and the packages have not been published. Do not install them from npm or PyPI until the first release is announced.

## Supported runtimes

| Language              | Runtime                     | Package                                    |
| --------------------- | --------------------------- | ------------------------------------------ |
| JavaScript/TypeScript | Node.js 22 and 24           | npm `@justdeploy/sdk`                      |
| Python                | CPython 3.12, 3.13 and 3.14 | PyPI `justdeploy-sdk`, import `justdeploy` |

Both packages cover Database, Storage, and Mail. They are for server applications only; Browser, Edge Runtime, Deno, Bun, Java, Go, and Rust are not supported. This repository does not provide a CLI or a generic raw API client.

## Quick start

Local development uses a Credential from the JustDeploy console:

```bash
export JUSTDEPLOY_ACCESS_KEY="<access-key>"
export JUSTDEPLOY_SECRET_KEY="<secret-key>"
```

Do not put those values in source code or include a local `.env` file in a deployment. The SDK itself does not read `.env` files.

In a deployed JustDeploy application, use the same argument-free client without setting either variable. The SDK uses the deployment identity that JustDeploy places in the image.

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

Authentication is attached only to the configured JustDeploy API. Presigned Storage upload and download requests never receive the Credential, session token, or SDK header.

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

No command in this repository publishes a package. See [CONTRIBUTING.md](CONTRIBUTING.md) before changing both language surfaces, and report security issues through [SECURITY.md](SECURITY.md).

## License

Apache License 2.0. See [LICENSE](LICENSE).
