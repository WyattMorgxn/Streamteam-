const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("./auth");

const router = express.Router();

router.get("/me", requireAuth, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM profiles WHERE user_id = $1", [req.user.userId]);
  res.json(rows[0] || null);
});

router.put("/me", requireAuth, async (req, res) => {
  const { display_name, bio, game_category, avatar_url, schedule_text } = req.body;
  if (!display_name) return res.status(400).json({ error: "display_name is required" });

  const { rows } = await pool.query(
    `INSERT INTO profiles (user_id, display_name, bio, game_category, avatar_url, schedule_text)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET
       display_name  = EXCLUDED.display_name,
       bio           = EXCLUDED.bio,
       game_category = EXCLUDED.game_category,
       avatar_url    = EXCLUDED.avatar_url,
       schedule_text = EXCLUDED.schedule_text,
       updated_at    = now()
     RETURNING *`,
    [req.user.userId, display_name, bio, game_category, avatar_url, schedule_text]
  );
  res.json(rows[0]);
});

// Discover deck: excludes already-swiped users and both directions of blocks
router.get("/deck", requireAuth, async (req, res) => {
  const { game_category } = req.query;
  const params = [req.user.userId];
  let filterSql = "";
  if (game_category) {
    params.push(game_category);
    filterSql = `AND p.game_category = $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT p.*, u.id AS user_id FROM profiles p
     JOIN users u ON u.id = p.user_id
     WHERE p.is_active = true
       AND u.id != $1
       AND u.id NOT IN (SELECT target_id FROM swipes WHERE swiper_id = $1)
       AND u.id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = $1)
       AND u.id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = $1)
       ${filterSql}
     ORDER BY p.updated_at DESC
     LIMIT 30`,
    params
  );
  res.json(rows);
});

module.exports = router;
