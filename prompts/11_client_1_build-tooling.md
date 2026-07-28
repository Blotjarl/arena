# Prompt 11_client_1 — Give the client real build tooling (it has never been run as an app)

**Owner: Raj.** Load `prompts/00_master_context.md` first.

### CRITICAL: this is a genuinely new gap, found while designing Step 11's prompts
Every prompt through Step 10 implemented and unit-tested `packages/client`'s classes in isolation (Jest +
jsdom + React Testing Library) — nothing has ever actually **run** the client as a real web app. Confirmed
by inspection, not assumed: `packages/client/package.json` has only `typecheck` and `test` scripts, no
bundler dependency (no Vite/webpack/esbuild), and there is no `index.html` anywhere in the package. Root
`npm run build` silently no-ops for this workspace. Separately: `ClientMain.main()`'s default socket
factory is a bare `io()` call with **no URL argument** — Socket.IO's client interprets that as "connect to
whatever origin served this page," which only works if the client and the game server happen to be served
from the same origin. They won't be (different processes, different ports in dev, likely different hosts
in production) — this has to become configurable before `11_shared_2`'s acceptance test (or any real
deployment) can work at all.

This prompt is a prerequisite for `11_shared_2_e2e-acceptance-test.md` — that prompt needs a buildable,
servable, connectable client to point a browser at.

---

### Scope
1. **Add Vite** (`vite`, `@vitejs/plugin-react`) as a dev dependency of `packages/client`, with a minimal
   `vite.config.ts`. Vite is the standard, low-config choice for a React+TS SPA and needs no server-side
   rendering or routing setup — this app is a single mounted root (`ClientMain.main()` already does the
   mounting), not a multi-page site.
2. **Add `packages/client/index.html`** — a minimal HTML shell with a `<div id="root"></div>` (matching
   `ClientMain.main()`'s existing `document.getElementById('root')` lookup — don't change that lookup) and
   a `<script type="module" src="/src/entry.tsx"></script>` (or wherever you place the actual entry file —
   see next point).
3. **Add a real entry point** — `packages/client/src/entry.tsx` (or similar; `ClientMain.tsx` itself
   exports the `ClientMain` class and shouldn't also be the side-effecting entry file) that imports
   `ClientMain` and calls `ClientMain.main()`. Keep this file tiny — it should do nothing but call `main()`,
   the same way `packages/server/src/index.ts` is a two-line file calling `ServerMain.main()`.
4. **Make the server URL configurable.** Change `ClientMain.main()`'s default `socketFactory` from `() =>
   io()` to something that reads a build-time-injected server URL — Vite's `import.meta.env.VITE_*`
   convention is the standard mechanism (e.g. `VITE_SERVER_URL`, falling back to a sensible local-dev
   default like `http://localhost:3001` if unset). Keep the `socketFactory` parameter itself unchanged
   (tests already inject a mock through it) — only change what the *default* value does.
5. **Add `dev`/`build`/`preview` scripts** to `packages/client/package.json` (`vite`, `vite build`, `vite
   preview` respectively — standard Vite conventions, check Vite's own docs for the exact script bodies
   rather than guessing at flags). `npm run build` from the repo root should now actually produce a
   `packages/client/dist/` for this workspace.
6. **Do not touch test infrastructure.** `jest.config.js`, the existing Jest+RTL test suites, and
   `tsconfig.json` should not need changes for this — Vite and Jest are independent toolchains here (Vite
   builds/serves the real app; Jest still runs the unit/component test suite exactly as before). If you
   find you *do* need to touch `jest.config.js`, stop and think hard about why before proceeding — that
   would be a sign something's being conflated that shouldn't be.

### Process
1. Read `packages/client/src/ClientMain.tsx` in full — the real current file, not this prompt's paraphrase.
2. Make the changes above.
3. Verify for real, not just by reading the config: run `npm run dev -w @arena/client` (or equivalent) and
   confirm it serves without a build error; run `npm run build -w @arena/client` and confirm a `dist/`
   folder is produced; run `npm run typecheck -w @arena/client` and the full existing Jest suite — both
   must stay green, since this prompt should not change any application behavior the existing tests cover,
   only add the ability to actually run the app.
4. Add a short new section to `docs/01_class_list.md`'s `packages/client` area (§6, wherever reads most
   naturally) documenting that the client now has real build tooling, the entry point's location, and the
   `VITE_SERVER_URL` env var — this is new infrastructure, not covered by any existing correction note.

---

### Verification and Git
Report the real output of `npm run typecheck -w @arena/client`, the full Jest suite, and confirm (paste
the terminal output or describe exactly what you saw) that `npm run dev` and `npm run build` both actually
work — this prompt's entire point is making the app *runnable*, so "the config looks right" is not
sufficient verification. Branch `client` from `main` (check `git log` for divergence first — this project
has hit stale-branch conflicts multiple times), commit `Step 11: add Vite build tooling to packages/client
(client has never been runnable as an app)`, push, open a PR into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: actually load the built/served app in a browser (or Playwright, if that's easier for you to
verify headlessly) and confirm the Lobby screen renders with no console errors before calling this done —
"it builds without a TypeScript error" is not the same as "it runs." This is the very first time this
client has ever been asked to actually execute in a browser; don't assume it works just because every
class passed its isolated unit tests.**
