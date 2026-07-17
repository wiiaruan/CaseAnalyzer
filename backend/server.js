import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { initDb, saveCase, loadIndex, fetchCase, deleteCase } from "./db.js";

dotenv.config({ path: ".env.local" });

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const EXTRACTION_PROMPT = `You are a sales-enablement analyst at Milestone Systems (open-platform VMS: XProtect, BriefCam analytics, Arcules cloud). Analyse the customer case below using the Growth Activator methodology and return ONE JSON object.

METHODOLOGY:
- Pain must be chained Pain -> Consequence -> Business impact. Criteria: Personal, Measurable, Negatively stated. Categories: "Compliance" | "Too high / increasing" | "Too low / decreasing" | "Missed opportunity". Each pain has an OWNER.
- Key players: Focus = Solution|Transition|Financial; Influence = High|Medium|Low.
- Vision = how the CUSTOMER sees THEMSELVES using the capabilities (their future state, not a pitch).
- Value = quantified drivers + Value Statements (Issue/Action/Value/Check).
- Competitive = lead with unique differentiators, prove parity elsewhere; objections via Acknowledge/Question/Position/Check.

PROVENANCE: every field with a "src" key = "doc" if the document states/implies it, else "inferred". NEVER leave a field empty. If missing, infer a value faithful to the context (industry, scale, tech, regulation, goals) and mark it "inferred". Inferred numbers are realistic ranges.

Return ONLY this JSON (no markdown, no commentary):
{
 "meta":{"customer":"","industry":"","stage":"","competitor":"","docType":""},
 "overview":{
   "summary":{"value":"","src":"doc"},
   "snapshot":[{"label":"","value":"","src":"doc"}],
   "rolePlay":{"role":{"value":"","src":"doc"},"scenario":{"value":"","src":"doc"},"objective":{"value":"","src":"doc"}}
 },
 "rfi":{
   "intro":{"value":"","src":"doc"},
   "sections":[{"no":"1.1","title":"","summary":{"value":"","src":"doc"},"rows":[{"k":"","v":{"value":"","src":"doc"}}],"critical":false}]
 },
 "discovery":{"statements":[{"value":"","src":"doc"}],"competitorAlert":{"value":"","src":"doc"}},
 "stakeholders":[{"name":"","title":"","focus":"","influence":"","cares":["",""],"src":"doc"}],
 "pains":[{"title":"","category":"","owner":"","pain":"","consequence":"","impact":"","src":"doc"}],
 "painHeadline":"",
 "vision":{"items":[{"title":"","detail":"","src":"doc"}],"playback":""},
 "value":{"drivers":[{"driver":"","mechanism":"","impact":"","src":"doc"}],"statements":[{"name":"","issue":"","action":"","value":"","check":""}],"proofEvents":[{"event":"","aspect":""}]},
 "competitive":{"narrative":"","differentiators":[{"title":"","detail":""}],"parity":[""],"objections":[{"objection":"","acknowledge":"","question":"","position":"","check":""}],"redFlags":[""]}
}

CASE OVERVIEW (the seller's SCENARIO BRIEFING — describe the situation, do NOT diagnose it):
This section only sets the stage. The seller must DISCOVER the pains, vision, value and positioning themselves in the other sections — so the Overview must NOT contain pain analysis, business impact, quantified value, competitive strategy, or any "answer". Facts of the scenario = yes; interpretations/findings = no.
- overview.summary: a 3-4 sentence narrative situating the case — who the customer is, why they're evaluating now (their stated goal), and where we are in the sales cycle. Neutral framing, no pain/impact analysis.
- overview.snapshot: 6-10 hard facts about the CURRENT situation as label/value cards (current system, scale, technology, constraints, budget/timeline if known). Raw facts only — the material the seller will later mine for pains. Infer realistic values where absent.
- overview.rolePlay: the practice setup. role = who the seller plays; scenario = where the activity starts; objective = what they must achieve in the exercise. Derive from the document; infer a sensible framing if none.
- stakeholders: 3-6 people the seller will engage. For each: name (or role if unnamed), title, Power-Model focus (Solution|Transition|Financial), influence (High|Medium|Low), and "cares" (2-3 neutral bullets on what matters to that person in their job). Do NOT list their pain points and do NOT give tips on how to win them — the seller discovers those. Infer plausible stakeholders for the industry if the document names none.

REQUIREMENTS: rfi.sections mirror the document's own numbering/titles (e.g. "2.7 Degraded Mode") and hold only the facts of each requirement; mark hard requirements critical:true. Do NOT add a Milestone response in the Overview. 5-6 pains. 6-8 vision items. 5-6 value drivers with figures. exactly 3 value statements (action starts "Imagine…"/"Consider…"). 4-5 proof events tagged Solution/Transition/Financial. differentiators[0] is the demo centerpiece (solves the hardest requirement). 2 fully-worked objections. 3 red flags. If no competitor is named, infer the most likely one.

BE CONCISE: keep every string under 30 words. Summaries and "answer" fields under 25 words. This keeps the JSON compact — do not exceed the output budget or the JSON will be cut off. Output the JSON and nothing after it.

CUSTOMER CASE:
`;

