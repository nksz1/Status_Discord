# Project Context

Last verified: 2026-07-10  
Project root: `.`

## Identity and Purpose

- **Name:** `neko-discord-uptime-dashboard`
- **Purpose:** Public status dashboard for configured Discord bot services. A server-side aggregator polls authenticated uptime endpoints, derives member-facing impact/incidents, persists history, and serves a sanitized React dashboard.
- **Stack:** Node.js ESM, TypeScript, Express 5, React 19, Vite 6, JSON-file persistence.
- This repository does **not** implement Discord gateway events, commands, or bot login.

## Entry Points

| Entry point | Responsibility |
|---|---|
| `server/index.ts` | Production/backend entry: configuration, polling, impact state, persistence, public API, static frontend serving. |
| `src/main.tsx` | Browser entry; renders `App` and loads global CSS. |
| `src/App.tsx` | Dashboard UI, 30-second refresh loop, status/history/incident presentation. |
| `index.js` | Compatibility launcher that spawns `npm start`; it does not contain application logic. |
| `vite.config.ts` | Vite React setup and development `/api` proxy to the backend port. |

## Important Folders

| Path | Responsibility |
|---|---|
| `server/` | Aggregator, upstream HTTP client, impact/incident logic, persistence, Express API. |
| `src/` | React frontend, shared public/internal TypeScript contracts, browser API client. |
| `src/services/` | Browser-to-backend data fetching only. |
| `public/` | Static source assets copied by Vite. |
| `dist/` | Generated production frontend served by Express; rebuild, do not hand-edit. |

## Important Files and Symbols

### Backend

- `server/index.ts`
  - `readBotConfigFile`, `readConfiguredBots`: load `bots.config.json`, resolve token variable names, validate tokens.
  - `pollBots`: fetch all configured services, decorate snapshots, retain history, clean incidents, persist state.
  - `decoratePublicSnapshot`, `calculateImpact`: derive `normal|slow|interrupted|checking|recovering`.
  - `buildFeatureStatuses`, `updatePublicIncident`: member-facing feature and incident state.
  - `enforcePublicStatusRateLimit`: in-memory IP fixed-window limiter for `GET /api/status`.
  - `toPublicBotSnapshot`: allowlist boundary from internal `BotSnapshot` to public DTO.
  - `getPublicStatusPayload`: builds/caches the public response.
  - `scheduleNextPoll`: non-overlapping recursive poll schedule.
  - `startServer`: initializes persistence, performs first poll, and listens on the configured port.
- `server/uptime.ts`
  - Exports `fetchBotStatuses`.
  - Sends server-side Bearer credentials, rejects redirects, times out after 6 seconds, limits responses to 64 KiB, normalizes unknown JSON, and creates offline snapshots on failure.
- `server/db.ts`
  - Exports mutable `db`, `initDb`, and `saveDb`.
  - Persists through `data.json.tmp` then rename to `data.json`.

### Shared Contracts and Frontend

- `src/types.ts`: shared types/interfaces. `BotSnapshot` is internal/technical; `PublicBotSnapshot` is the public allowlisted shape. Also defines status samples, signals, events, features, and incidents.
- `src/services/uptime.ts`: exports `DashboardData` and `fetchDashboardData`; browser calls only the aggregator URL.
- `src/config.ts`: exports `apiUrl`, defaulting to relative `/api/status`.
- `src/App.tsx`: default export `App`; request single-flight guard; UI helpers include `BotStatusCard`, `FeatureSection`, `IncidentSection`, `calculateUptime`, and `buildStatusBars`.
- `src/styles.css`: all dashboard styling and responsive/animation behavior.
- `bots.config.json`: configured services, server-only upstream URLs, per-service `tokenEnv` names, feature labels, and impact thresholds. Never copy URL values into context or public output.

## Module Relationships

```text
.env.local + .env + bots.config.json
              -> server/index.ts
              -> server/uptime.ts -> authenticated upstream uptime endpoints
              -> internal BotSnapshot
              -> impact/features/incidents -> server/db.ts -> data.json
              -> toPublicBotSnapshot -> GET /api/status
              -> src/services/uptime.ts -> App -> dashboard UI
```

## Discord Event and Command Flow

- There are no Discord event listeners, command loaders, interactions, or gateway clients here.
- Discord bot processes run elsewhere and expose uptime JSON endpoints.
- This aggregator consumes those endpoints; the browser never calls a bot origin directly.
- Tasks about Discord command/event behavior belong outside this repository and require separately approved scope.

## Configuration and Authentication

- `.env.local` contains local/public runtime settings by key name only: `BOT_ENDPOINTS`, `VITE_API_URL`, `VITE_SHOW_DEBUG`, `SERVER_PORT`.
- `.env` contains server-only uptime token keys and API protection settings. Never document values.
- `bots.config.json.tokenEnv` maps each configured service to its server-side token environment variable.
- Upstream requests use `Authorization: Bearer <server token>`; tokens must be at least 32 characters.
- Do not put any token in `VITE_*`; Vite-prefixed values are client-visible.
- `GET /api/status` is intentionally public, IP-rate-limited, cached briefly, and returns only `PublicBotSnapshot` plus public history/features/incidents.
- Optional cross-origin access is restricted by `PUBLIC_CORS_ORIGIN`; no CORS header is emitted when unset.
- Leave `TRUST_PROXY_HOPS` unset unless the exact trusted proxy hop count is known.

