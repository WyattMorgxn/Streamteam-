const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("./auth");

const router = express.Router();

// Report a user for moderation review
router.post("/", requireAuth, async (req, res) => {
  const reporterId = req.user.userId;
  const { reported_id, reason } = req.body;

  if (!reported_id) return res.status(400).json({ error: "reported_id is required" });
  if (Number(reported_id) === reporterId) return res.status(400).json({ error: "Cannot report yourself" });

  await pool.query(
    `INSERT INTO reports (reporter_id, reported_id, reason) VALUES ($1, $2, $3)`,
    [reporterId, reported_id, reason || null]
  );
  res.json({ ok: true });
});

module.exports = router;
