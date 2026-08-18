// Runs every .sql file in /migrations, in order, once.
// Usage: npm run migrate
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { pool } = require("../src/db");

async function run() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      run_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const dir = path.join(__dirname, "..", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    const { rows } = await pool.query("SELECT 1 FROM _migrations WHERE name = $1", [file]);
    if (rows.length) {
      console.log(`skip (already run): ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    console.log(`running: ${file}`);
    await pool.query(sql);
    await pool.query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
  }

  console.log("migrations complete");
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