## API and Dashboard Flow

1. Backend loads environment files and `bots.config.json`.
2. `pollBots` polls configured origins every 3 seconds using unique server-side credentials.
3. Responses are normalized and converted into public impact/incident state.
4. Latest snapshots are saved every poll; history samples are retained every 2 minutes for 30 days; public incidents retain 7 days.
5. `GET /api/status` applies rate limiting, strips technical fields, and caches the assembled response for 5 seconds.
6. The React client fetches `/api/status` every 30 seconds, prevents overlapping requests, and renders current status, uptime bars, features, and incidents.
7. Enabling `VITE_SHOW_DEBUG` renders received public JSON only; it must never be used as an authorization control.

## Database Flow

- Persistence is an in-memory object backed by ignored `data.json`.
- Logical collections: `latest_snapshots`, `history_logs`, `public_state`, `public_incidents`.
- `initDb` tolerates missing/invalid data by starting empty.
- `saveDb` writes a temporary file and renames it; keep writes serialized through the existing poll schedule.
- Never inspect or copy database contents into documentation unless the user explicitly requests a data task.

## Security Rules and Invariants

- Never expose upstream URL, host, port, bot IDs/tags, raw errors/signals/events, or credentials through `/api/status`.
- Keep `toPublicBotSnapshot` as an explicit allowlist; never replace it with object spreading of internal snapshots.
- Keep Bearer tokens server-side, unique per configured service, absent from logs/errors/context/frontend.
- Preserve timeout, redirect rejection, response-size ceiling, input normalization, rate limiting, and cache controls.
- Rate limiting is process-local and resets on restart; multi-instance deployment needs an edge/distributed limiter.
- Current upstream transport may not provide TLS. Use HTTPS, a private network, or IP allowlisting before treating Bearer transport as confidential.
- The history response can grow large over 30 days. For performance work, prefer aggregation/pagination or a separate history endpoint rather than increasing polling/cache load.
- `.env`, `.env.local`, runtime data, and token values must remain ignored and undocumented.

## Commands and Deployment

| Task | Command | Notes |
|---|---|---|
| Install | `npm install` | Uses `package-lock.json`. |
| Full development | `npm run dev` | Runs Vite and Express concurrently. |
| Frontend development | `npm run dev:frontend` | Vite binds `0.0.0.0`; avoid Internet exposure. |
| Backend development | `npm run dev:backend` | Runs `server/index.ts` via `tsx`. |
| Frontend build/typecheck | `npm run build` | Runs `tsc -b` for `src/` then Vite build; it does not typecheck `server/`. |
| Preview frontend | `npm run preview` | Vite preview only. |
| Production | `npm start` | Express polls services and serves `dist/`. |
| Compatibility launcher | `node index.js` | Spawns `npm start`. |

- No automated test or lint command is configured.
- Production deployment flow: install dependencies -> build -> provide environment/config -> start Express behind trusted TLS/firewall controls.
- Do not start, stop, restart, install, or deploy without explicit user approval.

## Generated and Runtime Paths to Skip

- `node_modules/`: installed dependencies.
- `dist/`: generated build output; inspect only for deployment/bundle verification.
- `data.json`, `data.json.tmp`, `data.db`: runtime/legacy data; never summarize contents.
- `*.tsbuildinfo`: generated TypeScript state.
- `.env`, `.env.local`: secrets/config values; inspect names/presence only when explicitly needed.
- `public/Elaina.mp4`: large static asset; skip unless the task concerns media/assets.
- `.git/`, `.agents/`: tooling metadata; inspect only for a directly relevant task.

## Task-to-File Index

| Task | Inspect first |
|---|---|
| Add/change monitored service or feature labels | `bots.config.json`, `server/index.ts` configuration interfaces |
| Upstream token/auth/timeout/response validation | `server/uptime.ts`, `server/index.ts:readConfiguredBots`, environment key names |
| Public API fields or information exposure | `server/index.ts:toPublicBotSnapshot/getPublicStatusPayload`, `src/types.ts` |
| Rate-limit, CORS, proxy, cache | `server/index.ts`, environment key names |
| Impact thresholds or incident transitions | `server/index.ts:calculateImpact/updatePublicIncident`, `bots.config.json.defaults` |
| Poll timing, retention, persistence races | `server/index.ts:pollBots/scheduleNextPoll`, `server/db.ts` |
| Dashboard fetching/refresh/errors | `src/services/uptime.ts`, `src/config.ts`, `src/App.tsx:App` |
| Status cards/history calculations | `src/App.tsx:BotStatusCard/calculateUptime/buildStatusBars`, `src/types.ts` |
| Layout, responsive design, animation | `src/styles.css`, then the relevant JSX in `src/App.tsx` |
| Frontend entry/static assets | `src/main.tsx`, `index.html`, `public/` |
| Build/dev proxy/deployment | `package.json`, `vite.config.ts`, `tsconfig*.json`, `index.js` |
| Runtime data schema | `server/db.ts`, write/read sites in `server/index.ts`; do not open data files first |
| Discord commands/events | None in this repository; request separately approved project scope |

## Context Maintenance

- Update this file after changes to entry points, module ownership, API contracts, authentication, persistence, polling, deployment, or security invariants.
- Re-verify symbols and commands before editing this map; do not paste implementation bodies or any sensitive/runtime values.
