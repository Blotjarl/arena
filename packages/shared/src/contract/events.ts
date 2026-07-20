import { MatchId, PlayerId, ChampionId } from '../domain/ids';
import { Team } from '../domain/Team';
import { EndReason } from '../domain/EndReason';
import { ConnectionStatus } from '../domain/ConnectionStatus';
import { Champion } from '../domain/Champion';
import { Position } from '../domain/Position';

export interface QueueJoinedPayload {
  position: number;
}

export type QueueCancelledPayload = Record<string, never>;

export interface MatchFoundPayload {
  matchId: MatchId;
  team: Team;
  opponentUsername: string;
  roster: Champion[];
}

export interface ChampionSelectedPayload {
  matchId: MatchId;
  playerId: PlayerId;
  championId: ChampionId;
  bothSelected: boolean;
}

export interface ParticipantSnapshot {
  playerId: PlayerId;
  team: Team;
  championId: ChampionId;
  position: Position;
  health: number;
  resource: number;
  cooldownsRemaining: Record<string, number>;
  crowdControlled: boolean;
  connectionStatus: ConnectionStatus;
  alive: boolean;
}

export interface MatchStatePayload {
  matchId: MatchId;
  tick: number;
  participants: [ParticipantSnapshot, ParticipantSnapshot];
}

export interface MatchStartPayload {
  matchId: MatchId;
  initialState: MatchStatePayload;
}

export interface MatchEndPayload {
  matchId: MatchId;
  reason: EndReason;
  winningTeam: Team | null;
  durationMs: number;
}

export interface PlayerDisconnectedPayload {
  playerId: PlayerId;
  gracePeriodSeconds: number;
}

export interface PlayerReconnectedPayload {
  playerId: PlayerId;
}

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
