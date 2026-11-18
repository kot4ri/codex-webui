# Codex CLI 0.170.0 compatibility

The build-time `@openai/codex` dependency, lockfile and Docker runtime defaults
now use 0.170.0, upgraded from 0.166.0. Unrelated dependencies remain unchanged.

## Protocol and catalog

Regenerate the version-specific protocol with `pnpm codex:schema` after installing
in an existing checkout. `ensure:codex-schema` checks file presence, not version.
The generated schema stays gitignored and is generated on fresh Docker builds.

The account response now requires nullable `userId`; the typed status fixture
includes it. Some gateway RPCs now accept explicit null parameters. The protocol
probe's raw transport accepts null without weakening the method/params correlation
of typed requests or changing the serialized value.

Other additive contract changes include assistant message moderation metadata,
completion token telemetry, queued-input metadata, audio file IDs, optional model
provider selection, history/output deferral options and MCP request metadata.
Existing production request/response paths compile without changes. The new
`requiredHumanApproval` capability remains unadvertised; this update does not
opt into human-command approvals or add UI for every new upstream feature.

`docs/upstream/model-catalog-0.170.0.json` is the complete deterministic bundled
export: 14 models, including 3 hidden entries, GPT-6.2 Sol and GPT-6.2 Astra.
Native parser tests compare the complete export and explicitly retain both 6.2
models and GPT-6.1 Terra. This bundled artifact is distinct from an account's
authenticated remote model catalog.

References:
- https://learn.chatgpt.com/docs/changelog?date=2026-11-18
- https://learn.chatgpt.com/docs/app-server

## Validation

Validated on 2026-11-18 using a project-local toolchain:

- Backend production build and full TypeScript checking, including test fixtures.
- Protocol-probe TypeScript checking.
- All 73 backend test files / 607 tests passed, including native catalog tests.
- Frontend production build and all 59 unit test files / 474 tests passed.
- Credential-free `settings-update` probe: explicit policy changes emitted the
  matching notifications; a global config reload did not emit a settings update
  within 1.5 seconds. That last observation does not establish policy enforcement.
- Credential-free `turn-item-finality` probe: a completed shell turn's complete
  item payloads stayed unchanged across another shell turn and loaded resume.
  Model/subagent finality and cold replay remain unmeasured.
- Isolated WebUI startup: homepage, authenticated health and Codex status routes
  returned HTTP 200. The app-server initialized as `codex_webui/0.170.0`, config
  discovery succeeded and the credential-free model list contained 11 entries.
- Proxy-prefix smoke check rendered the matching `/compat/` HTML base path.

The smoke instance used a disposable home and database without account credentials.
Its `accountLoginRequired` / `missingProviderConfig` status is expected and does
not validate a real login. No authenticated model turn or browser interaction was
performed. Existing services, Docker images, containers and user data were not
changed by these checks. Temporary probe homes and smoke processes were removed.

## Upgrade an existing checkout

```sh
pnpm install --frozen-lockfile
pnpm codex:schema
pnpm build
pnpm --dir web install --frozen-lockfile
pnpm --dir web build
```

Restart the intended host service only after building. Docker deployments need a
new image and container rollout; updating source defaults alone cannot change an
existing container. Confirm the running app-server version and account readiness
separately. A global CLI update does not override an explicitly selected binary.
