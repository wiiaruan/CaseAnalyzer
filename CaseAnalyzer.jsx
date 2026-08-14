import { useState, useRef, useEffect, useContext, createContext } from "react";
import {
  Building2, AlertTriangle, Eye, EyeOff, TrendingUp, Swords, ChevronDown,
  ChevronRight, Flag, Users, Target, CheckCircle2, ArrowRight,
  ShieldAlert, Lightbulb, MessageSquare, Pencil, Download, FileUp, Layers,
  ClipboardList, ClipboardCheck, Gauge, FileText, Upload, Loader2, RotateCcw,
  Search as SearchIcon, Sparkles, AlertCircle, Save, Trash2,
  FolderOpen, Check, Users2, Plus, Copy, ChevronUp, Presentation, Printer,
  GraduationCap, Dices
} from "lucide-react";

// Forces collapsible cards (RfiSection, StakeholderCard) open — set to true
// only inside the print-only tree so the printed PDF shows full content
// instead of the collapsed-by-default screen state.
const PrintForceOpenContext = createContext(false);

// Facilitator vs. participant view of Training exercises. Set from a header
// toggle (screen and print share this one source of truth, unlike the
// collapsed/open accordion state, which print always forces open separately
// via PrintForceOpenContext). Participant mode hides every "reveal answer"
// control outright; facilitator mode shows it on screen and auto-reveals it
// in print, so a printed facilitator key doesn't require clicking every box
// first (the print render is a separate React mount with its own blank
// state, so revealed-state alone can't cross over — same reason the
// accordion needs PrintForceOpenContext).
const FacilitatorModeContext = createContext(false);

/* ================================================================
   ██  CASE LIBRARY (via local backend)
   ================================================================
   Calls to Node.js backend at http://localhost:5000.
   Backend persists to SQLite (cases.db).
   ================================================================ */
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000/api";

async function loadIndex() {
  try {
    const res = await fetch(`${API_BASE}/cases`);
    return res.ok ? await res.json() : [];
  } catch { return []; }
}

async function saveCase(caseFile) {
  try {
    const res = await fetch(`${API_BASE}/cases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseFile }),
    });
    return res.ok ? await res.json() : [];
  } catch (e) {
    throw new Error("Could not save case: " + e.message);
  }
}

async function fetchCase(id) {
  try {
    const res = await fetch(`${API_BASE}/cases/${id}`);
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

async function deleteCase(id) {
  try {
    const res = await fetch(`${API_BASE}/cases/${id}`, { method: "DELETE" });
    return res.ok ? await res.json() : [];
  } catch (e) {
    throw new Error("Could not delete case: " + e.message);
  }
}

/* ================================================================
   ██  EXTRACTION AGENT  ("backend")  — token-efficient design
   ================================================================
   1. Extract PLAIN TEXT from the PDF in the browser with pdf.js
      (no API tokens spent, and it strips the heavy network
      diagrams / images that bloat a base64 PDF).
   2. ONE single Claude call with that text -> full caseFile JSON.
      One call = no repeated methodology context, no repeated
      document payload. Lowest possible token cost.

   PROVENANCE: every field carries src "doc" | "inferred".
   The agent never leaves a field empty; it infers, faithful to
   context, and flags it.
   ================================================================ */

// Load pdf.js from CDN once, on demand.
let pdfjsPromise = null;
function loadPdfJs() {
  if (pdfjsPromise) return pdfjsPromise;
  pdfjsPromise = new Promise((resolve, reject) => {
    if (window.pdfjsLib) return resolve(window.pdfjsLib);
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      resolve(window.pdfjsLib);
    };
    s.onerror = () => reject(new Error("Could not load the PDF reader"));
    document.head.appendChild(s);
  });
  return pdfjsPromise;
}

// Running headers/footers (company name, doc title, "Page X of Y") repeat
// verbatim on nearly every page. They're not cached like the system prompt —
// this text is a fresh, per-case payload every time — so every repeat is
// input tokens paid for on every single analysis. Detect the shared
// prefix/suffix across pages (skipping the cover page, which often differs)
// and strip it once here instead of shipping it N times.
function stripRepeatedBoilerplate(pages) {
  if (pages.length < 4) return pages; // too few pages to trust a pattern

  const body = pages.slice(1);
  let prefixLen = body[0].length;
  let suffixLen = body[0].length;
  for (let i = 1; i < body.length; i++) {
    const a = body[i - 1], b = body[i];
    let p = 0;
    while (p < prefixLen && p < a.length && p < b.length && a[p] === b[p]) p++;
    prefixLen = p;
    let s = 0;
    while (s < suffixLen && s < a.length && s < b.length && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
    suffixLen = s;
  }
  // Cap so a coincidental match never eats real paragraph content.
  prefixLen = Math.min(prefixLen, 120);
  suffixLen = Math.min(suffixLen, 120);
  if (prefixLen <= 8 && suffixLen <= 8) return pages;

  return pages.map((text, i) => {
    if (i === 0) return text;
    let t = prefixLen > 8 ? text.slice(prefixLen).replace(/^\d{1,4}\s+/, "") : text;
    if (suffixLen > 8 && t.length > suffixLen) t = t.slice(0, t.length - suffixLen);
    return t.trim();
  });
}

async function extractPdfText(file) {
  const pdfjsLib = await loadPdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    pages.push(content.items.map((it) => it.str).join(" ").replace(/[ \t]+/g, " ").trim());
  }
  // Trim to keep the request lean (case briefs are well under this).
  return stripRepeatedBoilerplate(pages)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 24000);
}

// EXTRACTION_PROMPT moved to backend (server.js) to minimize frontend tokens

// JSON parsing and model calls moved to backend for security and efficiency

// The backend streams the analysis as SSE (progress events with the
// growing output-token count, then a final done/error event) so a
// multi-minute Opus generation shows real movement instead of one
// blocking fetch that only resolves at the very end.
async function analyzeCase(caseText, onProgress) {
  let res;
  try {
    res = await fetch(`${API_BASE}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseText }),
    });
  } catch (e) {
    throw new Error("Analysis failed: " + e.message);
  }
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Analysis failed: Backend ${res.status}: ${detail.slice(0, 200)}`);
  }
  if (!res.body) return await res.json(); // fallback if streaming isn't supported

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let result = null;
  let errorMsg = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const lines = block.split("\n");
      const eventLine = lines.find((l) => l.startsWith("event:"));
      const dataLine = lines.find((l) => l.startsWith("data:"));
      if (!eventLine || !dataLine) continue;
      const event = eventLine.slice(6).trim();
      let data;
      try { data = JSON.parse(dataLine.slice(5).trim()); } catch { continue; }

      if (event === "progress") onProgress?.(data);
      else if (event === "done") result = data;
      else if (event === "error") errorMsg = data.message;
    }
  }

  if (errorMsg) throw new Error("Analysis failed: " + errorMsg);
  if (!result) throw new Error("Analysis failed: stream ended without a result.");
  return result;
}

// Re-scores just the Health Check block against the case JSON as it stands
// right now — cheap enough for one blocking request, no streaming needed.
async function rerunHealthCheck(caseFile) {
  let res;
  try {
    res = await fetch(`${API_BASE}/health-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseFile }),
    });
  } catch (e) {
    throw new Error("Health Check re-run failed: " + e.message);
  }
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Health Check re-run failed: Backend ${res.status}: ${detail.slice(0, 200)}`);
  }
  return await res.json();
}

/* ================================================================
   ██  EXPORT / IMPORT (schema-versioned)
   ================================================================ */
const SCHEMA_VERSION = 5;

// Accepts a raw parsed JSON — either a versioned export envelope
// ({app, schemaVersion, caseFile}) or a bare caseFile from any prior
// schema — and normalizes it to the current shape.
function migrateCaseFile(raw) {
  if (!raw || typeof raw !== "object") throw new Error("Not a valid case file.");
  const cf = raw.caseFile && typeof raw.caseFile === "object" ? { ...raw.caseFile } : { ...raw };
  if (!cf.meta || typeof cf.meta !== "object") {
    throw new Error("This JSON does not look like a CaseAnalyzer export (missing meta).");
  }

  // v1 pains used pain/consequence/impact; v2-v3 used pain/causes/capabilities/orgImpact
  // as a separate step; v4 folded the organizational impact into the pain statement itself;
  // v5 splits the factual situation back out into painDescription, leaving pain as only the
  // consequence. Pre-v5 files have no clean split point, so painDescription starts empty and
  // the full legacy text stays in pain — a trainer can move text across manually if desired.
  cf.pains = (cf.pains || []).map((p) => {
    const n = { ...p };
    if (n.causes === undefined && n.consequence !== undefined) n.causes = n.consequence;
    if (n.capabilities === undefined) n.capabilities = "";
    if (n.painDescription === undefined) n.painDescription = "";
    if (!Array.isArray(n.affects)) n.affects = [];
    const legacyOrgImpact = n.orgImpact !== undefined ? n.orgImpact : n.impact;
    if (legacyOrgImpact) {
      n.pain = n.pain ? `${n.pain} ${legacyOrgImpact}` : legacyOrgImpact;
    }
    delete n.consequence;
    delete n.impact;
    delete n.orgImpact;
    return n;
  });

  // v1-v3 quantified value drivers used driver/mechanism/impact; v4 uses
  // metric/baseline/target/impact. No baseline/target existed before, so this
  // is a best-effort carry-forward, not a lossless mapping.
  if (cf.value?.drivers?.length) {
    cf.value = {
      ...cf.value,
      drivers: cf.value.drivers.map((d) => {
        if (d.metric !== undefined) return d;
        const { driver, mechanism, ...rest } = d;
        return { metric: driver || "", baseline: "", target: mechanism || "", ...rest };
      }),
    };
  }

  // v1 kept proof events under value; v2+ moved them to the consensus plan.
  if (!cf.consensus && cf.value?.proofEvents?.length) {
    cf.consensus = {
      summary: "",
      events: cf.value.proofEvents.map((e) => ({
        event: e.event || "",
        phase: e.aspect || "Solution",
        weekOf: "",
        responsible: "",
        goNoGo: false,
        src: "doc",
      })),
    };
  }
  if (cf.value?.proofEvents) {
    cf.value = { ...cf.value };
    delete cf.value.proofEvents;
  }

  // Sections added over time — tolerate their absence (tabs render empty states).
  if (!cf.vision) cf.vision = { items: [], playback: "" };
  if (!cf.competitive) cf.competitive = { narrative: "", differentiators: [], parity: [], objections: [], redFlags: [] };

  // v1 overview had a rolePlay block — dropped in v2.
  if (cf.overview?.rolePlay) {
    cf.overview = { ...cf.overview };
    delete cf.overview.rolePlay;
  }
  return cf;
}

function exportCaseFile(caseFile) {
  const envelope = {
    app: "CaseAnalyzer",
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    caseFile,
  };
  const slug = (caseFile?.meta?.customer || "case")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `caseanalyzer-${slug}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Slide-deck export (PDF + PPTX) — both generators are heavy and only used
