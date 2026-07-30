import { useEffect, useReducer, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import type { Socket } from 'socket.io-client';
import {
  View,
  ModelListener,
  ModelEvent,
  ChampionRoster,
  MatchStatePayload,
  MatchStartPayload,
  Ability,
  EffectType,
  SOCKET_EVENTS,
  PlayerDisconnectedPayload,
  PlayerReconnectedPayload,
  ARENA_WIDTH,
  ARENA_HEIGHT,
  ARENA_OBSTACLES,
  Position,
} from '@arena/shared';
import { ClientIdentityModel } from '../model/ClientIdentityModel';
import { ClientMatchModel } from '../model/ClientMatchModel';
import { MatchController } from '../controller/MatchController';
import { InterpolationBuffer } from '../model/InterpolationBuffer';
import { ChampionSprite } from './ChampionSprite';

/** Directional presets for the movement controls, in dx/dy form (R4.1). */
const MOVE_DIRECTIONS: Record<string, { dx: number; dy: number }> = {
  Up: { dx: 0, dy: -1 },
  Down: { dx: 0, dy: 1 },
  Left: { dx: -1, dy: 0 },
  Right: { dx: 1, dy: 0 },
};

/** WASD -> the same direction presets the movement buttons already dispatch. */
const WASD_DIRECTIONS: Record<string, { dx: number; dy: number }> = {
  w: MOVE_DIRECTIONS.Up,
  s: MOVE_DIRECTIONS.Down,
  a: MOVE_DIRECTIONS.Left,
  d: MOVE_DIRECTIONS.Right,
};

/** Ability slots map to number-row keys 1-4, in the same order abilities are already rendered. */
const ABILITY_HOTKEYS = ['1', '2', '3', '4'];

/**
 * Rendered pixel box of the arena. `Position` values from the server stay in
 * ARENA_WIDTH/ARENA_HEIGHT game-logic units (11_server_2) — this is purely a display-time scale
 * factor, so growing the arena on screen never changes how far a step actually moves a champion.
 * CORRECTION (11_client_4): a fixed 700px box still read as small on a real desktop viewport, so the
 * rendered size now tracks the viewport (capped at ARENA_RENDER_SIZE_MAX_PX) via
 * computeArenaRenderSizePx() instead of a constant.
 * CORRECTION (11_client_6): the arena is no longer square (ARENA_WIDTH:ARENA_HEIGHT is 1.5:1 as of
 * 11_server_3) — computeArenaRenderSizePx() now returns a width/height pair that always preserves that
 * ratio, fitting the largest such rectangle inside the viewport-fraction/max-px bounding box. Because
 * the ratio is preserved exactly, the resulting px-per-game-unit scale is identical on both axes (see
 * the rangeRingRadiusPx comment below), so toRenderPixels/circular ranges don't need to change.
 */
const ARENA_RENDER_SIZE_MAX_PX = 900;
const ARENA_VIEWPORT_FRACTION = 0.85;
const ARENA_ASPECT_RATIO = ARENA_WIDTH / ARENA_HEIGHT;

/** Server tick rate (R-P1) — re-dispatching held WASD moves faster than this just wastes socket traffic. */
const MOVE_REPEAT_INTERVAL_MS = 50;

/** Cast/damage-popup animation lifetimes, in ms — kept in sync with styles.css's own keyframe durations. */
const CAST_EFFECT_DURATION_MS = 500;
const DAMAGE_POPUP_DURATION_MS = 900;

/** Rendered arena box, in px — always in ARENA_WIDTH:ARENA_HEIGHT proportion (11_client_6). */
interface ArenaRenderSize {
  readonly width: number;
  readonly height: number;
}

function computeArenaRenderSizePx(): ArenaRenderSize {
  if (typeof window === 'undefined') {
    return { width: ARENA_RENDER_SIZE_MAX_PX, height: ARENA_RENDER_SIZE_MAX_PX / ARENA_ASPECT_RATIO };
  }
  const width = Math.min(
    window.innerWidth * ARENA_VIEWPORT_FRACTION,
    window.innerHeight * ARENA_VIEWPORT_FRACTION * ARENA_ASPECT_RATIO,
    ARENA_RENDER_SIZE_MAX_PX,
  );
  return { width, height: width / ARENA_ASPECT_RATIO };
}

function toRenderPixels(
  position: { x: number; y: number },
  arenaRenderSizePx: ArenaRenderSize,
): { x: number; y: number } {
  return {
    x: (position.x / ARENA_WIDTH) * arenaRenderSizePx.width,
    y: (position.y / ARENA_HEIGHT) * arenaRenderSizePx.height,
  };
}

/**
 * Inverse of `toRenderPixels()` (11_cross_1) — converts a click's pixel coordinates, already relative
 * to the `arena` element's own top-left corner (not the viewport), back into arena-space game units.
 * Used to resolve a skillshot's aim point: the player clicks a point on screen, this recovers the real
 * `Position` `MatchModel.submitAbility` needs.
 */
function toGamePosition(pixel: { x: number; y: number }, arenaRenderSizePx: ArenaRenderSize): Position {
  return new Position(
    (pixel.x / arenaRenderSizePx.width) * ARENA_WIDTH,
    (pixel.y / arenaRenderSizePx.height) * ARENA_HEIGHT,
  );
}

/**
 * Every effect type except a self-targeted `HEAL` is a skillshot as of Step 11 (`11_cross_1`) — it
 * requires the player to aim (press the ability, then click a point in the arena) rather than
 * auto-targeting the opponent.
 * CORRECTION (11_cross_2): a `HEAL` ability is self-targeted/instant only when its own `range` is 0
 * (Iron Skin); a `HEAL` ability with `range > 0` (Vital Siphon) is an aimed drain, same as any other
 * skillshot — see `MatchModel.submitAbility`'s own doc comment for the server-side resolution this
 * mirrors. Takes the whole `ability` now, not just its `effectType`, since the distinction depends on
 * `range` too.
 */
function isSkillshotType(ability: Ability): boolean {
  return ability.effectType !== EffectType.HEAL || ability.range > 0;
}

/**
 * Whether a cast against this ability requires the opponent to be within range to land at all — drives
 * both the out-of-range button styling and (via `isSkillshotType` above) aim-mode gating.
 * CORRECTION (11_cross_2): now also true for a ranged `HEAL` (Vital Siphon) — it genuinely requires the
 * opponent in range to drain them, unlike a self-targeted `HEAL` or a `POSITIONING` self-move (which
 * has nothing to do with the opponent's position at all).
 */
function targetsOpponent(ability: Ability): boolean {
  return (
    ability.effectType === EffectType.DAMAGE ||
    ability.effectType === EffectType.CROWD_CONTROL ||
    (ability.effectType === EffectType.HEAL && ability.range > 0)
  );
}

/**
 * Clamps a recorded aim point to at most `ability.range` game-units from the caster, along the same
 * direction — `POSITIONING` abilities always resolve to exactly `ability.range` (mirroring
 * `MatchModel.submitAbility`'s own `caster.position + direction * ability.range`); every other skillshot
 * type is clamped to at most that distance. Purely a visual approximation (Step 11, `11_cross_2` Scope
 * B) — the server has already decided the real outcome by the time this animation plays (master context
 * §1.1); this only keeps the cast-effect projectile from visually flying past an ability's own range.
 */
function clampAimPoint(
  casterPosition: { x: number; y: number },
  aimPoint: { x: number; y: number },
  ability: Ability,
): { x: number; y: number } {
  const dx = aimPoint.x - casterPosition.x;
  const dy = aimPoint.y - casterPosition.y;
  const rawDistance = Math.hypot(dx, dy);
  if (rawDistance === 0) return casterPosition;
  const clampedDistance =
    ability.effectType === EffectType.POSITIONING ? ability.range : Math.min(rawDistance, ability.range);
  const scale = clampedDistance / rawDistance;
  return { x: casterPosition.x + dx * scale, y: casterPosition.y + dy * scale };
}

/**
 * Baseline projectile travel speed, in rendered px/ms (Step 11, `11_cross_2` Scope C) — tuned against
 * the arena's own render scale (up to 900px wide : 720 game units, see ARENA_RENDER_SIZE_MAX_PX), not
 * an absolute physical unit.
 */
const PROJECTILE_SPEED_PX_PER_MS = 1.6;

/**
 * Per-ability speed multiplier relative to the baseline above — >1 reads faster, <1 reads slower.
 * Abilities not listed use 1 (the baseline). Chosen by flavor, not first principles (same spirit as
 * `SKILLSHOT_HIT_RADIUS`'s own doc comment on the server): Arcane Bolt is Vex's "signature burst," Frost
 * Lance and Swift Reposition are both explicitly about speed in their own descriptions, so all three
 * read fast; Crushing Blow and Bulwark Charge are heavy, deliberate hits ("overhead strike,"
 * "shoulder-first... shield raised") that read slower per unit of distance even though Crushing Blow's
 * short range means it still resolves quickly in absolute terms; Shockwave Slam is a ground slam, not a
 * dart, so it also leans slow.
 */
const PROJECTILE_SPEED_MULTIPLIER: Record<string, number> = {
  'arcane-bolt': 1.6,
  'frost-lance': 1.4,
  'swift-reposition': 1.5,
  'crushing-blow': 0.6,
  'bulwark-charge': 0.55,
  'shockwave-slam': 0.7,
};

/** Clamp bounds for a computed travel duration — never instant/unreadable, never sluggish. */
const MIN_TRAVEL_MS = 90;
const MAX_TRAVEL_MS = 900;

/**
 * @returns how long (ms) a cast-effect projectile covering `distancePx` should take to travel, for the
 * given ability — replaces the old flat `CAST_EFFECT_DURATION_MS` for every projectile-kind cast.
 */
function computeTravelDurationMs(distancePx: number, abilityId: string): number {
  const multiplier = PROJECTILE_SPEED_MULTIPLIER[abilityId] ?? 1;
  const speed = PROJECTILE_SPEED_PX_PER_MS * multiplier;
  const raw = distancePx / speed;
  return Math.max(MIN_TRAVEL_MS, Math.min(MAX_TRAVEL_MS, raw));
}

/** The four `.ability-icon--*` CSS modifier classes, one per EffectType (see styles.css Scope B.2). */
function effectTypeModifier(effectType: EffectType): string {
  switch (effectType) {
    case EffectType.DAMAGE:
      return 'damage';
    case EffectType.HEAL:
      return 'heal';
    case EffectType.CROWD_CONTROL:
      return 'cc';
    case EffectType.POSITIONING:
      return 'positioning';
  }
}

/**
 * Fallback glyph content per EffectType — 11_client_4's original four icons, used for any ability.id
 * not covered by ABILITY_ICON_GLYPHS below (defensive; the fixed ten-ability roster should never
 * actually trigger this).
 */
function effectTypeFallbackGlyph(effectType: EffectType): JSX.Element {
  switch (effectType) {
    case EffectType.DAMAGE:
      return <path d="M13 2 3 14h6l-2 8 10-12h-6l2-8Z" fill="currentColor" />;
    case EffectType.HEAL:
      return <path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7Z" fill="currentColor" />;
    case EffectType.CROWD_CONTROL:
      return (
        <>
          <circle cx="12" cy="12" r="3.5" fill="currentColor" />
          <path
            d="M12 2v4M12 18v4M2 12h4M18 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      );
    case EffectType.POSITIONING:
      return (
        <path
          d="M3 12h13M12 6l7 6-7 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
  }
}

/**
 * Per-ability glyph content (11_client_8 Scope B.1), matched to each ability's real flavor rather than
 * just its EffectType — e.g. Crushing Blow (a warhammer) and Rending Strike (claw marks) read
 * differently even though both are DAMAGE. Keyed by Ability.id (ChampionRoster.ts is the source of
 * truth for the ten real ids); AbilityIcon below falls back to effectTypeFallbackGlyph for anything
 * not listed here.
 */
const ABILITY_ICON_GLYPHS: Record<string, JSX.Element> = {
  'crushing-blow': (
    <>
      <rect x="3" y="3" width="11" height="7" rx="1.5" fill="currentColor" />
      <line x1="8" y1="10" x2="8" y2="21" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path
        d="M16 13l3 3M20 11l2 2M17 18l3 1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </>
  ),
  'shockwave-slam': (
    <>
      <path d="M2 20a10 6 0 0 1 20 0" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M6 20a6 3.5 0 0 1 12 0" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="12" cy="20" r="1.6" fill="currentColor" />
    </>
  ),
  'iron-skin': (
    <>
      <path
        d="M12 2 20 5v6c0 6-3.5 9.5-8 11-4.5-1.5-8-5-8-11V5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M12 9v6M9 12h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  'bulwark-charge': (
    <>
      <path
        d="M2 12h10M6 7l6 5-6 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="14" y="5" width="8" height="14" rx="2" fill="currentColor" opacity="0.85" />
    </>
  ),
  'arcane-bolt': <path d="M13 2 3 14h6l-2 8 10-12h-6l2-8Z" fill="currentColor" />,
  'frost-lance': (
    <path
      d="M12 2v20M4.5 6.5l15 11M19.5 6.5l-15 11"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  ),
  'phase-step': (
    <path
      d="M12 4a8 8 0 1 0 7.6 10.6M19 4v5h-5"
      stroke="currentColor"
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  'rending-strike': (
    <path
      d="M4 4l6 16M10 3l6 16M16 4l4 14"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      fill="none"
    />
  ),
  'vital-siphon': (
    <path
      d="M12 21s-7-4.4-7-10a4.5 4.5 0 0 1 7-3.7A4.5 4.5 0 0 1 19 11c0 5.6-7 10-7 10Z"
      fill="currentColor"
    />
  ),
  'swift-reposition': (
    <>
      <path
        d="M3 12h13M12 6l7 6-7 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M1 8h4M1 16h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
    </>
  ),
};

/**
 * Small inline-SVG glyph for one ability, one per `ability.id` (11_client_8; originally one per
 * EffectType only, 11_client_4). Always rendered inside an aria-hidden wrapper (see AbilityButton
 * below), so these never affect an ability button's accessible name — that stays `ability.name`.
 */
function AbilityIcon(props: { abilityId: string; effectType: EffectType }): JSX.Element {
  const common = { width: 14, height: 14, viewBox: '0 0 24 24' } as const;
  return (
    <svg {...common} className={`ability-icon ability-icon--${effectTypeModifier(props.effectType)}`}>
      {ABILITY_ICON_GLYPHS[props.abilityId] ?? effectTypeFallbackGlyph(props.effectType)}
    </svg>
  );
}

/** One in-flight cast animation: a traveling projectile (offensive) or a self-pulse (self-targeted). */
interface CastEffectVisual {
  id: number;
  kind: 'projectile' | 'pulse';
  isMine: boolean;
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Drives the additive `cast-effect--{modifier}` shape/color class (11_client_8 Scope B.3) — layered
   *  on top of, not replacing, the existing kind/isMine classes and --dx/--dy mechanism. */
  effectType: EffectType;
  /** Drives a further additive `cast-effect--{abilityId}` shape class (11_cross_2 Scope D), layered on
   *  top of the effectType-level one above. */
  abilityId: string;
  /** How long (ms) this cast's travel animation takes — computed per-ability for projectiles (Scope C),
   *  fixed at CAST_EFFECT_DURATION_MS for a self-pulse (no travel distance to derive a speed from). */
  durationMs: number;
}

/** One in-flight floating damage-number popup. */
interface DamagePopupVisual {
  id: number;
  x: number;
  y: number;
  amount: number;
}

/**
 * MVC View for the in-combat HUD screen. Observes ClientMatchModel for authoritative tick
 * snapshots and uses InterpolationBuffer for smooth between-tick rendering (R4.7, R-P4).
 * Player input is forwarded to MatchController (SRS 3.1.1, R4.1–R4.7).
 */
export class MatchHUDView implements View, ModelListener {
  /** Callback registered by MatchHUDScreen to trigger a React re-render on model changes. */
  private onUpdate: (() => void) | null = null;

  /**
   * Rendering-only interpolation buffer; capacity of 10 retains ~500ms of ticks at 20Hz.
   * Positions produced here are never written back to ClientMatchModel.
   */
  private readonly interpolation = new InterpolationBuffer(10);

  /**
   * Transient, UI-only banner state for the opponent's live connection status — deliberately NOT a
   * ClientMatchModel field. Per SocketConnectionController.bindInboundEvents' own doc comment,
   * `match:player_disconnected`/`match:player_reconnected` are intentionally never routed through any
   * model (disconnect status is already carried per-tick via ParticipantSnapshot.connectionStatus, and
   * a view wanting a transient banner is expected to listen to the raw socket event directly instead).
   * This view does exactly that, via the optional `socket` constructor param below, rather than having
   * SocketConnectionController invent a new model field just for this. Cleared on a matching reconnect,
   * never persisted, never read by anything outside this view.
   */
  private opponentDisconnect: PlayerDisconnectedPayload | null = null;

  /**
   * CORRECTION (Step 10): same pattern as LobbyView/ChampionSelectView — distinguishing "you" from
   * "the opponent" in the HUD needs this connection's own playerId, which ClientMatchModel does not
   * carry. getModel()/setModel() still resolve to ClientMatchModel, matching MatchController's
   * `AbstractController<ClientMatchModel, MatchHUDView>` pairing; ClientIdentityModel is reachable via
   * a separate getIdentityModel() accessor, outside the formal View<M,C> contract.
   *
   * CORRECTION (Step 11, 11_shared_4): `socket` is a new, optional 4th param — see `opponentDisconnect`
   * above for why. Optional (rather than required) so every existing call site that has no reason to
   * care about the disconnect banner (e.g. most unit tests) is unaffected; ClientMain.tsx passes the
   * real socket.
   * @param identityModel - supplies this connection's own playerId, to tell "you" apart from the opponent
   * @param model - the match model this view observes for authoritative combat state
   * @param controller - the controller this view forwards player input through
   * @param socket - the live Socket.IO client connection, listened to directly for the two transient
   *   connection-status events; omit in contexts (most tests) that don't exercise the disconnect banner
   */
  constructor(
    private identityModel: ClientIdentityModel,
    private model: ClientMatchModel,
    private controller: MatchController,
    private readonly socket?: Pick<Socket, 'on'>,
  ) {
    this.model.addModelListener(this);
    this.bindSocketEvents();
  }

  /**
   * Listens directly to the raw socket (when provided) for the opponent's connection status, bypassing
   * both ClientMatchModel and SocketConnectionController — see `opponentDisconnect`'s doc comment above.
   * A disconnect payload naming this connection's own playerId is ignored (this connection is, by
   * definition, still connected if it's running this code); a reconnect payload only clears the banner
   * if it names the same player currently shown as disconnected.
   */
  private bindSocketEvents(): void {
    this.socket?.on(SOCKET_EVENTS.MATCH_PLAYER_DISCONNECTED, (payload: PlayerDisconnectedPayload) => {
      if (payload.playerId === this.identityModel.playerId) return;
      this.opponentDisconnect = payload;
      this.onUpdate?.();
    });
    this.socket?.on(SOCKET_EVENTS.MATCH_PLAYER_RECONNECTED, (payload: PlayerReconnectedPayload) => {
      if (this.opponentDisconnect?.playerId !== payload.playerId) return;
      this.opponentDisconnect = null;
      this.onUpdate?.();
    });
  }

  /**
   * Returns the opponent's current disconnect banner state, or null if the opponent is connected (or
   * this view was constructed without a socket). Read by MatchHUDScreen to render the transient banner.
   * @returns the most recent unresolved PlayerDisconnectedPayload naming the opponent, or null
   */
  getOpponentDisconnect(): PlayerDisconnectedPayload | null {
    return this.opponentDisconnect;
  }

  /**
   * Registers the React functional component's re-render trigger.
   * @param callback - called with no arguments whenever the model changes
   */
  bindUpdateCallback(callback: () => void): void {
    this.onUpdate = callback;
  }

  /**
   * Returns the observed match model.
   * @returns the current ClientMatchModel
   */
  getModel(): ClientMatchModel {
    return this.model;
  }

  /**
   * Replaces the observed model reference. Unlike the constructor, this does not re-register the
   * view as a listener on the new model — call `model.addModelListener(this)` separately if needed.
   * @param model - the new ClientMatchModel to observe
   */
  setModel(model: ClientMatchModel): void {
    this.model = model;
  }

  /**
   * Returns the observed identity model (CORRECTION, Step 10 — see constructor doc above).
   * @returns the current ClientIdentityModel
   */
  getIdentityModel(): ClientIdentityModel {
    return this.identityModel;
  }

  /**
   * Replaces the observed identity model reference. Does not re-register as a listener.
   * @param identityModel - the new ClientIdentityModel to observe
   */
  setIdentityModel(identityModel: ClientIdentityModel): void {
    this.identityModel = identityModel;
  }

  /**
   * Returns the controller used to forward player input.
   * @returns the current MatchController
   */
  getController(): MatchController {
    return this.controller;
  }

  /**
   * Replaces the controller used to forward player input.
   * @param controller - the new MatchController
   */
  setController(controller: MatchController): void {
    this.controller = controller;
  }

  /**
   * Returns the rendering-only interpolation buffer, for MatchHUDScreen to query render positions
   * from. Never exposed as anything other than read access — nothing outside this view pushes to it.
   * @returns the current InterpolationBuffer
   */
  getInterpolationBuffer(): InterpolationBuffer {
    return this.interpolation;
  }

  /**
   * Called by AbstractModel when the match model fires a change event (i.e. a new tick snapshot
   * has arrived). Feeds the snapshot into the interpolation buffer, then invokes onUpdate.
   * REGRESSION FIX (11_client_5): `matchStart` carries the real spawn positions in
   * `payload.initialState` (a MatchStatePayload) but was never routed into the buffer, so both
   * markers rendered at the buffer's empty-state (0,0) fallback until the first `matchState` tick
   * arrived — a visible corner-stack on match start.
   * @param event - the model event describing what changed
   */
  modelChanged(event: ModelEvent): void {
    if (event.type === 'matchState') {
      this.interpolation.push(event.payload as MatchStatePayload);
    } else if (event.type === 'matchStart') {
      this.interpolation.push((event.payload as MatchStartPayload).initialState);
    }
    this.onUpdate?.();
  }
}

/** Health/resource bars, cooldown indicators, arena rendering via InterpolationBuffer (SRS 3.1.1). */
export function MatchHUDScreen(props: { view: MatchHUDView }): JSX.Element {
  const { view } = props;
  const [, forceRender] = useReducer((n: number) => n + 1, 0);
  const [arenaRenderSizePx, setArenaRenderSizePx] = useState(computeArenaRenderSizePx);
  const [hoveredAbilityId, setHoveredAbilityId] = useState<string | null>(null);
  // Skillshot aim-then-click state (11_cross_1): non-null while the player has pressed a skillshot-type
  // ability (button click or hotkey) and is waiting for their next click inside the arena to aim it.
  const [aimingAbilityId, setAimingAbilityId] = useState<string | null>(null);
  const [castEffects, setCastEffects] = useState<CastEffectVisual[]>([]);
  const [damagePopups, setDamagePopups] = useState<DamagePopupVisual[]>([]);

  const prevStateRef = useRef<MatchStatePayload | null>(null);
  const nextEffectIdRef = useRef(0);
  const pendingTimeoutsRef = useRef<Set<number>>(new Set());
  /** This player's most recent aim point per ability id (11_cross_1) — the cast-effect detection loop
   *  below only sees server tick snapshots (no aim info), so a locally-known aim point is recorded here
   *  at cast time and consumed once that ability's cooldown transition is observed, so a cast effect can
   *  travel toward where this player actually clicked rather than always toward the opponent. */
  const lastAimPointRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  /** Kept fresh every render (not just inside an effect) so the hotkey listener below, which only
   *  re-subscribes when `controller` changes, always dispatches against the current ability list — the
   *  same "ref holds the latest closure data" pattern InterpolationBuffer's own caller (this component)
   *  already leans on for `now`. CORRECTION (11_cross_1): no longer carries `opponentPlayerId` — hotkeys
   *  toggle aim mode now instead of dispatching a targeted cast directly, so there's nothing left here
   *  that needs it. */
  const hotkeyContextRef = useRef<{ abilities: Ability[] } | null>(null);

  useEffect(() => {
    view.bindUpdateCallback(() => forceRender());
  }, [view]);

  useEffect(() => {
    const handleResize = (): void => setArenaRenderSizePx(computeArenaRenderSizePx());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    return () => {
      pendingTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
      pendingTimeoutsRef.current.clear();
    };
  }, []);

  const identity = view.getIdentityModel();
  const match = view.getModel();
  const controller = view.getController();
  const interpolation = view.getInterpolationBuffer();

  const spawnCastEffect = (effect: Omit<CastEffectVisual, 'id'>): void => {
    const id = nextEffectIdRef.current++;
    setCastEffects((prev) => [...prev, { ...effect, id }]);
    // CORRECTION (11_cross_2 Scope C): cleanup now matches each cast's own computed duration, not the
    // old flat CAST_EFFECT_DURATION_MS, so the effect is removed from state exactly when its animation
    // finishes rather than early/late.
    const timeoutId = window.setTimeout(() => {
      setCastEffects((prev) => prev.filter((e) => e.id !== id));
      pendingTimeoutsRef.current.delete(timeoutId);
    }, effect.durationMs);
    pendingTimeoutsRef.current.add(timeoutId);
  };

  const spawnDamagePopup = (popup: Omit<DamagePopupVisual, 'id'>): void => {
    const id = nextEffectIdRef.current++;
    setDamagePopups((prev) => [...prev, { ...popup, id }]);
    const timeoutId = window.setTimeout(() => {
      setDamagePopups((prev) => prev.filter((p) => p.id !== id));
      pendingTimeoutsRef.current.delete(timeoutId);
    }, DAMAGE_POPUP_DURATION_MS);
    pendingTimeoutsRef.current.add(timeoutId);
  };

  // WASD hold-to-move (11_client_3): an addition alongside the movement buttons, dispatching the
  // exact same controller.operation('move', direction) call those buttons already make. Held keys
  // are re-dispatched on a fixed interval, cleaned up on unmount, matching the project's existing
  // discipline around listener/timer cleanup (see this view's own doc comments elsewhere).
  //
  // CORRECTION (11_cross_1): previously dispatched one 'move' call per held key, every interval tick —
  // MatchController's own 50ms throttle then silently dropped all but the first of those calls within
  // the same tick, so holding e.g. W+A together only ever moved in whichever direction happened to
  // iterate first in the Set, never diagonally. Now computes a single MERGED direction from every
  // currently-held key each tick (opposite keys, e.g. W+S, correctly cancel to 0 on that axis) and
  // dispatches at most one 'move' call per tick. Deliberately NOT normalized here — ParticipantState.move()
  // now normalizes server-side (11_cross_1), so sending the raw per-axis-summed vector is correct and
  // keeps this client dumb about game-affecting math (master context §1.1).
  useEffect(() => {
    const heldKeys = new Set<string>();

    const computeMergedDirection = (): { dx: number; dy: number } => {
      let dx = 0;
      let dy = 0;
      heldKeys.forEach((key) => {
        dx += WASD_DIRECTIONS[key].dx;
        dy += WASD_DIRECTIONS[key].dy;
      });
      return { dx, dy };
    };

    const dispatchMergedMove = (): void => {
      const direction = computeMergedDirection();
      if (direction.dx === 0 && direction.dy === 0) return; // no keys held, or opposites canceled -- skip
      controller.operation('move', direction);
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      if (!(key in WASD_DIRECTIONS) || heldKeys.has(key)) return;
      heldKeys.add(key);
      dispatchMergedMove();
    };

    const handleKeyUp = (event: KeyboardEvent): void => {
      heldKeys.delete(event.key.toLowerCase());
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    const intervalId = window.setInterval(dispatchMergedMove, MOVE_REPEAT_INTERVAL_MS);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.clearInterval(intervalId);
    };
  }, [controller]);

  // Number-key hotkeys 1-4 (11_client_4): single-press-per-keydown, unlike WASD's hold-to-repeat, so
  // no repeat interval is needed. Uses hotkeyContextRef so this effect never needs to re-subscribe as
  // match state changes.
  // CORRECTION (11_cross_1): HEAL still casts immediately (self-targeted, no aim needed). Every other
  // effect type now toggles aim mode instead of casting directly — pressing the same ability's hotkey
  // again while already aiming it cancels; pressing a different ability's hotkey switches to aiming that
  // one instead (silently cancels the old aim, no cast). The actual cast happens from the arena's own
  // onClick handler below, once the player clicks where to aim.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setAimingAbilityId(null);
        return;
      }
      const index = ABILITY_HOTKEYS.indexOf(event.key);
      if (index === -1) return;
      const context = hotkeyContextRef.current;
      if (!context) return;
      const ability = context.abilities[index];
      if (!ability) return;
      if (!isSkillshotType(ability)) {
        controller.operation('useAbility', { abilityId: ability.id });
        return;
      }
      setAimingAbilityId((current) => (current === ability.id ? null : ability.id));
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [controller]);

  const state = match.latestState;

  // Cast feedback + damage popups (11_client_4): compares the newly-arrived tick snapshot against the
  // previous one. A cooldown that just went from 0 to positive means that ability was just used (the
  // same signal a player reads off the cooldown chips); a health drop spawns a floating "-N" popup.
  useEffect(() => {
    const prev = prevStateRef.current;
    if (prev && state) {
      for (const participant of state.participants) {
        const prevParticipant = prev.participants.find((p) => p.playerId === participant.playerId);
        if (!prevParticipant) continue;

        const isMine = participant.playerId === identity.playerId;
        const champion = ChampionRoster.getById(participant.championId);
        const target = state.participants.find((p) => p.playerId !== participant.playerId);
        const casterPixel = toRenderPixels(participant.position, arenaRenderSizePx);

        for (const ability of champion.abilities) {
          const prevCooldown = prevParticipant.cooldownsRemaining[ability.id] ?? 0;
          const currentCooldown = participant.cooldownsRemaining[ability.id] ?? 0;
          if (prevCooldown > 0 || currentCooldown <= 0) continue;

          // CORRECTION (11_cross_1): every non-HEAL ability is now an aimed skillshot, including
          // POSITIONING (previously bucketed into the self-pulse branch below). For this player's own
          // cast, animate toward the real aim point recorded at click time (lastAimPointRef) rather than
          // always toward the opponent's position — a skillshot that misses should still visibly fly off
          // in the direction it was actually aimed, not silently do nothing. The opponent's own casts have
          // no aim info available to this client, so they still fall back to animating toward `target`
          // (in a 1v1 game, "the other participant" is always the only plausible aim target to show).
          if (isSkillshotType(ability) && target) {
            const recordedAim = isMine ? lastAimPointRef.current.get(ability.id) : undefined;
            if (recordedAim) lastAimPointRef.current.delete(ability.id);
            // CORRECTION (11_cross_2 Scope B): this player's own recorded aim point is clamped to the
            // ability's real range before converting to render pixels, so the projectile never visually
            // travels farther than the ability could actually reach — previously it flew all the way to
            // the raw click point regardless of range. The opponent's cast (no aim info available to
            // this client) still falls back to target.position directly, which is already range-correct
            // by construction.
            const toGame = recordedAim ? clampAimPoint(participant.position, recordedAim, ability) : target.position;
            const to = toRenderPixels(toGame, arenaRenderSizePx);
            const travelDistancePx = Math.hypot(to.x - casterPixel.x, to.y - casterPixel.y);
            spawnCastEffect({
              kind: 'projectile',
              isMine,
              from: casterPixel,
              to,
              effectType: ability.effectType,
              abilityId: ability.id,
              durationMs: computeTravelDurationMs(travelDistancePx, ability.id),
            });
          } else {
            spawnCastEffect({
              kind: 'pulse',
              isMine,
              from: casterPixel,
              to: casterPixel,
              effectType: ability.effectType,
              abilityId: ability.id,
              durationMs: CAST_EFFECT_DURATION_MS,
            });
          }
        }

        if (participant.health < prevParticipant.health) {
          spawnDamagePopup({
            x: casterPixel.x,
            y: casterPixel.y,
            amount: prevParticipant.health - participant.health,
          });
        }
      }
    }
    prevStateRef.current = state ?? prev;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, arenaRenderSizePx, identity.playerId]);

  if (!state) {
    return <p>Waiting for match state...</p>;
  }

  const [participantA, participantB] = state.participants;
  const me = participantA.playerId === identity.playerId ? participantA : participantB;
  const opponent = participantA.playerId === identity.playerId ? participantB : participantA;
  const myChampion = ChampionRoster.getById(me.championId);
  const opponentChampion = ChampionRoster.getById(opponent.championId);

  hotkeyContextRef.current = { abilities: myChampion.abilities };

  const now = Date.now();
  const myPosition = interpolation.getInterpolatedPosition(me.playerId, now);
  const opponentPosition = interpolation.getInterpolatedPosition(opponent.playerId, now);
  const myPixel = toRenderPixels(myPosition, arenaRenderSizePx);
  const opponentPixel = toRenderPixels(opponentPosition, arenaRenderSizePx);

  const hoveredAbility = myChampion.abilities.find((a) => a.id === hoveredAbilityId);
  const aimingAbility = myChampion.abilities.find((a) => a.id === aimingAbilityId);
  // CORRECTION (11_cross_1): shows while aiming too (not just hovering), and now covers POSITIONING as
  // well as DAMAGE/CROWD_CONTROL — every skillshot type has a meaningful "how far does this reach" range
  // worth visualizing. Aiming takes priority over a stale hover from before the ability was pressed.
  const displayedRangeAbility = aimingAbility ?? hoveredAbility;
  const showRangeRing = displayedRangeAbility && isSkillshotType(displayedRangeAbility);
  // Px-per-game-unit is identical on both axes (ARENA_WIDTH:ARENA_HEIGHT ratio is preserved exactly by
  // computeArenaRenderSizePx), so scaling this game-space radius by the width axis alone still yields a
  // geometrically correct circle.
  const rangeRingRadiusPx = displayedRangeAbility
    ? (displayedRangeAbility.range / ARENA_WIDTH) * arenaRenderSizePx.width
    : 0;

  const opponentDisconnect = view.getOpponentDisconnect();

  // Skillshot aim-click (11_cross_1): the next click inside the arena while aiming resolves the cast.
  // Coordinates are read relative to the arena element's own bounding box (not the viewport) since
  // toRenderPixels()/every marker position here is already relative to that same origin.
  const handleArenaClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    if (!aimingAbilityId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const clickPixel = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const targetPosition = toGamePosition(clickPixel, arenaRenderSizePx);
    lastAimPointRef.current.set(aimingAbilityId, { x: targetPosition.x, y: targetPosition.y });
    controller.operation('useAbility', { abilityId: aimingAbilityId, targetPosition });
    setAimingAbilityId(null);
  };

  return (
    <div className="screen screen-match-hud">
      {opponentDisconnect && (
        <p aria-label="disconnect-banner" className="disconnect-banner">
          Opponent disconnected — reconnecting in {opponentDisconnect.gracePeriodSeconds}s
        </p>
      )}
      <div className="hud-row">
        <div aria-label="you-hud" className="hud-panel hud-panel--you">
          <p className="hud-line">
            You: HP {me.health} / Resource {me.resource}
          </p>
          <div className="bar bar--hp" aria-hidden="true">
            <div className="bar-fill" style={{ width: `${(me.health / myChampion.maxHealth) * 100}%` }} />
          </div>
          <div className="bar bar--resource" aria-hidden="true">
            <div
              className="bar-fill"
              style={{ width: `${(me.resource / myChampion.maxResource) * 100}%` }}
            />
          </div>
          <ul aria-label="you-cooldowns" className="cooldown-list">
            {Object.entries(me.cooldownsRemaining).map(([abilityId, secondsRemaining]) => (
              <li key={abilityId} className="cooldown-chip">
                {abilityId}: {secondsRemaining.toFixed(1)}s
              </li>
            ))}
          </ul>
        </div>
        <div aria-label="opponent-hud" className="hud-panel hud-panel--opponent">
          <p className="hud-line">
            Opponent: HP {opponent.health} / Resource {opponent.resource}
          </p>
          <div className="bar bar--hp" aria-hidden="true">
            <div
              className="bar-fill"
              style={{ width: `${(opponent.health / opponentChampion.maxHealth) * 100}%` }}
            />
          </div>
          <div className="bar bar--resource" aria-hidden="true">
            <div
              className="bar-fill"
              style={{ width: `${(opponent.resource / opponentChampion.maxResource) * 100}%` }}
            />
          </div>
        </div>
      </div>
      <div
        aria-label="arena"
        className={`arena ${aimingAbilityId ? 'arena--aiming' : ''}`}
        style={{ position: 'relative', width: arenaRenderSizePx.width, height: arenaRenderSizePx.height }}
        onClick={handleArenaClick}
      >
        {ARENA_OBSTACLES.map((obstacle, index) => {
          const topLeft = toRenderPixels(obstacle, arenaRenderSizePx);
          return (
            <div
              key={`obstacle-${index}`}
              aria-hidden="true"
              className="arena-obstacle"
              style={{
                position: 'absolute',
                left: topLeft.x,
                top: topLeft.y,
                width: (obstacle.width / ARENA_WIDTH) * arenaRenderSizePx.width,
                height: (obstacle.height / ARENA_HEIGHT) * arenaRenderSizePx.height,
              }}
            />
          );
        })}
        {showRangeRing && (
          <div
            className="range-ring"
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: myPixel.x,
              top: myPixel.y,
              width: rangeRingRadiusPx * 2,
              height: rangeRingRadiusPx * 2,
            }}
          />
        )}
        <div
          aria-label="you-marker"
          className={`marker marker--you champion-${me.championId}`}
          style={{ position: 'absolute', left: myPixel.x, top: myPixel.y }}
        >
          <ChampionSprite championId={me.championId} animated />
        </div>
        <div
          aria-label="opponent-marker"
          className={`marker marker--opponent champion-${opponent.championId}`}
          style={{ position: 'absolute', left: opponentPixel.x, top: opponentPixel.y }}
        >
          <ChampionSprite championId={opponent.championId} animated />
        </div>
        {castEffects.map((effect) => (
          <div
            key={effect.id}
            aria-hidden="true"
            className={`cast-effect cast-effect--${effect.kind} ${
              effect.isMine ? 'cast-effect--mine' : 'cast-effect--opponent'
            } cast-effect--${effectTypeModifier(effect.effectType)} cast-effect--${effect.abilityId}`}
            style={
              {
                left: effect.from.x,
                top: effect.from.y,
                '--dx': `${effect.to.x - effect.from.x}px`,
                '--dy': `${effect.to.y - effect.from.y}px`,
                '--travel-ms': `${effect.durationMs}ms`,
              } as CSSProperties
            }
          />
        ))}
        {damagePopups.map((popup) => (
          <div
            key={popup.id}
            aria-hidden="true"
            className="damage-popup"
            style={{ left: popup.x, top: popup.y }}
          >
            -{popup.amount}
          </div>
        ))}
      </div>
      <div aria-label="movement-controls" className="movement-controls">
        {Object.entries(MOVE_DIRECTIONS).map(([label, direction]) => (
          <button
            key={label}
            onClick={() => controller.operation('move', direction)}
            className={`btn btn-move btn-move--${label.toLowerCase()}`}
          >
            Move {label}
          </button>
        ))}
      </div>
      <div aria-label="ability-controls" className="ability-controls">
        {myChampion.abilities.map((ability, index) => {
          // CORRECTION (11_cross_1): HEAL still casts immediately on click (self-targeted, no aim
          // needed). Every other effect type (DAMAGE, CROWD_CONTROL, POSITIONING) now toggles aim mode
          // instead — clicking the same ability again while already aiming it cancels; clicking a
          // different ability switches aim to that one. The real cast happens from the arena's onClick
          // handler once the player clicks where to aim. See MatchModel.submitAbility's own doc comment
          // for the server-side resolution this mirrors.
          const onCooldown = Boolean(me.cooldownsRemaining[ability.id]);
          const isAiming = aimingAbilityId === ability.id;
          // Range indication (11_client_4): the server already silently ignores an out-of-range cast
          // (R4.2, deliberate) — the client previously gave zero indication of why, so an out-of-range
          // click looked identical to a broken button. Only meaningful for opponent-targeted abilities
          // (CORRECTION, 11_cross_2: now includes a ranged HEAL like Vital Siphon, via targetsOpponent);
          // a self-targeted HEAL/POSITIONING has no "range to opponent" to speak of.
          const outOfRange =
            targetsOpponent(ability) && !onCooldown && myPosition.distanceTo(opponentPosition) > ability.range;
          return (
            <button
              key={ability.id}
              onClick={() => {
                if (!isSkillshotType(ability)) {
                  controller.operation('useAbility', { abilityId: ability.id });
                  return;
                }
                setAimingAbilityId((current) => (current === ability.id ? null : ability.id));
              }}
              onMouseEnter={() => setHoveredAbilityId(ability.id)}
              onMouseLeave={() => setHoveredAbilityId((current) => (current === ability.id ? null : current))}
              onFocus={() => setHoveredAbilityId(ability.id)}
              onBlur={() => setHoveredAbilityId((current) => (current === ability.id ? null : current))}
              title={ability.description}
              className={`btn btn-ability ${onCooldown ? 'btn-ability--cooldown' : ''} ${
                outOfRange ? 'btn-ability--out-of-range' : ''
              } ${isAiming ? 'btn-ability--aiming' : ''}`}
            >
              <span className="ability-visual" aria-hidden="true">
                <span className="ability-hotkey">{index + 1}</span>
                <AbilityIcon abilityId={ability.id} effectType={ability.effectType} />
              </span>
              {ability.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
