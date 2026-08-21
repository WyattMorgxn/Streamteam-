"use strict";
const { processSwipe } = require("../src/swipeLogic");

function makeMockClient({ reciprocalExists = false, existingMatchId = 99 } = {}) {
  const calls = [];
  const client = {
    calls,
    query: jest.fn(async (sql, params) => {
      const trimmed = sql.replace(/\s+/g, " ").trim();
      calls.push({ sql: trimmed, params });

      if (trimmed.includes("FROM swipes") && trimmed.includes("WHERE swiper_id")) {
        return { rows: reciprocalExists ? [{ "?column?": 1 }] : [] };
      }
      if (trimmed.includes("INSERT INTO matches")) {
        const row = existingMatchId ? { id: existingMatchId } : undefined;
        return { rows: row ? [row] : [] };
      }
      return { rows: [] };
    }),
  };
  return client;
}

function calledWith(client, fragment) {
  return client.calls.some((c) => c.sql.toLowerCase().includes(fragment.toLowerCase()));
}

describe("processSwipe", () => {
  test("one-way like creates a follow, not a match", async () => {
    const client = makeMockClient({ reciprocalExists: false });
    const result = await processSwipe(client, 1, 2, "like");

    expect(result.followed).toBe(true);
    expect(result.matched).toBe(false);
    expect(calledWith(client, "INSERT INTO follows")).toBe(true);
    expect(calledWith(client, "INSERT INTO matches")).toBe(false);
  });

  test("reciprocal like creates a match and removes the pending follow", async () => {
    const client = makeMockClient({ reciprocalExists: true, existingMatchId: 7 });
    const result = await processSwipe(client, 2, 1, "like");

    expect(result.matched).toBe(true);
    expect(result.matchId).toBe(7);
    expect(result.followed).toBe(false);
    expect(calledWith(client, "INSERT INTO matches")).toBe(true);
    expect(calledWith(client, "DELETE FROM follows")).toBe(true);
    expect(calledWith(client, "INSERT INTO follows")).toBe(false);
  });

  test("pass creates neither a follow nor a match", async () => {
    const client = makeMockClient();
    const result = await processSwipe(client, 1, 2, "pass");

    expect(result.followed).toBe(false);
    expect(result.matched).toBe(false);
    expect(calledWith(client, "INSERT INTO follows")).toBe(false);
    expect(calledWith(client, "INSERT INTO matches")).toBe(false);
    expect(calledWith(client, "INSERT INTO swipes")).toBe(true);
  });

  test("swiping on yourself throws a 400 error", async () => {
    const client = makeMockClient();
    await expect(processSwipe(client, 5, 5, "like")).rejects.toMatchObject({
      message: "Cannot swipe on yourself",
      statusCode: 400,
    });
    expect(client.calls.length).toBe(0);
  });

  test("duplicate swipe: second INSERT is still issued (DB ON CONFLICT handles dedup)", async () => {
    const client = makeMockClient({ reciprocalExists: false });
    await processSwipe(client, 1, 2, "like");
    await processSwipe(client, 1, 2, "like");

    const swipeInserts = client.calls.filter((c) => c.sql.includes("INSERT INTO swipes"));
    expect(swipeInserts.length).toBe(2);
  });
});
