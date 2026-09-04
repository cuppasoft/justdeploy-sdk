# SDK release checklist

Stable `0.1.1` was published to npm and PyPI on 2026-09-04 through the approved [GitHub publishing run](https://github.com/cuppasoft/justdeploy-sdk/actions/runs/33831514520). Publishing and Production rollout are separate approval gates.

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
- [x] Confirm five invalid Storage input cases create no file rows, and a real late upload after cancellation is removed without reviving its record.
- [x] Confirm another organization is rejected and signed file requests contain no JustDeploy authentication header.
- [x] Confirm an expired-session GET is repeated once and no mutation is automatically repeated.
- [x] Generate the Development Playground Database, Storage, and Mail guide variants.
- [x] Install `0.1.0` from PyPI in clean Python 3.12, 3.13, and 3.14 environments and import both sync and async clients.
- [x] Install `0.1.0` from npm by package name in clean Node.js 22 and 24 environments and import both ESM and CommonJS exports.
- [x] Install only from the public registries and verify that a clean Playground project can follow each guide without repository-only knowledge: Node web, Python sync API, and Python async cron, each in two fresh-agent rounds.

## 0.1.1 release

- [x] Both language versions are 0.1.1; successful uploads return their transferred byte size without an extra API call.
- [x] Python 3.14 can inspect all public resource-list method annotations.
- [x] Node.js 22/24: 15 tests each plus TypeScript checks; Python 3.12/3.13/3.14: 28 tests each using the built wheel. Linters and dependency audits pass.
- [x] Deploy the candidate archives through normal Development CI/CD and test Node plus Python 3.14 sync/async automatic authentication, exact immediate upload sizes, stream transfers, byte comparison, and deletion.
- [x] Verify the real Development API/Console guides and fresh build analysis; normal SDK construction no longer produces a manual-Credential requirement.
- [x] Review npm/wheel/sdist license, types, file lists, and absence of credentials and identity files.
- [x] Obtain explicit 0.1.1 publication approval. This is separate from Production deployment approval.
- [x] Publish the reviewed archives, anonymously verify all three hashes, then clean-install by public package name: 15 tests each on Node.js 22/24 and 28 each on Python 3.12/3.13/3.14, 114 in total.
- [x] Update the repository release notice, example dependency pins, and Development API/Console guide images to the verified public 0.1.1 together. Verify deployed image contents and all seven API guide responses.
- [ ] Recheck the seven Console guide responses from an allowed network. The new image is deployed and verified, but the current network receives the existing IP-allowlist 403; the allowlist was not changed.

## GitHub publishing setup

- [x] Register the PyPI `justdeploy-sdk` Trusted Publisher for `cuppasoft/justdeploy-sdk`, workflow `publish.yml`, no environment name.
- [x] Register the same publisher for npm `@justdeploy/sdk`, including permission for direct `npm publish`.
- [x] Commit the manual-only workflow, pass a prepare-only run, and verify the publishing artifacts against the Development-tested files. Later CI-only changes leave SDK source and archive contents unchanged.
- [x] Publish through GitHub without stored registry tokens and verify anonymous archive downloads.

Account GitHub linking is not publishing authorization. These registry settings are a one-time setup; normal approved releases use the manual GitHub workflow. Keep account two-factor authentication enabled and never add push/tag/release publishing triggers.

## Completed 0.1.0 publishing gate

- [x] Node.js and Python versions match and all local CI commands pass.
- [x] Package archives contain the license and type information, with no test fixture, key, Credential, token, or identity file.
- [x] Recheck both package names and publishing access immediately before publishing; the operator owns the npm `justdeploy` organization.
- [x] Publish manually from the operator machine, without an automatic publishing workflow or npm provenance.
- [x] Publish stable `0.1.0` to npm and PyPI only after explicit operator approval.
- [x] Confirm npm public visibility and download all three published archives without authentication; their bytes match the reviewed release files.

## Production gate

- [x] Complete public-package Development Playground guide validation and record the remaining publication/Production gates.
- [x] Prepare the server's Production-enabled release source and test both stage branches; Development remains limited to Playground. Deploy the same source to Development without touching live Production functions.
- [x] Run the server's read-only Production preflight: both DDLs, six IAM policies, ten platform functions, fifteen current customer builds, original-source availability, and rollback archives. Repeat it immediately before rollout.
- [ ] Enable Production SDK permissions and guides only after separate explicit operator approval.
- [ ] Include Storage's failed-upload cleanup and edge attachment in the coordinated server rollout; do not deploy only authentication and guides.
- [ ] Immediately test an identity-free local client with only the two Credential environment variables. This exact path cannot target the Development API because the SDK intentionally has no API URL setting.
- [ ] Only after that local check passes, redeploy every existing Production application and clean exactly identified legacy temporary build archives. For source-less applications already using current identity images, reapply the same image and verify a new execution revision; do not claim their missing source was rebuilt or recovered.

Publishing 0.1.1 does not enable Production authentication. The server rollout remains a separate explicit approval.
