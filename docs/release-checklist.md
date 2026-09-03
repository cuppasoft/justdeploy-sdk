# First release checklist

The first Node.js and Python release is stable `0.1.0`. Publishing and Production rollout are separate approval gates.

## Development server readiness

- [x] Development `POST /auth/credential` exchanges a valid Credential for a 10-minute session.
- [x] Development build and Credential sessions can use every API in their own organization.
- [x] Both endpoints return the documented token, organization, project where applicable, and expiry fields.
- [x] New Node.js and Python web, API, and cron builds contain a read-only `/opt/justdeploy/identity.json` with the Development API origin.
- [x] An SDK build with a direct Credential succeeds, keeps it, and records secret-free feedback recommending automatic identity.

## SDK and Playground checks

- [x] Install the packed npm artifact in clean Node.js 22 and 24 directories, covering ESM and CommonJS.
- [x] Install the built wheel in clean Python 3.12, 3.13, and 3.14 directories, covering sync and async clients.
- [x] Test local Credential exchange and automatic deployed identity exchange.
- [x] Test Database DDL and DML, streaming Storage upload/download/delete, and idempotent Mail send/read.
- [x] Confirm another organization is rejected and signed file requests contain no JustDeploy authentication header.
- [x] Confirm an expired-session GET is repeated once and no mutation is automatically repeated.
- [x] Generate the Development Database, Storage, and Mail guide variants.
- [ ] Install only from the public registries and verify that a clean Playground project can follow each guide without repository-only knowledge.

## Package publishing gate

- [x] Node.js and Python versions match and all local CI commands pass.
- [x] Package archives contain the license and type information, with no test fixture, key, Credential, token, or identity file.
- [x] npm `@justdeploy/sdk` and PyPI `justdeploy-sdk` were unregistered when checked on 2026-09-03.
- [ ] Recheck both package names and publishing access immediately before publishing.
- [ ] Publish stable `0.1.0` to npm and PyPI only after explicit operator approval. This repository intentionally contains no automatic publishing workflow.

## Production gate

- [ ] Report the public-package Development guide results to the operator.
- [ ] Enable Production SDK permissions, change Production guides, clean legacy temporary build archives, and redeploy every existing Production build only after separate explicit operator approval.
