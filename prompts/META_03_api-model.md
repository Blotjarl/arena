# Meta-Prompt 03 — Generate: API Model Package Remainder (4 prompts)

**Your job is to WRITE PROMPT FILES, not implement application code directly.** You are generating
`09_api_1_pending-match-correlator.md`, `09_api_3_player-repository.md`, `09_api_4_match-repository.md`,
and `09_api_5_leaderboard-repository.md`.

**Owner of all four generated prompts: En** (per `prompts/09-10_implementation_plan.md` §4's Owner column —
`packages/api` is En's SRS track; note that `09_api_2`, the schema/PgPool prerequisite you're building on,
is the one exception owned by Marshall, documented as such in that file). Each generated `.md` file must
open with `**Owner: En.**`, matching the format at `09_server_2_participant-state.md:3`.

### CRITICAL: read first, and confirm a real prerequisite before starting #2-4
1. `prompts/00_master_context.md`
2. `prompts/09-10_implementation_plan.md` (§2, §3 — the real-Postgres testing approach)
3. `prompts/09_api_2_schema-and-pgpool.md` — **must be merged to `main` before you validate prompts #2-4**
   (they need `packages/api/schema.sql`, `docker-compose.test.yml`, and a working `PgPool` to test
   against). Prompt #1 (`PendingMatchCorrelator`) has no DB dependency and can be done regardless.
4. `prompts/09_server_2_participant-state.md` — your quality/format bar.

### Process (same for each of the four prompts)
1. Read the actual current stub in `packages/api/src/model/` — ground truth.
2. TDD: write tests first, implement, `npm run typecheck -w @arena/api` + `npx jest <file> --coverage`
   until green. For #2-4 (repository classes), this means: `npm run test:db:up`, wait for readiness
   (`docker exec <container> pg_isready -U arena`, retry), run tests against the real container, `npm run
   test:db:down` when finished. Report real coverage numbers.
3. Revert (`git checkout -- <file>`, delete your test file) once verified. Confirm `git status` clean
   under `packages/` before continuing.
4. Write the prompt file.

**IMPORTANT — carry this design note into `09_api_3` verbatim** (it's already documented in
`09_api_2_schema-and-pgpool.md`, don't lose it): `PlayerRepository.findOrCreateByUsername` resolves by
**username**, not by whatever transient client-generated `PlayerId` a live match used — SRS 3.4 keys
`Player` rows by unique username, while the live match's id is only stable within one browser session
(R1.2). Return the canonical stored id.

---

### 1. `09_api_1_pending-match-correlator.md` — no DB, pure in-memory
Already covered in depth by `prompts/00_master_context.md` §8's critical-checkpoint list and
`prompts/09-10_implementation_plan.md` §2 item 4: include a named test proving `recordBegin`/`recordEnd`
are idempotent per `matchId` (calling either twice does not create a duplicate pending entry or return a
second combined record).

### 2. `09_api_3_player-repository.md` — `PlayerRepository.findOrCreateByUsername`
Real SQL against `players` (see `09_api_2`'s schema): `SELECT` by username first; if no row, `INSERT ...
RETURNING *` with a server-generated id (use `crypto.randomUUID()`, available in Node without an extra
dependency). Test both branches (existing player found; new player created) against the real test DB.

### 3. `09_api_4_match-repository.md` — `MatchRepository.recordMatch` + `LeaderboardEntry.fromRow`
`recordMatch` writes one `matches` row and exactly two `match_participants` rows in a single transaction
(`BEGIN`/`COMMIT`/`ROLLBACK` via `PgPool` — you may need to add a `transaction()` helper to `PgPool` if one
doesn't exist yet; check the current file before assuming). `findHistoryForPlayer` queries
`match_participants` joined to `matches`, filtered by `player_id`, most-recent-first, paginated
(`LIMIT`/`OFFSET` from `page`/`pageSize`). `LeaderboardEntry.fromRow` maps one aggregated query result row
(field names of your choosing, document them) to a `LeaderboardEntry` instance.

### 4. `09_api_5_leaderboard-repository.md` — `LeaderboardRepository`
`computeLeaderboard(minGames)`: aggregate `match_participants` by player (wins/losses/draws/gamesPlayed),
compute `winRate = wins / gamesPlayed` in the query (not as a separately maintained value — R8.1), exclude
players below `minGames` (R8.2), order by win rate then total wins. `computeChampionWinRates()`: same idea
aggregated by `champion_id` instead of `player_id`.

---

### Verification and Git
Confirm `git status` shows only the four new `.md` files under `prompts/`. Commit directly to `main`
(`Add generated Step 9 prompts: api model package remainder`), push. Update `prompts/README.md`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: If `PgPool` doesn't yet have a way to run multiple statements as one transaction when you get
to `09_api_4`, that's a real gap to fix — document the addition in that prompt the same way `09_api_2`
documented adding `close()` to `PgPool`, rather than working around it with non-atomic separate inserts.**
