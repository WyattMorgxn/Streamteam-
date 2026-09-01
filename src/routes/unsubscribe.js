/**
 * src/routes/unsubscribe.js
 *
 * GET  /unsubscribe?t=TOKEN   → is this token valid? (does NOT unsubscribe)
 * POST /unsubscribe           → { token } — actually opts them out
 *
 * Why two steps: mail clients and security scanners prefetch links in emails.
 * A GET that unsubscribes on load would silently opt people out who never
 * clicked anything. The GET only reports whether the token is real; the POST
 * behind a button on the confirmation page does the write.
 *
 * Public — no auth. The token is the credential, so it needs to be long enough
 * that it can't be guessed.
 */

const express = require("express");
const { pool } = require("../db");

const router = express.Router();

/** Look up a token without changing anything. */
router.get("/", async (req, res) => {
  const token = typeof req.query.t === "string" ? req.query.t.trim() : null;

  if (!token) {
    return res.status(400).json({ error: "Missing unsubscribe token" });
  }

  try {
    const { rows } = await pool.query(
      "SELECT email, brand_name, marketing_consent FROM waitlist WHERE unsubscribe_token = $1",
      [token]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "That unsubscribe link isn't valid." });
    }

    return res.json({
      email: rows[0].email,
      brand_name: rows[0].brand_name,
      // Lets the page say "you're already unsubscribed" instead of pretending
      // this is the first time.
      already_unsubscribed: rows[0].marketing_consent === false,
    });
  } catch (err) {
    console.error("[unsubscribe] lookup error:", err.message);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/** Actually opt them out. */
router.post("/", async (req, res) => {
  const token = req.body && typeof req.body.token === "string" ? req.body.token.trim() : null;

  if (!token) {
    return res.status(400).json({ error: "Missing unsubscribe token" });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE waitlist
          SET marketing_consent = false
        WHERE unsubscribe_token = $1
      RETURNING email`,
      [token]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "That unsubscribe link isn't valid." });
    }

    console.log("[unsubscribe] opted out:", rows[0].email);
    return res.json({ ok: true, email: rows[0].email });
  } catch (err) {
    console.error("[unsubscribe] error:", err.message);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

module.exports = router;
