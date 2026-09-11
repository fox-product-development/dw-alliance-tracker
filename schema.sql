CREATE TABLE IF NOT EXISTS players (
  id    SERIAL PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS events (
  id          SERIAL PRIMARY KEY,
  event_type  TEXT NOT NULL CHECK (event_type IN ('vs','poll','frankie','zombies','contribution','war')),
  event_date  DATE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_type, event_date)
);

CREATE TABLE IF NOT EXISTS scores (
  id         SERIAL PRIMARY KEY,
  player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  measure    TEXT NOT NULL CHECK (measure IN
               ('vs','poll_response','car_cp','frankie','zombies','contribution','war')),
  value      NUMERIC NOT NULL,
  UNIQUE (player_id, event_id, measure)
);

CREATE INDEX IF NOT EXISTS idx_scores_player ON scores (player_id);
CREATE INDEX IF NOT EXISTS idx_scores_event ON scores (event_id);

CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  NUMERIC NOT NULL
);

INSERT INTO settings (key, value) VALUES
  ('weight_vs',           0.40),
  ('weight_poll',         0.20),
  ('weight_frankie',      0.12),
  ('weight_zombies',      0.12),
  ('weight_car_cp',       0.12),
  ('weight_contribution', 0.04),
  ('weight_war',          0),
  ('vs_floor',            10),
  ('vs_cap',              40),
  ('vs_curve_exponent',   1.5),
  ('contribution_cap',    100)
ON CONFLICT (key) DO NOTHING;