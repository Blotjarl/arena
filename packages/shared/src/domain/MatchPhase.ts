/** The lifecycle stage of a `MatchModel`, gating which operations are valid (R3–R5). */
export enum MatchPhase {
  CHAMPION_SELECT = 'CHAMPION_SELECT',
  ACTIVE = 'ACTIVE',
  ENDED = 'ENDED',
}
