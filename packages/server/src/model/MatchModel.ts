import {
  AbstractModel,
  MatchId,
  MatchPhase,
  EndReason,
  EffectType,
  Team,
  Player,
  Position,
  MatchStatePayload,
  ModelEvent,
  ChampionRoster,
  ArenaError,
  ConnectionStatus,
  GracePeriodExpiredError,
  InvalidMatchPhaseError,
  SelectionWindowExpiredError,
  ARENA_WIDTH,
  ARENA_HEIGHT,
  SKILLSHOT_HIT_RADIUS,
  segmentCrossesObstacle,
  distanceFromSegment,
} from '@arena/shared';
import { ParticipantState } from './ParticipantState';

const CHAMPION_SELECT_WINDOW_MS = 30_000;
const MATCH_TIME_LIMIT_MS = 5 * 60_000;
const DISCONNECT_GRACE_PERIOD_MS = 30_000;
/** Distance kept from the arena's side walls when placing each participant's spawn (Step 11). */
const SPAWN_WALL_MARGIN = 50;

/**
 * Aim-alignment tolerance for Shockwave Slam specifically (Step 11, `11_cross_2` Scope E1) — wider than
 * the shared `SKILLSHOT_HIT_RADIUS` because its own description ("staggering anyone caught in its arc")
 * is explicitly an area effect, not a precision point-and-click hit like every other skillshot. A
 * one-off special case (`ability.id === 'shockwave-slam'`, not a new field on the shared `Ability`
 * class) — one ability needs this today; see the prompt for why a general per-ability hit-radius field
 * would be a bigger, unjustified change for a one-off need. A tunable balance number, same spirit as
 * `SKILLSHOT_HIT_RADIUS` itself — adjust by how it actually feels to play.
 */
const SHOCKWAVE_SLAM_HIT_RADIUS = 90;

/**
 * Collision radius / stagger duration for Bulwark Charge's opponent-facing "shoulder-first charge,
 * shield raised" (Step 11, `11_cross_2` Scope E2) — reuses `SKILLSHOT_HIT_RADIUS` as a reasonable
 * existing "how close counts as a hit" tolerance rather than inventing an unrelated number from scratch.
 */
const BULWARK_CHARGE_STAGGER_RADIUS = SKILLSHOT_HIT_RADIUS;
const BULWARK_CHARGE_STAGGER_DURATION_MS = 750;

/**
 * One instance of gameplay, champion selection through a win condition — the authoritative source of
 * truth for both participants (2.1, R4.1). Owns exactly two ParticipantState (1v1 scope) and notifies its
 * MatchBroadcastView listener on every state-relevant change via AbstractModel.
 */
export class MatchModel extends AbstractModel {
  /** Current stage of the match; most operations below are only valid in one specific phase. */
  public phase: MatchPhase = MatchPhase.CHAMPION_SELECT;
  private participants: [ParticipantState, ParticipantState];
  /** Simulation timestamp (ms) by which both players must select a champion, or the match ends (R3.4). */
  public championSelectDeadline: number;
  /** Simulation timestamp (ms) the ACTIVE phase began, or null before combat starts. */
  public startedAt: number | null = null;
  /** Simulation timestamp (ms) the match ended, or null while still in progress. */
  public endedAt: number | null = null;
  /** Why the match ended, or null while still in progress (R5.3). */
  public endReason: EndReason | null = null;
  /** The winning team, or null for a draw or a match still in progress. */
  public winningTeam: Team | null = null;
  /** Incrementing tick counter included in every broadcast snapshot; not a timestamp. */
  private tickCount = 0;
  /** Each participant's most recently submitted movement input, applied once per tick (see submitMove). */
  private pendingMoves: Map<string, { dx: number; dy: number }> = new Map();

