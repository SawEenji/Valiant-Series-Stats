# Threat Model

## Project Overview

Valiant Series is a pnpm monorepo that serves a public esports league website and a separate Express 5 JSON API backed by PostgreSQL through Drizzle ORM. The production deployment consists of `artifacts/valiant-series-web` as a static React/Vite frontend and `artifacts/api-server` as the API mounted at `/api`; admin users authenticate with a cookie-backed session to create, edit, and delete league data.

Production assumptions for this scan:
- `NODE_ENV` is `production` in deployed services.
- Traffic to the deployed app is already protected by platform-managed TLS.
- `artifacts/mockup-sandbox` is dev-only and not deployed.
- `valiant-series/` is a legacy prototype kept for reference and not deployed unless production reachability is later demonstrated.

## Assets

- **Admin session and admin password** — the `ADMIN_PASSWORD`, `SESSION_SECRET`, and the `vs.sid` session cookie control all write access to league data. Compromise gives full administrative control.
- **League integrity data** — teams, players, matches, tournaments, stages, and ELO/stat updates are the application's core business data. Unauthorized writes would deface the site and corrupt standings.
- **Database availability** — public pages depend on unauthenticated read endpoints for players, teams, matches, tournaments, search, and summary stats. Abuse that overwhelms the API or PostgreSQL can take the site offline.
- **Application secrets** — database connection strings and session secrets are loaded from environment variables and must never leak through logs or client code.

## Trust Boundaries

- **Browser to API** — all frontend requests cross from an untrusted browser into the Express API. Every mutating route must enforce admin authorization server-side.
- **API to PostgreSQL** — the API has direct read/write access to the production database. Query construction, filtering, and result sizes directly affect integrity and availability.
- **Public to admin boundary** — public users can read league data, while admin routes mutate data. This boundary is enforced with an `express-session` cookie and `requireAdmin` middleware.
- **Static frontend to API session boundary** — the frontend is publicly accessible, including the `/admin` page shell, but authenticated state must come only from the backend session check and not client-side assumptions.
- **Production to dev-only boundary** — `artifacts/mockup-sandbox` and `valiant-series/` should normally be ignored during production scans unless they become reachable from deployed services.

## Scan Anchors

- **Production entry points:** `artifacts/api-server/src/index.ts`, `artifacts/api-server/src/app.ts`, `artifacts/valiant-series-web/src/main.tsx`, `artifacts/valiant-series-web/src/App.tsx`
- **Highest-risk code areas:** `artifacts/api-server/src/routes/admin.ts`, `artifacts/api-server/src/middlewares/requireAdmin.ts`, public aggregate/search routes under `artifacts/api-server/src/routes/`, and shared request schemas in `lib/api-zod/src/generated/api.ts`
- **Public surfaces:** `GET /api/players`, `GET /api/teams`, `GET /api/teams/leaderboard`, `GET /api/matches*`, `GET /api/tournaments`, `GET /api/stages`, `GET /api/stats/summary`, `GET /api/search`
- **Admin surfaces:** `POST /api/admin/login`, `POST /api/admin/logout`, and all non-GET create/update/delete match, player, team, tournament, and stage routes
- **Dev-only areas to skip by default:** `artifacts/mockup-sandbox/**`, `valiant-series/**`

## Threat Categories

### Spoofing

The only privileged identity in this system is the admin session established by `POST /api/admin/login`. The application must ensure the admin password is resistant to online guessing, sessions are regenerated on login, session secrets remain server-side, and protected routes never trust frontend state alone.

### Tampering

All create, update, delete, and match-finalization routes can alter core league data and standings. The system must keep these routes behind server-side admin authorization, validate request bodies with the shared Zod schemas, and prevent malformed or cross-entity updates from corrupting tournament, stage, or stats data.

### Denial of Service

Most site pages depend on unauthenticated API endpoints, and several endpoints aggregate or search across whole tables. The system must keep public read routes bounded in cost, rate-limit the admin login surface against brute-force abuse, and avoid unauthenticated endpoints whose work scales linearly with total dataset size.

### Information Disclosure

The app intentionally publishes league data, but it must not disclose secrets, session cookies, or internal errors. Logs and error responses must continue to redact cookies and auth headers, and no environment secrets may enter frontend bundles or public API responses.

### Elevation of Privilege

The primary privilege-escalation risk is bypassing `requireAdmin` or abusing implementation flaws that let a public user perform admin-only actions indirectly. All mutating API routes must remain protected server-side, all database interactions must remain parameterized or ORM-safe, and any future WebSocket or cross-origin features must not create an alternate path around the admin session boundary.
