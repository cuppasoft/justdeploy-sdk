# JustDeploy SDK

Official server-side SDKs for [JustDeploy](https://justdeploy.ai).

> This repository is in its initial setup phase. The packages are not published yet.

## Supported languages

| Language              | Runtime                     | Package                                    |
| --------------------- | --------------------------- | ------------------------------------------ |
| JavaScript/TypeScript | Node.js 22 and 24           | npm `@justdeploy/sdk`                      |
| Python                | CPython 3.12, 3.13 and 3.14 | PyPI `justdeploy-sdk`, import `justdeploy` |

Both packages will provide the same version and feature set. Browser, Edge Runtime, Deno, Bun, Java, Go and Rust are not supported.

## Scope

The first release will provide APIs for:

- Database
- Storage
- Mail

This project does not provide a CLI.

## Repository layout

```text
javascript/  Node.js SDK
python/      Python SDK
examples/    Runnable examples for both SDKs
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before making a change. Report security issues using the process in [SECURITY.md](SECURITY.md).

## License

Apache License 2.0. See [LICENSE](LICENSE).
