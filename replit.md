# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

- `artifacts/api-server` — Express 5 API. Routes for players, teams, matches, tournaments, stages, stats, ranking, plus `/matches/:id/finish` (Elo, K=32) and `/tournaments/:id/finish` (placements + history tables + recalc VSP). Schema lives in `lib/db/src/schema/`.
  - **Tournaments**: Prisma-style fields added alongside the legacy ones. `prize_pool integer` is the canonical cash prize; the legacy `prize integer` is kept for back-compat and the server enforces `prize === prizePool` on every write — both POST and PATCH go through `reconcilePrizePool()` which 400s on mismatch and auto-mirrors a one-sided write into both columns. New `stages text[]` (default `'{}'::text[]`) is a denormalized list of stage labels for the Prisma model — it does **not** replace the rich `stages` table (which still owns matches/standings via `stageId`). New `created_at timestamptz default now()` (read-only). Tournament responses always include `prize`, `prizePool`, `stages`, and `createdAt`. Admin UI binds the form to `prizePool` and accepts comma-separated `stages` input.
  - **Matches**: `team1Id` / `team2Id` are nullable FKs to `teams` with `onDelete: "restrict"` (a team that still appears in matches must be unlinked or those matches removed first — preserves historical integrity). `score1` / `score2` are integers; the legacy `score: "13-9"` string is parsed only by the `/finish` endpoint. Extra Prisma-style fields: `format text default 'Bo1'` (enum `Bo1|Bo2|Bo3|Bo5` validated by OpenAPI), `maps text[]` (per-map list, validated against the canonical Valorant `MapName` enum: Sunset/Breeze/Lotus/Haven/Ascent/Split/Pearl/Bind/Icebox/Fracture — defined in `lib/api-spec/openapi.yaml` and reused in `MapResult.map` and `Match.map`; admin UI exposes a checkbox grid (`MAP_POOL` in `admin.tsx`) — keep both lists in sync). `PlayerMatchStat.agent` is a required nullable field constrained to the canonical Valorant `Agent` enum (Jett/Reyna/Sova/Omen/Brimstone/Phoenix/Sage/Cypher/Killjoy/Viper/Skye/Yoru/Neon/Fade/Harbor/Gekko/Deadlock/Iso) defined in `openapi.yaml`; admin Submit Stats dialog renders a per-player Select dropdown sourced from `AGENT_POOL` in `admin.tsx` — which is derived at runtime from the generated `Agent` const re-exported by `@workspace/api-client-react`, so adding/removing an agent in `openapi.yaml` propagates automatically after `pnpm --filter @workspace/api-spec run codegen`. Stats are stored in `matches.stats jsonb` so adding the field requires no migration. `mapResults jsonb` typed `{map, score1, score2}[]`, `tournamentId integer` FK to `tournaments` with `onDelete: "set null"` (kept side-by-side with the legacy `tournament` text column — new code uses the FK), and `createdAt timestamptz default now()`. The Prisma `isLive Boolean` is **not stored** — it's a derived field added in API responses (`status === 'LIVE'`) via `withDerived()` in `routes/matches.ts`. All endpoints returning a `Match` (including the `/teams/:id/history` and `/players/:id/history` enriched arrays) MUST run `withDerived` (or inline the spread `{ ...m, isLive: m.status === "LIVE" }`) or Zod response validation will 500. Single legacy `map text` field stays for back-compat — when a single map exists it can be backfilled into `maps[map]`.
  - **Players**: `position` (in-game role string e.g. Duelist/Controller/Initiator/Sentinel/Flex) is now separate from `role` (enum `main | sub | coach`, default `main`). Partial unique index `players_one_coach_per_team` enforces one coach per `teamId WHERE role='coach'` → 400 on conflict.
  - **History tables**: `team_tournament_history` (placement per team per tournament), `player_team_history` (player↔team movements with timestamps), `player_tournament_history` (per-player participation) — populated by `finishTournament` and consumed by `recalcVSP`. `getTeamForm` reads finished `matches` rows directly.
  - **Rating model** (in `artifacts/api-server/src/lib/rating.ts`):
    - `PLACEMENT_LADDER` maps tournament placement → VSP points; `recalcVSP(teamId)` resums them from `team_tournament_history`.
    - `getTeamForm(teamId)` returns the last 5 finished matches as `+10` per win, `-5` per loss (most recent first).
    - `getActivityScore(teamId)`: `+20` if last match within 7d, `0` within 30d, else `-30`.
    - **Rating A** = `vsp + form + activity` (rounded) — exposed by `GET /api/ranking?limit=N` (default 30, max 100) via `buildRanking()`.
    - **Rating B** is the per-match Elo on `teams.elo` updated by `finishMatch`.
  - **Image uploads** (admin-only): `POST /api/admin/uploads/image?preset=team|player` accepts multipart `file` (JPEG/PNG/WebP, ≤5 MB), magic-byte sniff, sharp pipeline (team=256² contain transparent; player=300² cover smart-crop) → WebP@80. Files saved to `artifacts/api-server/uploads/`, served via `app.use("/api/uploads", express.static(...))` with 1y immutable cache. **Storage caveat**: local filesystem — uploads do NOT survive deploy/redeploy on Replit. Swap to App Storage before going to production (use the `object-storage` skill).