  constructor(
    /** Stable identifier for this match. */
    public readonly id: MatchId,
    players: [Player, Player],
  ) {
    super();
    this.participants = [
      new ParticipantState(players[0].id, Team.A),
      new ParticipantState(players[1].id, Team.B),
    ];
    // CORRECTION (Step 11): previously both participants kept ParticipantState's own default position
    // (0, 0), stacking both players on top of each other at match start (found by real end-to-end play,
    // see docs/01_class_list.md §5a). Spawned on opposite sides of the arena instead, with margin from
    // the walls the same prompt just added clamping against.
    this.participants[0].position = new Position(SPAWN_WALL_MARGIN, ARENA_HEIGHT / 2);
    this.participants[1].position = new Position(ARENA_WIDTH - SPAWN_WALL_MARGIN, ARENA_HEIGHT / 2);
    this.championSelectDeadline = Date.now() + CHAMPION_SELECT_WINDOW_MS;
  }

  protected findParticipant(playerId: string): ParticipantState {
    const p = this.participants.find((x) => x.playerId === playerId);
    if (!p) throw new Error(`playerId ${playerId} is not a participant in match ${this.id}`);
    return p;
  }

  /** The other participant. */
  protected opponentOf(participant: ParticipantState): ParticipantState {
    return this.participants[0] === participant ? this.participants[1] : this.participants[0];
  }

  protected endMatch(reason: EndReason, winningTeam: Team | null, now: number): void {
    this.phase = MatchPhase.ENDED;
    this.endedAt = now;
    this.endReason = reason;
    this.winningTeam = winningTeam;
    const durationMs = this.startedAt !== null ? now - this.startedAt : 0;
    this.notifyChanged(
      new ModelEvent(this, 'match:end', { matchId: this.id, reason, winningTeam, durationMs }),
    );
  }

  /** The ELIMINATION/TIME_LIMIT winner. DISCONNECT_FORFEIT/SELECTION_TIMEOUT are decided at their call sites. */
  protected determineWinner(reason: EndReason): Team | null {
    const [a, b] = this.participants;
    if (reason === EndReason.ELIMINATION) {
      return a.isAlive() ? a.team : b.team;
    }
    if (reason === EndReason.TIME_LIMIT) {
      if (a.health === b.health) return null;
      return a.health > b.health ? a.team : b.team;
    }
    return null;
  }

  /**
   * Records a player's champion choice during Champion Select.
   * @param playerId - the selecting player
   * @param championId - the chosen champion's identifier
   * @throws {InvalidChampionSelectionError} if championId does not match any champion in the roster (R3.2)
   * @throws {SelectionWindowExpiredError} if the 30-second selection window has elapsed (R3.4)
   * @throws {InvalidMatchPhaseError} if the match is not currently in CHAMPION_SELECT
   */
  selectChampion(playerId: string, championId: string): void {
    if (this.phase !== MatchPhase.CHAMPION_SELECT) {
      throw new InvalidMatchPhaseError(this.id, MatchPhase.CHAMPION_SELECT, this.phase);
    }
    if (Date.now() > this.championSelectDeadline) {
      throw new SelectionWindowExpiredError(this.id);
    }
    const champion = ChampionRoster.getById(championId); // throws InvalidChampionSelectionError
    const participant = this.findParticipant(playerId);
    participant.champion = champion;
    participant.health = champion.maxHealth;
    participant.resource = champion.maxResource;

    const bothSelected = this.participants.every((p) => p.champion !== null);
    this.notifyChanged(
      new ModelEvent(this, 'champion:selected', { matchId: this.id, playerId, championId, bothSelected }),
    );

    if (bothSelected) {
      this.phase = MatchPhase.ACTIVE;
      this.startedAt = Date.now();
      this.notifyChanged(new ModelEvent(this, 'match:start', { matchId: this.id, initialState: this.snapshot() }));
    }
  }

  /**
   * Forwards movement input to the submitting player's ParticipantState for the current tick. Buffers the
   * input rather than moving immediately — actual position integration happens once per tick(), using
   * that tick's own deltaSeconds, so movement speed is independent of client send rate.
   * @param playerId - the moving player
   * @param input - raw directional input for this tick
   * @throws {InvalidMatchPhaseError} if the match is not currently ACTIVE
   */
  submitMove(playerId: string, input: { dx: number; dy: number }): void {
    if (this.phase !== MatchPhase.ACTIVE) {
      throw new InvalidMatchPhaseError(this.id, MatchPhase.ACTIVE, this.phase);
    }
    this.pendingMoves.set(playerId, input);
  }

