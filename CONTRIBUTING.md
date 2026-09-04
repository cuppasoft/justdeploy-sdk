# Contributing

JustDeploy SDK maintains matching Node.js and Python releases. Please open an issue before starting a large change so both APIs can stay aligned.

Run the checks in [Development](README.md#development) before submitting a change. The CI workflow covers every supported runtime.

When submitting a pull request:

- Keep the change focused.
- Update both SDKs when public behavior changes.
- Add tests for new behavior and regressions.
- Update user-facing documentation and examples.
- Do not include credentials, identity files or customer data.
- Publishing requires separate operator approval. Keep `publish.yml` manually dispatched; ordinary CI checks, pushes, tags, and pull requests must never publish packages.

Do not report security vulnerabilities in a public issue. Follow [SECURITY.md](SECURITY.md) instead.
