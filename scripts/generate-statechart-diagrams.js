#!/usr/bin/env node
/**
 * System statechart diagrams (submission archive item, docs/ProjectProcess.txt / docs/projectDescription.txt
 * item "System statechart diagrams") — unlike the class diagram, these are hand-authored, not reverse-
 * engineered: a state machine's states/transitions/guards require semantic understanding of the code
 * (which condition triggers which transition, and why), not just static type analysis. Each diagram below
 * is grounded directly in the real, current source it documents — see the comment above each `stateDiagram`
 * block for the exact file/method it was verified against.
 *
 * Reuses the same self-contained HTML shell (CSS + embedded mermaid.js, extracted from
 * docs/01_class_diagram.html) that scripts/generate-class-diagram.js uses, so this renders identically and
 * offline, with no network dependency, exactly like the class diagrams.
 *
 * Usage: node scripts/generate-statechart-diagrams.js
 */
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const outputPath = path.join(repoRoot, 'docs', 'statechart-diagrams.html');
const templatePath = path.join(repoRoot, 'docs', '01_class_diagram.html');

// ---------------------------------------------------------------------------
// Diagram 1 — MatchModel.phase, the match's own lifecycle (packages/server/src/model/MatchModel.ts,
// verified against selectChampion() and tick(), including checkWinConditions()/DISCONNECT_GRACE_PERIOD_MS).
// MatchPhase itself has exactly three values (CHAMPION_SELECT, ACTIVE, ENDED) — the four arrows into ENDED
// are four distinct real trigger conditions collapsing into that one state, not four separate states.
// ---------------------------------------------------------------------------
const matchModelDiagram = `stateDiagram-v2
    [*] --> CHAMPION_SELECT : constructor(id, players)
    CHAMPION_SELECT --> CHAMPION_SELECT : selectChampion() [only one player selected so far]
    CHAMPION_SELECT --> ACTIVE : selectChampion() [both now selected] / startedAt = now, notify match:start
    CHAMPION_SELECT --> ENDED : tick() [selection deadline elapsed] / endReason = SELECTION_TIMEOUT
    ACTIVE --> ENDED : tick() [a participant's health reaches 0] / endReason = ELIMINATION
    ACTIVE --> ENDED : tick() [5 minutes elapsed since startedAt] / endReason = TIME_LIMIT
    ACTIVE --> ENDED : tick() [disconnected participant's 30s grace period elapses] / endReason = DISCONNECT_FORFEIT
    ENDED --> [*]`;

// ---------------------------------------------------------------------------
// Diagram 2 — ParticipantState.connectionStatus, one participant's own connection lifecycle within a match
// (packages/server/src/model/ParticipantState.ts's connectionStatus field, mutated only by
// MatchModel.disconnect()/reconnect() — R6.1-R6.4). Deliberately scoped to just this one participant's own
// two-value state; the match-level consequence of staying disconnected too long (DISCONNECT_FORFEIT) is a
// transition on MatchModel, not on this class — see Diagram 1's ACTIVE -> ENDED arrow for that.
// ---------------------------------------------------------------------------
const participantConnectionDiagram = `stateDiagram-v2
    [*] --> CONNECTED : new ParticipantState(playerId, team)
    CONNECTED --> DISCONNECTED : disconnect(playerId) [socket disconnects] / disconnectedAt = now
    DISCONNECTED --> CONNECTED : reconnect(playerId) [within 30s grace period] / disconnectedAt = null
    DISCONNECTED --> DISCONNECTED : reconnect(playerId) [grace period elapsed] / throws GracePeriodExpiredError
    note right of DISCONNECTED
        While disconnected: no movement or ability
        input is accepted on this participant's
        behalf (R6.1). If still disconnected 30s
        after disconnectedAt, MatchModel.tick()
        ends the whole match as DISCONNECT_FORFEIT
        (see the Match Lifecycle diagram) -- that
        is a transition on the owning MatchModel,
        not a further transition of this state.
    end note`;

// ---------------------------------------------------------------------------
// Diagram 3 — ClientQueueModel.status, the local player's own matchmaking queue lifecycle as reported by
// the server (packages/client/src/model/ClientQueueModel.ts's setQueued/setCancelled/setMatched, driven by
// SocketConnectionController's queue:joined/queue:cancelled/match:found handlers — R2.1-R2.6). The
// server is authoritative; this model only ever stores what it has been told, never decides a transition
// on its own.
// ---------------------------------------------------------------------------
const clientQueueDiagram = `stateDiagram-v2
    [*] --> idle
    idle --> queued : setQueued(position) [server: queue:joined]
    queued --> idle : setCancelled() [server: queue:cancelled]
    queued --> matched : setMatched(payload) [server: match:found]
    matched --> queued : setQueued(position) [server: queue:joined, after Return to Queue]`;

