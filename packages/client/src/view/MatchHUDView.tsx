import { useEffect, useReducer } from 'react';
import type { Socket } from 'socket.io-client';
import {
  View,
  ModelListener,
  ModelEvent,
  ChampionRoster,
  MatchStatePayload,
  EffectType,
  SOCKET_EVENTS,
  PlayerDisconnectedPayload,
  PlayerReconnectedPayload,
  ARENA_WIDTH,
  ARENA_HEIGHT,
} from '@arena/shared';
import { ClientIdentityModel } from '../model/ClientIdentityModel';
import { ClientMatchModel } from '../model/ClientMatchModel';
import { MatchController } from '../controller/MatchController';
import { InterpolationBuffer } from '../model/InterpolationBuffer';

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

/**
 * Rendered pixel size of the (square) arena. `Position` values from the server stay in
 * ARENA_WIDTH/ARENA_HEIGHT game-logic units (11_server_2) — this is purely a display-time scale
 * factor, so growing the arena on screen never changes how far a step actually moves a champion.
 */
const ARENA_RENDER_SIZE_PX = 700;

/** Server tick rate (R-P1) — re-dispatching held WASD moves faster than this just wastes socket traffic. */
const MOVE_REPEAT_INTERVAL_MS = 50;

function toRenderPixels(position: { x: number; y: number }): { x: number; y: number } {
  return {
    x: (position.x / ARENA_WIDTH) * ARENA_RENDER_SIZE_PX,
    y: (position.y / ARENA_HEIGHT) * ARENA_RENDER_SIZE_PX,
  };
}

/**
 * Small hand-built pixel grids, one per champion, dark-fantasy silhouettes matching each
 * champion's established identity: Korr (bruiser) wide/bulky, Vex (mage) slender/hooded/robed,
 * Rin (duelist) lean with an angular blade accent. Chars: '.' transparent, 'O' outline, 'B' body
 * (the champion's own accent color), 'E' eye, 'A' blade/highlight accent.
 */
const CHAMPION_SPRITES: Record<string, readonly string[]> = {
  korr: [
    '...OOOOO...',
    '..OBBBBBO..',
    '..OBEOEBO..',
    '..OBBBBBO..',
    '.OOBBBBBOO.',
    'OBBBBBBBBBO',
    'OBBBBBBBBBO',
    'OBBBBBBBBBO',
    'OBBBBBBBBBO',
    '.OBBBBBBBO.',
    '.OBB...BBO.',
    '.OB.....BO.',
    '.OO.....OO.',
  ],
  vex: [
    '.....O.....',
    '....OOO....',
    '...OBBBO...',
    '...OBEBO...',
    '...OBBBO...',
    '....OBO....',
    '...OBBBO...',
    '..OBBBBBO..',
    '..OBBBBBO..',
    '.OBBBBBBBO.',
    '.OBBBBBBBO.',
    'OBBBBBBBBBO',
    'OB.......BO',
  ],
  rin: [
    '...OOOOO...',
    '..OBBBBBO..',
    '..OBEOEBO..',
    '..OBBBBBO..',
    '...OBBBO...',
    '..OBBBBBO..',
    '.OBBBBBBOA.',
    '..OBBBBBOA.',
    '..OBBBBBBO.',
    '..OB.O.BO..',
    '..OB...BO..',
    '..OO...OO..',
  ],
};

/** Pixel-art cell size, in real px, for each sprite grid unit. */
const SPRITE_CELL_PX = 4;

const SPRITE_PIXEL_COLORS: Record<string, string> = {
  O: 'var(--color-border-strong)',
  B: 'var(--champion-accent)',
  E: 'var(--color-text)',
  A: 'var(--color-text-muted)',
};

