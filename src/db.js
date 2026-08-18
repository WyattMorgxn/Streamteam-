const { Pool } = require("pg");

// Railway's DATABASE_URL requires SSL in production but not always locally.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

pool.on("error", (err) => {
  console.error("Unexpected Postgres error", err);
});

module.exports = { pool };
