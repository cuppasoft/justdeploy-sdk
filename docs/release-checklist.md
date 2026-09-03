# First release checklist

The first Node.js and Python release is stable `0.1.0`. Publishing and Production rollout are separate approval gates.

## Development Playground server readiness

- [x] Development Playground `POST /auth/credential` exchanges a valid Credential for a 10-minute session; other Development organizations are still closed.
- [x] Development Playground build and Credential sessions can use every External API in their own organization.
- [x] Both endpoints return the documented token, organization, project where applicable, and expiry fields.
- [x] New Development Playground Node.js and Python web, API, and cron builds contain a read-only `/opt/justdeploy/identity.json` with the Development API origin.
- [x] An SDK build with a direct Credential succeeds, keeps it, and records secret-free feedback recommending automatic identity.

## SDK and Playground checks

- [x] Install the packed npm artifact in clean Node.js 22 and 24 directories, covering ESM and CommonJS.
- [x] Install the built wheel in clean Python 3.12, 3.13, and 3.14 directories, covering sync and async clients.
- [x] Test Credential exchange against Development with a test-provided Development origin, and test automatic deployed identity exchange. The exact identity-free local path remains in the Production gate below.
- [x] Test Database DDL and DML, streaming Storage upload/download/delete, and idempotent Mail send/read.
- [x] Confirm another organization is rejected and signed file requests contain no JustDeploy authentication header.
- [x] Confirm an expired-session GET is repeated once and no mutation is automatically repeated.
- [x] Generate the Development Playground Database, Storage, and Mail guide variants.
- [ ] Install only from the public registries and verify that a clean Playground project can follow each guide without repository-only knowledge.

## Package publishing gate

- [x] Node.js and Python versions match and all local CI commands pass.
- [x] Package archives contain the license and type information, with no test fixture, key, Credential, token, or identity file.
- [x] npm `@justdeploy/sdk` and PyPI `justdeploy-sdk` were unregistered when checked on 2026-09-03.
- [ ] Recheck both package names and publishing access immediately before publishing.
- [ ] Decide whether to publish from the operator machine or add a separately approved trusted-publishing workflow. Do not enable npm provenance without an OIDC publishing workflow.
- [ ] Publish stable `0.1.0` to npm and PyPI only after explicit operator approval. This repository intentionally contains no automatic publishing workflow.

## Production gate

- [ ] Report the public-package Development Playground guide results to the operator.
- [ ] Enable Production SDK permissions and guides only after separate explicit operator approval.
- [ ] Immediately test an identity-free local client with only the two Credential environment variables. This exact path cannot target the Development API because the SDK intentionally has no API URL setting.
- [ ] Only after that local check passes, clean legacy temporary build archives and redeploy every existing Production build.
