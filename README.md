# StreamSwipe API

## Local setup
```bash
npm install
cp .env.example .env
# fill in DATABASE_URL (local Postgres or Railway's), TWITCH_CLIENT_ID/SECRET, JWT_SECRET
npm run migrate    # creates all tables
npm run dev        # starts on http://localhost:4000
```

Check it worked: `curl http://localhost:4000/health` should return `{"ok":true,...}`.

## Deploying to Railway
1. Push this repo to GitHub.
2. In Railway: New Project → Deploy from GitHub repo → select this repo.
3. Add a PostgreSQL plugin to the same project — Railway sets `DATABASE_URL` automatically.
4. In the service's Variables tab, add: `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_REDIRECT_URI` (your Railway URL + `/auth/twitch/callback`), `JWT_SECRET`, `APP_URL`.
5. Update your Twitch app's OAuth Redirect URL (dev.twitch.tv/console) to match the Railway one.
6. Run the migration against the Railway database once: `railway run npm run migrate` (via the Railway CLI), or temporarily set `DATABASE_URL` locally to the Railway one and run `npm run migrate`.
7. Hit `https://<your-app>.up.railway.app/health` to confirm the deploy is live.

## Routes so far
- `GET /auth/twitch` — starts Twitch login
- `GET /auth/twitch/callback` — Twitch redirects here, issues our JWT
- `GET /profiles/me` / `PUT /profiles/me` — read/update your own profile
- `GET /profiles/deck` — the swipeable discover deck
- `POST /swipes` — `{ target_id, direction: "like"|"pass" }` → returns `{ matched, followed }`
- `GET /matches` — your mutual matches
- `GET /matches/:id/messages` / `POST /matches/:id/messages` — chat within a match
- `GET /follows` — people you one-way followed (clips-only)

## Not built yet (next steps)
- Real-time delivery for messages (currently request/response only — add Socket.io next)
- Pulling actual clips from the Twitch API for the Following tab
- Report/block enforcement wired into the deck query (blocks table exists, not yet used everywhere)
- Rate limiting on swipes
