# Codex CLI 0.164.0 compatibility

This update targets the stable `@openai/codex@0.164.0` package. Both the
build-time dependency and Docker runtime default are pinned to that version.
The npm lockfile includes its platform-specific native packages.

## Protocol and catalog

Generate the wire types from the pinned binary, as recommended by the
[official App Server documentation](https://learn.chatgpt.com/docs/app-server).
For an existing checkout, run `pnpm codex:schema` explicitly after installing
dependencies: `ensure:codex-schema` only checks whether generated files exist.
Generated types are ignored by Git and are recreated during clean Docker builds.

Typed test fixtures now include `availableAccessPrograms`, `rootTurnId`,
`disabledPluginIds`, resume `collaborationMode`, and thread `originator`.
Existing production request/response handling compiles against the new schema
without changes; this update does not add UI for every new upstream feature.

The versioned bundled model catalog was exported with `pnpm codex:catalog`.
Its content is identical to the 0.162.1 bundled baseline.

## Validation

- Backend and frontend production builds.
- Backend TypeScript checking, including test fixtures.
- Backend and frontend unit tests with `NODE_ENV=test`.
- Native catalog/parser integration tests using the pinned binary.
- Credential-free `settings-update` and `turn-item-finality` protocol probes.
- Isolated WebUI startup: homepage and health endpoint return HTTP 200;
  `/api/codex/status` reports app-server connected and initialized with
  `codex_webui/0.164.0`, and successful config/model discovery.

The isolated smoke instance intentionally has no account credentials. Its
runtime reports `accountLoginRequired` / `missingProviderConfig`; authenticated
model turns and browser interaction are not covered by this smoke check.
No existing container, user configuration, or conversation data was changed.

## Build and upgrade

```sh
pnpm install --frozen-lockfile
pnpm codex:schema
pnpm build
NODE_ENV=test pnpm test
pnpm --dir web install --frozen-lockfile
pnpm --dir web build
NODE_ENV=test pnpm --dir web test
docker build -t kot4ri/codex-webui:0.164.0-local .
```

Before replacing a deployment, back up its Compose configuration and persisted
Codex home/database. The image entrypoint upgrades the CLI inside an initialized
`/root` volume when its version marker differs; that step needs npm connectivity.
Verify `codex --version` and `/api/codex/status` after deployment, since the
existing entrypoint logs a warning and continues if the CLI installation fails.