- `artifacts/valiant-series-web` — React + Vite frontend for "Valiant Series" esports league. Mounted at `/`. Uses generated hooks from `@workspace/api-client-react`.
  - **Pages**: Dashboard, Matches, Match detail, Tournaments, Tournament detail (stage-aware), Teams, Team detail, Players, Player detail, **Ranking** (`/ranking` — Rating A leaderboard with `FormDots` showing last 5 results), Admin.
  - **Entity helpers** (`src/lib/entities.ts`): `playerFullName`, `teamNameById`, `teamById`, `matchScore`, `isMatchTeam` — used everywhere a team-name string used to live (now teams are referenced by FK id).
  - **FormDots** (`src/components/form-dots.tsx`): renders W/L pills from `RankingEntry.formMatches`.
  - Realtime invalidation uses a string-prefix predicate so per-id detail queries refresh automatically.
  - **Admin edit** (`src/pages/admin.tsx`): `TeamDialog`/`PlayerDialog`/`TournamentDialog` are dual-mode. Without entity prop → uncontrolled, renders trigger button "NEW X", calls `onSubmit` (create). With entity prop + controlled `open`/`onOpenChange` → no trigger, prefills from entity, calls `onUpdate` (PATCH partial). Edit buttons (`button-edit-{kind}-{id}`, `Edit` lucide icon) sit next to each row in the lists. State `editingTeam`/`editingPlayer`/`editingTournament` lives in `AdminPanel`. `MatchDialog` is currently create-only by design (matches are mutated via FINISH and STATS dialogs, not free-form edit).

Teams table extra columns: `twitter`, `telegram`, `instagram`, `twitch` (all nullable). Social link builder normalizes bare handles vs full URLs; anchors use `target="_blank" rel="noopener noreferrer"`.
- `valiant-series/` (legacy, untouched) — original vanilla JS + json-server prototype kept for reference.

Seed data (4 teams, 20 players, 6 matches, 3 tournaments) was loaded from `valiant-series/db.json`. Idempotent re-seed via `WHERE NOT EXISTS`. Mapping notes when re-seeding from legacy JSON: legacy `player.role` (Duelist/Controller/...) → new `player.position` + `role='main'`; legacy `player.name` is split on first space into `first_name`/`last_name`; legacy `match.score` `"13-9"` → `score1=13, score2=9`; legacy team-name strings on matches/players are looked up to FK ids; **legacy free-text `tournament.format` ("Double Elimination" etc.) MUST be normalized to the OpenAPI enum `single|double|swiss|group`** — otherwise `GET /api/tournaments` 500s on Zod response validation. Garbage rows ("Test Team", "TestNick", "Test Tour" with non-integer prize, "A vs B" LIVE match without tournament) are filtered out.
