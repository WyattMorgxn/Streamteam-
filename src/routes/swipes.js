const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("./auth");
const { createRateLimiter } = require("../middleware/rateLimiter");
const { processSwipe } = require("../swipeLogic");

const router = express.Router();
const swipeRateLimit = createRateLimiter({ maxRequests: 100, windowMs: 60 * 60 * 1000 });

router.post("/", requireAuth, swipeRateLimit, async (req, res) => {
  const swiperId = req.user.userId;
  const { target_id, direction } = req.body;

  if (!target_id || !["like", "pass"].includes(direction)) {
    return res.status(400).json({ error: "target_id and a valid direction are required" });
  }

  const targetId = Number(target_id);

  if (targetId === swiperId) {
    return res.status(400).json({ error: "Cannot swipe on yourself" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Block guard — reject if either party has blocked the other
    const { rows: blockRows } = await client.query(
      `SELECT 1 FROM blocks
       WHERE (blocker_id = $1 AND blocked_id = $2)
          OR (blocker_id = $2 AND blocked_id = $1)
       LIMIT 1`,
      [swiperId, targetId]
    );
    if (blockRows.length) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Action not permitted" });
    }

    const result = await processSwipe(client, swiperId, targetId, direction);

    await client.query("COMMIT");
    res.json(result);
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.statusCode === 400) return res.status(400).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Swipe failed" });
  } finally {
    client.release();
  }
});

module.exports = router;
