# Server Plan Progress

Branch: feat/a1-a3-server-plan
Started: 2026-07-20

## Scope (from ai iteration plan)
- A2.1 telemetry endpoints
- A2.4/A2.5 createdBy filter tighten + tests
- A3.3 plugins/market/install-from-url

## DONE

### A2.1 Telemetry API
- [x] `POST /api/telemetry/events` — batch ingest (Zod, max 100), JWT auth
- [x] `POST /api/telemetry/errors` — error report ingest
- [x] `GET /api/telemetry/funnel` + `/summary` — funnel counts (`hours` query, default 24)
- [x] Models: `TelemetryEvent`, `TelemetryError` (tenantId, userId, createdAt)
- [x] Registered in `src/app.ts`
- [x] Tests: `src/__tests__/telemetry.spec.ts`

### A2.4 / A2.5 createdBy isolation
- [x] `/api/keys` — `buildOwnershipFilter` already enforced; admin bypass documented (`data_scope=all`)
- [x] Regression matrix test added in `apiKey-isolation.spec.ts` (+ mocked unit suite)
- [x] Agent workflows — verified all list/get/update/delete/publish/execute/rotate-key use `createdBy` (no admin bypass by design)
- [x] Tests: `src/ai/__tests__/agentWorkflowOwnership.spec.ts`, `src/__tests__/apiKey-ownership-unit.spec.ts`

### A3.3 Plugin market
- [x] `GET /api/plugins/market`
- [x] `POST /api/plugins/market/:id/install`
- [x] `POST /api/plugins/market/:id/uninstall`
- [x] `POST /api/plugins/market/install-from-url` — allowlist, timeout/size, JSON-only expert manifest, write to `plugins/local/experts`
- [x] Env: `PLUGIN_INSTALL_URL_ALLOWLIST`, optional fetch limits in `.env.example`
- [x] Tests: `src/ai/__tests__/pluginMarket.spec.ts`

## Notes / blockers
- Full `apiKey-isolation.spec.ts` (Mongo integration) skipped locally when MongoDB is not running (`ECONNREFUSED :27017`). Mocked unit coverage covers ownership filter logic.
