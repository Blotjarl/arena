# Prompt 09_server_5 — MatchModel: Disconnect/Reconnect (increment 3 of 3)

**Owner: Marshall.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` first.
**MANDATORY prerequisite: `09_server_4` must be merged first.** Final increment for `MatchModel`: adds
`disconnect`/`reconnect` and the disconnect-forfeit branch in `tick()`. After this prompt, `MatchModel` has
no remaining stub methods.

---

### 1. In `packages/server/src/model/MatchModel.ts`:

Add `ConnectionStatus` and `GracePeriodExpiredError` to the imports from `@arena/shared`, and a constant:
```ts
const DISCONNECT_GRACE_PERIOD_MS = 30_000;
```

Replace the `disconnect`/`reconnect` stub methods with:
```ts
  /**
   * Marks a participant disconnected and starts their 30-second reconnect grace period (R6.1, R6.2, R6.4).
   * Does not itself throw — an already-disconnected participant is simply left as is.
   * @param playerId - the player whose socket disconnected
   */
  disconnect(playerId: string): void {
    const p = this.findParticipant(playerId);
    if (p.connectionStatus === ConnectionStatus.DISCONNECTED) return;
    p.connectionStatus = ConnectionStatus.DISCONNECTED;
    p.disconnectedAt = Date.now();
    this.notifyChanged(
      new ModelEvent(this, 'player_disconnected', { playerId, gracePeriodSeconds: DISCONNECT_GRACE_PERIOD_MS / 1000 }),
    );
  }

  /**
   * Restores a disconnected participant to CONNECTED if they reconnect within the grace period.
   * @param playerId - the reconnecting player
   * @throws {GracePeriodExpiredError} if the 30-second grace period has already elapsed (R6.3, R6.4)
   */
  reconnect(playerId: string): void {
    const p = this.findParticipant(playerId);
    if (p.connectionStatus === ConnectionStatus.CONNECTED) return;
    const now = Date.now();
    if (p.disconnectedAt !== null && now - p.disconnectedAt >= DISCONNECT_GRACE_PERIOD_MS) {
      throw new GracePeriodExpiredError(playerId, this.id);
    }
    p.connectionStatus = ConnectionStatus.CONNECTED;
    p.disconnectedAt = null;
    this.notifyChanged(new ModelEvent(this, 'player_reconnected', { playerId }));
  }
```

In `tick()`, insert this block as the **first** statement inside the `if (this.phase !== MatchPhase.ACTIVE) return;` guard — i.e., right after that guard, before the movement/regen loop:
```ts
    for (const p of this.participants) {
      if (p.connectionStatus === ConnectionStatus.DISCONNECTED && p.disconnectedAt !== null) {
        if (now - p.disconnectedAt >= DISCONNECT_GRACE_PERIOD_MS) {
          this.endMatch(EndReason.DISCONNECT_FORFEIT, this.opponentOf(p).team, now);
          return;
        }
      }
    }
```

### 2. Extend `MatchModel.test.ts` — add (append after the `checkWinConditions` block from `09_server_4`;
add `ConnectionStatus`, `GracePeriodExpiredError` to imports):

```ts
  describe('disconnect / reconnect', () => {
    it('marks disconnected and broadcasts player_disconnected', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      const events = collectEvents(match);
      match.disconnect('p1');
      const p1 = match.snapshot().participants.find((p) => p.playerId === 'p1')!;
      expect(p1.connectionStatus).toBe(ConnectionStatus.DISCONNECTED);
      expect(events.some((e) => e.type === 'player_disconnected')).toBe(true);
    });

    it('is a no-op for an already-disconnected participant', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      match.disconnect('p1');
      expect(() => match.disconnect('p1')).not.toThrow();
    });

    it('restores CONNECTED within the grace period and broadcasts player_reconnected', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      const events = collectEvents(match);
      match.disconnect('p1');
      match.reconnect('p1');
      const p1 = match.snapshot().participants.find((p) => p.playerId === 'p1')!;
      expect(p1.connectionStatus).toBe(ConnectionStatus.CONNECTED);
      expect(events.some((e) => e.type === 'player_reconnected')).toBe(true);
    });

    it('throws GracePeriodExpiredError once 30s have elapsed', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      match.disconnect('p1');
      const p1 = (match as unknown as { participants: { disconnectedAt: number | null }[] }).participants[0];
      p1.disconnectedAt = Date.now() - 30_001;
      expect(() => match.reconnect('p1')).toThrow(GracePeriodExpiredError);
    });

    it('tick() ends the match as DISCONNECT_FORFEIT once the grace period elapses without reconnect', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      const events = collectEvents(match);
      match.disconnect('p1');
      const p1 = (match as unknown as { participants: { disconnectedAt: number | null }[] }).participants[0];
      p1.disconnectedAt = Date.now() - 30_001;
      match.tick(0.05);
      expect(match.phase).toBe(MatchPhase.ENDED);
      expect(match.endReason).toBe(EndReason.DISCONNECT_FORFEIT);
      expect(match.winningTeam).toBe(Team.B);
      expect(events.some((e) => e.type === 'match:end')).toBe(true);
    });
  });

  describe('snapshot', () => {
    it('includes both participants and an incrementing tick count', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      const before = match.snapshot().tick;
      match.tick(0.05);
      const after = match.snapshot().tick;
      expect(after).toBe(before + 1);
      expect(match.snapshot().participants).toHaveLength(2);
    });
  });
```

---

### 3. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/server` passes; `npx jest MatchModel.test`
passes (validated: 26 tests total for the complete class); run `npx jest --coverage
--collectCoverageFrom="src/model/MatchModel.ts"` and report the number (validated: ~92% statements, ~80%
branch). Same `server` branch, commit `Step 9: MatchModel disconnect/reconnect (increment 3/3) — class
complete`, push, open/update the PR into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: After this prompt, `MatchModel` has zero remaining `NotImplementedError` stubs — confirm this
with `grep -n NotImplementedError packages/server/src/model/MatchModel.ts` returning nothing before
committing.**
