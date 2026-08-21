# Streamteam- Track A — Work Summary

## A1 — Auth Bug Checklist: `{"status":400,"message":"invalid client"}`

This error comes from Twitch at the token exchange step (`POST /oauth2/token`). Work through this checklist in Railway → Environment Variables:

**1. TWITCH_CLIENT_ID is empty or undefined**
- Go to Railway → your service → Variables
- Confirm `TWITCH_CLIENT_ID` is set and matches exactly what's in the Twitch Developer Console (dev.twitch.tv → Your Applications → your app → Client ID)
- The value should be a 30-char alphanumeric string

**2. TWITCH_CLIENT_SECRET is empty or undefined**
- Confirm `TWITCH_CLIENT_SECRET` is set in Railway Variables
- If you regenerated the secret in Twitch Console after setting it in Railway, Railway still has the old one — update it

**3. Client ID and Secret are swapped**
- Easy mistake: paste the secret where the ID should go. Double-check which field is which

**4. TWITCH_REDIRECT_URI mismatch**
- In Twitch Console → your app → OAuth Redirect URLs — the URL must match EXACTLY (including trailing slash, https vs http, path casing)
- In Railway, `TWITCH_REDIRECT_URI` should be: `https://streamteam-production.up.railway.app/auth/twitch/callback`
- Any difference (even a trailing slash) causes "invalid client" or "invalid redirect_uri" from Twitch

**5. Twitch app category blocks Authorization Code flow**
- In Twitch Console → your app → Category — make sure it's not set to something that disables OAuth (e.g. "Chat Bot" can have restrictions)
- The authorization_code grant requires the app to have OAuth redirect URIs registered

**6. URL encoding of redirect_uri in the request**
- The code uses `URLSearchParams` which handles encoding automatically — this is fine. But if you're testing with curl, manually encoding the `redirect_uri` incorrectly would cause this

**Most likely cause:** either the CLIENT_SECRET is wrong/stale in Railway, or the REDIRECT_URI in Railway doesn't match the one registered in Twitch Console.

---

## A2 — Seed Script ✅

`scripts/seed.js` — 10 fake streamer profiles, fully idempotent via `ON CONFLICT … DO UPDATE`.

```bash
npm run seed
```

---

## A3 — Integration Tests ✅

13 tests, 13 passing. No live DB required (pool is mocked).

```bash
npm test
```

**Suites:**
- `tests/swipes.test.js` (8 tests — HTTP layer): one-way like, reciprocal, pass, duplicate, self-swipe, blocked, missing auth, invalid direction
- `tests/swipeLogic.test.js` (5 tests — logic layer): same cases tested against processSwipe() directly

---

## A4 — Rate Limiting ✅

100 swipes/hour per authenticated user. In-memory sliding window.

```json
{ "error": "Rate limit exceeded", "retryAfter": 3542 }
```

**Note for Wyatt:** this resets on restart and won't work across multiple Railway replicas. Single-instance deploy is fine. Multi-instance → swap for Redis-backed counter.

**Files:** `src/middleware/rateLimiter.js`, `src/routes/swipes.js`

---

## A5 — Block Enforcement ✅

### Deck (`GET /profiles/deck`)
Excludes users blocked by the requester AND users who have blocked the requester (both directions).

### Swipes (`POST /swipes`)
Block guard runs inside the transaction before any swipe logic. Returns 403 if blocked in either direction.

### Matches (`GET /matches`, `GET /matches/:id/messages`, `POST /matches/:id/messages`)
All three now filter `hidden = false`. Blocking a user sets `matches.hidden = true` for any shared match.

### New Routes
- `POST /blocks` — block a user, hides shared match in same transaction
- `DELETE /blocks/:blockedId` — unblock (does NOT restore hidden match)
- `GET /blocks` — list who you've blocked
- `POST /reports` — report a user for moderation (inserts to `reports` table)

### Schema
`migrations/002_matches_hidden.sql` — adds `hidden BOOLEAN NOT NULL DEFAULT false` to matches.

**Note for Wyatt:** hidden matches are never deleted, only hidden. If you want hard deletes, change `UPDATE … SET hidden = true` to `DELETE` in `src/routes/blocks.js`.

**Files:** `src/routes/blocks.js` (new), `src/routes/reports.js` (new), `src/routes/profiles.js`, `src/routes/swipes.js`, `src/routes/matches.js`, `migrations/002_matches_hidden.sql` (new), `server.js`

---

## A6 — Twitch Clips ✅

`GET /follows/:userId/clips` — top 10 clips for a followed/matched streamer.

- **Access:** requester must follow the target OR share an active (unhidden) match with them
- **Cache:** 1-hour TTL in `clips` table; stale cache served on Twitch 429 or network errors
- **App token:** `client_credentials` grant, cached in memory, auto-refreshed before expiry
- **Seed users:** `twitch_id` starting with `seed_` skips Twitch API and returns cache/empty list

**Schema:** `migrations/003_clips.sql` — new `clips` table.

**Requires env vars:** `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`

**Files:** `src/routes/follows.js`, `migrations/003_clips.sql` (new)

---

## Running Everything

```bash
cd ~/Downloads/Streamteam-
npm install
cp .env.example .env   # fill in DATABASE_URL, TWITCH_*, JWT_SECRET, APP_URL
npm run migrate        # runs 001_init → 002_matches_hidden → 003_clips
npm run seed           # optional: 10 fake profiles
npm test               # 13 tests, no DB needed
npm run dev            # dev server on :4000
```

## Migration Order

Run migrations in order — they're numbered for this reason:
```
001_init.sql            — base schema (tables: users, profiles, swipes, matches, follows, messages, reports, blocks)
002_matches_hidden.sql  — adds matches.hidden column
003_clips.sql           — adds clips cache table
```

## Decisions for Wyatt

| Decision | Notes |
|---|---|
| Rate limiter is in-memory | Zero-dep for single Railway instance. Swap for Redis on multi-instance. |
| Blocked matches are hidden, not deleted | Preserves message history. Change to DELETE in blocks.js if you want hard deletes. |
| Unblocking does not restore hidden matches | Treat blocking as final for that match. Easy to change. |
| Clips require follow OR active match | Matched users can see each other's clips too. Remove UNION branch if you want follow-only. |
| Seed users skip Twitch API | twitch_ids starting with `seed_` return empty/cached clips. |
