import { readFileSync } from "fs";

const sql = readFileSync(new URL("./setup.sql", import.meta.url), "utf8");

const statements = sql
  .split(/;\s*\n/)
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !s.startsWith("--"));

const DB_URL = "postgresql://postgres:S5WXkeXrMtWzd550@db.jylbtlvspfywizanekcr.supabase.co:5432/postgres";

const pg = await import("pg");
const { Pool } = pg.default;
const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

let ok = 0;
let fail = 0;
for (const stmt of statements) {
  try {
    await pool.query(stmt);
    ok++;
  } catch (e) {
    console.error("SKIP:", e.message.split("\n")[0]);
    fail++;
  }
}
console.log(`Done: ${ok} ok, ${fail} skipped`);
await pool.end();