/** Renders one champion's inline-SVG pixel sprite. A genuinely blocky look, no image assets. */
function ChampionSprite(props: { championId: string }): JSX.Element {
  const grid = CHAMPION_SPRITES[props.championId] ?? CHAMPION_SPRITES.korr;
  const cols = Math.max(...grid.map((row) => row.length));
  const rows = grid.length;
  return (
    <svg
      className={`champion-sprite champion-${props.championId}`}
      width={cols * SPRITE_CELL_PX}
      height={rows * SPRITE_CELL_PX}
      viewBox={`0 0 ${cols} ${rows}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {grid.flatMap((row, y) =>
        row.split('').map((cell, x) => {
          const fill = SPRITE_PIXEL_COLORS[cell];
          if (!fill) return null;
          return <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />;
        }),
      )}
    </svg>
  );
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
   * @param event - the model event describing what changed
   */
  modelChanged(event: ModelEvent): void {
    if (event.type === 'matchState') {
      this.interpolation.push(event.payload as MatchStatePayload);
    }
    this.onUpdate?.();
  }
}

/** Health/resource bars, cooldown indicators, arena rendering via InterpolationBuffer (SRS 3.1.1). */
export function MatchHUDScreen(props: { view: MatchHUDView }): JSX.Element {
  const { view } = props;
  const [, forceRender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    view.bindUpdateCallback(() => forceRender());
  }, [view]);

  const identity = view.getIdentityModel();
  const match = view.getModel();
  const controller = view.getController();
  const interpolation = view.getInterpolationBuffer();

  // WASD hold-to-move (11_client_3): an addition alongside the movement buttons, dispatching the
  // exact same controller.operation('move', direction) call those buttons already make. Held keys
  // are re-dispatched on a fixed interval, cleaned up on unmount, matching the project's existing
  // discipline around listener/timer cleanup (see this view's own doc comments elsewhere).
  useEffect(() => {
    const heldKeys = new Set<string>();

    const dispatchHeldMoves = (): void => {
      heldKeys.forEach((key) => {
        controller.operation('move', WASD_DIRECTIONS[key]);
      });
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      if (!(key in WASD_DIRECTIONS) || heldKeys.has(key)) return;
      heldKeys.add(key);
      controller.operation('move', WASD_DIRECTIONS[key]);
    };

    const handleKeyUp = (event: KeyboardEvent): void => {
      heldKeys.delete(event.key.toLowerCase());
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    const intervalId = window.setInterval(dispatchHeldMoves, MOVE_REPEAT_INTERVAL_MS);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.clearInterval(intervalId);
    };
  }, [controller]);

  const state = match.latestState;
  if (!state) {
    return <p>Waiting for match state...</p>;
  }

  const [participantA, participantB] = state.participants;
  const me = participantA.playerId === identity.playerId ? participantA : participantB;
  const opponent = participantA.playerId === identity.playerId ? participantB : participantA;
  const myChampion = ChampionRoster.getById(me.championId);
  const opponentChampion = ChampionRoster.getById(opponent.championId);

  const now = Date.now();
  const myPixel = toRenderPixels(interpolation.getInterpolatedPosition(me.playerId, now));
  const opponentPixel = toRenderPixels(interpolation.getInterpolatedPosition(opponent.playerId, now));

  const opponentDisconnect = view.getOpponentDisconnect();

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
        className="arena"
        style={{ position: 'relative', width: ARENA_RENDER_SIZE_PX, height: ARENA_RENDER_SIZE_PX }}
      >
        <div
          aria-label="you-marker"
          className={`marker marker--you champion-${me.championId}`}
          style={{ position: 'absolute', left: myPixel.x, top: myPixel.y }}
        >
          <ChampionSprite championId={me.championId} />
        </div>
        <div
          aria-label="opponent-marker"
          className={`marker marker--opponent champion-${opponent.championId}`}
          style={{ position: 'absolute', left: opponentPixel.x, top: opponentPixel.y }}
        >
          <ChampionSprite championId={opponent.championId} />
        </div>
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
        {myChampion.abilities.map((ability) => {
          // CORRECTION (Step 11): MatchModel.submitAbility treats a request naming no target as
          // self-targeted (see its own doc comment) — that's correct for HEAL (self-heal kits) but
          // means an offensive ability fired with no target here would land on the caster, never the
          // opponent. In this 1v1 game the opponent is the only sensible target for a DAMAGE or
          // CROWD_CONTROL ability, so those two effect types explicitly target them; HEAL/POSITIONING
          // keep the previous no-target (self) behavior.
          const isOffensive =
            ability.effectType === EffectType.DAMAGE || ability.effectType === EffectType.CROWD_CONTROL;
          const onCooldown = Boolean(me.cooldownsRemaining[ability.id]);
          return (
            <button
              key={ability.id}
              onClick={() =>
                controller.operation('useAbility', {
                  abilityId: ability.id,
                  ...(isOffensive ? { targetPlayerId: opponent.playerId } : {}),
                })
              }
              className={`btn btn-ability ${onCooldown ? 'btn-ability--cooldown' : ''}`}
            >
              {ability.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
