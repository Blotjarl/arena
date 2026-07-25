/** Why a match ended (R5.3, R-DB3) — recorded on `Match` for history/leaderboard purposes. */
export enum EndReason {
  ELIMINATION = 'ELIMINATION',
  TIME_LIMIT = 'TIME_LIMIT',
  DISCONNECT_FORFEIT = 'DISCONNECT_FORFEIT',
  SELECTION_TIMEOUT = 'SELECTION_TIMEOUT',
}