// occasionally, so they're dynamically imported on click rather than bundled
// eagerly (same "load on demand" pattern already used for pdf.js above).
function ExportDeckMenu({ caseFile }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null); // null | "pdf" | "pptx"
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const run = async (format) => {
    setBusy(format);
    try {
      if (format === "pdf") {
        const { downloadPdf } = await import("./export/PdfDeck.jsx");
        await downloadPdf(caseFile);
      } else {
        const { downloadPptx } = await import("./export/pptxDeck.js");
        await downloadPptx(caseFile);
      }
    } catch (e) {
      console.error(`Deck export (${format}) failed:`, e);
      alert(`Couldn't generate the ${format.toUpperCase()} deck. See console for details.`);
    } finally {
      setBusy(null);
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={!!busy}
        className="flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white rounded-md px-2.5 py-1.5 hover:bg-white/10 disabled:opacity-60"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Presentation size={13} />}
        {busy ? `Generating ${busy.toUpperCase()}…` : "Export Deck"}
        {!busy && <ChevronDown size={12} />}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-40 rounded-md bg-white shadow-lg border border-slate-200 py-1 z-20">
          <button
            onClick={() => run("pdf")}
            className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            <FileText size={13} /> PDF
          </button>
          <button
            onClick={() => run("pptx")}
            className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            <Presentation size={13} /> PowerPoint
          </button>
        </div>
      )}
    </div>
  );
}

/* ================================================================
   ██  PRESENTATION LAYER
   ================================================================ */

const ACCENT = "#0098DB";
const DARK = "#12263A";

function SrcChip({ src }) {
  if (src !== "inferred") return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 ml-1.5 align-middle">
      <Flag size={10} /> inferred
    </span>
  );
}

function Field({ f }) {
  if (!f) return null;
  return <span>{f.value}<SrcChip src={f.src} /></span>;
}

function SectionTitle({ icon: Icon, children, sub }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <Icon size={18} style={{ color: ACCENT }} />
        <h2 className="font-display text-xl font-bold text-slate-900 tracking-tight">{children}</h2>
      </div>
      {sub && <p className="text-sm text-slate-500 mt-1 ml-7">{sub}</p>}
    </div>
  );
}

