# AGENTS.md — JustDeploy SDK

This repository contains the public Node.js and Python SDKs for JustDeploy.

## Product boundaries

- Support Node.js and Python only. Keep both SDKs on the same version and feature set.
- Support server applications only. Do not add Browser, Edge Runtime, Deno or Bun compatibility.
- The first release covers Database, Storage and Mail. Do not add a generic raw-request API.
- Do not add a JustDeploy CLI.
- Keep public APIs small and explicit so an AI can select the correct operation without guessing.

## Security boundaries

- Never commit credentials, tokens, private keys, identity files or real customer data.
- Never include secrets, SQL text or file contents in logs, errors or telemetry.
- Authentication headers may be sent only to the configured JustDeploy API origin, never to other hosts or presigned upload URLs.
- Do not publish npm or PyPI packages without explicit approval.

## Working rules

- Keep language behavior and documentation equivalent.
- Add or update tests with implementation changes.
- Record setup, test and release commands in the root README once they exist.
- Use Conventional Commit prefixes such as `feat:`, `fix:`, `docs:`, `refactor:` and `chore:`.
- Keep generated files, build output and local secrets out of Git.