  /**
   * Resolves and forwards an ability-use request (R4.2).
   *
   * CORRECTION (Step 11, 11_cross_1): `HEAL` stays self-targeted and instant, no aim needed. Every other
   * effect type (`DAMAGE`, `CROWD_CONTROL`, `POSITIONING`) is now a skillshot — it requires `req.targetPosition`
   * (a point in arena-space the caster aimed at) and resolves via direction, not a named target player.
   * This replaces the old `target = req.targetPlayerId ? opponent : caster` resolution, which silently made
   * every `POSITIONING` ability a same-position no-op (the client never sent `targetPlayerId` for them —
   * see the class-list correction for this prompt for the full history of that bug).
   *
   * CORRECTION (Step 11, 11_cross_2): `HEAL` is no longer uniformly self-targeted/instant — it now
   * branches on `ability.range`. `range === 0` (Iron Skin only) keeps the exact behavior above; `range >
   * 0` (Vital Siphon only, currently) is an aimed drain, resolved through the same gates as
   * `DAMAGE`/`CROWD_CONTROL` below, applying both damage to the opponent and healing to the caster on a
   * hit — see Scope E4 for why this was a real, previously-unread piece of data (Vital Siphon's `range`
   * was already nonzero and simply never consulted).
   *
   * For `DAMAGE`/`CROWD_CONTROL`/ranged-`HEAL`: the aim direction is computed from caster to
   * `targetPosition`, then the *actual* opponent (not the clicked point) is checked against four
   * independent conditions, all required for a hit — range (`distanceTo(opponent) <= ability.range`,
   * unchanged from before), forward-facing (the opponent must be on the same side of the caster as the
   * aim direction, not merely colinear with the infinite line through it — CORRECTION, 11_cross_2 Scope
   * A: previously missing, so a click aimed *away* from the opponent could still register a hit if they
   * happened to be behind the caster along the same line), aim alignment (the opponent's perpendicular
   * distance from the cast ray is within the hit radius — `SKILLSHOT_HIT_RADIUS` for every ability except
   * Shockwave Slam, which uses its own wider `SHOCKWAVE_SLAM_HIT_RADIUS`, Scope E1), and line of sight
   * (`segmentCrossesObstacle` between caster and opponent). A miss on any of these still consumes the
   * ability's cooldown/resource via `useAbility()` — a real "whiffed cast", not a bug.
   *
   * For `POSITIONING`: the destination is `caster.position + direction * ability.range`, wall-clamped
   * exactly like regular movement; if the straight path to that destination crosses an obstacle, the whole
   * cast is rejected (caster does not move, cooldown/resource are still consumed) rather than attempting a
   * partial teleport — except Phase Step (Scope E3), a magical teleport "through the space between
   * spaces" rather than a physical dash, which is exempt from the obstacle check (still wall-clamped to
   * the arena bounds, a hard world boundary rather than an "obstacle" in the same sense). Bulwark Charge
   * (Scope E2) additionally staggers the opponent (a short `applyCrowdControl`) if its travel path passes
   * within `BULWARK_CHARGE_STAGGER_RADIUS` of them — "shoulder-first... shield raised" is more than a
   * pure escape, unlike Phase Step/Swift Reposition.
   * @param playerId - the acting player
   * @param req - the ability id and, for every effect type except self-targeted `HEAL`, the aimed
   *   `targetPosition`
   * @throws {InvalidMatchPhaseError} if the match is not currently ACTIVE
   *
   * All per-ability validation failures — unknown ability, cooldown, insufficient resource, incapacitation,
   * missing aim, out-of-range/misaimed/blocked target — are caught internally and silently ignored, per
   * R4's "silently ignores" behavior.
   */
  submitAbility(playerId: string, req: { abilityId: string; targetPlayerId?: string; targetPosition?: Position }): void {
    if (this.phase !== MatchPhase.ACTIVE) {
      throw new InvalidMatchPhaseError(this.id, MatchPhase.ACTIVE, this.phase);
    }
    const caster = this.findParticipant(playerId);
    if (!caster.champion) return;
    const ability = caster.champion.abilities.find((a) => a.id === req.abilityId);
    if (!ability) return;

    const now = Date.now();

    // Self-targeted, instant, no aim -- Iron Skin only (the sole HEAL ability with range 0). A HEAL
    // ability with range > 0 (Vital Siphon) falls through to the aimed path below instead.
    if (ability.effectType === EffectType.HEAL && ability.range === 0) {
      try {
        caster.useAbility(ability, now);
      } catch (err) {
        if (err instanceof ArenaError) return;
        throw err;
      }
      caster.applyHeal(ability.magnitude);
      return;
    }

    // DAMAGE / CROWD_CONTROL / POSITIONING / ranged-HEAL (Vital Siphon) all require an aimed direction.
    if (!req.targetPosition) return;
    const dx = req.targetPosition.x - caster.position.x;
    const dy = req.targetPosition.y - caster.position.y;
    const aimMagnitude = Math.hypot(dx, dy);
    if (aimMagnitude === 0) return; // aimed exactly at self -- no direction to cast in
    const dirX = dx / aimMagnitude;
    const dirY = dy / aimMagnitude;

    try {
      caster.useAbility(ability, now); // consumes cooldown/resource regardless of hit/miss below
    } catch (err) {
      if (err instanceof ArenaError) return;
      throw err;
    }

    if (ability.effectType === EffectType.POSITIONING) {
      const rawX = caster.position.x + dirX * ability.range;
      const rawY = caster.position.y + dirY * ability.range;
      const destX = Math.max(0, Math.min(ARENA_WIDTH, rawX));
      const destY = Math.max(0, Math.min(ARENA_HEIGHT, rawY));
      // Phase Step ignores obstacles in its path (a teleport, not a physical dash); every other
      // POSITIONING ability is still blocked by them, same as before.
      const blockedByObstacle =
        ability.id !== 'phase-step' &&
        segmentCrossesObstacle(caster.position.x, caster.position.y, destX, destY);
      if (blockedByObstacle) return;

      const origin = caster.position;
      caster.position = new Position(destX, destY);

      // Bulwark Charge: a charge whose travel path passes close enough to the opponent staggers them,
      // on top of the reposition itself.
      if (ability.id === 'bulwark-charge') {
        const opponent = this.opponentOf(caster);
        const clearance = distanceFromSegment(
          origin.x,
          origin.y,
          destX,
          destY,
          opponent.position.x,
          opponent.position.y,
        );
        if (clearance <= BULWARK_CHARGE_STAGGER_RADIUS) {
          opponent.applyCrowdControl(BULWARK_CHARGE_STAGGER_DURATION_MS, now);
        }
      }
      return;
    }

    // DAMAGE / CROWD_CONTROL / ranged-HEAL: resolve against the real opponent, not the clicked point.
    const opponent = this.opponentOf(caster);
    const distance = caster.position.distanceTo(opponent.position);
    if (distance > ability.range) return;

    const ox = opponent.position.x - caster.position.x;
    const oy = opponent.position.y - caster.position.y;

    // The opponent must be in front of the caster relative to the aim direction, not merely colinear
    // with the infinite line through it -- otherwise a click aimed away from the opponent could still
    // register as a hit if they happened to be behind the caster along the same line.
    const forwardDot = ox * dirX + oy * dirY;
    if (forwardDot < 0) return;

    const hitRadius = ability.id === 'shockwave-slam' ? SHOCKWAVE_SLAM_HIT_RADIUS : SKILLSHOT_HIT_RADIUS;
    const perpendicularDistance = Math.abs(ox * dirY - oy * dirX);
    if (perpendicularDistance > hitRadius) return;

    if (segmentCrossesObstacle(caster.position.x, caster.position.y, opponent.position.x, opponent.position.y)) {
      return;
    }

    switch (ability.effectType) {
      case EffectType.DAMAGE:
        opponent.applyDamage(ability.magnitude);
        break;
      case EffectType.CROWD_CONTROL:
        opponent.applyCrowdControl(ability.magnitude * 1000, now);
        break;
      case EffectType.HEAL:
        // Vital Siphon: "draws vitality through a melee strike" -- a real drain, not a plain self-heal.
        opponent.applyDamage(ability.magnitude);
        caster.applyHeal(ability.magnitude);
        break;
    }
  }

