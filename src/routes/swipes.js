const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("./auth");

const router = express.Router();

router.post("/", requireAuth, async (req, res) => {
  const swiperId = req.user.userId;
  const { target_id, direction } = req.body;

  if (!target_id || !["like", "pass"].includes(direction)) {
    return res.status(400).json({ error: "target_id and a valid direction are required" });
  }
  if (target_id === swiperId) {
    return res.status(400).json({ error: "Cannot swipe on yourself" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Record the swipe (idempotent — swiping again just no-ops via ON CONFLICT)
    await client.query(
      `INSERT INTO swipes (swiper_id, target_id, direction)
       VALUES ($1, $2, $3)
       ON CONFLICT (swiper_id, target_id) DO NOTHING`,
      [swiperId, target_id, direction]
    );

    let result = { direction, matched: false, followed: false };

    if (direction === "like") {
      // Did the target already like the swiper back?
      const { rows: reciprocal } = await client.query(
        `SELECT 1 FROM swipes WHERE swiper_id = $1 AND target_id = $2 AND direction = 'like'`,
        [target_id, swiperId]
      );

      if (reciprocal.length) {
        // Mutual like -> create a match (store the pair in a consistent order to satisfy the UNIQUE constraint)
        const [a, b] = [swiperId, target_id].sort((x, y) => x - y);
        const { rows: match } = await client.query(
          `INSERT INTO matches (user_a_id, user_b_id)
           VALUES ($1, $2)
           ON CONFLICT (user_a_id, user_b_id) DO NOTHING
           RETURNING id`,
          [a, b]
        );
        result.matched = true;
        result.matchId = match[0]?.id;
      } else {
        // One-way like -> follow, so the swiper can see the target's clips
        await client.query(
          `INSERT INTO follows (follower_id, followed_id)
           VALUES ($1, $2)
           ON CONFLICT (follower_id, followed_id) DO NOTHING`,
          [swiperId, target_id]
        );
        result.followed = true;
      }
    }

    await client.query("COMMIT");
    res.json(result);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Swipe failed" });
  } finally {
    client.release();
  }
});

module.exports = router;
