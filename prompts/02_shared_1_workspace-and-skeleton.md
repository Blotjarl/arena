# Prompt 02_shared_1 — Workspace Structure and Empty Skeleton

### CRITICAL DIRECTIVE ###
**CRITICAL: Load `prompts/00_master_context.md` before proceeding.** This prompt creates the npm workspace
monorepo, every package's build config, and an empty placeholder file for every class/interface named in
`docs/01_class_list.md` — the literal "skeleton of the source code" `docs/ProjectProcess.txt` Step 2 asks
for. **Do not write any class members in this prompt** — only `packages/shared/src/util/NotImplementedError.ts`
gets real content, because every later prompt's stub method bodies depend on it existing.

---

### MANDATORY: Sandwich Requirement
- **Start**: Nothing under `packages/` exists yet — confirm this with `ls` before starting; if it already
  exists, stop and report rather than overwriting.
- **End**: `npm install` succeeds at the repo root; the directory tree below exists exactly; only
  `NotImplementedError.ts` has real content, everything else is a one-line placeholder comment.

---

### 1. Root files

**`package.json`**
```json
{
  "name": "arena",
  "private": true,
  "version": "0.1.0",
  "workspaces": [
    "packages/shared",
    "packages/server",
    "packages/client",
    "packages/api"
  ],
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "npm run test --workspaces --if-present"
  },
  "devDependencies": {
    "typescript": "^5.6.0"
  }
}
```

**`tsconfig.base.json`**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "CommonJS",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "exclude": ["node_modules", "dist"]
}
```

**`.gitignore`** — append (don't overwrite existing entries): `node_modules/`, `dist/`, `coverage/`, `.env`, `*.tsbuildinfo`

---

### 2. Per-package config

**`packages/shared/package.json`**
```json
{
  "name": "@arena/shared",
  "version": "0.1.0",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": { "typecheck": "tsc --noEmit", "test": "jest" },
  "devDependencies": {
    "typescript": "^5.6.0", "jest": "^29.7.0", "ts-jest": "^29.2.0", "@types/jest": "^29.5.0"
  }
}
```
**`packages/shared/tsconfig.json`**
```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "rootDir": "src", "outDir": "dist" }, "include": ["src"] }
```

**`packages/server/package.json`**
```json
{
  "name": "@arena/server",
  "version": "0.1.0",
  "main": "dist/index.js",
  "scripts": { "build": "tsc", "typecheck": "tsc --noEmit", "test": "jest", "start": "node dist/index.js" },
  "dependencies": { "@arena/shared": "*", "socket.io": "^4.7.0" },
  "devDependencies": {
    "typescript": "^5.6.0", "jest": "^29.7.0", "ts-jest": "^29.2.0", "@types/jest": "^29.5.0", "@types/node": "^20.0.0"
  }
}
```
**`packages/server/tsconfig.json`** — same shape as shared's.

**`packages/client/package.json`**
```json
{
  "name": "@arena/client",
  "version": "0.1.0",
  "scripts": { "typecheck": "tsc --noEmit", "test": "jest" },
  "dependencies": { "@arena/shared": "*", "react": "^18.3.0", "react-dom": "^18.3.0", "socket.io-client": "^4.7.0" },
  "devDependencies": {
    "typescript": "^5.6.0", "@types/react": "^18.3.0", "@types/react-dom": "^18.3.0",
    "jest": "^29.7.0", "ts-jest": "^29.2.0", "@types/jest": "^29.5.0",
    "@testing-library/react": "^16.0.0", "jest-environment-jsdom": "^29.7.0"
  }
}
```
**`packages/client/tsconfig.json`**
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "jsx": "react-jsx", "lib": ["ES2022", "DOM"] },
  "include": ["src"]
}
```

**`packages/api/package.json`**
```json
{
  "name": "@arena/api",
  "version": "0.1.0",
  "scripts": { "build": "tsc", "typecheck": "tsc --noEmit", "test": "jest", "start": "node dist/index.js" },
  "dependencies": { "@arena/shared": "*", "express": "^4.19.0", "pg": "^8.12.0" },
  "devDependencies": {
    "typescript": "^5.6.0", "@types/express": "^4.17.0", "@types/pg": "^8.11.0", "@types/node": "^20.0.0",
    "jest": "^29.7.0", "ts-jest": "^29.2.0", "@types/jest": "^29.5.0"
  }
}
```
**`packages/api/tsconfig.json`** — same shape as shared's.

**CRITICAL**: exact dependency versions above are reasonable current majors, not verified pins — if `npm install`
resolves a materially different version, that's fine; don't hand-edit version numbers to force a match.

---

### 3. Empty file skeleton

Create every file below containing **only** a one-line comment naming the class/interface it will hold —
e.g. `// Model — see docs/01_class_list.md §1` — except `NotImplementedError.ts` (§4 below).