/* ---------- Overview ---------- */
function RfiSection({ s }) {
  const forceOpen = useContext(PrintForceOpenContext);
  const [openState, setOpen] = useState(false);
  const open = openState || forceOpen;
  return (
    <div className={`rounded-lg border bg-white overflow-hidden ${s.critical ? "border-red-300" : "border-slate-200"}`}>
      <button
        onClick={() => setOpen(!openState)}
        className="w-full flex items-start gap-3 p-3.5 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
      >
        {open ? <ChevronDown size={16} className="mt-0.5 text-slate-400 shrink-0" /> : <ChevronRight size={16} className="mt-0.5 text-slate-400 shrink-0" />}
        <FileText size={16} className="mt-0.5 shrink-0" style={{ color: s.critical ? "#dc2626" : ACCENT }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-mono font-bold text-slate-400">{s.no}</span>
            <span className="font-semibold text-slate-900 text-sm">{s.title}</span>
            {s.critical && (
              <span className="rounded-full bg-red-100 text-red-700 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5">
                critical requirement
              </span>
            )}
          </div>
          {!open && <p className="text-xs text-slate-500 mt-1 truncate">{s.summary?.value}</p>}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 pl-11 space-y-3">
          <p className="text-sm text-slate-600 leading-snug">{s.summary?.value}</p>

          {s.rows?.length > 0 && (
            <div className="rounded-md border border-slate-200 divide-y divide-slate-100">
              {s.rows.map((r, i) => (
                <div key={i} className="flex flex-col sm:flex-row gap-1 sm:gap-3 p-2.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:w-44 shrink-0">{r.k}</div>
                  <div className="text-[13px] text-slate-700 leading-snug"><Field f={r.v} /></div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StakeholderCard({ p }) {
  const forceOpen = useContext(PrintForceOpenContext);
  const [openState, setOpen] = useState(false);
  const open = openState || forceOpen;
  const inf = String(p.influence || "");
  const infCls = inf.startsWith("High") ? "bg-sky-100 text-sky-800" : inf.startsWith("Med") ? "bg-slate-100 text-slate-700" : "bg-slate-100 text-slate-500";
  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <button onClick={() => setOpen(!openState)} className="w-full flex items-start gap-3 p-3.5 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
        {open ? <ChevronDown size={16} className="mt-0.5 text-slate-400 shrink-0" /> : <ChevronRight size={16} className="mt-0.5 text-slate-400 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-900 text-sm">{p.name}<SrcChip src={p.src} /></span>
            {p.title && <span className="text-xs text-slate-500">· {p.title}</span>}
          </div>
          <div className="flex items-center gap-2 mt-1">
            {p.focus && <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{p.focus}</span>}
            {p.influence && <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${infCls}`}>{p.influence} influence</span>}
          </div>
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 pl-11 space-y-3">
          {p.cares?.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-sky-600 mb-1">What they care about</div>
              <ul className="space-y-1">
                {p.cares.map((c, i) => <li key={i} className="text-[13px] text-slate-600 leading-snug flex gap-1.5"><span className="text-sky-300 shrink-0">•</span>{c}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Overview({ data }) {
  const [q, setQ] = useState("");
  const ov = data.overview || {};
  const sections = (data.rfi?.sections || []).filter(
    (s) => !q || `${s.no} ${s.title} ${s.summary?.value}`.toLowerCase().includes(q.toLowerCase())
  );
  const stakeholders = data.stakeholders || [];

  return (
    <div className="space-y-6">
      <SectionTitle icon={Building2} sub="The seller's briefing — everything needed to understand the case">
        Case Overview
      </SectionTitle>

      {/* Executive summary */}
      {ov.summary?.value && (
        <div className="rounded-lg p-4 text-white leading-relaxed" style={{ background: DARK }}>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: ACCENT }}>The case at a glance</div>
          <p className="text-sm text-slate-100 leading-relaxed"><Field f={ov.summary} /></p>
        </div>
      )}

      {/* Current situation snapshot */}
      {ov.snapshot?.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Current situation</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {ov.snapshot.map((f, i) => (
              <div key={i} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{f.label}</div>
                <div className="text-sm font-medium text-slate-800 mt-1 leading-snug">{f.value}<SrcChip src={f.src} /></div>
              </div>
            ))}
          </div>
        </div>
      )}


      {/* Stakeholders (personas + Power Model fused) */}
      {stakeholders.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Users size={15} className="text-slate-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Stakeholders — who you'll engage</span>
          </div>
          <div className="space-y-2">
            {stakeholders.map((p, i) => <StakeholderCard key={i} p={p} />)}
          </div>
        </div>
      )}

      {/* RFI / requirements structure */}
      {data.rfi?.intro?.value && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: ACCENT }}>Requirements — introduction</div>
          <p className="text-sm text-slate-600 leading-snug"><Field f={data.rfi.intro} /></p>
        </div>
      )}

      {data.rfi?.sections?.length > 0 && (
        <div>
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Requirements structure · {data.rfi.sections.length} sections
            </span>
            <div className="relative">
              <SearchIcon size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filter sections…"
                className="pl-7 pr-3 py-1.5 text-xs rounded-md border border-slate-200 bg-white w-48 focus:outline-none focus:ring-2 focus:ring-sky-300"
              />
            </div>
          </div>
          <div className="space-y-2">
            {sections.map((s, i) => <RfiSection key={i} s={s} />)}
          </div>
        </div>
      )}

      {/* Discovery */}
      {data.discovery?.statements?.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Information from the discovery meeting
          </div>
          <ul className="space-y-2">
            {data.discovery.statements.map((d, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-700 leading-snug">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" style={{ color: ACCENT }} />
                <Field f={d} />
              </li>
            ))}
          </ul>
          {data.discovery.competitorAlert?.value && (
            <div className="mt-3 rounded-md bg-red-50 border border-red-200 p-2.5 flex gap-2 text-sm text-red-900">
              <Swords size={15} className="mt-0.5 shrink-0 text-red-600" />
              <span><span className="font-semibold">Competitor alert: </span><Field f={data.discovery.competitorAlert} /></span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Solution (open-platform map) ---------- */
function SolutionLayer({ title, subtitle, items, tone }) {
  if (!items?.length) return null;
  const tones = {
    top: { bg: ACCENT, text: "#fff", sub: "rgba(255,255,255,0.75)" },
    mid: { bg: DARK, text: "#fff", sub: "rgba(255,255,255,0.6)" },
    base: { bg: "#94a3b8", text: "#fff", sub: "rgba(255,255,255,0.8)" },
  }[tone];
  return (
    <div className="rounded-lg overflow-hidden border border-slate-200">
      <div className="px-4 py-2.5" style={{ background: tones.bg }}>
        <span className="font-display text-sm font-bold" style={{ color: tones.text }}>{title}</span>
        {subtitle && <span className="ml-2 text-[11px]" style={{ color: tones.sub }}>{subtitle}</span>}
      </div>
      <div className="grid sm:grid-cols-2 gap-px bg-slate-100">
        {items.map((it, i) => (
          <div key={i} className="bg-white p-3">
            <div className="font-semibold text-slate-900 text-sm">{it.item}<SrcChip src={it.src} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Solution({ data }) {
  const s = data.solution;
  if (!s) {
    return (
      <div className="space-y-4">
        <SectionTitle icon={Layers} sub="The open-platform stack this case needs">
          Solution
        </SectionTitle>
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
          This case was analyzed before the Solution map existed — re-analyze the source document to generate it.
        </div>
      </div>
    );
  }
  const topGroups = [
    { key: "extensions", title: "XProtect Extensions", items: s.extensions },
    { key: "analytics", title: "BriefCam Analytics", items: s.analytics },
    { key: "cloud", title: "Arcules Cloud", items: s.cloud },
  ].filter((g) => g.items?.length);

  return (
    <div className="space-y-4">
      <SectionTitle icon={Layers} sub="The open-platform stack this case needs — every item maps to a requirement or pain">
        Solution
      </SectionTitle>

      {s.narrative && (
        <div className="rounded-lg p-4 text-sm text-white leading-relaxed" style={{ background: DARK }}>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: ACCENT }}>
            Solution narrative
          </div>
          {s.narrative}
        </div>
      )}

      {topGroups.length > 0 && (
        <div className="rounded-lg border-2 p-3 space-y-3" style={{ borderColor: ACCENT, background: "rgba(0,152,219,0.04)" }}>
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: ACCENT }}>
            Completing the solution — extensions · analytics · cloud
          </div>
          {topGroups.map((g) => (
            <SolutionLayer key={g.key} title={g.title} items={g.items} tone="top" />
          ))}
        </div>
      )}

      <SolutionLayer
        title="XProtect Platform"
        subtitle="native capabilities"
        items={s.platform}
        tone="mid"
      />
      <SolutionLayer
        title="Device Integration"
        subtitle="open driver library — no vendor lock-in"
        items={s.deviceIntegration}
        tone="base"
      />
    </div>
  );
}

/* ---------- Pain ---------- */
function Pain({ data }) {
  const [open, setOpen] = useState(0);
  return (
    <div className="space-y-4">
      <SectionTitle icon={AlertTriangle} sub="Pain → Causes → Capabilities · Pain criteria: Personal, Measurable, Negatively stated, linked to strategy — factual situation shown under each pain's title">
        Customer Pain
      </SectionTitle>

      {(data.pains || []).map((p, i) => {
        const isOpen = open === i;
        const steps = [
          { label: "Pain", text: p.pain, cls: "bg-rose-50 border-rose-200", dot: "text-rose-600" },
          { label: "Causes", text: p.causes, cls: "bg-amber-50 border-amber-200", dot: "text-amber-600" },
          { label: "Capabilities", text: p.capabilities, cls: "bg-sky-50 border-sky-200", dot: "text-sky-600" },
        ];
        return (
          <div key={i} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <button
              onClick={() => setOpen(isOpen ? -1 : i)}
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              {isOpen ? <ChevronDown size={16} className="text-slate-400 shrink-0" /> : <ChevronRight size={16} className="text-slate-400 shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-900 text-sm">P{i + 1} — {p.title}<SrcChip src={p.src} /></div>
                <div className="text-xs text-slate-500 mt-0.5">{p.category} · Owner: {p.owner}</div>
                {p.painDescription && (
                  <div className="text-sm text-slate-700 mt-1 leading-snug">{p.painDescription}</div>
                )}
              </div>
            </button>
            {isOpen && (
              <div className="px-4 pb-4">
                <div className="flex flex-col md:flex-row md:items-stretch gap-2 mt-3">
                  {steps.map((s, j) => (
                    <div key={j} className="flex flex-col md:flex-row md:items-center md:flex-1 gap-2">
                      <div className={`rounded-lg border p-3 flex-1 ${s.cls}`}>
                        <div className={`text-[10px] font-bold uppercase tracking-wider ${s.dot}`}>{s.label}</div>
                        <div className="text-sm text-slate-700 mt-1 leading-snug">{s.text}</div>
                      </div>
                      {j < steps.length - 1 && <ArrowRight size={16} className="text-slate-300 hidden md:block shrink-0" />}
                    </div>
                  ))}
                </div>
                {p.affects?.length > 0 && (
                  <div className="flex items-center flex-wrap gap-1.5 mt-3">
                    <Users2 size={13} className="text-slate-400 shrink-0" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">Also impacts:</span>
                    {p.affects.map((a, k) => (
                      <span key={k} className="rounded-full bg-slate-100 text-slate-600 text-[11px] px-2 py-0.5">{a}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {data.painHeadline && (
        <div className="rounded-lg p-4 text-sm text-white leading-relaxed" style={{ background: DARK }}>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: ACCENT }}>
            Pain-chain headline for the meeting recap
          </div>
          “{data.painHeadline}”
        </div>
      )}
    </div>
  );
}

/* ---------- Training (EST level exercises) ---------- */
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const revealBtnCls =
  "rounded-md px-3 py-1.5 text-xs font-semibold border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed";
const answerBoxCls = "rounded-md bg-emerald-50 border border-emerald-200 p-2.5 text-sm text-slate-700 leading-snug whitespace-pre-line";
const textareaCls = "w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-sky-300";
const levelCardCls = "rounded-lg border border-slate-200 p-4 space-y-2.5";

// Each level gets one accent color, used consistently for its badge, statement
// box and interactive states — this is what lets a participant tell at a
// glance which exercise (and which of its own rows) they're looking at.
const LEVEL_BADGE = {
  1: "bg-sky-100 text-sky-700",
  2: "bg-amber-100 text-amber-700",
  3: "bg-rose-100 text-rose-700",
  4: "bg-violet-100 text-violet-700",
};
function LevelBadge({ level, children }) {
  return (
    <span className={`inline-flex items-center rounded-full text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 ${LEVEL_BADGE[level]}`}>
      {children}
    </span>
  );
}

// Every exercise gets a short, fixed "consigna" line so a participant always
// knows what they're being asked to do — falls back to a level-appropriate
// default when the case data doesn't carry a custom ex.instructions string
// (only Level 1 exports have historically set one).
function ExerciseBrief({ children }) {
  return (
    <div className="flex items-start gap-2 rounded-md bg-slate-50 border border-slate-200 px-3 py-2">
      <Target size={13} className="mt-0.5 shrink-0 text-slate-400" />
      <p className="text-xs text-slate-600 leading-snug">{children}</p>
    </div>
  );
}
const DEFAULT_INSTRUCTIONS = {
  1: "Match each requirement on the left to the capability that satisfies it.",
  2: "Read the customer statement, then say out loud which layers you'd bring together and why — before you check the expected composition.",
  3: "Diagnose the pain, derive the requirements, and map the solution across layers. Time yourself, then compare your answer against the rubric.",
  4: "Pick the option you'd defend to the customer and justify it in writing — the justification is what's graded, not the pick.",
};

// Custom listbox for Level 1's matching rows — plain <select> can't grey out
// an option that another row already claimed, and this is a 1-to-1 matching
// exercise where reusing the same capability across rows is always wrong.
function MatchSelect({ value, options, usedElsewhere, onChange, checked, isCorrect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative sm:w-80 shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-start justify-between gap-2 w-full text-left text-sm rounded-md border px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300 ${
          checked ? (isCorrect ? "border-emerald-400 bg-emerald-50" : "border-red-400 bg-red-50") : "border-slate-300"
        }`}
      >
        <span className={`leading-snug ${value ? "text-slate-700" : "text-slate-400"}`}>{value || "— choose capability —"}</span>
        <ChevronDown size={14} className="shrink-0 text-slate-400 mt-0.5" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 mt-1 rounded-md bg-white shadow-lg border border-slate-200 py-1 z-20 max-h-64 overflow-y-auto">
          <button
            type="button"
            onClick={() => { onChange(""); setOpen(false); }}
            className="flex items-start gap-2 w-full text-left px-3 py-1.5 text-xs leading-snug text-slate-400 hover:bg-slate-100"
          >
            <Check size={12} className="shrink-0 opacity-0 mt-0.5" />
            <span>— choose capability —</span>
          </button>
          {options.map((o, k) => {
            const takenElsewhere = usedElsewhere.has(o) && o !== value;
            return (
              <button
                key={k}
                type="button"
                disabled={takenElsewhere}
                onClick={() => { onChange(o); setOpen(false); }}
                className={`flex items-start gap-2 w-full text-left px-3 py-1.5 text-xs leading-snug ${
                  takenElsewhere
                    ? "text-slate-300 cursor-not-allowed"
                    : o === value
                    ? "text-sky-700 bg-sky-50 font-semibold"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <Check size={12} className={`shrink-0 mt-0.5 ${o === value ? "opacity-100" : "opacity-0"}`} />
                <span>{o}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Level1Matching({ ex }) {
  const facilitatorMode = useContext(FacilitatorModeContext);
  const printForce = useContext(PrintForceOpenContext);
  const showFacilitatorKey = facilitatorMode && printForce;
  const [options] = useState(() => shuffleArray([...ex.pairs.map((p) => p.capability), ...(ex.distractors || [])]));
  const [answers, setAnswers] = useState({});
  const [checked, setChecked] = useState(false);
  const score = ex.pairs.filter((p, i) => answers[i] === p.capability).length;

  return (
    <div className={levelCardCls}>
      <LevelBadge level={1}>Level 1 · Matching</LevelBadge>
      <ExerciseBrief>{ex.instructions || DEFAULT_INSTRUCTIONS[1]}</ExerciseBrief>
      <div className="space-y-2">
        {ex.pairs.map((p, i) => {
          const isCorrect = answers[i] === p.capability;
          const usedElsewhere = new Set(
            Object.entries(answers).filter(([k]) => Number(k) !== i).map(([, v]) => v)
          );
          return (
            <div
              key={i}
              className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5"
            >
              <div className="flex items-start gap-2 sm:flex-1 min-w-0">
                <span className="mt-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-sky-100 text-sky-700 text-[10px] font-bold shrink-0">
                  {i + 1}
                </span>
                <div className="text-sm text-slate-700 leading-snug">{p.requirement}</div>
              </div>
              <MatchSelect
                value={answers[i] || ""}
                options={options}
                usedElsewhere={usedElsewhere}
                onChange={(v) => { setAnswers({ ...answers, [i]: v }); setChecked(false); }}
                checked={checked}
                isCorrect={isCorrect}
              />
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setChecked(true)}
          className="rounded-md px-3 py-1.5 text-xs font-semibold text-white print:hidden"
          style={{ background: ACCENT }}
        >
          Check answers
        </button>
        {checked && <span className="text-xs font-semibold text-slate-600">{score}/{ex.pairs.length} correct</span>}
      </div>
      {/* Facilitator print key: a live dropdown means nothing on paper, so the
          correct pairing is spelled out as plain text instead — screen-only
          (no printForce) and participant-mode prints render neither. */}
      {showFacilitatorKey && (
        <div className="rounded-md bg-emerald-50 border border-emerald-200 p-2.5 text-xs text-slate-700 space-y-1">
          <div className="font-bold uppercase tracking-wider text-[10px] text-emerald-700">Facilitator key</div>
          {ex.pairs.map((p, i) => (
            <div key={i}>{i + 1}. {p.requirement} → <b>{p.capability}</b></div>
          ))}
        </div>
      )}
    </div>
  );
}

// Reveal button + answer box shared by Levels 2-4: hidden outright in
// participant mode (nothing to peek at), shown with a manual toggle on
// screen in facilitator mode, and force-revealed in print so a facilitator
// key comes out complete without pre-clicking every exercise first.
function RevealAnswer({ label, hideLabel, children }) {
  const facilitatorMode = useContext(FacilitatorModeContext);
  const printForce = useContext(PrintForceOpenContext);
  const [revealedState, setRevealed] = useState(false);
  if (!facilitatorMode) return null;
  const revealed = revealedState || printForce;
  return (
    <>
      <button type="button" onClick={() => setRevealed((r) => !r)} className={`${revealBtnCls} print:hidden`}>
        {revealed ? hideLabel : label}
      </button>
      {revealed && <div className={answerBoxCls}>{children}</div>}
    </>
  );
}

function Level2Derivation({ ex }) {
  const [answer, setAnswer] = useState("");
  return (
    <div className={levelCardCls}>
      <LevelBadge level={2}>Level 2 · Derivation</LevelBadge>
      <ExerciseBrief>{ex.instructions || DEFAULT_INSTRUCTIONS[2]}</ExerciseBrief>
      <div className="rounded-md bg-amber-50 border border-amber-200 p-2.5 text-sm text-slate-700 italic leading-snug">“{ex.statement}”</div>
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={3}
        placeholder="Sketch the solution aloud — which layers, and why…"
        className={textareaCls}
      />
      <RevealAnswer label="Reveal expected answer" hideLabel="Hide expected answer">
        {ex.expectedComposition}
      </RevealAnswer>
    </div>
  );
}

function Level3Diagnosis({ ex, painDescription, causes }) {
  const [answer, setAnswer] = useState("");
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className={levelCardCls}>
      <LevelBadge level={3}>Level 3 · Diagnosis</LevelBadge>
      <ExerciseBrief>{ex.instructions || DEFAULT_INSTRUCTIONS[3]}</ExerciseBrief>
      <div className="rounded-md bg-rose-50 border border-rose-200 p-2.5 space-y-1.5">
        {painDescription && <div className="text-sm text-slate-700 leading-snug">{painDescription}</div>}
        {causes && <div className="text-sm text-slate-600 leading-snug">{causes}</div>}
        {ex.axisHint && <div className="text-[11px] font-semibold text-rose-700">Axis: {ex.axisHint}</div>}
      </div>
      <div className="flex items-center gap-3 print:hidden">
        <button
          type="button"
          onClick={() => setRunning((r) => !r)}
          className="rounded-md px-3 py-1.5 text-xs font-semibold text-white"
          style={{ background: running ? "#dc2626" : ACCENT }}
        >
          {running ? "Stop" : "Start"} timer
        </button>
        {elapsed > 0 && <span className="font-display text-sm font-bold text-slate-700 tabular-nums">{mm}:{ss}</span>}
      </div>
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={4}
        placeholder="Derive the requirements, map the solution across layers, decide where to stop…"
        className={textareaCls}
      />
      <RevealAnswer label="Reveal rubric" hideLabel="Hide rubric">
        {ex.rubric}
      </RevealAnswer>
    </div>
  );
}

function Level4Discrimination({ ex }) {
  const facilitatorMode = useContext(FacilitatorModeContext);
  const printForce = useContext(PrintForceOpenContext);
  const [choice, setChoice] = useState(null);
  const [justification, setJustification] = useState("");
  const [revealedState, setRevealed] = useState(false);
  const revealed = facilitatorMode && (revealedState || printForce);
  const optionCls = (opt) => {
    const base = "text-left rounded-lg border p-3 text-sm flex-1 leading-snug focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400";
    if (!revealed) return `${base} ${choice === opt ? "border-sky-400 bg-sky-50" : "border-slate-200 bg-white hover:bg-slate-50"}`;
    if (opt === ex.correctOption) return `${base} border-emerald-400 bg-emerald-50`;
    if (choice === opt) return `${base} border-red-400 bg-red-50`;
    return `${base} border-slate-200 bg-white opacity-60`;
  };
  return (
    <div className={levelCardCls}>
      <LevelBadge level={4}>Level 4 · Discrimination</LevelBadge>
      <ExerciseBrief>{ex.instructions || DEFAULT_INSTRUCTIONS[4]}</ExerciseBrief>
      {ex.scenario && <p className="text-sm text-slate-600 leading-snug">{ex.scenario}</p>}
      <div className="flex flex-col sm:flex-row gap-2">
        <button type="button" onClick={() => !revealed && setChoice("A")} className={optionCls("A")}>{ex.optionA}</button>
        <button type="button" onClick={() => !revealed && setChoice("B")} className={optionCls("B")}>{ex.optionB}</button>
      </div>
      <textarea
        value={justification}
        onChange={(e) => setJustification(e.target.value)}
        rows={2}
        placeholder="Justify the choice — the justification is what's marked, not the pick itself…"
        className={textareaCls}
      />
      {facilitatorMode && (
        <button type="button" onClick={() => setRevealed((r) => !r)} disabled={!choice} className={`${revealBtnCls} print:hidden`}>
          {revealed ? "Hide answer" : "Reveal answer"}
        </button>
      )}
      {revealed && <div className={answerBoxCls}>{ex.explanation}</div>}
    </div>
  );
}

function Training({ data }) {
  // Print always renders every pain expanded (same pattern as RfiSection /
  // StakeholderCard) — otherwise a printed handout would only ever show the
  // first pain's exercises, since `open` starts at a single index.
  const forceOpen = useContext(PrintForceOpenContext);
  const facilitatorMode = useContext(FacilitatorModeContext);
  const [open, setOpen] = useState(0);
  const painsWithExercises = (data.pains || [])
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.exercises);

  return (
    <div className="space-y-4">
      <SectionTitle
        icon={GraduationCap}
        sub={`Level 1-4 exercises for Essential Solution Training participants · ${facilitatorMode ? "Facilitator view (answers available)" : "Participant view (answers hidden)"}`}
      >
        Training
      </SectionTitle>

      {painsWithExercises.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
          This case has no training exercises attached.
        </div>
      ) : (
        painsWithExercises.map(({ p, i }, k) => {
          const isOpen = open === k || forceOpen;
          return (
            <div key={i} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
              <button
                onClick={() => setOpen(isOpen ? -1 : k)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              >
                {isOpen ? <ChevronDown size={16} className="text-slate-400 shrink-0" /> : <ChevronRight size={16} className="text-slate-400 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-900 text-sm">P{i + 1} — {p.title}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{p.category} · Owner: {p.owner}</div>
                </div>
              </button>
              {isOpen && (
                <div className="px-4 pb-4 space-y-3">
                  {p.exercises.level1 && <Level1Matching ex={p.exercises.level1} />}
                  {p.exercises.level2 && <Level2Derivation ex={p.exercises.level2} />}
                  {p.exercises.level3 && (
                    <Level3Diagnosis ex={p.exercises.level3} painDescription={p.painDescription} causes={p.causes} />
                  )}
                  {p.exercises.level4 && <Level4Discrimination ex={p.exercises.level4} />}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

/* ---------- Vision ---------- */
function Vision({ data }) {
  const v = data.vision || {};
  return (
    <div className="space-y-4">
      <SectionTitle icon={Eye} sub="How the customer sees themselves using the capabilities — played back, not told">
        Customer Vision
      </SectionTitle>
      <div className="grid md:grid-cols-2 gap-3">
        {(v.items || []).map((it, i) => (
          <div key={i} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: ACCENT }}>
                {i + 1}
              </div>
              <div>
                <div className="font-semibold text-slate-900 text-sm">{it.title}<SrcChip src={it.src} /></div>
                <div className="text-sm text-slate-600 mt-1 leading-snug">{it.detail}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
      {v.playback && (
        <div className="rounded-lg border-l-4 bg-sky-50 p-4 text-sm text-slate-700 italic" style={{ borderColor: ACCENT }}>
          <span className="not-italic text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: ACCENT }}>
            Vision playback line
          </span>
          “{v.playback}”
        </div>
      )}
    </div>
  );
}

/* ---------- Value ---------- */
function Value({ data }) {
  const v = data.value || {};
  const iavc = [
    { k: "issue", label: "Issue", cls: "text-rose-700 bg-rose-50" },
    { k: "action", label: "Action", cls: "text-sky-700 bg-sky-50" },
    { k: "value", label: "Value", cls: "text-emerald-700 bg-emerald-50" },
    { k: "check", label: "Check", cls: "text-violet-700 bg-violet-50" },
  ];
  return (
    <div className="space-y-6">
      <SectionTitle icon={TrendingUp} sub="Collaborated on, proven, and measured over time">
        Customer Value
      </SectionTitle>

      <div className="rounded-lg border border-slate-200 bg-white p-4 overflow-x-auto">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Quantified value drivers</div>
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
              <th className="py-2 pr-3 font-semibold">Metric / KPI</th>
              <th className="py-2 pr-3 font-semibold">Baseline</th>
              <th className="py-2 pr-3 font-semibold">Target</th>
              <th className="py-2 font-semibold">$ Impact</th>
            </tr>
          </thead>
          <tbody>
            {(v.drivers || []).map((d, i) => (
              <tr key={i} className="border-b border-slate-50 last:border-0 align-top">
                <td className="py-2 pr-3 font-medium text-slate-800">{d.metric}<SrcChip src={d.src} /></td>
                <td className="py-2 pr-3 text-slate-600">{d.baseline}</td>
                <td className="py-2 pr-3 text-slate-600">{d.target}</td>
                <td className="py-2 font-medium" style={{ color: "#0f766e" }}>{d.impact}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
          Value statements — Issue · Action · Value · Check
        </div>
        <div className="grid lg:grid-cols-3 gap-3">
          {(v.statements || []).map((s, i) => (
            <div key={i} className="rounded-lg border border-slate-200 bg-white p-4 space-y-2">
              <div className="font-semibold text-slate-900 text-sm mb-1">{s.name}</div>
              {iavc.map(({ k, label, cls }) => (
                <div key={k}>
                  <span className={`text-[10px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 ${cls}`}>{label}</span>
                  <p className="text-[13px] text-slate-600 mt-1 leading-snug">{s[k]}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Consensus ---------- */
function Consensus({ data }) {
  const c = data.consensus || {};
  const phaseCls = {
    Solution: "bg-sky-50 text-sky-700",
    Transition: "bg-violet-50 text-violet-700",
    Financial: "bg-emerald-50 text-emerald-700",
  };
  return (
    <div className="space-y-4">
      <SectionTitle icon={ClipboardCheck} sub="Collaboration plan · cocreated with Power across Solution, Transition and Financial">
        Consensus
      </SectionTitle>

      {c.summary && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">{c.summary}</div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4 overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
              <th className="py-2 pr-3 font-semibold">Event</th>
              <th className="py-2 pr-3 font-semibold">Phase</th>
              <th className="py-2 pr-3 font-semibold">Week of</th>
              <th className="py-2 pr-3 font-semibold">Responsible</th>
              <th className="py-2 font-semibold">Go/No-Go</th>
            </tr>
          </thead>
          <tbody>
            {(c.events || []).map((e, i) => (
              <tr key={i} className="border-b border-slate-50 last:border-0 align-top">
                <td className="py-2 pr-3 font-medium text-slate-800">{e.event}<SrcChip src={e.src} /></td>
                <td className="py-2 pr-3">
                  <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${phaseCls[e.phase] || "bg-slate-100 text-slate-600"}`}>
                    {e.phase}
                  </span>
                </td>
                <td className="py-2 pr-3 text-slate-600">{e.weekOf}</td>
                <td className="py-2 pr-3 text-slate-600">{e.responsible}</td>
                <td className="py-2">
                  {e.goNoGo && (
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700">
                      <Flag size={10} /> Go/No-Go
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Value Grid ---------- */
function quadrantOf(cv, uq) {
  if (uq >= 5) return cv >= 5 ? "Differentiators" : "Cool stuff";
  return cv >= 5 ? "Core" : "Trivial";
}

function quadrantReason(actual, d) {
  const u = d.uniqueness, v = d.customerValue;
  switch (actual) {
    case "Differentiators":
      return `High uniqueness (${u}/10) and high customer value (${v}/10) — this is a capability to lead with.`;
    case "Cool stuff":
      return `High uniqueness (${u}/10) but limited customer value here (${v}/10) — impressive, but it won't move this deal.`;
    case "Core":
      return `High customer value (${v}/10) but low uniqueness (${u}/10) — expected table stakes, not a differentiator.`;
    default:
      return `Low uniqueness (${u}/10) and low customer value (${v}/10) for this deal — not worth leading with.`;
  }
}

function ValueGrid({ items }) {
  const pts = (items || []).filter((d) => typeof d.uniqueness === "number" && typeof d.customerValue === "number");
  const svgRef = useRef(null);
  const [order] = useState(() => shuffleArray(pts.map((_, i) => i)));
  const [placed, setPlaced] = useState({});
  const [checked, setChecked] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);

  if (pts.length === 0) return null;

  const left = 46, right = 314, top = 14, bottom = 240, trayY = 300;
  const x = (cv) => left + (Math.max(0, Math.min(10, cv)) / 10) * (right - left);
  const y = (uq) => bottom - (Math.max(0, Math.min(10, uq)) / 10) * (bottom - top);
  const invCv = (px) => Math.max(0, Math.min(10, ((px - left) / (right - left)) * 10));
  const invUq = (px) => Math.max(0, Math.min(10, ((bottom - px) / (bottom - top)) * 10));
  const midX = (left + right) / 2;
  const midY = (top + bottom) / 2;

  const quadrants = [
    { label: "Cool stuff", x: left + 4, y: top + 14, anchor: "start" },
    { label: "Differentiators", x: right - 4, y: top + 14, anchor: "end" },
    { label: "Trivial", x: left + 4, y: bottom - 6, anchor: "start" },
    { label: "Core", x: right - 4, y: bottom - 6, anchor: "end" },
  ];

  const clientToPlot = (clientX, clientY) => {
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: left, y: bottom };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: Math.max(left, Math.min(right, p.x)), y: Math.max(top, Math.min(bottom, p.y)) };
  };

  const onDown = (i) => (e) => {
    if (checked) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setPlaced((prev) => ({ ...prev, [i]: clientToPlot(e.clientX, e.clientY) }));
    setDragIdx(i);
  };
  const onMove = (e) => {
    if (dragIdx === null || checked) return;
    setPlaced((prev) => ({ ...prev, [dragIdx]: clientToPlot(e.clientX, e.clientY) }));
  };
  const onUp = () => setDragIdx(null);

  const trayItems = order.filter((i) => placed[i] === undefined);
  const score = pts.reduce((s, d, i) => {
    const g = placed[i];
    if (!g) return s;
    return s + (quadrantOf(invCv(g.x), invUq(g.y)) === quadrantOf(d.customerValue, d.uniqueness) ? 1 : 0);
  }, 0);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Value Grid — uniqueness vs. customer value</div>
      <p className="text-[11px] text-slate-500 mb-2">Drag each capability onto the grid where you think it belongs, then check.</p>
      <svg
        ref={svgRef}
        viewBox="0 0 340 320"
        className="w-full max-w-md mx-auto touch-none select-none"
        role="img"
        aria-label="Drag each capability onto the grid by uniqueness and customer value"
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <rect x={left} y={top} width={right - left} height={bottom - top} fill="#f8fafc" stroke="#e2e8f0" />
        <line x1={midX} y1={top} x2={midX} y2={bottom} stroke="#e2e8f0" strokeWidth="1" />
        <line x1={left} y1={midY} x2={right} y2={midY} stroke="#e2e8f0" strokeWidth="1" />
        {quadrants.map((q, i) => (
          <text key={i} x={q.x} y={q.y} textAnchor={q.anchor} className="fill-slate-400" style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {q.label}
          </text>
        ))}
        <text x={(left + right) / 2} y={bottom + 22} textAnchor="middle" className="fill-slate-500" style={{ fontSize: 10, fontWeight: 600 }}>
          Customer value →
        </text>
        <text x={left - 34} y={(top + bottom) / 2} textAnchor="middle" className="fill-slate-500" style={{ fontSize: 10, fontWeight: 600 }} transform={`rotate(-90 ${left - 34} ${(top + bottom) / 2})`}>
          Uniqueness →
        </text>

        {checked && pts.map((d, i) => {
          const cx = x(d.customerValue), cy = y(d.uniqueness);
          const g = placed[i];
          return (
            <g key={"answer" + i}>
              {g && <line x1={g.x} y1={g.y} x2={cx} y2={cy} stroke="#94a3b8" strokeWidth="1" strokeDasharray="3,3" />}
              <circle cx={cx} cy={cy} r={9} fill="#fff" stroke={ACCENT} strokeWidth="2" strokeDasharray="2,2" />
            </g>
          );
        })}

        {pts.map((d, i) => {
          const g = placed[i];
          if (!g) return null;
          const isCorrect = checked && quadrantOf(invCv(g.x), invUq(g.y)) === quadrantOf(d.customerValue, d.uniqueness);
          const ring = checked ? (isCorrect ? "#059669" : "#dc2626") : "#fff";
          return (
            <g key={"guess" + i} onPointerDown={onDown(i)} style={{ cursor: checked ? "default" : "grab" }}>
              <circle cx={g.x} cy={g.y} r={10} fill={ACCENT} stroke={ring} strokeWidth={2.5} />
              <text x={g.x} y={g.y} textAnchor="middle" dominantBaseline="central" className="fill-white" style={{ fontSize: 10, fontWeight: 700 }}>
                {i + 1}
              </text>
            </g>
          );
        })}

        {trayItems.map((i, k) => {
          const cx = left + (k + 0.5) * ((right - left) / Math.max(trayItems.length, 4));
          return (
            <g key={"tray" + i} onPointerDown={onDown(i)} style={{ cursor: "grab" }}>
              <circle cx={cx} cy={trayY} r={10} fill="#fff" stroke={ACCENT} strokeWidth={2} strokeDasharray="3,2" />
              <text x={cx} y={trayY} textAnchor="middle" dominantBaseline="central" style={{ fontSize: 10, fontWeight: 700, fill: ACCENT }}>
                {i + 1}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center mt-2">
        {pts.map((d, i) => (
          <span key={i} className="text-[11px] text-slate-500">
            <span className="font-bold" style={{ color: ACCENT }}>{i + 1}</span> {d.title}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-slate-100">
        <button
          type="button"
          onClick={() => setChecked(true)}
          disabled={checked}
          className="rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          style={{ background: ACCENT }}
        >
          Check placement
        </button>
        <button
          type="button"
          onClick={() => { setPlaced({}); setChecked(false); }}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold border border-slate-300 text-slate-600 hover:bg-slate-50"
        >
          <RotateCcw size={12} /> Reset
        </button>
        {!checked && (
          <button type="button" onClick={() => setChecked(true)} className={revealBtnCls}>
            Show correct positions
          </button>
        )}
        {checked && <span className="text-xs font-semibold text-slate-600">{score}/{pts.length} correct quadrant</span>}
      </div>
      {checked && (
        <ul className="mt-2 space-y-0.5">
          {pts.map((d, i) => {
            const g = placed[i];
            const actual = quadrantOf(d.customerValue, d.uniqueness);
            const guessed = g ? quadrantOf(invCv(g.x), invUq(g.y)) : null;
            const ok = guessed === actual;
            return (
              <li key={i} className="text-[11px] text-slate-500">
                <span className="font-bold" style={{ color: ok ? "#059669" : "#dc2626" }}>{i + 1}.</span>{" "}
                {guessed ? (ok ? `${actual} — correct` : `You placed it in ${guessed} — it's actually ${actual}.`) : `Not placed — it's ${actual}.`}
                {!ok && <span className="block pl-4 text-slate-400">{quadrantReason(actual, d)}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Picks 4 indices from the pool for the Value Grid game. When the pool has
// "Cool stuff" items (unique-sounding but low customer value for this case),
// deliberately includes 1-2 of them as traps — a rep who reflexively leads
// with the flashiest-sounding capability should get caught misclassifying it.
function pickSet(pool) {
  const idx = pool.map((_, i) => i);
  if (idx.length <= 4) return idx;
  const cool = idx.filter((i) => {
    const d = pool[i];
    return (
      typeof d.uniqueness === "number" &&
      typeof d.customerValue === "number" &&
      quadrantOf(d.customerValue, d.uniqueness) === "Cool stuff"
    );
  });
  const rest = idx.filter((i) => !cool.includes(i));
  const trapCount = Math.min(cool.length, Math.random() < 0.5 ? 1 : 2);
  const traps = shuffleArray(cool).slice(0, trapCount);
  const fillers = shuffleArray(rest).slice(0, 4 - traps.length);
  return shuffleArray([...traps, ...fillers]);
}

/* ---------- Competitive ---------- */
function Competitive({ data }) {
  const c = data.competitive || {};
  const pool = [...(c.differentiators || []), ...(c.differentiatorPool || [])];
  const [activeIdx, setActiveIdx] = useState(() => pickSet(pool));

  useEffect(() => {
    setActiveIdx(pickSet(pool));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.differentiators, c.differentiatorPool]);

  const reroll = () => {
    if (pool.length <= 4) return;
    const current = activeIdx.slice().sort().join(",");
    let next = activeIdx;
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = pickSet(pool);
      if (candidate.slice().sort().join(",") !== current) {
        next = candidate;
        break;
      }
    }
    setActiveIdx(next);
  };

  const activeItems = activeIdx
    .map((i) => pool[i])
    .filter(Boolean)
    .slice()
    .sort((a, b) => (b.uniqueness + b.customerValue) - (a.uniqueness + a.customerValue));

  return (
    <div className="space-y-6">
      <SectionTitle icon={Swords} sub={`vs. ${data.meta?.competitor || "competition"} · lead with unique value, prove parity elsewhere`}>
        Competitive Positioning
      </SectionTitle>

      {c.narrative && (
        <div className="rounded-lg border border-slate-300 bg-slate-50 p-4 text-sm text-slate-700">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Anticipated competitor narrative</div>
          {c.narrative}
        </div>
      )}

      <ValueGrid key={activeItems.map((d) => d.title).join("|")} items={activeItems} />

      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Lightbulb size={15} style={{ color: ACCENT }} />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Lead with — high value + unique</span>
          </div>
          {pool.length > 4 && (
            <button
              type="button"
              onClick={reroll}
              className="flex items-center gap-1.5 text-xs font-semibold rounded-md px-2.5 py-1.5 border border-slate-300 text-slate-600 hover:bg-slate-50"
              title="Load a different set of 4 capabilities for this case"
            >
              <Dices size={13} /> New set
            </button>
          )}
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          {activeItems.map((d, i) => (
            <div key={i} className="rounded-lg border bg-white p-4" style={{ borderColor: i === 0 ? ACCENT : "#e2e8f0", borderWidth: i === 0 ? 2 : 1 }}>
              <div className="font-semibold text-slate-900 text-sm">
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-[10px] font-bold mr-1.5 align-middle" style={{ background: ACCENT }}>{i + 1}</span>
                {d.title}
                {i === 0 && (
                  <span className="ml-2 rounded-full text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 text-white" style={{ background: ACCENT }}>
                    demo centerpiece
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-600 mt-1 leading-snug">{d.detail}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-2">
          <Target size={15} className="text-slate-500" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Prove parity — high value, contested</span>
        </div>
        <ul className="space-y-2">
          {(c.parity || []).map((p, i) => (
            <li key={i} className="flex gap-2 text-sm text-slate-700"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-slate-400" />{p}</li>
          ))}
        </ul>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare size={15} className="text-slate-500" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Objection handling — Acknowledge · Question · Position · Check
          </span>
        </div>
        <div className="grid lg:grid-cols-2 gap-3">
          {(c.objections || []).map((o, i) => (
            <div key={i} className="rounded-lg border border-slate-200 bg-white p-4 space-y-2">
              <div className="font-semibold text-slate-900 text-sm">“{o.objection}”</div>
              {["acknowledge", "question", "position", "check"].map((k) => (
                <div key={k} className="text-[13px] leading-snug">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">{k}</span>
                  <span className="text-slate-600">{o[k]}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="flex items-center gap-2 mb-2">
          <ShieldAlert size={15} className="text-red-600" />
          <span className="text-xs font-semibold uppercase tracking-wider text-red-600">Red flags — Health Check discipline</span>
        </div>
        <ul className="space-y-2">
          {(c.redFlags || []).map((r, i) => <li key={i} className="text-sm text-red-900/80 leading-snug">• {r}</li>)}
        </ul>
      </div>
    </div>
  );
}

/* ---------- Health Check ---------- */
const HEALTH_VITALS = [
  { key: "pain", label: "Pain" },
  { key: "power", label: "Power" },
  { key: "vision", label: "Vision" },
  { key: "value", label: "Value" },
  { key: "consensus", label: "Consensus" },
];

function HealthMeter({ score }) {
  const s = Math.max(0, Math.min(6, score || 0));
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="w-5 h-2.5 rounded-sm"
            style={{ background: i < s ? ACCENT : "#e2e8f0" }}
          />
        ))}
      </div>
      <span className="text-sm font-bold text-slate-800 tabular-nums">{s}/6</span>
    </div>
  );
}

function HealthCheck({ data, onRerun, rerunning, rerunError }) {
  const hc = data.healthCheck || {};
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <SectionTitle icon={Gauge} sub="Opportunity Health Check · scored only on what this document evidences about the sales process">
          Health Check
        </SectionTitle>
        {onRerun && (
          <button
            onClick={onRerun}
            disabled={rerunning}
            className="flex items-center gap-1.5 text-xs font-semibold rounded-md px-2.5 py-1.5 text-white disabled:opacity-60 shrink-0"
            style={{ background: ACCENT }}
            title="Re-score the Health Check against the case as it stands now, including any edits"
          >
            {rerunning ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
            {rerunning ? "Re-running…" : "Re-run Health Check"}
          </button>
        )}
      </div>

      {rerunError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 leading-relaxed">
          {rerunError}
        </div>
      )}

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 leading-relaxed">
        A case briefing rarely documents live deal history — low scores here are expected and reflect the document, not a judgment on the opportunity. Use this to spot what to go verify with the customer.
      </div>

      <div className="space-y-3">
        {HEALTH_VITALS.map(({ key, label }) => {
          const v = hc[key] || {};
          return (
            <div key={key} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <span className="font-semibold text-slate-900 text-sm w-24 shrink-0">{label}</span>
                <HealthMeter score={v.score} />
              </div>
              {v.rationale && <p className="text-sm text-slate-600 mt-2 leading-snug">{v.rationale}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Upload screen ---------- */
function UploadScreen({ onFile, onText, onImport, busy, progress, streamProgress, error, library, onOpen, onDelete, libLoading }) {
  const inputRef = useRef(null);
  const importRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [text, setText] = useState("");
  const [confirmDel, setConfirmDel] = useState(null);

  const handleFiles = (files) => {
    const f = files?.[0];
    if (f && f.type === "application/pdf") onFile(f);
  };

  const fmtDate = (iso) => {
    try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
    catch { return ""; }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: DARK }}>
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] mb-3" style={{ color: ACCENT }}>
            <Sparkles size={12} /> Growth Activator
          </div>
          <h1 className="font-display text-4xl font-bold text-white tracking-tight">Case Analyzer</h1>
          <p className="text-slate-400 text-sm mt-3 leading-relaxed">
            Drop a customer case PDF and get a Growth Activator briefing: pain
            chains, vision, quantified value, competitive positioning and an
            opportunity health check.
          </p>
        </div>

        {busy ? (
          <AnalysisProgress phase={progress} streamProgress={streamProgress} />
        ) : pasteMode ? (
          <div className="rounded-xl bg-white/5 border border-white/10 p-4">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste the case text here…"
              rows={8}
              className="w-full rounded-lg bg-white/5 border border-white/10 p-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400 resize-y"
            />
            <div className="flex items-center justify-between mt-3">
              <button
                onClick={() => setPasteMode(false)}
                className="text-xs font-medium text-slate-400 hover:text-white"
              >
                ← Back to upload
              </button>
              <button
                onClick={() => text.trim().length > 40 && onText(text.trim())}
                disabled={text.trim().length <= 40}
                className="text-xs font-semibold rounded-md px-3.5 py-2 text-white disabled:opacity-40"
                style={{ background: ACCENT }}
              >
                Analyze text
              </button>
            </div>
          </div>
        ) : (
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
            onClick={() => inputRef.current?.click()}
            className={`rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition ${
              drag ? "bg-white/10" : "bg-white/5 hover:bg-white/[0.07]"
            }`}
            style={{ borderColor: drag ? ACCENT : "rgba(255,255,255,0.15)" }}
          >
            <Upload size={26} className="mx-auto mb-3" style={{ color: ACCENT }} />
            <div className="text-white font-medium text-sm">Drop the case PDF here</div>
            <div className="text-slate-500 text-xs mt-1">or click to browse</div>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>
        )}

        {!busy && !pasteMode && (
          <div className="mt-3 flex items-center justify-center gap-5">
            <button
              onClick={() => setPasteMode(true)}
              className="text-xs font-medium text-slate-400 hover:text-white"
            >
              or paste the case text instead →
            </button>
            <button
              onClick={() => importRef.current?.click()}
              className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-white"
            >
              <FileUp size={12} /> import a case export (.json)
            </button>
            <input
              ref={importRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ""; }}
            />
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/30 p-3 flex gap-2 text-sm text-red-200">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span className="break-words whitespace-pre-wrap font-mono text-xs leading-relaxed">{error}</span>
          </div>
        )}

        {/* Shared case library */}
        {!busy && !pasteMode && (
          <div className="mt-8">
            <div className="flex items-center gap-2 mb-3">
              <FolderOpen size={14} className="text-slate-400" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Saved cases</span>
              <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                <Users2 size={11} /> shared with your team
              </span>
            </div>

            {libLoading ? (
              <div className="flex items-center gap-2 text-xs text-slate-500 py-3">
                <Loader2 size={13} className="animate-spin" /> Loading library…
              </div>
            ) : library.length === 0 ? (
              <p className="text-xs text-slate-600 py-3">No saved cases yet. Analyze one and hit “Save” to add it here.</p>
            ) : (
              <div className="space-y-1.5">
                {library.map((e) => (
                  <div key={e.id} className="group flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/[0.08] transition">
                    <button onClick={() => onOpen(e.id)} className="flex-1 flex items-center gap-3 px-3 py-2.5 text-left min-w-0">
                      <Building2 size={14} className="shrink-0" style={{ color: ACCENT }} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white truncate">{e.customer}</div>
                        <div className="text-[11px] text-slate-500 truncate">{e.industry}{e.industry && " · "}{fmtDate(e.date)}</div>
                      </div>
                    </button>
                    {confirmDel === e.id ? (
                      <div className="flex items-center gap-1 pr-2 shrink-0">
                        <button onClick={() => { onDelete(e.id); setConfirmDel(null); }} className="text-[11px] font-semibold text-red-300 hover:text-red-200 px-1.5 py-1">Delete</button>
                        <button onClick={() => setConfirmDel(null)} className="text-[11px] text-slate-400 hover:text-white px-1.5 py-1">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDel(e.id)} className="opacity-0 group-hover:opacity-100 transition text-slate-500 hover:text-red-300 pr-3 shrink-0" title="Delete (visible to whole team)">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="text-center text-[11px] text-slate-600 mt-6 leading-relaxed">
          Fields the document doesn't contain are auto-completed from context and flagged
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100/90 text-amber-800 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 mx-1 align-middle">
            <Flag size={8} /> inferred
          </span>
          — validate them with the customer.
        </p>
      </div>
    </div>
  );
}

/* ---------- App ---------- */
const TABS = [
  { id: "overview", label: "Case Overview", icon: Building2, comp: Overview },
  { id: "solution", label: "Solution", icon: Layers, comp: Solution },
  { id: "pain", label: "Pain", icon: AlertTriangle, comp: Pain },
  { id: "vision", label: "Vision", icon: Eye, comp: Vision },
  { id: "value", label: "Value", icon: TrendingUp, comp: Value },
  { id: "consensus", label: "Consensus", icon: ClipboardCheck, comp: Consensus },
  { id: "competitive", label: "Competitive", icon: Swords, comp: Competitive },
  { id: "healthcheck", label: "Health Check", icon: Gauge, comp: HealthCheck },
  { id: "training", label: "Training", icon: GraduationCap, comp: Training },
];

// The Training tab only makes sense for cases that carry EST exercise content
// (added by hand to pains[].exercises, never by the extraction prompt) — real
// customer cases never populate it, so it stays out of the nav and print output.
// Consensus is temporarily hidden (not in use yet) but kept in source in case
// it gets reinstated later.
const visibleTabs = (cf) =>
  TABS.filter((t) => t.id !== "consensus").filter(
    (t) => t.id !== "training" || (cf.pains || []).some((p) => p.exercises)
  );

// Print-only view: every tab rendered full-length, one per printed page, in
// the exact same components/styling as the on-screen tabs — this is what
// "Print / Save as PDF" outputs, kept separate from the interactive screen
// view (which only mounts the active tab).
function PrintDeck({ caseFile }) {
  const m = caseFile.meta || {};
  return (
    <div className="print-only">
      <PrintForceOpenContext.Provider value={true}>
        {visibleTabs(caseFile).map((t) => (
          <section key={t.id} className="print-tab">
            <div className="print-tab-header">
              <span>Growth Activator · Case Briefing</span>
              <span>{[m.customer, t.label].filter(Boolean).join(" — ")}</span>
            </div>
            <t.comp data={caseFile} />
          </section>
        ))}
      </PrintForceOpenContext.Provider>
    </div>
  );
}

/* ---------- Analysis progress ---------- */
function AnalysisProgress({ phase, streamProgress }) {
  const [now, setNow] = useState(Date.now());
  const startRef = useRef(Date.now());
  const phase1Ref = useRef(null);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (phase >= 1 && phase1Ref.current === null) phase1Ref.current = Date.now();

  const elapsed = Math.max(0, Math.floor((now - startRef.current) / 1000));
  let pct, stage;
  if (phase === 0) {
    pct = Math.min(4, elapsed + 1);
    stage = "Extracting text from the PDF";
  } else if (streamProgress?.chars > 0) {
    // Real progress from the growing JSON the model is streaming back,
    // forwarded live from the backend — no more guessing from elapsed time.
    pct = Math.min(99, Math.round(5 + 94 * (streamProgress.chars / streamProgress.expectedChars)));
    stage =
      pct < 20 ? "Reading the case & identifying the vertical" :
      pct < 40 ? "Mapping stakeholders & building pain chains" :
      pct < 60 ? "Quantifying value & drafting the collaboration plan" :
      pct < 80 ? "Competitive positioning & opportunity health check" :
      "Assembling the briefing";
  } else {
    // Before the first streamed token count arrives, fall back to an
    // elapsed-time estimate (asymptotic toward the point streaming takes over).
    const t1 = Math.max(0, (now - (phase1Ref.current ?? now)) / 1000);
    pct = Math.min(15, Math.round(5 + 10 * (1 - Math.exp(-t1 / 20))));
    stage = "Sending the case to Claude";
  }
  const mm = Math.floor(elapsed / 60);
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-6">
      <div className="flex items-center gap-3 mb-4">
        <Loader2 size={18} className="animate-spin shrink-0" style={{ color: ACCENT }} />
        <span className="text-white font-medium text-sm flex-1">Analyzing the case…</span>
        <span className="font-display text-2xl font-bold text-white tabular-nums">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000 ease-linear"
          style={{ width: `${pct}%`, background: ACCENT }}
        />
      </div>
      <div className="flex items-center justify-between mt-3 text-xs">
        <span className="text-slate-300">{stage}</span>
        <span className="text-slate-500 tabular-nums shrink-0 ml-3">{mm}:{ss}</span>
      </div>
    </div>
  );
}

/* ---------- Edit mode ---------- */
const EDIT_ACCENT = "#d97706";

const TAB_EDIT_KEYS = {
  overview: ["meta", "overview", "rfi", "discovery", "stakeholders"],
  solution: ["solution"],
  pain: ["painHeadline", "pains"],
  vision: ["vision"],
  value: ["value"],
  consensus: ["consensus"],
  competitive: ["competitive"],
  healthcheck: ["healthCheck"],
  training: ["pains"],
};

function setAtPath(obj, path, value) {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  const clone = Array.isArray(obj) ? [...obj] : { ...obj };
  clone[head] = setAtPath(obj?.[head], rest, value);
  return clone;
}

const deepClone = (x) => JSON.parse(JSON.stringify(x));

// Build an empty item shaped like an existing one, so "Add" keeps the schema
// intact: strings blank, numbers 0, booleans false, and provenance defaults to
// "inferred" (a trainer-added field is not from the source doc).
function blankLike(sample) {
  if (Array.isArray(sample)) return [];
  if (sample !== null && typeof sample === "object") {
    const out = {};
    for (const [k, v] of Object.entries(sample)) {
      out[k] = k === "src" ? "inferred" : blankLike(v);
    }
    return out;
  }
  if (typeof sample === "number") return 0;
  if (typeof sample === "boolean") return false;
  return "";
}

const prettyKey = (k) =>
  String(k)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());

function EditField({ label, value, path, onChange }) {
  if (typeof value === "boolean") {
    return (
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(path, e.target.checked)}
          className="accent-amber-500"
        />
        {label}
      </label>
    );
  }
  if (typeof value === "number") {
    return (
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">{label}</div>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(path, Number(e.target.value))}
          className="w-24 rounded border border-amber-300 bg-amber-50/60 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
      </div>
    );
  }
  const text = value == null ? "" : String(value);
  const rows = Math.min(6, Math.max(1, Math.ceil(text.length / 90)));
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">{label}</div>
      <textarea
        value={text}
        rows={rows}
        onChange={(e) => onChange(path, e.target.value)}
        className="w-full rounded border border-amber-300 bg-amber-50/60 px-2 py-1.5 text-sm leading-snug resize-y focus:outline-none focus:ring-2 focus:ring-amber-400"
      />
    </div>
  );
}

// An item is "blank" when it equals its own blanked shape — i.e. the trainer
// added it but never typed anything. Those delete without a confirm; items with
// real content require a two-step confirm so nothing is lost by a stray click.
const isBlankItem = (item) => JSON.stringify(item) === JSON.stringify(blankLike(item));

function ArrayEditor({ label, value, path, onChange, depth }) {
  const [confirmIdx, setConfirmIdx] = useState(null);
  const mutate = (next) => { setConfirmIdx(null); onChange(path, next); };
  const addItem = () => mutate([...value, blankLike(value.length ? value[value.length - 1] : "")]);
  const removeItem = (i) => mutate(value.filter((_, j) => j !== i));
  const duplicateItem = (i) => {
    const next = [...value];
    next.splice(i + 1, 0, deepClone(value[i]));
    mutate(next);
  };
  const moveItem = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    mutate(next);
  };
  const requestDelete = (i) => (isBlankItem(value[i]) ? removeItem(i) : setConfirmIdx(i));

  const itemControls = (i) =>
    confirmIdx === i ? (
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-[10px] font-bold uppercase tracking-wider text-red-600">Delete?</span>
        <button type="button" aria-label="Confirm delete" onClick={() => removeItem(i)}
          className="rounded bg-red-500 px-1.5 py-0.5 text-[11px] font-semibold text-white hover:bg-red-600">Yes</button>
        <button type="button" aria-label="Cancel delete" onClick={() => setConfirmIdx(null)}
          className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100">No</button>
      </div>
    ) : (
      <div className="flex items-center gap-0.5 shrink-0">
        <button type="button" aria-label="Move up" title="Move up" disabled={i === 0} onClick={() => moveItem(i, -1)}
          className="rounded p-1 text-amber-600 hover:bg-amber-100 disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronUp size={14} />
        </button>
        <button type="button" aria-label="Move down" title="Move down" disabled={i === value.length - 1} onClick={() => moveItem(i, 1)}
          className="rounded p-1 text-amber-600 hover:bg-amber-100 disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronDown size={14} />
        </button>
        <button type="button" aria-label="Duplicate" title="Duplicate" onClick={() => duplicateItem(i)}
          className="rounded p-1 text-amber-600 hover:bg-amber-100">
          <Copy size={13} />
        </button>
        <button type="button" aria-label="Delete" title="Delete" onClick={() => requestDelete(i)}
          className="rounded p-1 text-red-500 hover:bg-red-50">
          <Trash2 size={13} />
        </button>
      </div>
    );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
          {label}
          {value.length > 0 && <span className="ml-1 text-amber-400">({value.length})</span>}
        </div>
        <button type="button" onClick={addItem}
          className="flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-100">
          <Plus size={12} /> Add
        </button>
      </div>
      {value.length === 0 && (
        <div className="text-xs italic text-slate-400">No items yet — use Add to create one.</div>
      )}
      {value.map((item, i) =>
        item !== null && typeof item === "object" ? (
          <div key={i} className="rounded-lg border border-amber-200 bg-white p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600">
                {label} · {i + 1}
              </div>
              {itemControls(i)}
            </div>
            {Object.entries(item).map(([k, v]) => (
              <EditNode key={k} label={prettyKey(k)} value={v} path={[...path, i, k]} onChange={onChange} depth={depth + 1} />
            ))}
          </div>
        ) : (
          <div key={i} className="flex items-end gap-2">
            <div className="flex-1 min-w-0">
              <EditField label={`${label} · ${i + 1}`} value={item} path={[...path, i]} onChange={onChange} />
            </div>
            {itemControls(i)}
          </div>
        )
      )}
    </div>
  );
}

function EditNode({ label, value, path, onChange, depth = 0 }) {
  if (path[path.length - 1] === "src") {
    return (
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">{label}</div>
        <select
          value={value === "inferred" ? "inferred" : "doc"}
          onChange={(e) => onChange(path, e.target.value)}
          className="rounded border border-amber-300 bg-amber-50/60 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          <option value="doc">doc</option>
          <option value="inferred">inferred</option>
        </select>
      </div>
    );
  }
  if (value === null || value === undefined || typeof value !== "object") {
    return <EditField label={label} value={value} path={path} onChange={onChange} />;
  }
  if (Array.isArray(value)) {
    return <ArrayEditor label={label} value={value} path={path} onChange={onChange} depth={depth} />;
  }
  return (
    <div className={depth > 0 ? "rounded-lg border border-amber-100 bg-amber-50/30 p-2.5 space-y-2" : "space-y-2.5"}>
      {depth > 0 && (
        <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700">{label}</div>
      )}
      {Object.entries(value).map(([k, v]) => (
        <EditNode key={k} label={prettyKey(k)} value={v} path={[...path, k]} onChange={onChange} depth={depth + 1} />
      ))}
    </div>
  );
}

function TabEditor({ data, tabId, onChange }) {
  const keys = (TAB_EDIT_KEYS[tabId] || []).filter((k) => data[k] !== undefined);
  return (
    <div className="space-y-5">
      <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 flex items-start gap-2.5 text-sm text-amber-900">
        <Pencil size={16} className="shrink-0 mt-0.5 text-amber-600" />
        <span>
          <b>Edit mode is on.</b> Changes apply to the open case as you type — press <b>Save</b> in the
          header to persist them to the shared library, or toggle Edit off to review the result.
        </span>
      </div>
      {keys.map((k) => (
        <div
          key={k}
          className="rounded-lg border border-amber-300 bg-white p-4 space-y-3"
          style={{ borderLeftWidth: 4, borderLeftColor: EDIT_ACCENT }}
        >
          <div className="font-display text-base font-bold text-slate-900">{prettyKey(k)}</div>
          <EditNode label={prettyKey(k)} value={data[k]} path={[k]} onChange={onChange} depth={0} />
        </div>
      ))}
    </div>
  );
}

export default function CaseAnalyzer() {
  const [caseFile, setCaseFile] = useState(null);
  const [tab, setTab] = useState("overview");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [streamProgress, setStreamProgress] = useState(null);
  const [error, setError] = useState(null);

  const [library, setLibrary] = useState([]);
  const [libLoading, setLibLoading] = useState(true);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved
  const [editMode, setEditMode] = useState(false);
  const [facilitatorMode, setFacilitatorMode] = useState(false);
  const [hcBusy, setHcBusy] = useState(false);
  const [hcError, setHcError] = useState(null);

  const updateField = (path, value) => setCaseFile((prev) => setAtPath(prev, path, value));

  const handleRerunHealthCheck = async () => {
    setHcBusy(true);
    setHcError(null);
    try {
      const healthCheck = await rerunHealthCheck(caseFile);
      setCaseFile((prev) => ({ ...prev, healthCheck }));
    } catch (e) {
      setHcError(e?.message || String(e));
    } finally {
      setHcBusy(false);
    }
  };

  // Every entry point that hands the app a completed case (open from
  // library, import, or a fresh analysis) lands on the same screen state.
  const openCase = (cf) => {
    setCaseFile(cf);
    setTab("overview");
    setEditMode(false);
  };

  // Load the shared library once on mount.
  useEffect(() => {
    (async () => {
      setLibLoading(true);
      setLibrary(await loadIndex());
      setLibLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    if (!caseFile) return;
    setSaveState("saving");
    try {
      const next = await saveCase(caseFile);
      setLibrary(next);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch (e) {
      console.error(e);
      setSaveState("idle");
      setError("Could not save the case: " + (e?.message || String(e)));
    }
  };

  const handleOpen = async (id) => {
    setError(null);
    try {
      const cf = await fetchCase(id);
      if (cf) openCase(cf);
      else setError("That saved case could not be found (it may have been deleted by a teammate).");
    } catch (e) {
      setError("Could not open the case: " + (e?.message || String(e)));
    }
  };

  const handleDelete = async (id) => {
    try { setLibrary(await deleteCase(id)); } catch (e) { console.error(e); }
  };

  const handleImport = async (file) => {
    setError(null);
    try {
      const parsed = JSON.parse(await file.text());
      const cf = migrateCaseFile(parsed);
      openCase(cf);
    } catch (e) {
      setError("Import failed: " + (e?.message || String(e)));
    }
  };

  const analyzeText = async (caseText) => {
    setBusy(true);
    setError(null);
    setProgress(1);
    setStreamProgress(null);
    try {
      const result = await analyzeCase(caseText, setStreamProgress);
      setProgress(2);
      openCase(result);
    } catch (e) {
      console.error(e);
      setError("Analysis failed. " + (e?.message || String(e)));
    } finally {
      setBusy(false);
    }
  };

  const analyze = async (file) => {
    setBusy(true);
    setError(null);
    setProgress(0);
    setStreamProgress(null);
    try {
      // Step 1 — extract plain text locally (no tokens).
      let caseText;
      try {
        caseText = await extractPdfText(file);
      } catch (e) {
        throw new Error("PDF_READ: " + (e.message || "could not read the PDF") + ". Try the ‘paste text’ option below.");
      }
      if (!caseText || caseText.length < 40) {
        throw new Error(
          "No readable text found — this looks like a scanned/image PDF. Use the ‘paste text’ option below instead."
        );
      }
      // Step 2 — one Claude call.
      setProgress(1);
      const result = await analyzeCase(caseText, setStreamProgress);
      setProgress(2);
      openCase(result);
    } catch (e) {
      console.error(e);
      const msg = e?.message || String(e);
      if (msg.startsWith("No readable text")) {
        setError(msg);
      } else {
        setError("Analysis failed. " + msg);
      }
    } finally {
      setBusy(false);
    }
  };

  if (!caseFile) {
    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&display=swap');
          .font-display { font-family: 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif; }
        `}</style>
        <UploadScreen
          onFile={analyze} onText={analyzeText} onImport={handleImport} busy={busy} progress={progress}
          streamProgress={streamProgress} error={error}
          library={library} onOpen={handleOpen} onDelete={handleDelete} libLoading={libLoading}
        />
      </>
    );
  }

  const Active = TABS.find((t) => t.id === tab).comp;
  const m = caseFile.meta || {};

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&display=swap');
        .font-display { font-family: 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif; }

        .print-only { display: none; }
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .print-tab { break-before: page; padding: 0 6mm; }
          .print-tab:first-child { break-before: avoid; }
          .print-tab-header {
            display: flex; justify-content: space-between; align-items: baseline;
            font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8;
            border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 14px;
          }
        }
      `}</style>

      <FacilitatorModeContext.Provider value={facilitatorMode}>
      <div className="no-print min-h-screen bg-slate-100 font-sans text-slate-900">
      <header className="text-white" style={{ background: DARK }}>
        <div className="max-w-5xl mx-auto px-4 pt-5 pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: ACCENT }}>
                Growth Activator · Case Analyzer
              </div>
              <h1 className="font-display text-3xl font-bold tracking-tight mt-1">{m.customer}</h1>
              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs text-slate-300">
                {m.industry && <span>{m.industry}</span>}
                {m.stage && <span>· {m.stage}</span>}
                {m.competitor && <span>· vs. {m.competitor}</span>}
              </div>
              {m.docType && <div className="text-[11px] text-slate-400 mt-1">{m.docType}</div>}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setEditMode((v) => !v)}
                className={`flex items-center gap-1.5 text-xs font-semibold rounded-md px-2.5 py-1.5 ${
                  editMode ? "text-white" : "text-slate-300 hover:text-white hover:bg-white/10"
                }`}
                style={editMode ? { background: EDIT_ACCENT } : undefined}
              >
                <Pencil size={13} /> {editMode ? "Editing" : "Edit"}
              </button>
              <button
                onClick={handleSave}
                disabled={saveState === "saving"}
                className="flex items-center gap-1.5 text-xs font-semibold rounded-md px-2.5 py-1.5 text-white disabled:opacity-60"
                style={{ background: saveState === "saved" ? "#059669" : ACCENT }}
              >
                {saveState === "saving" ? <Loader2 size={13} className="animate-spin" />
                  : saveState === "saved" ? <Check size={13} />
                  : <Save size={13} />}
                {saveState === "saved" ? "Saved" : "Save"}
              </button>
              <button
                onClick={() => exportCaseFile(caseFile)}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white rounded-md px-2.5 py-1.5 hover:bg-white/10"
              >
                <Download size={13} /> Export JSON
              </button>
              <ExportDeckMenu caseFile={caseFile} />
              {(caseFile.pains || []).some((p) => p.exercises) && (
                <button
                  onClick={() => setFacilitatorMode((v) => !v)}
                  className={`flex items-center gap-1.5 text-xs font-semibold rounded-md px-2.5 py-1.5 ${
                    facilitatorMode ? "text-white" : "text-slate-300 hover:text-white hover:bg-white/10"
                  }`}
                  style={facilitatorMode ? { background: ACCENT } : undefined}
                  title="Training tab: show or hide exercise answers, on screen and when printed"
                >
                  {facilitatorMode ? <Eye size={13} /> : <EyeOff size={13} />}
                  {facilitatorMode ? "Facilitator" : "Participant"}
                </button>
              )}
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white rounded-md px-2.5 py-1.5 hover:bg-white/10"
                title="Print, or save as PDF with each tab on its own page"
              >
                <Printer size={13} /> Print
              </button>
              <button
                onClick={() => { setCaseFile(null); setProgress(0); setError(null); setEditMode(false); }}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white rounded-md px-2.5 py-1.5 hover:bg-white/10"
              >
                <RotateCcw size={13} /> New case
              </button>
            </div>
          </div>
        </div>

        <nav className="max-w-5xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {visibleTabs(caseFile).map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium rounded-t-lg whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                  active ? "bg-slate-100 text-slate-900" : "text-slate-300 hover:text-white hover:bg-white/10"
                }`}
              >
                <t.icon size={15} style={active ? { color: ACCENT } : undefined} />
                {t.label}
              </button>
            );
          })}
        </nav>
      </header>

      {editMode && (
        <div className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-white py-1" style={{ background: EDIT_ACCENT }}>
          Edit mode
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 py-6">
        {editMode ? (
          <TabEditor data={caseFile} tabId={tab} onChange={updateField} />
        ) : tab === "healthcheck" ? (
          <Active data={caseFile} onRerun={handleRerunHealthCheck} rerunning={hcBusy} rerunError={hcError} />
        ) : (
          <Active data={caseFile} />
        )}
        <footer className="mt-8 pt-4 border-t border-slate-200 text-[11px] text-slate-400 flex items-start gap-2">
          <Flag size={11} className="text-amber-500 mt-0.5 shrink-0" />
          <span>
            Fields marked <b>inferred</b> were auto-completed from context and must be validated with
            the customer; everything else comes from the source document.
          </span>
        </footer>
      </main>
      </div>

      <PrintDeck caseFile={caseFile} />
      </FacilitatorModeContext.Provider>
    </>
  );
}