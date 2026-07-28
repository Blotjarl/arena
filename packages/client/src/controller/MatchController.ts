import { AbstractController, SOCKET_EVENTS, MovementInput, AbilityUseRequest } from '@arena/shared';
import { ClientMatchModel } from '../model/ClientMatchModel';
import type { MatchHUDView } from '../view/MatchHUDView';
import { SocketConnectionController } from './SocketConnectionController';

/** Minimum milliseconds between two 'move' emissions — matches the server's 20Hz tick rate (R-P1). */
const MOVE_THROTTLE_MS = 50;

/**
 * Handles in-combat player input during the COMBAT phase (R4.1–R4.6).
 * Translates UI events (keyboard, pointer) into server action requests; applies client-side
 * input throttling so the socket is not flooded at the render frame rate.
 */
export class MatchController extends AbstractController<ClientMatchModel, MatchHUDView> {
  /** Wall-clock time (ms) the last 'move' action was actually emitted; null means never yet. */
  private lastMoveEmitAt: number | null = null;

  /**
   * CORRECTION (Step 10): as with the other client controllers in this batch, needs a
   * SocketConnectionController reference to actually emit anything — docs/01_class_list.md §6b's
   * constructor sketch only documents the inherited (model, view) shape.
   * @param model - the match model this controller reads from (never mutated here)
   * @param view - the paired MatchHUDView
   * @param socketController - used to emit `match:action` to the server
   * @param now - clock function, injected for deterministic throttle testing (defaults to Date.now)
   */
  constructor(
    model: ClientMatchModel,
    view: MatchHUDView,
    private readonly socketController: SocketConnectionController,
    private readonly now: () => number = () => Date.now(),
  ) {
    super(model, view);
  }

  /**
   * Throttles and forwards a combat action to the server.
   * Supported actions: 'move' (directional input), 'useAbility' (ability slot activation).
   * The server validates cooldowns, resource costs, and phase legality before applying any effect
   * (R4.1) — this controller never asserts an outcome.
   *
   * 'move' is throttled to at most once per MOVE_THROTTLE_MS (50ms, matching the server's 20Hz tick
   * rate) — held-down directional input fires at the render frame rate, which would otherwise flood
   * the socket well beyond what the server can act on. 'useAbility' is a discrete, deliberate action
   * (a single key press or click), not continuous input, so it is never throttled — every call is
   * forwarded immediately.
   * @param action - 'move' or 'useAbility'
   * @param payload - action-specific data: MovementInput for 'move', AbilityUseRequest for 'useAbility'
   */
  operation(action: string, payload?: MovementInput | AbilityUseRequest): void {
    if (!payload) return;
    switch (action) {
      case 'move': {
        const t = this.now();
        if (this.lastMoveEmitAt !== null && t - this.lastMoveEmitAt < MOVE_THROTTLE_MS) return;
        this.lastMoveEmitAt = t;
        this.socketController.operation(SOCKET_EVENTS.MATCH_ACTION, payload as MovementInput);
        break;
      }
      case 'useAbility':
        this.socketController.operation(SOCKET_EVENTS.MATCH_ACTION, payload as AbilityUseRequest);
        break;
    }
  }
}
