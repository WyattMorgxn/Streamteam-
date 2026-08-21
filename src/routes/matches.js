const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("./auth");

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  const userId = req.user.userId;
  const { rows } = await pool.query(
    `SELECT m.id AS match_id, m.created_at,
            CASE WHEN m.user_a_id = $1 THEN m.user_b_id ELSE m.user_a_id END AS other_user_id,
            p.display_name, p.avatar_url, p.game_category
     FROM matches m
     JOIN profiles p ON p.user_id = CASE WHEN m.user_a_id = $1 THEN m.user_b_id ELSE m.user_a_id END
     WHERE (m.user_a_id = $1 OR m.user_b_id = $1)
       AND m.hidden = false
     ORDER BY m.created_at DESC`,
    [userId]
  );
  res.json(rows);
});

router.get("/:matchId/messages", requireAuth, async (req, res) => {
  const { matchId } = req.params;
  const userId = req.user.userId;

  const { rows: matchCheck } = await pool.query(
    `SELECT 1 FROM matches WHERE id = $1 AND hidden = false AND (user_a_id = $2 OR user_b_id = $2)`,
    [matchId, userId]
  );
  if (!matchCheck.length) return res.status(403).json({ error: "Not your match" });

  const { rows } = await pool.query(
    `SELECT id, sender_id, body, created_at FROM messages WHERE match_id = $1 ORDER BY created_at ASC`,
    [matchId]
  );
  res.json(rows);
});

router.post("/:matchId/messages", requireAuth, async (req, res) => {
  const { matchId } = req.params;
  const userId = req.user.userId;
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: "Message body required" });

  const { rows: matchCheck } = await pool.query(
    `SELECT 1 FROM matches WHERE id = $1 AND hidden = false AND (user_a_id = $2 OR user_b_id = $2)`,
    [matchId, userId]
  );
  if (!matchCheck.length) return res.status(403).json({ error: "Not your match" });

  const { rows } = await pool.query(
    `INSERT INTO messages (match_id, sender_id, body) VALUES ($1, $2, $3) RETURNING *`,
    [matchId, userId, body.trim()]
  );
  res.json(rows[0]);
});

module.exports = router;
