import { useState, useRef, useEffect } from "react";
import {
  Building2, AlertTriangle, Eye, TrendingUp, Swords, ChevronDown,
  ChevronRight, Flag, Users, Target, CheckCircle2, ArrowRight,
  ShieldAlert, Lightbulb, FlaskConical, MessageSquareWarning,
  MonitorPlay, ClipboardList, FileText, Upload, Loader2, RotateCcw,
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
      <SectionTitle icon={Building2} sub="The seller's briefing — everything needed to step into the role play">
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

      {/* Role-play setup */}
      {ov.rolePlay && (ov.rolePlay.role?.value || ov.rolePlay.scenario?.value) && (
        <div className="rounded-lg border-l-4 bg-white border border-slate-200 p-4 space-y-3" style={{ borderLeftColor: ACCENT }}>
          <div className="flex items-center gap-2">
            <MonitorPlay size={15} style={{ color: ACCENT }} />
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: ACCENT }}>Role-play setup</span>
          </div>
          {ov.rolePlay.role?.value && (
            <div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Your role</div>
              <p className="text-sm text-slate-700 leading-snug mt-0.5"><Field f={ov.rolePlay.role} /></p></div>
          )}
          {ov.rolePlay.scenario?.value && (
            <div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Where it starts</div>
              <p className="text-sm text-slate-700 leading-snug mt-0.5"><Field f={ov.rolePlay.scenario} /></p></div>
          )}
          {ov.rolePlay.objective?.value && (
            <div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Your objective</div>
              <p className="text-sm text-slate-700 leading-snug mt-0.5"><Field f={ov.rolePlay.objective} /></p></div>
          )}
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

/* ---------- Pain ---------- */
function Pain({ data }) {
  const [open, setOpen] = useState(0);
  return (
    <div className="space-y-4">
      <SectionTitle icon={AlertTriangle} sub="Pain → Consequence → Business impact · criteria: Personal, Measurable, Negatively stated">
        Customer Pain
      </SectionTitle>

      {(data.pains || []).map((p, i) => {
        const isOpen = open === i;
        const steps = [
          { label: "Pain", text: p.pain, cls: "bg-rose-50 border-rose-200", dot: "text-rose-600" },
          { label: "Consequence", text: p.consequence, cls: "bg-orange-50 border-orange-200", dot: "text-orange-600" },
          { label: "Business impact", text: p.impact, cls: "bg-red-50 border-red-300", dot: "text-red-700" },
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

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-3">
          <FlaskConical size={15} className="text-slate-500" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Proof events — Collaboration plan</span>
        </div>
        <ul className="space-y-2">
          {(v.proofEvents || []).map((e, i) => (
            <li key={i} className="flex items-center gap-3 text-sm text-slate-700">
              <span className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 shrink-0 w-20 text-center">
                {e.aspect}
              </span>
              {e.event}
            </li>
          ))}
        </ul>
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

      <div>
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb size={15} style={{ color: ACCENT }} />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Lead with — high value + unique</span>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          {(c.differentiators || []).map((d, i) => (
            <div key={i} className="rounded-lg border bg-white p-4" style={{ borderColor: i === 0 ? ACCENT : "#e2e8f0", borderWidth: i === 0 ? 2 : 1 }}>
              <div className="font-semibold text-slate-900 text-sm">
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
          <MessageSquareWarning size={15} className="text-slate-500" />
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

/* ---------- Upload screen ---------- */
function UploadScreen({ onFile, onText, busy, progress, error, library, onOpen, onDelete, libLoading }) {
  const inputRef = useRef(null);
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
            Drop a customer case PDF. Claude reads it and builds the pain chains,
            customer vision, quantified value and competitive positioning.
          </p>
        </div>

        {busy ? (
          <div className="rounded-xl bg-white/5 border border-white/10 p-6">
            <div className="flex items-center gap-3 mb-5">
              <Loader2 size={18} className="animate-spin" style={{ color: ACCENT }} />
              <span className="text-white font-medium text-sm">Analyzing the case…</span>
            </div>
            <div className="space-y-2.5">
              {STEPS.map((label, i) => {
                const done = progress > i;
                const active = progress === i;
                return (
                  <div key={label} className="flex items-center gap-2.5 text-sm">
                    {done ? (
                      <CheckCircle2 size={15} className="shrink-0" style={{ color: ACCENT }} />
                    ) : active ? (
                      <Loader2 size={15} className="animate-spin text-slate-400 shrink-0" />
                    ) : (
                      <div className="w-[15px] h-[15px] rounded-full border border-white/20 shrink-0" />
                    )}
                    <span className={done ? "text-slate-300" : active ? "text-white" : "text-slate-600"}>
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
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
          <button
            onClick={() => setPasteMode(true)}
            className="mx-auto mt-3 block text-xs font-medium text-slate-400 hover:text-white"
          >
            or paste the case text instead →
          </button>
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
  { id: "pain", label: "Pain", icon: AlertTriangle, comp: Pain },
  { id: "vision", label: "Vision", icon: Eye, comp: Vision },
  { id: "value", label: "Value", icon: TrendingUp, comp: Value },
  { id: "competitive", label: "Competitive", icon: Swords, comp: Competitive },
];

const STEPS = ["Reading the PDF", "Analyzing with Growth Activator"];

export default function CaseAnalyzer() {
  const [caseFile, setCaseFile] = useState(null);
  const [tab, setTab] = useState("overview");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  const [library, setLibrary] = useState([]);
  const [libLoading, setLibLoading] = useState(true);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved

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
      if (cf) { setCaseFile(cf); setTab("overview"); }
      else setError("That saved case could not be found (it may have been deleted by a teammate).");
    } catch (e) {
      setError("Could not open the case: " + (e?.message || String(e)));
    }
  };

  const handleDelete = async (id) => {
    try { setLibrary(await deleteCase(id)); } catch (e) { console.error(e); }
  };

  const analyzeText = async (caseText) => {
    setBusy(true);
    setError(null);
    setProgress(1);
    try {
      const result = await analyzeCase(caseText);
      setProgress(2);
      setCaseFile(result);
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
          onFile={analyze} onText={analyzeText} busy={busy} progress={progress} error={error}
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
                onClick={() => { setCaseFile(null); setProgress(0); setError(null); }}
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

      <main className="max-w-5xl mx-auto px-4 py-6">
        <Active data={caseFile} />
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