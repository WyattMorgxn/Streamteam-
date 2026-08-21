// Integration tests for POST /swipes
// DB pool is fully mocked — no live connection required.
// Run: npm test
"use strict";

process.env.JWT_SECRET = "test-jwt-secret";
process.env.DATABASE_URL = "postgres://test@localhost/test_does_not_exist";

jest.mock("../src/db", () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");
const { pool } = require("../src/db");
const swipesRouter = require("../src/routes/swipes");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/swipes", swipesRouter);
  return app;
}

function makeToken(userId) {
  return jwt.sign({ userId, twitchId: `twitch_${userId}` }, process.env.JWT_SECRET);
}

let mockClient;

beforeEach(() => {
  mockClient = { query: jest.fn(), release: jest.fn() };
  pool.connect.mockResolvedValue(mockClient);
  pool.query.mockReset();
  jest.clearAllMocks();
  pool.connect.mockResolvedValue(mockClient);
});

// Query sequence for POST /swipes:
//   one-way like:    BEGIN → blocks → INSERT swipes → reciprocal(empty) → INSERT follows → COMMIT
//   reciprocal like: BEGIN → blocks → INSERT swipes → reciprocal(hit) → INSERT matches → DELETE follows → COMMIT
//   pass:            BEGIN → blocks → INSERT swipes → COMMIT

function sequenceClientQuery(...results) {
  results.forEach((r) => mockClient.query.mockResolvedValueOnce(r || { rows: [] }));
}

const NO_BLOCKS = { rows: [] };

describe("POST /swipes", () => {
  const app = buildApp();

  test("one-way like creates a follow and returns followed:true, matched:false", async () => {
    sequenceClientQuery(
      { rows: [] },  // BEGIN
      NO_BLOCKS,     // block check
      { rows: [] },  // INSERT swipes
      { rows: [] },  // reciprocal → empty
      { rows: [] },  // INSERT follows
      { rows: [] }   // COMMIT
    );

    const res = await request(app)
      .post("/swipes")
      .set("Authorization", `Bearer ${makeToken(10)}`)
      .send({ target_id: 20, direction: "like" });

    expect(res.statusCode).toBe(200);
    expect(res.body.followed).toBe(true);
    expect(res.body.matched).toBe(false);
  });

  test("reciprocal like creates a match and returns matched:true", async () => {
    sequenceClientQuery(
      { rows: [] },                    // BEGIN
      NO_BLOCKS,                       // block check
      { rows: [] },                    // INSERT swipes
      { rows: [{ "?column?": 1 }] },  // reciprocal → hit
      { rows: [{ id: 99 }] },         // INSERT matches RETURNING id
      { rows: [] },                    // DELETE follows
      { rows: [] }                     // COMMIT
    );

    const res = await request(app)
      .post("/swipes")
      .set("Authorization", `Bearer ${makeToken(30)}`)
      .send({ target_id: 40, direction: "like" });

    expect(res.statusCode).toBe(200);
    expect(res.body.matched).toBe(true);
    expect(res.body.matchId).toBe(99);
  });

  test("pass creates neither follow nor match", async () => {
    sequenceClientQuery(
      { rows: [] },  // BEGIN
      NO_BLOCKS,     // block check
      { rows: [] },  // INSERT swipes (pass)
      { rows: [] }   // COMMIT
    );

    const res = await request(app)
      .post("/swipes")
      .set("Authorization", `Bearer ${makeToken(50)}`)
      .send({ target_id: 60, direction: "pass" });

    expect(res.statusCode).toBe(200);
    expect(res.body.matched).toBe(false);
    expect(res.body.followed).toBe(false);
  });

  test("duplicate swipe returns 200 (idempotent)", async () => {
    sequenceClientQuery(
      { rows: [] },  // BEGIN
      NO_BLOCKS,     // block check
      { rows: [] },  // INSERT swipes → ON CONFLICT DO NOTHING
      { rows: [] },  // reciprocal
      { rows: [] },  // INSERT follows → ON CONFLICT DO NOTHING
      { rows: [] }   // COMMIT
    );

    const res = await request(app)
      .post("/swipes")
      .set("Authorization", `Bearer ${makeToken(70)}`)
      .send({ target_id: 80, direction: "like" });

    expect(res.statusCode).toBe(200);
    const swipeInserts = mockClient.query.mock.calls.filter(
      ([sql]) => typeof sql === "string" && sql.includes("INSERT INTO swipes")
    );
    expect(swipeInserts).toHaveLength(1);
  });

  test("swiping yourself returns 400", async () => {
    const res = await request(app)
      .post("/swipes")
      .set("Authorization", `Bearer ${makeToken(100)}`)
      .send({ target_id: 100, direction: "like" });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/yourself/i);
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  test("swiping a blocked user returns 403", async () => {
    sequenceClientQuery(
      { rows: [] },                   // BEGIN
      { rows: [{ "?column?": 1 }] }, // block check → blocked
      { rows: [] }                    // ROLLBACK
    );

    const res = await request(app)
      .post("/swipes")
      .set("Authorization", `Bearer ${makeToken(11)}`)
      .send({ target_id: 22, direction: "like" });

    expect(res.statusCode).toBe(403);
  });

  test("missing token returns 401", async () => {
    const res = await request(app).post("/swipes").send({ target_id: 5, direction: "like" });
    expect(res.statusCode).toBe(401);
  });

  test("invalid direction returns 400", async () => {
    const res = await request(app)
      .post("/swipes")
      .set("Authorization", `Bearer ${makeToken(1)}`)
      .send({ target_id: 2, direction: "dislike" });
    expect(res.statusCode).toBe(400);
  });
});
