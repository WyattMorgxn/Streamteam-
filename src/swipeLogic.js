// Core swipe-processing logic extracted for unit testing without a live DB.
// Call processSwipe(client, swiperId, targetId, direction) inside a transaction;
// caller is responsible for BEGIN / COMMIT / ROLLBACK.

async function processSwipe(client, swiperId, targetId, direction) {
  if (targetId === swiperId) {
    throw Object.assign(new Error("Cannot swipe on yourself"), { statusCode: 400 });
  }
  if (!["like", "pass"].includes(direction)) {
    throw Object.assign(new Error("direction must be 'like' or 'pass'"), { statusCode: 400 });
  }

  await client.query(
    `INSERT INTO swipes (swiper_id, target_id, direction)
     VALUES ($1, $2, $3)
     ON CONFLICT (swiper_id, target_id) DO NOTHING`,
    [swiperId, targetId, direction]
  );

  const result = { direction, matched: false, followed: false };

  if (direction === "like") {
    const { rows: reciprocal } = await client.query(
      `SELECT 1 FROM swipes WHERE swiper_id = $1 AND target_id = $2 AND direction = 'like'`,
      [targetId, swiperId]
    );

    if (reciprocal.length) {
      const [a, b] = [swiperId, targetId].sort((x, y) => x - y);
      const { rows: match } = await client.query(
        `INSERT INTO matches (user_a_id, user_b_id)
         VALUES ($1, $2)
         ON CONFLICT (user_a_id, user_b_id) DO NOTHING
         RETURNING id`,
        [a, b]
      );
      await client.query(
        `DELETE FROM follows WHERE follower_id = $1 AND followed_id = $2`,
        [targetId, swiperId]
      );
      result.matched = true;
      result.matchId = match[0]?.id ?? null;
    } else {
      await client.query(
        `INSERT INTO follows (follower_id, followed_id)
         VALUES ($1, $2)
         ON CONFLICT (follower_id, followed_id) DO NOTHING`,
        [swiperId, targetId]
      );
      result.followed = true;
    }
  }

  return result;
}

module.exports = { processSwipe };
