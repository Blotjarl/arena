# Prompt 03_shared_2 — Initial API Documentation Generation (TypeDoc)

**Owner: Marshall** (per SRS Appendix C: testing infrastructure, deployment — this is repo tooling, not
package-specific work).

### CRITICAL DIRECTIVE ###
**CRITICAL: Load `prompts/00_master_context.md`. Do not run this prompt until `03_shared_1`,
`03_server_1`, `03_client_1`, and `03_api_1` are all merged to `main`** — TypeDoc's output is only useful
once there's documentation across the whole codebase for it to render; running this first produces a
mostly-empty doc site that would need regenerating anyway. This prompt implements
`docs/ProjectProcess.txt` Step 5: "Produce an initial javadoc documentation (with all scopes of visibility
allowed)." TypeDoc is TypeScript's javadoc equivalent — `-private`-equivalent visibility is an explicit
config flag, not a default, so get it right.

---

### MANDATORY: Sandwich Requirement
- **Start**: confirm on `main` that all four `03_*_1` TSDoc prompts are merged (`git log --oneline -20`
  should show all four "Step 3: ... TSDoc pass" commits reachable from `main`).
- **End**: `npx typedoc` runs with **zero errors** and generates real HTML pages under `docs/api/` for
  classes across all four packages (not just `shared`) — this exact config was validated against this
  repo before being written into this prompt; if it errors, something about the repo has changed since,
  investigate rather than assuming the config is wrong.

---

### 1. Install TypeDoc
```
npm install --save-dev typedoc
```
(This does affect `package.json`/`package-lock.json` — unlike prior prompts, this one **should** modify
the lockfile; that's expected and correct here.)

### 2. `tsconfig.typedoc.json` (repo root) — a dedicated tsconfig for doc generation only

TypeDoc needs one `tsconfig` covering all four packages' `src/` directories, which none of the existing
per-package `tsconfig.json` files do individually (each is scoped to its own package for the real build).
Don't repurpose an existing tsconfig — add this new one:

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "rootDir": ".",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM"]
  },
  "include": [
    "packages/shared/src/**/*.ts",
    "packages/server/src/**/*.ts",
    "packages/client/src/**/*.ts",
    "packages/client/src/**/*.tsx",
    "packages/api/src/**/*.ts"
  ]
}
```
`rootDir: "."` is required — without it, TypeScript infers a `rootDir` from the first file it sees and
rejects every other package's files as "not under rootDir." This was the actual failure mode hit while
validating this config; don't remove it to "simplify."

### 3. `typedoc.json` (repo root)

```json
{
  "entryPoints": [
    "packages/shared/src",
    "packages/server/src",
    "packages/client/src",
    "packages/api/src"
  ],
  "entryPointStrategy": "expand",
  "tsconfig": "tsconfig.typedoc.json",
  "out": "docs/api",
  "excludePrivate": false,
  "excludeProtected": false,
  "excludeInternal": false,
  "excludeExternals": true,
  "name": "Arena — API Documentation"
}
```
`entryPointStrategy: "expand"` is deliberate — Arena is an application, not a library with a curated
public surface, so every file in each package's `src/` should be documented, not just what each package's
`index.ts` re-exports. `excludePrivate`/`excludeProtected`/`excludeInternal` are all `false` — this is the
"all scopes of visibility allowed" requirement from Step 5; TypeDoc defaults to hiding private members,
which would silently violate that requirement if left unset.

### 4. Add the generation script to root `package.json`
```json
"scripts": {
  "docs": "typedoc"
}
```
(add alongside the existing `build`/`typecheck`/`test` scripts, don't replace them)

### 5. Generate and verify
```
npm run docs
```
Confirm: exit code 0, no `[error]` lines in the output (warnings about individual undocumented members are
acceptable for an *initial* pass — Step 5 asks for initial documentation, not a zero-warning site; fix
egregious gaps if you see whole classes with no documentation at all, since that would mean a `03_*_1`
prompt was skipped, not that this prompt has more docs-writing to do). Spot-check that
`docs/api/classes/*.html` contains real pages for classes from all four packages, not just `shared`.

### 6. `.gitignore`
Decide and note in your commit message: `docs/api/` is generated output. Course submission wants "API
docs produced by javadoc" as an actual artifact in the archive (`docs/ProjectProcess.txt` submission
list), so **do commit** `docs/api/` rather than gitignoring it — this is a deliberate exception to
"generated output doesn't belong in git," made because the archive-based submission process has no build
step of its own to regenerate it.

---

### 7. Verification and Git
Per master context §9.4: branch `shared` from `main` (`git branch -D shared 2>/dev/null; git checkout -b
shared main`), commit `Step 5: TypeDoc setup and initial API documentation generation`, push, open a PR
into `main`. This is the last prompt in the Step 3–5 batch — once merged, update `prompts/README.md`'s
Step 3–5 table (all rows checked).

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: If `npx typedoc` produces `[error]` output, do not silence it by loosening `include`/
`entryPoints` until every file is excluded — diagnose the actual cause (most likely: a new file was added
somewhere under `packages/*/src/` after this prompt was written and needs including, or a tsconfig option
conflicts). The config in this prompt is known-good as of when it was written; a failure means something
changed, not that the approach is wrong.**
