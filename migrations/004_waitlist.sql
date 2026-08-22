CREATE TABLE IF NOT EXISTS waitlist (
  id                SERIAL PRIMARY KEY,
  email             TEXT NOT NULL UNIQUE,
  brand_name        TEXT NOT NULL,
  platform          TEXT NOT NULL,          -- twitch | youtube | kick | other
  handle            TEXT,                   -- optional channel link/handle
  marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
  referral_code     TEXT NOT NULL UNIQUE,   -- short code for their share link
  referred_by       TEXT,                   -- referral_code of the person who sent them
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_referral_code ON waitlist(referral_code);
CREATE INDEX IF NOT EXISTS idx_waitlist_referred_by   ON waitlist(referred_by);
