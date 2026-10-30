# Codex CLI 0.166.0 compatibility

This update pins the build-time `@openai/codex` dependency and Docker runtime
(default `CODEX_CLI_VERSION`) to 0.166.0. The lockfile changes only Codex and its
six platform packages; unrelated dependency versions remain unchanged.

## Protocol and catalog

Regenerate version-specific protocol types with `pnpm codex:schema` after
installing dependencies in an existing checkout. `ensure:codex-schema` checks
only for the presence of generated files, not their version.

The 0.166.0 account contract adds nullable `workspaceName` for ChatGPT accounts;
typed fixtures now include it. The generated protocol also adds optional item
lifecycle timestamps and output-drain status, a nullable image generation id,
and additional account, hook, requirements and error metadata. Reviews are
inline-only upstream, matching the existing WebUI request path. Production
request/response code compiles against this schema without changes. This is
compatibility work, not new UI for every upstream capability.

`docs/upstream/model-catalog-0.166.0.json` is the complete deterministic bundled
export, including instructions and hidden entries. It has 12 entries (3 hidden),
including the new `gpt-6.1-terra`. Native parser tests compare the full export
and explicitly check that Terra is retained. The bundled baseline is separate
from an authenticated account's effective model list.

References:
- https://learn.chatgpt.com/docs/app-server#message-schema
- https://learn.chatgpt.com/docs/changelog (Codex CLI 0.166.0)

## Validation

Validated on 2026-10-30 with the pinned npm binary:

- Backend production build and full TypeScript checking, including test fixtures.
- Protocol-probe TypeScript checking.
- 73 backend test files / 607 tests passed, including native catalog/lifecycle
  integration tests, with `NODE_ENV=test WEBUI_API_KEY=isolated-unit-test-key`.
- Frontend production build and 59 unit test files / 474 tests passed.
- Credential-free `settings-update` and `turn-item-finality` protocol probes.
  Explicit settings changes emitted matching notifications; a completed shell
  turn's complete payload stayed unchanged across another shell turn and loaded
  resume. These probes do not establish model/subagent finality or policy enforcement.
- Isolated WebUI startup: homepage and authenticated health endpoint returned
  HTTP 200; `/api/codex/status` showed connected/initialized app-server,
  `codex_webui/0.166.0`, and successful config/model discovery.

The isolated smoke instance used a disposable Codex home and database with no
account credentials, so `accountLoginRequired` / `missingProviderConfig` was
expected. Authenticated model turns and browser interactions were not tested.
Docker image builds and deployment were deliberately deferred; updating source
Docker defaults does not change an existing image, container or persisted volume.

## Upgrade an existing host checkout

```sh
pnpm install --frozen-lockfile
pnpm codex:schema
pnpm build
pnpm --dir web install --frozen-lockfile
pnpm --dir web build
```

Restart the host's WebUI service after building, then verify `/api/status` and
`/api/codex/status` with its existing credentials. Confirm both the initialized
CLI version and readiness; an installed global CLI does not override the local
pinned npm binary selected by WebUI.
