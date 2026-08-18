const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("./auth");

const router = express.Router();

// People I follow one-way (clips-only access, no chat)
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

module.exports = router;
