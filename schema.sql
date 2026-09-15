CREATE TABLE IF NOT EXISTS players (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  status       TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','removed')),
  status_date  DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE INDEX IF NOT EXISTS idx_players_status ON players (status);

CREATE TABLE IF NOT EXISTS events (
  id          SERIAL PRIMARY KEY,
  event_type  TEXT NOT NULL CHECK (event_type IN
                ('vs','poll','frankie','zombies','contribution','war','black_gold','kill_event')),
  event_date  DATE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_type, event_date)
);

CREATE TABLE IF NOT EXISTS scores (
  id         SERIAL PRIMARY KEY,
  player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  measure    TEXT NOT NULL CHECK (measure IN
               ('vs','poll_response','car_cp','frankie','zombies','contribution',
                'war','black_gold','kill_event')),
  value      NUMERIC NOT NULL,
  reason     TEXT,
  UNIQUE (player_id, event_id, measure)
);

CREATE INDEX IF NOT EXISTS idx_scores_player ON scores (player_id);
CREATE INDEX IF NOT EXISTS idx_scores_event ON scores (event_id);

CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       NUMERIC NOT NULL,
  text_value  TEXT
);

INSERT INTO settings (key, value) VALUES
  ('weight_vs',           0.40),
  ('weight_poll',         0.20),
  ('weight_frankie',      0.12),
  ('weight_zombies',      0.12),
  ('weight_war',          0),
  ('weight_black_gold',   0),
  ('weight_kill_event',   0),
  ('weight_car_cp',       0.12),
  ('weight_contribution', 0.04),
  ('vs_floor',            2),
  ('vs_cap',              10),
  ('vs_curve_exponent',   1.5),
  ('contribution_cap',    100)
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, text_value) VALUES
  ('car_range_1', 0, '1G+'),
  ('car_range_2', 0, '800m-1G'),
  ('car_range_3', 0, '500-600'),
  ('car_range_4', 0, '400-500'),
  ('car_range_5', 0, '200-400'),
  ('car_range_6', 0, '<200')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS records (
  key         TEXT NOT NULL,
  rank        INTEGER NOT NULL DEFAULT 1,
  value       NUMERIC NOT NULL,
  week_start  DATE NOT NULL,
  player_name TEXT,
  PRIMARY KEY (key, rank)
);