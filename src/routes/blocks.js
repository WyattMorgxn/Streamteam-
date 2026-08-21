const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("./auth");

const router = express.Router();

// Block a user — also hides any shared match from both sides
router.post("/", requireAuth, async (req, res) => {
  const blockerId = req.user.userId;
  const { blocked_id } = req.body;

  if (!blocked_id) return res.status(400).json({ error: "blocked_id is required" });
  if (Number(blocked_id) === blockerId) return res.status(400).json({ error: "Cannot block yourself" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)
       ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
      [blockerId, blocked_id]
    );
    await client.query(
      `UPDATE matches SET hidden = true
       WHERE (user_a_id = $1 AND user_b_id = $2)
          OR (user_a_id = $2 AND user_b_id = $1)`,
      [blockerId, blocked_id]
    );
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Block failed" });
  } finally {
    client.release();
  }
});

// Unblock — does NOT restore the hidden match (intentional)
router.delete("/:blockedId", requireAuth, async (req, res) => {
  const blockerId = req.user.userId;
  const blockedId = parseInt(req.params.blockedId, 10);
  if (!blockedId) return res.status(400).json({ error: "Invalid blockedId" });

  await pool.query(
    `DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2`,
    [blockerId, blockedId]
  );
  res.json({ ok: true });
});

// List everyone I've blocked
router.get("/", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT b.blocked_id AS user_id, b.created_at, p.display_name, p.avatar_url
     FROM blocks b
     LEFT JOIN profiles p ON p.user_id = b.blocked_id
     WHERE b.blocker_id = $1
     ORDER BY b.created_at DESC`,
    [req.user.userId]
  );
  res.json(rows);
});

module.exports = router;