// Best-effort JSON repair (same as frontend)
function parseCaseJson(text) {
  let t = text.replace(/\`\`\`json|\`\`\`/g, "").trim();
  const first = t.indexOf("{");
  if (first > 0) t = t.slice(first);

  const lastBrace = t.lastIndexOf("}");
  if (lastBrace > 0) {
    try {
      return JSON.parse(t.slice(0, lastBrace + 1));
    } catch {}
  }

  const stackAt = (arr) => arr.slice();
  let depth = [];
  let inStr = false,
    esc = false;
  let cut = -1,
    cutDepth = [];
  const mark = (i) => {
    cut = i;
    cutDepth = stackAt(depth);
  };

  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === "\\") {
      esc = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      if (!inStr) {
        let j = i + 1;
        while (j < t.length && /\s/.test(t[j])) j++;
        if (t[j] === "," || t[j] === "}" || t[j] === "]" || j >= t.length)
          mark(i);
      }
      continue;
    }
    if (inStr) continue;
    if (ch === "{" || ch === "[") depth.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") {
      depth.pop();
      mark(i);
    } else if (/[0-9truefalsn]/.test(ch)) {
      let j = i + 1;
      while (j < t.length && /[0-9truefalsn.eE+-]/.test(t[j])) j++;
      while (j < t.length && /\s/.test(t[j])) j++;
      if (t[j] === "," || t[j] === "}" || t[j] === "]") mark(i);
    }
  }

  if (cut < 0) throw new Error("unrepairable JSON");
  let repaired = t.slice(0, cut + 1).replace(/,\s*$/, "");
  for (let k = cutDepth.length - 1; k >= 0; k--) repaired += cutDepth[k];
  return JSON.parse(repaired);
}

async function analyzeCase(caseText) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set in .env.local");

  let res;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 20000,
        messages: [{ role: "user", content: EXTRACTION_PROMPT + caseText }],
      }),
    });
  } catch (e) {
    throw new Error("NETWORK: could not reach the API — " + e.message);
  }

  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {}
    throw new Error(`API ${res.status}: ${detail}`);
  }

  const data = await res.json();
  if (data.error) {
    throw new Error("API error: " + JSON.stringify(data.error).slice(0, 300));
  }

  const text = (data.content || [])
    .map((c) => (c.type === "text" ? c.text : ""))
    .join("");
  if (!text) throw new Error("Empty response from the model.");

  try {
    return parseCaseJson(text);
  } catch (e) {
    throw new Error(
      "PARSE: model did not return valid JSON. First 200 chars: " +
        text.slice(0, 200)
    );
  }
}

// Routes

// Analizar texto (POST desde frontend después de extraer PDF)
app.post("/api/analyze", async (req, res) => {
  try {
    const { caseText } = req.body;
    if (!caseText)
      return res.status(400).json({ error: "caseText required" });

    const result = await analyzeCase(caseText);
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Guardar caso
app.post("/api/cases", async (req, res) => {
  try {
    const { caseFile } = req.body;
    const index = await saveCase(caseFile);
    res.json(index);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Cargar índice de casos
app.get("/api/cases", async (req, res) => {
  try {
    const index = await loadIndex();
    res.json(index);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Abrir caso específico
app.get("/api/cases/:id", async (req, res) => {
  try {
    const caseFile = await fetchCase(req.params.id);
    if (!caseFile)
      return res.status(404).json({ error: "Case not found" });
    res.json(caseFile);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Borrar caso
app.delete("/api/cases/:id", async (req, res) => {
  try {
    const index = await deleteCase(req.params.id);
    res.json(index);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Start server
const PORT = process.env.PORT || 5000;
await initDb();
app.listen(PORT, () => {
  console.log(`🚀 CaseAnalyzer backend running on http://localhost:${PORT}`);
});