  /**
   * Advances the match simulation by one tick. During CHAMPION_SELECT, only checks the 30s selection
   * deadline (R3.4). Once ACTIVE, first checks each participant's disconnect grace period, ending the
   * match by DISCONNECT_FORFEIT if one has elapsed (R6.3, R6.4), then drives combat — applies buffered
   * movement, regenerates resource, checks win conditions, and notifies listeners with the new state
   * (R4.3–R4.6). A no-op once ENDED.
   * CRITICAL: called by TickLoop.onTick() up to 20x/sec, once per registered match. This method itself
   * must never throw uncaught — TickLoop wraps each call in a per-match try/catch specifically so one
   * match's internal error cannot crash the loop or affect any other in-progress match (R5.4, 3.6.2).
   * @param deltaSeconds - elapsed simulation time since the previous tick
   */
  tick(deltaSeconds: number): void {
    const now = Date.now();
    if (this.phase === MatchPhase.CHAMPION_SELECT) {
      if (now > this.championSelectDeadline) {
        this.endMatch(EndReason.SELECTION_TIMEOUT, null, now);
      }
      return;
    }
    if (this.phase !== MatchPhase.ACTIVE) return;

    for (const p of this.participants) {
      if (p.connectionStatus === ConnectionStatus.DISCONNECTED && p.disconnectedAt !== null) {
        if (now - p.disconnectedAt >= DISCONNECT_GRACE_PERIOD_MS) {
          this.endMatch(EndReason.DISCONNECT_FORFEIT, this.opponentOf(p).team, now);
          return;
        }
      }
    }

    for (const p of this.participants) {
      const pending = this.pendingMoves.get(p.playerId);
      if (pending) {
        // CORRECTION (Step 11): previously left in pendingMoves after being applied, so a single
        // submitMove() call moved the participant on every subsequent tick forever, not just the next
        // one — found by real end-to-end play: MatchHUDScreen's movement buttons are plain discrete
        // onClick handlers (no press/hold, no "stop" control that could ever send {dx:0,dy:0}), so one
        // accidental click on a movement button left that player walking in a straight line,
        // uncontrollably, for the rest of the match. Consumed here so each submitMove() input is
        // applied exactly once, matching the discrete-click UI that actually exists.
        this.pendingMoves.delete(p.playerId);
        try {
          p.move(pending, deltaSeconds, now);
        } catch {
          // ActorIncapacitatedError: movement silently has no effect this tick.
        }
      }
      p.regenerateResource(deltaSeconds);
    }
    this.tickCount += 1;

    const reason = this.checkWinConditions();
    if (reason) {
      this.endMatch(reason, this.determineWinner(reason), now);
      return;
    }

    this.notifyChanged(new ModelEvent(this, 'state', this.snapshot()));
  }

  /**
   * Evaluates whether the match has reached a win condition this tick (elimination or time limit).
   * Disconnect forfeit and selection timeout are handled separately, not here (SRS 3.2.6 vs. 3.2.5).
   * @returns the reason the match ended, or null if it should continue
   */
  checkWinConditions(): EndReason | null {
    const [a, b] = this.participants;
    if (!a.isAlive() || !b.isAlive()) return EndReason.ELIMINATION;
    if (this.startedAt !== null && Date.now() - this.startedAt >= MATCH_TIME_LIMIT_MS) return EndReason.TIME_LIMIT;
    return null;
  }

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

  /** @returns a read-only snapshot of both participants and match metadata, for broadcast to clients. */
  snapshot(): MatchStatePayload {
    const now = Date.now();
    return {
      matchId: this.id,
      tick: this.tickCount,
      participants: [this.participants[0].toSnapshot(now), this.participants[1].toSnapshot(now)],
    };
  }
}
