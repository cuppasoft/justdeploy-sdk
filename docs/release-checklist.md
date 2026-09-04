# SDK release checklist

Use this checklist for each release. Commands and publishing setup are in [README.md](../README.md#publishing-operator-only). Published archives are immutable; current source documentation may be newer than the README inside an archive.

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
- [ ] Update README versions, example dependency pins and Development guides together; verify actual served guides.
- [ ] After a partial failure, inspect existing publications and retry only failed jobs. Never overwrite an existing version or repeat a successful npm publish.

## Server rollout

Production rollout is separately approved and tracked in the server repository's `docs/specs/ops.md`. Use its preflight, migration and recovery procedure; package publication is not evidence that the server rollout succeeded.

The current baseline is SDK `0.1.1`, with Production authentication enabled for local Credentials and deployed web/API/cron identities. Development authentication remains limited to Playground.

The operator confirmed receipt of an SDK-sent Production email. Production Mail idempotency and the server record's `delivered` status remain unverified; they are tracked in the server's `docs/proposals/misc-roadmap.md`. Any additional send requires separate approval. Production Database sampling was read-only, not a full CRUD/DDL test.
