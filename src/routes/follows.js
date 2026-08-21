const express = require("express");
const axios = require("axios");
const { pool } = require("../db");
const { requireAuth } = require("./auth");

const router = express.Router();
const CLIP_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ── helpers ──────────────────────────────────────────────────────────────────

let _appToken = null;
let _appTokenExpiry = 0;

async function getTwitchAppToken() {
  if (_appToken && Date.now() < _appTokenExpiry) return _appToken;

  const res = await axios.post("https://id.twitch.tv/oauth2/token", null, {
    params: {
      client_id: process.env.TWITCH_CLIENT_ID,
      client_secret: process.env.TWITCH_CLIENT_SECRET,
      grant_type: "client_credentials",
    },
  });

  _appToken = res.data.access_token;
  _appTokenExpiry = Date.now() + (res.data.expires_in - 300) * 1000;
  return _appToken;
}

// ── routes ───────────────────────────────────────────────────────────────────

// People I follow one-way (clips access)
router.get("/", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT f.followed_id AS user_id, f.created_at,
            p.display_name, p.avatar_url, p.game_category
     FROM follows f
     JOIN profiles p ON p.user_id = f.followed_id
     WHERE f.follower_id = $1
     ORDER BY f.created_at DESC`,
    [req.user.userId]
  );
  res.json(rows);
});

// Top 10 clips for a followed/matched streamer, cached 1 hour
router.get("/:userId/clips", requireAuth, async (req, res) => {
  const requesterId = req.user.userId;
  const targetId = parseInt(req.params.userId, 10);
  if (!targetId) return res.status(400).json({ error: "Invalid userId" });

  // Access check: must follow OR be matched
  const { rows: access } = await pool.query(
    `SELECT 1
     FROM follows
     WHERE follower_id = $1 AND followed_id = $2
     UNION
     SELECT 1
     FROM matches
     WHERE hidden = false
       AND ((user_a_id = $1 AND user_b_id = $2) OR (user_a_id = $2 AND user_b_id = $1))
     LIMIT 1`,
    [requesterId, targetId]
  );
  if (!access.length) return res.status(403).json({ error: "You don't follow this streamer" });

  // Check cache
  const { rows: cached } = await pool.query(
    `SELECT clip_id, title, thumbnail_url, view_count, duration, url, fetched_at
     FROM clips
     WHERE streamer_id = $1
     ORDER BY view_count DESC
     LIMIT 10`,
    [targetId]
  );

  const cacheAge = cached.length
    ? Date.now() - new Date(cached[0].fetched_at).getTime()
    : Infinity;

  if (cached.length && cacheAge < CLIP_CACHE_TTL_MS) {
    return res.json({ source: "cache", clips: cached });
  }

  // Look up twitch_id to call Helix
  const { rows: userRows } = await pool.query(
    `SELECT twitch_id FROM users WHERE id = $1`,
    [targetId]
  );
  if (!userRows.length) return res.status(404).json({ error: "User not found" });

  // Seed users: skip Twitch API, return cached/empty
  if (userRows[0].twitch_id.startsWith("seed_")) {
    return res.json({ source: "cache", clips: cached });
  }

  try {
    const token = await getTwitchAppToken();
    const twitchRes = await axios.get("https://api.twitch.tv/helix/clips", {
      params: { broadcaster_id: userRows[0].twitch_id, first: 10 },
      headers: {
        Authorization: `Bearer ${token}`,
        "Client-Id": process.env.TWITCH_CLIENT_ID,
      },
    });

    const clips = twitchRes.data.data || [];

    for (const clip of clips) {
      await pool.query(
        `INSERT INTO clips (streamer_id, clip_id, title, thumbnail_url, view_count, duration, url, fetched_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now())
         ON CONFLICT (streamer_id, clip_id) DO UPDATE SET
           title         = EXCLUDED.title,
           thumbnail_url = EXCLUDED.thumbnail_url,
           view_count    = EXCLUDED.view_count,
           duration      = EXCLUDED.duration,
           url           = EXCLUDED.url,
           fetched_at    = now()`,
        [targetId, clip.id || null, clip.title || null, clip.thumbnail_url || null,
         clip.view_count || 0, clip.duration || 0, clip.url || null]
      );
    }

    return res.json({ source: "twitch", clips });
  } catch (err) {
    // On Twitch error, serve stale cache if available
    if (err.response?.status === 429 || cached.length) {
      return res.json({ source: "stale_cache", clips: cached });
    }
    console.error("[clips] Twitch fetch error:", err.response?.data || err.message);
    return res.json({ source: "error", clips: [] });
  }
});

module.exports = router;
