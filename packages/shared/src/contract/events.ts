import { MatchId, PlayerId, ChampionId } from '../domain/ids';
import { Team } from '../domain/Team';
import { EndReason } from '../domain/EndReason';
import { ConnectionStatus } from '../domain/ConnectionStatus';
import { Champion } from '../domain/Champion';
import { Position } from '../domain/Position';

/** Sent server→client on `queue:joined`, once a player is accepted into the matchmaking queue (R2.1). */
export interface QueueJoinedPayload {
  position: number;
}

/** Sent server→client on `queue:cancelled`, acknowledging a `queue:cancel` request (R2.3). No fields. */
export type QueueCancelledPayload = Record<string, never>;

/** Sent server→client on `match:found`, once two queued players have been paired (R2.4–R2.6). */
export interface MatchFoundPayload {
  matchId: MatchId;
  team: Team;
  opponentUsername: string;
  roster: Champion[];
}

/** Sent server→client on `champion:selected`, after a player picks a champion (R3.2, R3.3). */
export interface ChampionSelectedPayload {
  matchId: MatchId;
  playerId: PlayerId;
  championId: ChampionId;
  /** Whether both players have now selected, meaning the match can start. */
  bothSelected: boolean;
}

/** One participant's authoritative state at a given tick — embedded in `MatchStatePayload`. */
export interface ParticipantSnapshot {
  playerId: PlayerId;
  team: Team;
  championId: ChampionId;
  position: Position;
  health: number;
  resource: number;
  /** Seconds remaining before each ability (keyed by ability id) is usable again. */
  cooldownsRemaining: Record<string, number>;
  crowdControlled: boolean;
  connectionStatus: ConnectionStatus;
  alive: boolean;
}

/** Sent server→client on `match:state`, once per tick, at 20Hz (R-P1, R-P2, R4.7). */
export interface MatchStatePayload {
  matchId: MatchId;
  tick: number;
  participants: [ParticipantSnapshot, ParticipantSnapshot];
}

/** Sent server→client on `match:start`, once both players have selected champions (R3.5). */
export interface MatchStartPayload {
  matchId: MatchId;
  initialState: MatchStatePayload;
}

/** Sent server→client on `match:end`, once a win condition is reached (R5.1–R5.3). */
export interface MatchEndPayload {
  matchId: MatchId;
  reason: EndReason;
  winningTeam: Team | null;
  durationMs: number;
}

/** Sent server→client on `match:player_disconnected`, when a match participant's socket drops (R6.1, R6.2). */
export interface PlayerDisconnectedPayload {
  playerId: PlayerId;
  gracePeriodSeconds: number;
}

/** Sent server→client on `match:player_reconnected`, when a disconnected participant reconnects in time (R6.3). */
export interface PlayerReconnectedPayload {
  playerId: PlayerId;
}

/** Sent server→client on `error`, for any rejected request that needs to surface a message to the player. */
export interface ErrorPayload {
  code: string;
  message: string;
}

/**
 * Event name constants — not in docs/01_class_list.md, added here to prevent magic-string drift between
 * server and client (both import this instead of retyping 'match:state' etc.). Values match SRS Appendix A.
 */
export const SOCKET_EVENTS = {
  IDENTIFY: 'identify',
  QUEUE_JOIN: 'queue:join',
  QUEUE_CANCEL: 'queue:cancel',
  CHAMPION_SELECT: 'champion:select',
  MATCH_ACTION: 'match:action',
  MATCH_RECONNECT: 'match:reconnect',
  QUEUE_JOINED: 'queue:joined',
  QUEUE_CANCELLED: 'queue:cancelled',
  MATCH_FOUND: 'match:found',
  CHAMPION_SELECTED: 'champion:selected',
  MATCH_START: 'match:start',
  MATCH_STATE: 'match:state',
  MATCH_END: 'match:end',
  MATCH_PLAYER_DISCONNECTED: 'match:player_disconnected',
  MATCH_PLAYER_RECONNECTED: 'match:player_reconnected',
  ERROR: 'error',
} as const;
