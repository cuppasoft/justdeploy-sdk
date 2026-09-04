# SDK release checklist

Stable `0.1.1` was published to npm and PyPI on 2026-09-04 through the approved [GitHub publishing run](https://github.com/cuppasoft/justdeploy-sdk/actions/runs/33831514520). Production authentication and guides were enabled later that day under separate operator approval. Actual Production mail delivery remains an unperformed follow-up, not a completed check.

## Development Playground server readiness

- [x] Development Playground `POST /auth/credential` exchanges a valid Credential for a 10-minute session; other Development organizations are still closed.
- [x] Development Playground build and Credential sessions can use every External API in their own organization.
- [x] Both endpoints return the documented token, organization, project where applicable, and expiry fields.
- [x] New Development Playground Node.js and Python web, API, and cron builds contain a read-only `/opt/justdeploy/identity.json` with the Development API origin.
- [x] An SDK build with a direct Credential succeeds, keeps it, and records secret-free feedback recommending automatic identity.

## SDK and Playground checks

- [x] Install the packed npm artifact in clean Node.js 22 and 24 directories, covering ESM and CommonJS.
- [x] Install the built wheel in clean Python 3.12, 3.13, and 3.14 directories, covering sync and async clients.
- [x] Test Credential exchange against Development with a test-provided Development origin, and test automatic deployed identity exchange. The exact identity-free local path was subsequently verified in Production below.
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
- [x] At the approved 0.1.1 release gate, Node.js 22/24 passed 15 tests each plus TypeScript checks, and Python 3.12/3.13/3.14 passed 28 tests each using the built wheel. Linters and dependency audits also passed. Subsequent CI results are recorded separately below.
- [x] Deploy the candidate archives through normal Development CI/CD and test Node plus Python 3.14 sync/async automatic authentication, exact immediate upload sizes, stream transfers, byte comparison, and deletion.
- [x] Verify the real Development API/Console guides and fresh build analysis; normal SDK construction no longer produces a manual-Credential requirement.
- [x] Review npm/wheel/sdist license, types, file lists, and absence of credentials and identity files.
- [x] Obtain explicit 0.1.1 publication approval. This is separate from Production deployment approval.
- [x] Publish the reviewed archives, anonymously verify all three hashes, then clean-install by public package name: 15 tests each on Node.js 22/24 and 28 each on Python 3.12/3.13/3.14, 114 in total.
- [x] Update the repository release notice, example dependency pins, and Development API/Console guide images to the verified public 0.1.1 together. Verify deployed image contents and all seven API guide responses.
- [x] Recheck all fourteen Development API/Console guide responses against the public 0.1.1 contract. Console access succeeded under the existing allowlist; no access policy was changed.

## GitHub publishing setup

- [x] Register the PyPI `justdeploy-sdk` Trusted Publisher for `cuppasoft/justdeploy-sdk`, workflow `publish.yml`, no environment name.
- [x] Register the same publisher for npm `@justdeploy/sdk`, including permission for direct `npm publish`.
- [x] Commit the manual-only workflow, pass a prepare-only run, and verify the publishing artifacts against the Development-tested files. Later CI-only changes leave SDK source and archive contents unchanged.
- [x] Publish through GitHub without stored registry tokens and verify anonymous archive downloads.

Account GitHub linking is not publishing authorization. These registry settings are a one-time setup; normal approved releases use the manual GitHub workflow. Keep account two-factor authentication enabled and never add push/tag/release publishing triggers.

Pre-rollout CI evidence on 2026-09-04: commit `efcf13d` [passed every job](https://github.com/cuppasoft/justdeploy-sdk/actions/runs/33842439206), including all five supported runtimes and dependency security audits. This resolved the earlier documentation commit's npm audit connection timeout without bypassing the check. Runtime sources and dependency lockfiles remain unchanged from the successful publishing commit `726da7c`.

## Completed 0.1.0 publishing gate

- [x] Node.js and Python versions match and all local CI commands pass.
- [x] Package archives contain the license and type information, with no test fixture, key, Credential, token, or identity file.
- [x] Recheck both package names and publishing access immediately before publishing; the operator owns the npm `justdeploy` organization.
- [x] Publish manually from the operator machine, without an automatic publishing workflow or npm provenance.
- [x] Publish stable `0.1.0` to npm and PyPI only after explicit operator approval.
- [x] Confirm npm public visibility and download all three published archives without authentication; their bytes match the reviewed release files.

## Production rollout — 2026-09-04

- [x] Complete public-package Development Playground guide validation and record the remaining publication/Production gates.
- [x] Prepare the server's Production-enabled release source and test both stage branches; Development remains limited to Playground. Deploy the same source to Development without touching live Production functions.
- [x] Run the server's read-only Production preflight: both DDLs, six IAM policies, ten platform functions, fifteen current customer builds, original-source availability, and rollback archives. Repeat it immediately before rollout.
- [x] Pass the latest SDK CI, including the dependency security audit, without bypassing a failed or unavailable check.
- [x] Enable Production SDK permissions and guides after separate explicit operator approval.
- [x] Deploy Storage's failed-upload cleanup and attach the new edge version; verify propagation and actual download bytes. Invoke both Credential and Storage cleanup jobs successfully.
- [x] Test identity-free Node.js and Python clients with only the two Credential environment variables: authentication and SQL reads succeed; an invalid key is rejected with 401.
- [x] Refresh all fifteen existing Production applications after the local check: twelve normal rebuilds and three same-image refreshes with new execution revisions. Missing source was neither rebuilt nor recovered.
- [x] Check readiness, baseline responses, policy loading, and absence of identity errors for all fifteen applications. Verify six default/custom-domain endpoints across rebuilt web, API, and source-less web representatives.
- [x] Verify public 0.1.1 automatic authentication in operator-owned Node web and Python cron apps with no Credential environment variables. Verify SQL reads, bytes/stream upload, immediate size, matching download bytes, deletion, and cross-organization rejection. The cron receives identity without Firewall; test-web Firewall rejection and restoration returned 403 then 200.
- [x] Check eight representative Production API/Console guides. Correct the stale Development availability notice, deploy both Development guide servers, and verify fourteen actual responses.
- [x] Recheck five existing Production Node web applications without changing their code or configuration: 42 HTTP/file/access checks and successful SDK authentication against Production from each exact deployment image. Existing direct-Credential applications still work; this isolated image check does not imply that their source adopted the SDK or that it covers Python/cron.
- [x] Delete the 466 exactly matched legacy temporary build archives, retaining twelve original sources and rollback material. Delete the two test applications and the temporary verification Credential; customer keys remain intact. Follow-up checks confirmed that asynchronous cleanup also removed both remaining test network resources.
- [ ] Send an approved Production test email and verify idempotency plus actual delivery. Only Mail listing and invalid-sender rejection were exercised in Production; no email has been sent for this check.

Database CRUD/DDL and actual Mail delivery were verified in Development, not repeated in Production. Production Database sampling deliberately remained read-only and did not modify customer data or schema. Do not describe these narrower checks as a full Production CRUD/Mail pass.

The server repository's `docs/proposals/sdk.md` records the canonical target inventory, deployed source, verification scope, and recovery procedure. Completed Development simulations and the 114 public-install checks were not repeated in Production. This documentation update does not publish new archives; the immutable 0.1.1 registry files retain their publication-time README.
