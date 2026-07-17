import { useState, useRef, useEffect } from "react";
import {
  Building2, AlertTriangle, Eye, TrendingUp, Swords, ChevronDown,
  ChevronRight, Flag, Users, Target, CheckCircle2, ArrowRight,
  ShieldAlert, Lightbulb, MessageSquare, Pencil, Download, FileUp, Layers,
  ClipboardList, ClipboardCheck, Gauge, FileText, Upload, Loader2, RotateCcw,
  Search as SearchIcon, Sparkles, AlertCircle, Save, Trash2,
  FolderOpen, Check, Users2
} from "lucide-react";

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

async function extractPdfText(file) {
  const pdfjsLib = await loadPdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let out = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    out += content.items.map((it) => it.str).join(" ") + "\n\n";
  }
  // Trim to keep the request lean (case briefs are well under this).
  return out.replace(/[ \t]+/g, " ").trim().slice(0, 24000);
}

// EXTRACTION_PROMPT moved to backend (server.js) to minimize frontend tokens

// JSON parsing and model calls moved to backend for security and efficiency

async function analyzeCase(caseText) {
  try {
    const res = await fetch(`${API_BASE}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseText }),
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Backend ${res.status}: ${detail.slice(0, 200)}`);
    }
    return await res.json();
  } catch (e) {
    throw new Error("Analysis failed: " + e.message);
  }
}

/* ================================================================
   ██  EXPORT / IMPORT (schema-versioned)
   ================================================================ */
const SCHEMA_VERSION = 3;

