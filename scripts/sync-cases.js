#!/usr/bin/env node
// Syncs the curated training cases in `Cases Json/*.json` to the CaseAnalyzer
// backend's case list. Each case is matched to any existing production entry
// by customer name; a match is deleted and re-created so the sync behaves as
// an upsert (server.js's saveCase() always mints a fresh id, so a plain POST
// would otherwise duplicate the entry instead of replacing it).
//
// Usage:
//   node scripts/sync-cases.js                                        # -> production (Railway)
//   CASE_API_BASE=http://localhost:5000 node scripts/sync-cases.js    # -> local backend
//
// This is training-tool convenience for a small internal audience. When
// CaseAnalyzer moves to shared/multi-user use, new users should see an empty
// case list — at that point, disable/delete .github/workflows/sync-cases.yml
// (and this script stays useful for one-off manual syncs if still needed).

import { readdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CASES_DIR = join(__dirname, "..", "Cases Json");
const API_BASE = (process.env.CASE_API_BASE || "https://caseanalyzer-production.up.railway.app").replace(/\/$/, "");

async function fetchWithRetry(url, options, attempts = 4, delayMs = 5000) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      lastErr = new Error(`${options?.method || "GET"} ${url} -> ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    if (i < attempts) {
      console.warn(`Retrying (${i}/${attempts - 1}) ${url}: ${lastErr.message}`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

async function main() {
  const files = readdirSync(CASES_DIR).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    console.log("No case JSON files found in", CASES_DIR);
    return;
  }

  let index = await (await fetchWithRetry(`${API_BASE}/api/cases`)).json();

  let created = 0;
  let replaced = 0;
  let skipped = 0;
  const seenCustomers = new Set();

  for (const file of files) {
    const raw = JSON.parse(readFileSync(join(CASES_DIR, file), "utf8"));
    const caseFile = raw.caseFile;
    const customer = caseFile?.meta?.customer;
    if (!customer) {
      console.warn(`Skipping ${file}: no caseFile.meta.customer`);
      skipped++;
      continue;
    }
    if (seenCustomers.has(customer)) {
      console.log(`Skipping ${file}: duplicate of an already-synced customer "${customer}"`);
      skipped++;
      continue;
    }
    seenCustomers.add(customer);

    const existing = index.filter((e) => e.customer === customer);
    for (const entry of existing) {
      await fetchWithRetry(`${API_BASE}/api/cases/${entry.id}`, { method: "DELETE" });
    }

    index = await (
      await fetchWithRetry(`${API_BASE}/api/cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseFile }),
      })
    ).json();

    if (existing.length) replaced++;
    else created++;
    console.log(`${existing.length ? "Replaced" : "Created"}: ${customer} (${file})`);
  }

  console.log(
    `\nDone. ${created} created, ${replaced} replaced, ${skipped} skipped, ${index.length} cases now in production.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