```
packages/shared/src/
├── mvc/
│   ├── Model.ts
│   ├── View.ts
│   ├── Controller.ts
│   ├── ModelEvent.ts
│   ├── ModelListener.ts
│   ├── AbstractModel.ts
│   └── AbstractController.ts
├── domain/
│   ├── ids.ts
│   ├── Team.ts
│   ├── MatchPhase.ts
│   ├── ConnectionStatus.ts
│   ├── EndReason.ts
│   ├── MatchResult.ts
│   ├── EffectType.ts
│   ├── Position.ts
│   ├── Ability.ts
│   ├── Champion.ts
│   ├── ChampionRoster.ts
│   ├── Player.ts
│   ├── Match.ts
│   └── MatchParticipant.ts
├── contract/
│   ├── payloads.ts
│   ├── events.ts
│   └── dto.ts
├── exceptions/
│   ├── ArenaError.ts
│   ├── InvalidUsernameError.ts
│   ├── UnidentifiedConnectionError.ts
│   ├── AlreadyQueuedError.ts
│   ├── NotQueuedError.ts
│   ├── InvalidChampionSelectionError.ts
│   ├── SelectionWindowExpiredError.ts
│   ├── InvalidMatchPhaseError.ts
│   ├── AbilityOnCooldownError.ts
│   ├── InsufficientResourceError.ts
│   ├── ActorIncapacitatedError.ts
│   ├── TargetOutOfRangeError.ts
│   ├── GracePeriodExpiredError.ts
│   ├── PlayerNotFoundError.ts
│   ├── PersistenceError.ts
│   ├── ValidationError.ts
│   └── index.ts
├── util/
│   └── NotImplementedError.ts   ← real content, see §4
└── index.ts                      ← barrel export, filled in by 02_shared_4

packages/server/src/
├── model/
│   ├── QueueEntry.ts
│   ├── MatchmakingQueue.ts
│   ├── ParticipantState.ts
│   ├── MatchModel.ts
│   └── TickLoop.ts
├── controller/
│   ├── ConnectionHandler.ts
│   ├── PlayerIdentifyController.ts
│   ├── MatchmakingController.ts
│   ├── ChampionSelectController.ts
│   ├── CombatController.ts
│   ├── DisconnectController.ts
│   └── MatchReportingClient.ts
├── view/
│   ├── MatchmakingBroadcastView.ts
│   └── MatchBroadcastView.ts
├── ServerMain.ts
└── index.ts

packages/client/src/
├── model/
│   ├── ClientIdentityModel.ts
│   ├── ClientQueueModel.ts
│   ├── ClientMatchModel.ts
│   └── InterpolationBuffer.ts
├── controller/
│   ├── SocketConnectionController.ts
│   ├── LobbyController.ts
│   ├── ChampionSelectController.ts
│   └── MatchController.ts
├── view/
│   ├── LobbyView.tsx
│   ├── ChampionSelectView.tsx
│   ├── MatchHUDView.tsx
│   └── ResultsView.tsx
├── ClientMain.tsx
└── index.tsx

packages/api/src/
├── model/
│   ├── PlayerRepository.ts
│   ├── MatchRepository.ts
│   ├── LeaderboardEntry.ts
│   ├── LeaderboardRepository.ts
│   └── PendingMatchCorrelator.ts
├── controller/
│   ├── InternalMatchController.ts
│   ├── MatchHistoryController.ts
│   └── LeaderboardController.ts
├── view/
│   ├── LeaderboardResponseView.ts
│   ├── MatchHistoryResponseView.ts
│   └── ErrorResponseView.ts
├── util/
│   └── PgPool.ts
├── ApiMain.ts
└── index.ts
```

---

### 4. `packages/shared/src/util/NotImplementedError.ts` — the one real file

```ts
/**
 * Thrown by every stub method body during the skeleton/declaration phase
 * (docs/ProjectProcess.txt Steps 2–3). Not a domain exception — does not
 * extend ArenaError, and should not appear in the codebase once a method's
 * real implementation lands (Steps 8–10).
 */
export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotImplementedError';
    Object.setPrototypeOf(this, NotImplementedError.prototype);
  }
}
```

---

### 5. Verification and Git

Verify per master context §9.5 — here that means: `npm install` succeeds; every path above exists; `git status`
shows only new files (nothing under `node_modules/` staged). Then, per §9.4: branch `shared` from `main`,
commit as `Step 2: shared workspace structure and empty skeleton`, push to `origin shared`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: This prompt only lays out shape — no other file may contain real declarations yet.** Prompts
`02_shared_2` through `02_shared_4` fill in `packages/shared`; only after those merge do the server/client/api
model prompts begin.
