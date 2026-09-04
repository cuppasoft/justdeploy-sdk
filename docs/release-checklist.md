# SDK release checklist

This is a reusable checklist for future releases, not unfinished work for the current release. The published version and Production availability are in [README.md](../README.md); commands and publishing setup are in [Publishing](../README.md#publishing-operator-only). Published archives are immutable; current source documentation may be newer than the README inside an archive.

## Candidate checks

- [ ] Match the Node.js and Python versions, public behavior, examples and documentation.
- [ ] Pass CI on Node.js 22/24 and Python 3.12/3.13/3.14, including dependency security checks. Audit timeouts are failures, not clean results.
- [ ] Inspect the npm archive, wheel and sdist for license, types, expected files and absence of secrets or customer data.
- [ ] Install the candidate archives in clean environments; check ESM/CommonJS and Python sync/async clients.
- [ ] Verify local Credential authentication, automatic deployed identity, environment-variable priority, cross-organization rejection and secret-free errors.
- [ ] Verify Database operations, bytes/stream Storage transfers, immediate upload size, cancellation cleanup and Mail idempotency in an approved Development Playground test.
- [ ] Verify bound SQL values and mismatches before writes, browser-direct PUT from new and existing organizations, exact downloaded bytes, CORS and no Credential/header leakage. Mock tests do not replace the browser check.
- [ ] Confirm credentials never reach other hosts or signed file URLs, GET retries once on expired authentication, and mutations are not automatically retried.
- [ ] Test web, API and cron examples. A fresh AI using only the generated guides must be able to develop and deploy without repository-only knowledge.

## Publication

- [ ] Obtain explicit approval for the version and reviewed main commit. Publication does not authorize Production server deployment.
- [ ] Check npm and PyPI Trusted Publishers for `cuppasoft/justdeploy-sdk`, workflow `publish.yml`, with no environment name. Account linking alone is not publishing authorization.
- [ ] Run the manual workflow in prepare-only mode and inspect its archives and checksums.
- [ ] Publish those exact archives from the same reviewed commit using GitHub Trusted Publishing. Do not add stored registry tokens or automatic push/tag/release triggers.
- [ ] Verify anonymous downloads against all three reviewed archive checksums; clean-install by public package name on every supported runtime.
- [ ] Update README versions, example dependency pins, and the served guides and web documentation for the approved stages together; verify actual responses.
- [ ] After a partial failure, inspect existing publications and retry only failed jobs. Never overwrite an existing version or repeat a successful npm publish.

## Server rollout

For a version that requires server changes, obtain separate Production approval and verify the server and platform-owned Storage prerequisites before publication. The publishing workflow does not deploy the server. Do not roll back to a server that cannot support an already published SDK.

Current server deployment, verified scope and recovery rules belong in the server repository's [operations spec](https://github.com/cuppasoft/justdeploy-server/blob/main/docs/specs/ops.md#sdkfirewall-운영-전환). Outstanding operational checks belong in its [roadmap](https://github.com/cuppasoft/justdeploy-server/blob/main/docs/proposals/misc-roadmap.md), not in this reusable checklist.
