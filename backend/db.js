import sqlite3 from "sqlite3";
import { promisify } from "util";

const db = new sqlite3.Database("./cases.db");

// Promisify callbacks
const dbRun = promisify(db.run.bind(db));
const dbGet = promisify(db.get.bind(db));
const dbAll = promisify(db.all.bind(db));

// Init schema
export async function initDb() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(
        `CREATE TABLE IF NOT EXISTS caseindex (
          id TEXT PRIMARY KEY,
          customer TEXT,
          industry TEXT,
          date TEXT
        )`,
        (err) => err && console.error("caseindex:", err)
      );
      db.run(
        `CREATE TABLE IF NOT EXISTS cases (
          id TEXT PRIMARY KEY,
          data TEXT
        )`,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  });
}

export async function loadIndex() {
  try {
    const rows = await dbAll("SELECT * FROM caseindex ORDER BY date DESC");
    return rows || [];
  } catch {
    return [];
  }
}

export async function saveCase(caseFile) {
  const customer = caseFile?.meta?.customer || "Untitled";
  const slug = customer
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "case";
  const id = `case:${slug}-${Date.now()}`;

  await dbRun("INSERT OR REPLACE INTO cases VALUES (?, ?)", [
    id,
    JSON.stringify(caseFile),
  ]);

  const index = await loadIndex();
  const entry = {
    id,
    customer,
    industry: caseFile?.meta?.industry || "",
    date: new Date().toISOString(),
  };

  await dbRun("INSERT OR REPLACE INTO caseindex VALUES (?, ?, ?, ?)", [
    entry.id,
    entry.customer,
    entry.industry,
    entry.date,
  ]);

  return [entry, ...index.filter((e) => e.id !== id)];
}

export async function fetchCase(id) {
  try {
    const row = await dbGet("SELECT data FROM cases WHERE id = ?", [id]);
    return row ? JSON.parse(row.data) : null;
  } catch {
    return null;
  }
}

export async function deleteCase(id) {
  await dbRun("DELETE FROM cases WHERE id = ?", [id]);
  await dbRun("DELETE FROM caseindex WHERE id = ?", [id]);
  return await loadIndex();
}