function section(id, title, sourceNote, diagram) {
  return `
    <section class="pkg" id="${id}">
      <div class="pkg-head"><h2 class="pkg-title">${title}</h2></div>
      <p class="pkg-note">${sourceNote}</p>
      <div class="diagram-frame"><pre class="mermaid">${diagram}</pre></div>
    </section>`;
}

const sections = [
  section(
    'sc-match-lifecycle',
    'MatchModel — Match Lifecycle (server)',
    'packages/server/src/model/MatchModel.ts — the <code>phase: MatchPhase</code> field, driven by ' +
      '<code>selectChampion()</code> and <code>tick()</code> (R3.1&ndash;R3.5, R5.1&ndash;R5.4, R6.4). Three ' +
      'real states (<code>CHAMPION_SELECT</code>, <code>ACTIVE</code>, <code>ENDED</code>); the four arrows ' +
      'into <code>ENDED</code> are four distinct real trigger conditions, each recorded via the separate ' +
      '<code>endReason: EndReason</code> field, not four different phases.',
    matchModelDiagram,
  ),
  section(
    'sc-participant-connection',
    'ParticipantState — Connection Status (server)',
    'packages/server/src/model/ParticipantState.ts &mdash; the <code>connectionStatus: ConnectionStatus</code> ' +
      'field, mutated only by <code>MatchModel.disconnect()</code>/<code>reconnect()</code> (R6.1&ndash;R6.4). ' +
      'Scoped to one participant\'s own two-value state; the match-level consequence of staying disconnected ' +
      'past the 30s grace period is a transition on <em>MatchModel</em> (see the Match Lifecycle diagram above), ' +
      'not a further transition of this state.',
    participantConnectionDiagram,
  ),
  section(
    'sc-client-queue',
    'ClientQueueModel — Matchmaking Queue Status (client)',
    'packages/client/src/model/ClientQueueModel.ts &mdash; the <code>status: QueueStatus</code> field ' +
      '(R2.1&ndash;R2.6). The server is authoritative (master context &sect;1.1): every transition here is ' +
      'driven by an inbound server event via <code>SocketConnectionController</code>, this model never decides ' +
      'a transition on its own initiative.',
    clientQueueDiagram,
  ),
].join('\n');

// ---------------------------------------------------------------------------
// Splice into the same Step 1 template the class diagrams reuse: same CSS, same embedded mermaid.js.
// ---------------------------------------------------------------------------
const templateHtml = fs.readFileSync(templatePath, 'utf8');
const styleMatch = templateHtml.match(/<style>[\s\S]*?<\/style>/);
const mermaidScriptMatch = templateHtml.match(/<script>\s*"use strict";var __esbuild_esm_mermaid_nm[\s\S]*?<\/script>/);
const initScriptMatch = templateHtml.match(/<script>\s*mermaid\.initialize[\s\S]*?<\/script>/);

if (!styleMatch || !mermaidScriptMatch || !initScriptMatch) {
  console.error('Could not locate expected blocks in docs/01_class_diagram.html — template may have changed shape.');
  process.exit(1);
}

const out = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Arena — System Statechart Diagrams</title>
${styleMatch[0]}
</head>
<body>
<div class="shell">
  <main>
    <header class="page-head">
      <div class="eyebrow">Arena — Software Engineering Term Project</div>
      <h1 class="title">System Statechart Diagrams</h1>
      <p class="dek">Submission archive item ("System statechart diagrams", <code>docs/projectDescription.txt</code>).
      Unlike the class diagrams (<code>docs/06_class_diagram_reverse-engineered.html</code>,
      <code>docs/12_class_diagram_final.html</code>), these are hand-authored, not mechanically
      reverse-engineered — a state machine's transitions, guards, and actions require reading and
      understanding the actual control flow, not just static type declarations. Each diagram below is
      grounded directly in the real, current source named in its own caption, covering the three classes in
      this codebase whose behavior is genuinely state-dependent: one server-side (the match itself), one
      server-side scoped to a single participant (disconnect/reconnect), and one client-side (the local
      matchmaking queue view).</p>
    </header>
${sections}
    <footer class="page-foot">Regenerate with: <code>node scripts/generate-statechart-diagrams.js</code></footer>
  </main>
</div>
${mermaidScriptMatch[0]}
${initScriptMatch[0]}
</body>
</html>
`;

fs.writeFileSync(outputPath, out, 'utf8');
console.log(`Wrote ${outputPath} (${(out.length / 1024).toFixed(1)} KB)`);
