# Contributing

JustDeploy SDK maintains matching Node.js and Python releases. Please open an issue before starting a large change so both APIs can stay aligned.

Run the complete checks before submitting a change:

```bash
cd javascript
npm ci
npm audit --audit-level=high
npm run typecheck
npm test
npm run pack:check

cd ../python
uv sync --all-groups --frozen
uv run ruff format --check . ../examples/python
uv run ruff check . ../examples/python
uv run mypy src tests ../examples/python
uv run pytest
uv run pip-audit
uv build
```

When submitting a pull request:

- Keep the change focused.
- Update both SDKs when public behavior changes.
- Add tests for new behavior and regressions.
- Update user-facing documentation and examples.
- Do not include credentials, identity files or customer data.
- Publishing requires separate operator approval. Keep `publish.yml` manually dispatched; ordinary CI checks, pushes, tags, and pull requests must never publish packages.

Do not report security vulnerabilities in a public issue. Follow [SECURITY.md](SECURITY.md) instead.
