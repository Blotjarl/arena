import { AbstractController, MovementInput, AbilityUseRequest } from '@arena/shared';
import { MatchModel } from '../model/MatchModel';
import { MatchBroadcastView } from '../view/MatchBroadcastView';

/** Payload ConnectionHandler forwards for a `match:action` request — the connection's identified playerId plus the raw wire input (movement or ability use, distinguished by the presence of `abilityId`). */
export interface CombatActionRequest {
  playerId: string;
  input: MovementInput | AbilityUseRequest;
}

function isAbilityUse(input: MovementInput | AbilityUseRequest): input is AbilityUseRequest {
  return 'abilityId' in input;
}

/** Handles in-combat movement and ability-use requests during the ACTIVE phase (R4.1–R4.6). */
export class CombatController extends AbstractController {
  constructor(model: MatchModel, view: MatchBroadcastView) {
    super(model, view);
  }

  /**
   * Dispatches a `match:action` request (movement or ability use) to the underlying MatchModel.
   * Every failure mode this can encounter — an out-of-phase action (InvalidMatchPhaseError) as well as
   * the ability-specific contingencies MatchModel.submitAbility() already catches internally (cooldown,
   * resource, incapacitation, range, R4.2) — is caught here and swallowed rather than surfaced as an
   * exception to the player: an invalid action simply has no effect, per R4's "silently ignores" behavior.
   * @param action - the combat action, e.g. 'match:action'
   * @param payload - the acting player and movement input or an ability-use request
   */
  operation(action: string, payload?: CombatActionRequest): void {
    if (!payload) return;
    const match = this.model as MatchModel;
    try {
      if (isAbilityUse(payload.input)) {
        match.submitAbility(payload.playerId, payload.input);
      } else {
        match.submitMove(payload.playerId, payload.input);
      }
    } catch {
      // InvalidMatchPhaseError (or anything else): swallowed, per R4.1/R4.2's "silently ignores" behavior.
    }
  }
}
