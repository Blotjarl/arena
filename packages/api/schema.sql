-- Arena persistence schema (docs/01_class_list.md §3.4 Logical Database Requirements).
-- Applied via docker-compose.test.yml's postgres init-scripts mechanism for tests; the same file is the
-- schema for a real deployment (no migration framework — this is a term project, not a system with a
-- schema history to manage, per prompts/09-10_implementation_plan.md §3).

CREATE TABLE players (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE matches (
  id TEXT PRIMARY KEY,
  end_reason TEXT NOT NULL
    CHECK (end_reason IN ('ELIMINATION', 'TIME_LIMIT', 'DISCONNECT_FORFEIT', 'SELECTION_TIMEOUT')),
  winning_team TEXT CHECK (winning_team IN ('A', 'B')), -- null = draw (R-DB3)
  duration_ms INTEGER NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE match_participants (
  match_id TEXT NOT NULL REFERENCES matches(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  team TEXT NOT NULL CHECK (team IN ('A', 'B')),
  champion_id TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('WIN', 'LOSS', 'DRAW')),
  PRIMARY KEY (match_id, player_id) -- R-DB4: cannot exist without both a match and a player
);

-- R-DB5: efficient retrieval by player (match history) and by champion (win-rate aggregation), without
-- scanning the full table.
CREATE INDEX idx_match_participants_player ON match_participants(player_id);
CREATE INDEX idx_match_participants_champion ON match_participants(champion_id);
