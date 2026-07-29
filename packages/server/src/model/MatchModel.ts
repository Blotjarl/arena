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
} from '@arena/shared';
import { ParticipantState } from './ParticipantState';

const CHAMPION_SELECT_WINDOW_MS = 30_000;
const MATCH_TIME_LIMIT_MS = 5 * 60_000;
const DISCONNECT_GRACE_PERIOD_MS = 30_000;
/** Distance kept from the arena's side walls when placing each participant's spawn (Step 11). */
const SPAWN_WALL_MARGIN = 50;

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
   * Resolves and forwards an ability-use request. Because ParticipantState.useAbility() has no
   * target-position parameter, this method is where target range is checked (R4.2). A request naming no
   * target is treated as self-targeted (range always satisfied) — matches self-heal/self-buff kits. Once
   * ParticipantState.useAbility() succeeds, this method applies the ability's actual effect
   * (damage/heal/crowd-control/positioning) using ability.effectType/magnitude. POSITIONING is simplified
   * to "move the caster directly to the target's position" (a charge/leap) — nuanced blink semantics are
   * out of scope for this pass.
   * @param playerId - the acting player
   * @param req - the ability id and optional target
   * @throws {InvalidMatchPhaseError} if the match is not currently ACTIVE
   *
   * All per-ability validation failures — unknown ability, cooldown, insufficient resource, incapacitation,
   * out-of-range target — are caught internally and silently ignored, per R4's "silently ignores" behavior.
   */
  submitAbility(playerId: string, req: { abilityId: string; targetPlayerId?: string }): void {
    if (this.phase !== MatchPhase.ACTIVE) {
      throw new InvalidMatchPhaseError(this.id, MatchPhase.ACTIVE, this.phase);
    }
    const caster = this.findParticipant(playerId);
    if (!caster.champion) return;
    const ability = caster.champion.abilities.find((a) => a.id === req.abilityId);
    if (!ability) return;

    const target = req.targetPlayerId ? this.findParticipant(req.targetPlayerId) : caster;
    const distance = caster.position.distanceTo(target.position);
    if (target !== caster && distance > ability.range) return;

    const now = Date.now();
    try {
      caster.useAbility(ability, now);
    } catch (err) {
      if (err instanceof ArenaError) return;
      throw err;
    }

    switch (ability.effectType) {
      case EffectType.DAMAGE:
        target.applyDamage(ability.magnitude);
        break;
      case EffectType.HEAL:
        target.applyHeal(ability.magnitude);
        break;
      case EffectType.CROWD_CONTROL:
        target.applyCrowdControl(ability.magnitude * 1000, now);
        break;
      case EffectType.POSITIONING:
        caster.position = target.position;
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
