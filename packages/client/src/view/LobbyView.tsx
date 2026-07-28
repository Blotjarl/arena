import { useEffect, useReducer, useState } from 'react';
import { View, ModelListener, ModelEvent } from '@arena/shared';
import { ClientIdentityModel } from '../model/ClientIdentityModel';
import { ClientQueueModel } from '../model/ClientQueueModel';
import { LobbyController } from '../controller/LobbyController';

/**
 * MVC View for the Lobby screen. Listens for ClientIdentityModel changes and notifies the paired
 * React functional component (LobbyScreen) to re-render (SRS 3.1.1, R1.1–R1.4, R2.1–R2.6).
 */
export class LobbyView implements View, ModelListener {
  /** Callback registered by LobbyScreen to trigger a React re-render on model changes. */
  private onUpdate: (() => void) | null = null;

  /**
   * CORRECTION (Step 10): the Lobby screen's own documented responsibility (docs/01_class_list.md §6c —
   * "Username field, 'Find Match' control, queue status/cancel") spans two models, not one: identity
   * (username/playerId) and queue (position/status). The stub's constructor only took ClientIdentityModel.
   * A second, non-`View<M,C>`-generic-typed model reference is added here purely for observation — the
   * same pattern MatchmakingController (server side) established for extra constructor dependencies
   * beyond the formal (model, view) pair. getModel()/setModel() below still resolve to
   * ClientIdentityModel, matching LobbyController's own `AbstractController<ClientIdentityModel,
   * LobbyView>` pairing — queueModel is reachable via the separate getQueueModel() accessor.
   * @param model - the identity model this view observes
   * @param queueModel - the queue model this view also observes, for queue status/cancel rendering
   * @param controller - the lobby controller this view dispatches user actions through
   */
  constructor(
    private model: ClientIdentityModel,
    private queueModel: ClientQueueModel,
    private controller: LobbyController,
  ) {
    this.model.addModelListener(this);
    this.queueModel.addModelListener(this);
  }

  /**
   * Registers the React functional component's re-render trigger.
   * The paired functional component supplies this so modelChanged can trigger a re-render.
   * @param callback - called with no arguments whenever either observed model changes
   */
  bindUpdateCallback(callback: () => void): void {
    this.onUpdate = callback;
  }

  /**
   * Returns the observed identity model.
   * @returns the current ClientIdentityModel
   */
  getModel(): ClientIdentityModel {
    return this.model;
  }

  /**
   * Replaces the observed model reference. Unlike the constructor, this does not re-register the
   * view as a listener on the new model — call `model.addModelListener(this)` separately if needed.
   * @param model - the new ClientIdentityModel to observe
   */
  setModel(model: ClientIdentityModel): void {
    this.model = model;
  }

  /**
   * Returns the observed queue model.
   * CORRECTION (Step 10): not part of the formal View<M,C> contract (see constructor doc above) — a
   * plain accessor LobbyScreen uses to render queue status/cancel.
   * @returns the current ClientQueueModel
   */
  getQueueModel(): ClientQueueModel {
    return this.queueModel;
  }

  /**
   * Replaces the observed queue model reference. Does not re-register as a listener — call
   * `queueModel.addModelListener(this)` separately if needed.
   * @param queueModel - the new ClientQueueModel to observe
   */
  setQueueModel(queueModel: ClientQueueModel): void {
    this.queueModel = queueModel;
  }

  /**
   * Returns the lobby controller used to dispatch user actions.
   * @returns the current LobbyController
   */
  getController(): LobbyController {
    return this.controller;
  }

  /**
   * Replaces the controller used to dispatch user actions.
   * @param controller - the new LobbyController
   */
  setController(controller: LobbyController): void {
    this.controller = controller;
  }

  /**
   * Called by AbstractModel when either observed model fires a change event.
   * Invokes the registered onUpdate callback to trigger a React re-render.
   * @param event - the model event describing what changed
   */
  modelChanged(event: ModelEvent): void {
    this.onUpdate?.();
  }
}

/**
 * Username field, "Find Match" control, queue status/cancel (SRS 3.1.1).
 *
 * CRITICAL (master context §1.1): this component only ever displays state ClientIdentityModel/
 * ClientQueueModel already hold and forwards user intent through LobbyController — it never decides
 * on its own whether a username is accepted or a queue position is correct. The client-side username
 * check surfaced as a validation message here is a UX precheck only; the server is the sole authority
 * (see LobbyController.operation's own doc comment) and this screen must not imply otherwise.
 */
export function LobbyScreen(props: { view: LobbyView }): JSX.Element {
  const { view } = props;
  const [, forceRender] = useReducer((n: number) => n + 1, 0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    view.bindUpdateCallback(() => forceRender());
  }, [view]);

  const identity = view.getModel();
  const queue = view.getQueueModel();
  const controller = view.getController();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const username = String(formData.get('username') ?? '');
    try {
      controller.operation('submitUsername', { username });
      setError(null);
    } catch (err) {
      // UX precheck failure only (R1.1) — the server remains the authoritative validator (master
      // context §1.1); this message is immediate feedback, not proof of eventual server acceptance.
      setError(err instanceof Error ? err.message : 'Invalid username');
    }
  };

  if (identity.username === null) {
    return (
      <form onSubmit={handleSubmit} aria-label="identify-form">
        <label htmlFor="username">Username</label>
        <input id="username" name="username" type="text" maxLength={24} />
        <button type="submit">Continue</button>
        {error && <p role="alert">{error}</p>}
      </form>
    );
  }

  if (queue.status === 'idle') {
    return (
      <div>
        <p>Welcome, {identity.username}</p>
        <button onClick={() => controller.operation('joinQueue')}>Find Match</button>
      </div>
    );
  }

  if (queue.status === 'queued') {
    return (
      <div>
        <p>Position in queue: {queue.position}</p>
        <button onClick={() => controller.operation('cancelQueue')}>Cancel</button>
      </div>
    );
  }

  return <p>Match found! Opponent: {queue.matchPayload?.opponentUsername}</p>;
}
