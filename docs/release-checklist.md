# First release checklist

The packages must not be published until every item below is complete.

## Server readiness

- [ ] Development `POST /auth/credential` exchanges a valid Credential for a 10-minute session.
- [ ] Development `POST /auth/build` sessions can use the Database, Storage, and Mail routes exposed by the SDK.
- [ ] Both endpoints return `token`, `organizationId`, and `expiresAt` with the documented meaning.
- [ ] New Node.js and Python builds contain a read-only `/opt/justdeploy/identity.json` with the correct Development API origin.

## Playground checks

- [ ] Install the packed npm artifact in clean Node.js 22 and 24 Playground projects, covering ESM and CommonJS.
- [ ] Install the built wheel in clean Python 3.12, 3.13, and 3.14 Playground projects, covering sync and async clients.
- [ ] Test both local Credential exchange and automatic deployed identity exchange.
- [ ] Test Database query and table changes, a streaming Storage upload and download, and an idempotent Mail send.
- [ ] Confirm another organization is rejected and signed file requests contain no JustDeploy authentication header.
- [ ] Confirm one expired-session `GET` is repeated once and no mutation is automatically repeated.

## Publishing gate

- [ ] Node.js and Python versions match and all CI jobs pass on the release commit.
- [ ] Package archives contain the license, type information, and no test fixture, key, Credential, token, or identity file.
- [ ] Publish only after explicit operator approval. This repository intentionally contains no automatic publishing workflow.