// Accepts a raw parsed JSON — either a versioned export envelope
// ({app, schemaVersion, caseFile}) or a bare caseFile from any prior
// schema — and normalizes it to the current shape.
function migrateCaseFile(raw) {
  if (!raw || typeof raw !== "object") throw new Error("Not a valid case file.");
  const cf = raw.caseFile && typeof raw.caseFile === "object" ? { ...raw.caseFile } : { ...raw };
  if (!cf.meta || typeof cf.meta !== "object") {
    throw new Error("This JSON does not look like a CaseAnalyzer export (missing meta).");
  }

  // v1 pains used pain/consequence/impact; v2+ use pain/causes/capabilities/orgImpact.
  cf.pains = (cf.pains || []).map((p) => {
    const n = { ...p };
    if (n.causes === undefined && n.consequence !== undefined) n.causes = n.consequence;
    if (n.orgImpact === undefined && n.impact !== undefined) n.orgImpact = n.impact;
    if (n.capabilities === undefined) n.capabilities = "";
    if (!Array.isArray(n.affects)) n.affects = [];
    delete n.consequence;
    delete n.impact;
    return n;
  });

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
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-lg border bg-white overflow-hidden ${s.critical ? "border-red-300" : "border-slate-200"}`}>
      <button
        onClick={() => setOpen(!open)}
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
  const [open, setOpen] = useState(false);
  const inf = String(p.influence || "");
  const infCls = inf.startsWith("High") ? "bg-sky-100 text-sky-800" : inf.startsWith("Med") ? "bg-slate-100 text-slate-700" : "bg-slate-100 text-slate-500";
  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-start gap-3 p-3.5 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
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
            <div className="text-[13px] text-slate-600 mt-0.5 leading-snug">{it.purpose}</div>
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
      <SectionTitle icon={AlertTriangle} sub="Pain → Causes → Capabilities → Organizational impact · criteria: Personal, Measurable, Negatively stated">
        Customer Pain
      </SectionTitle>

      {(data.pains || []).map((p, i) => {
        const isOpen = open === i;
        const steps = [
          { label: "Pain", text: p.pain, cls: "bg-rose-50 border-rose-200", dot: "text-rose-600" },
          { label: "Causes", text: p.causes, cls: "bg-amber-50 border-amber-200", dot: "text-amber-600" },
          { label: "Capabilities", text: p.capabilities, cls: "bg-sky-50 border-sky-200", dot: "text-sky-600" },
          { label: "Organizational impact", text: p.orgImpact, cls: "bg-red-50 border-red-300", dot: "text-red-700" },
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
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
              <th className="py-2 pr-3 font-semibold">Driver</th>
              <th className="py-2 pr-3 font-semibold">Mechanism</th>
              <th className="py-2 font-semibold">Estimated impact</th>
            </tr>
          </thead>
          <tbody>
            {(v.drivers || []).map((d, i) => (
              <tr key={i} className="border-b border-slate-50 last:border-0 align-top">
                <td className="py-2 pr-3 font-medium text-slate-800">{d.driver}<SrcChip src={d.src} /></td>
                <td className="py-2 pr-3 text-slate-600">{d.mechanism}</td>
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
function ValueGrid({ items }) {
  const pts = (items || []).filter((d) => typeof d.uniqueness === "number" && typeof d.customerValue === "number");
  if (pts.length === 0) return null;

  const left = 46, right = 314, top = 14, bottom = 240;
  const x = (cv) => left + (Math.max(0, Math.min(10, cv)) / 10) * (right - left);
  const y = (uq) => bottom - (Math.max(0, Math.min(10, uq)) / 10) * (bottom - top);
  const midX = (left + right) / 2;
  const midY = (top + bottom) / 2;

  const quadrants = [
    { label: "Cool stuff", x: left + 4, y: top + 14, anchor: "start" },
    { label: "Differentiators", x: right - 4, y: top + 14, anchor: "end" },
    { label: "Trivial", x: left + 4, y: bottom - 6, anchor: "start" },
    { label: "Core", x: right - 4, y: bottom - 6, anchor: "end" },
  ];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Value Grid — uniqueness vs. customer value</div>
      <svg viewBox="0 0 340 300" className="w-full max-w-md mx-auto" role="img" aria-label="Value grid plotting differentiators by uniqueness and customer value">
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
        {pts.map((d, i) => {
          const cx = x(d.customerValue), cy = y(d.uniqueness);
          const r = i === 0 ? 10 : 8;
          return (
            <g key={i}>
              <circle cx={cx} cy={cy} r={r} fill={ACCENT} stroke="#fff" strokeWidth={i === 0 ? 2 : 1.5} />
              <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" className="fill-white" style={{ fontSize: 10, fontWeight: 700 }}>
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
    </div>
  );
}

/* ---------- Competitive ---------- */
function Competitive({ data }) {
  const c = data.competitive || {};
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

      <ValueGrid items={c.differentiators} />

      <div>
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb size={15} style={{ color: ACCENT }} />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Lead with — high value + unique</span>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          {(c.differentiators || []).map((d, i) => (
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

function HealthCheck({ data }) {
  const hc = data.healthCheck || {};
  return (
    <div className="space-y-4">
      <SectionTitle icon={Gauge} sub="Opportunity Health Check · scored only on what this document evidences about the sales process">
        Health Check
      </SectionTitle>

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
function UploadScreen({ onFile, onText, onImport, busy, progress, error, library, onOpen, onDelete, libLoading }) {
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
          <AnalysisProgress phase={progress} />
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
];

/* ---------- Analysis progress ---------- */
function AnalysisProgress({ phase }) {
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
  } else {
    // The model call is a single long request, so progress is estimated
    // from elapsed time (asymptotic toward 98% until the response lands).
    const t1 = Math.max(0, (now - (phase1Ref.current ?? now)) / 1000);
    pct = Math.min(98, Math.round(5 + 93 * (1 - Math.exp(-t1 / 90))));
    stage =
      pct < 20 ? "Reading the case & identifying the vertical" :
      pct < 40 ? "Mapping stakeholders & building pain chains" :
      pct < 60 ? "Quantifying value & drafting the collaboration plan" :
      pct < 80 ? "Competitive positioning & opportunity health check" :
      "Assembling the briefing — deep analysis can take a few minutes";
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
};

function setAtPath(obj, path, value) {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  const clone = Array.isArray(obj) ? [...obj] : { ...obj };
  clone[head] = setAtPath(obj?.[head], rest, value);
  return clone;
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
    return (
      <div className="space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700">{label}</div>
        {value.map((item, i) =>
          item !== null && typeof item === "object" ? (
            <div key={i} className="rounded-lg border border-amber-200 bg-white p-3 space-y-2.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600">
                {label} · {i + 1}
              </div>
              {Object.entries(item).map(([k, v]) => (
                <EditNode key={k} label={prettyKey(k)} value={v} path={[...path, i, k]} onChange={onChange} depth={depth + 1} />
              ))}
            </div>
          ) : (
            <EditField key={i} label={`${label} · ${i + 1}`} value={item} path={[...path, i]} onChange={onChange} />
          )
        )}
      </div>
    );
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
  const [error, setError] = useState(null);

  const [library, setLibrary] = useState([]);
  const [libLoading, setLibLoading] = useState(true);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved
  const [editMode, setEditMode] = useState(false);

  const updateField = (path, value) => setCaseFile((prev) => setAtPath(prev, path, value));

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
      if (cf) { setCaseFile(cf); setTab("overview"); setEditMode(false); }
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
      setCaseFile(cf);
      setTab("overview");
      setEditMode(false);
    } catch (e) {
      setError("Import failed: " + (e?.message || String(e)));
    }
  };

  const analyzeText = async (caseText) => {
    setBusy(true);
    setError(null);
    setProgress(1);
    try {
      const result = await analyzeCase(caseText);
      setProgress(2);
      setCaseFile(result);
      setEditMode(false);
      setTab("overview");
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
      const result = await analyzeCase(caseText);
      setProgress(2);
      setCaseFile(result);
      setEditMode(false);
      setTab("overview");
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
          onFile={analyze} onText={analyzeText} onImport={handleImport} busy={busy} progress={progress} error={error}
          library={library} onOpen={handleOpen} onDelete={handleDelete} libLoading={libLoading}
        />
      </>
    );
  }

  const Active = TABS.find((t) => t.id === tab).comp;
  const m = caseFile.meta || {};

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&display=swap');
        .font-display { font-family: 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif; }
      `}</style>

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
                <Download size={13} /> Export
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
          {TABS.map((t) => {
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
  );
}