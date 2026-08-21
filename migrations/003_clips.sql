CREATE TABLE IF NOT EXISTS clips (
  id            SERIAL PRIMARY KEY,
  streamer_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clip_id       TEXT NOT NULL,
  title         TEXT,
  thumbnail_url TEXT,
  view_count    INTEGER NOT NULL DEFAULT 0,
  duration      NUMERIC NOT NULL DEFAULT 0,
  url           TEXT,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(streamer_id, clip_id)
);

CREATE INDEX IF NOT EXISTS idx_clips_streamer ON clips(streamer_id);
