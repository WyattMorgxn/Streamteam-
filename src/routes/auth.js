const express = require("express");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const { pool } = require("../db");

const router = express.Router();

// Step 1: send the user to Twitch to log in
router.get("/twitch", (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID,
    redirect_uri: process.env.TWITCH_REDIRECT_URI,
    response_type: "code",
    scope: "user:read:email",
  });
  res.redirect(`https://id.twitch.tv/oauth2/authorize?${params.toString()}`);
});

// Step 2: Twitch redirects back here with a ?code=...
router.get("/twitch/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: "Missing code from Twitch" });

  try {
    // Exchange the code for an access token
    const tokenRes = await axios.post("https://id.twitch.tv/oauth2/token", null, {
      params: {
        client_id: process.env.TWITCH_CLIENT_ID,
        client_secret: process.env.TWITCH_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: process.env.TWITCH_REDIRECT_URI,
      },
    });
    const { access_token } = tokenRes.data;

    // Use the token to get the logged-in user's Twitch profile
    const userRes = await axios.get("https://api.twitch.tv/helix/users", {
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Client-Id": process.env.TWITCH_CLIENT_ID,
      },
    });
    const twitchUser = userRes.data.data[0];

    // Upsert into our users table
    const { rows } = await pool.query(
      `INSERT INTO users (twitch_id, twitch_login, email)
       VALUES ($1, $2, $3)
       ON CONFLICT (twitch_id) DO UPDATE SET twitch_login = EXCLUDED.twitch_login
       RETURNING id, twitch_id, twitch_login`,
      [twitchUser.id, twitchUser.login, twitchUser.email || null]
    );
    const user = rows[0];

    // Issue our own session token the mobile app will use on future requests
    const token = jwt.sign({ userId: user.id, twitchId: user.twitch_id }, process.env.JWT_SECRET, {
      expiresIn: "30d",
    });

    // Hand back to the app with the token. In production this becomes a deep link
    // (e.g. streamswipe://auth?token=...) instead of raw JSON.
    res.redirect(`${process.env.APP_URL}?token=${token}`);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Twitch login failed" });
  }
});

// Middleware other routes use to require a logged-in user
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = { router, requireAuth };
