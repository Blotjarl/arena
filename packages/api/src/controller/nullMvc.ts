import type { Model, View, Controller } from '@arena/shared';

/**
 * Harmless stand-in `Model`/`View` pair for `packages/api`'s REST controllers, which — unlike
 * `packages/server`'s socket controllers — have no domain `Model` to observe and no push-based `View` to
 * notify (response formatting is synchronous, one HTTP response per request). `AbstractController`
 * structurally requires a `model`/`view` in its constructor; this pair satisfies that requirement without
 * inventing a fake domain object. Mirrors `PlayerIdentifyController`'s "default (untyped) AbstractController
 * generics" design note (`prompts/10_server_1_player-identify-controller.md`), except here there is no
 * existing process-wide Model/View instance (like `MatchmakingQueue`) for `ApiMain` to reuse as the
 * stand-in, so each api controller supplies this no-op pair itself rather than requiring callers to
 * construct one.
 */
export const NULL_MODEL: Model = {
  notifyChanged: () => {},
};

export const NULL_VIEW: View = {
  getModel: () => NULL_MODEL,
  setModel: () => {},
  getController: () => undefined as unknown as Controller,
  setController: () => {},
};
