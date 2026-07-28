import { useEffect, useReducer } from 'react';
import { View, ModelListener, ModelEvent, ChampionRoster, MatchStatePayload } from '@arena/shared';
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
   * CORRECTION (Step 10): same pattern as LobbyView/ChampionSelectView — distinguishing "you" from
   * "the opponent" in the HUD needs this connection's own playerId, which ClientMatchModel does not
   * carry. getModel()/setModel() still resolve to ClientMatchModel, matching MatchController's
   * `AbstractController<ClientMatchModel, MatchHUDView>` pairing; ClientIdentityModel is reachable via
   * a separate getIdentityModel() accessor, outside the formal View<M,C> contract.
   * @param identityModel - supplies this connection's own playerId, to tell "you" apart from the opponent
   * @param model - the match model this view observes for authoritative combat state
   * @param controller - the controller this view forwards player input through
   */
  constructor(
    private identityModel: ClientIdentityModel,
    private model: ClientMatchModel,
    private controller: MatchController,
  ) {
    this.model.addModelListener(this);
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

  const state = match.latestState;
  if (!state) {
    return <p>Waiting for match state...</p>;
  }

  const [participantA, participantB] = state.participants;
  const me = participantA.playerId === identity.playerId ? participantA : participantB;
  const opponent = participantA.playerId === identity.playerId ? participantB : participantA;
  const myChampion = ChampionRoster.getById(me.championId);

  const now = Date.now();
  const myPosition = interpolation.getInterpolatedPosition(me.playerId, now);
  const opponentPosition = interpolation.getInterpolatedPosition(opponent.playerId, now);

  return (
    <div>
      <div aria-label="you-hud">
        <p>
          You: HP {me.health} / Resource {me.resource}
        </p>
        <ul aria-label="you-cooldowns">
          {Object.entries(me.cooldownsRemaining).map(([abilityId, secondsRemaining]) => (
            <li key={abilityId}>
              {abilityId}: {secondsRemaining.toFixed(1)}s
            </li>
          ))}
        </ul>
      </div>
      <div aria-label="opponent-hud">
        <p>
          Opponent: HP {opponent.health} / Resource {opponent.resource}
        </p>
      </div>
      <div aria-label="arena" style={{ position: 'relative', width: 400, height: 400 }}>
        <div
          aria-label="you-marker"
          style={{ position: 'absolute', left: myPosition.x, top: myPosition.y }}
        />
        <div
          aria-label="opponent-marker"
          style={{ position: 'absolute', left: opponentPosition.x, top: opponentPosition.y }}
        />
      </div>
      <div aria-label="movement-controls">
        {Object.entries(MOVE_DIRECTIONS).map(([label, direction]) => (
          <button key={label} onClick={() => controller.operation('move', direction)}>
            Move {label}
          </button>
        ))}
      </div>
      <div aria-label="ability-controls">
        {myChampion.abilities.map((ability) => (
          <button
            key={ability.id}
            onClick={() => controller.operation('useAbility', { abilityId: ability.id })}
          >
            {ability.name}
          </button>
        ))}
      </div>
    </div>
  );
}
