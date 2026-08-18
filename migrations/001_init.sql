-- StreamSwipe initial schema

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  twitch_id     TEXT UNIQUE NOT NULL,
  twitch_login  TEXT NOT NULL,
  email         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL,
  bio           TEXT,
  game_category TEXT,
  avatar_url    TEXT,
  schedule_text TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

CREATE TABLE swipes (
  id            SERIAL PRIMARY KEY,
  swiper_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  direction     TEXT NOT NULL CHECK (direction IN ('like', 'pass')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(swiper_id, target_id)
);

CREATE TABLE matches (
  id            SERIAL PRIMARY KEY,
  user_a_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_a_id, user_b_id)
);

-- One-way: created when swiper likes target but target hasn't liked back (yet)
CREATE TABLE follows (
  id            SERIAL PRIMARY KEY,
  follower_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followed_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(follower_id, followed_id)
);

CREATE TABLE messages (
  id            SERIAL PRIMARY KEY,
  match_id      INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sender_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reports (
  id            SERIAL PRIMARY KEY,
  reporter_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE blocks (
  id            SERIAL PRIMARY KEY,
  blocker_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(blocker_id, blocked_id)
);

CREATE INDEX idx_swipes_swiper ON swipes(swiper_id);
CREATE INDEX idx_swipes_target ON swipes(target_id);
CREATE INDEX idx_messages_match ON messages(match_id);
