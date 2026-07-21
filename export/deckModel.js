// Pure JSON -> slide-descriptor mapping, shared by the PDF renderer
// (PdfDeck.jsx) and the PPTX renderer (pptxDeck.js). No rendering code lives
// here — only "what goes on which slide, in what order". Deliberately strips
// every `src` provenance flag: the exported deck is a client-facing document,
// unlike the in-app UI, and must never surface "inferred" markers.

// Most fields are flat strings with a sibling `src`; overview/rfi/discovery
// fields are wrapped as {value, src}. This unwraps either shape.
const val = (f) => (f && typeof f === "object" && "value" in f ? f.value : f ?? "");

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const SOLUTION_LAYER_LABELS = {
  deviceIntegration: "Device Integration",
  platform: "XProtect Platform",
  extensions: "XProtect Extensions",
  analytics: "BriefCam Analytics",
  cloud: "Arcules Cloud",
};

// Shared filename slug, mirroring exportCaseFile's pattern in CaseAnalyzer.jsx
// so both export paths name files consistently.
export function slugForCase(caseFile) {
  return (caseFile?.meta?.customer || "case")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export function buildDeckModel(caseFile) {
  const meta = caseFile.meta || {};
  const slides = [];

  slides.push({ type: "title", customer: meta.customer, industry: meta.industry, stage: meta.stage, competitor: meta.competitor });

  // ---- Overview ----
  slides.push({ type: "sectionDivider", title: "Case Overview" });
  const overview = caseFile.overview || {};
  if (val(overview.summary)) {
    slides.push({ type: "narrative", breadcrumb: "Case Overview", title: "Solution overview", text: val(overview.summary) });
  }
  const snapshot = (overview.snapshot || []).map((s) => ({ label: s.label, value: val(s.v ?? s.value) }));
  chunk(snapshot, 4).forEach((items, i, all) => {
    slides.push({
      type: "factGrid",
      breadcrumb: "Case Overview",
      title: all.length > 1 ? `At a glance (${i + 1}/${all.length})` : "At a glance",
      items,
    });
  });

  const stakeholders = caseFile.stakeholders || [];
  chunk(stakeholders, 3).forEach((items, i, all) => {
    slides.push({
      type: "stakeholderGrid",
      breadcrumb: "Case Overview",
      title: all.length > 1 ? `Key players (${i + 1}/${all.length})` : "Key players",
      items,
    });
  });

  const discovery = caseFile.discovery || {};
  const discoveryStatements = (discovery.statements || []).map(val).filter(Boolean);
  if (discoveryStatements.length || val(discovery.competitorAlert)) {
    slides.push({
      type: "bulletCallout",
      breadcrumb: "Case Overview",
      title: "Discovery signals",
      bullets: discoveryStatements,
      calloutTitle: val(discovery.competitorAlert) ? "Competitor alert" : null,
      calloutText: val(discovery.competitorAlert) || null,
    });
  }

  // ---- Solution ----
  slides.push({ type: "sectionDivider", title: "Solution" });
  const solution = caseFile.solution || {};
  if (solution.narrative) {
    slides.push({ type: "narrative", breadcrumb: "Solution", title: "How it fits together", text: solution.narrative });
  }
  const layers = ["deviceIntegration", "platform", "extensions", "analytics", "cloud"]
    .map((key) => ({
      key,
      name: SOLUTION_LAYER_LABELS[key],
      items: (solution[key] || []).map((it) => ({ item: it.item, purpose: it.purpose })),
    }))
    .filter((l) => l.items.length > 0);
  if (layers.length) {
    slides.push({ type: "solutionStack", breadcrumb: "Solution", title: "The open platform solution map", layers });
  }

  // ---- Pain ----
  slides.push({ type: "sectionDivider", title: "Pain" });
  const pains = caseFile.pains || [];
  pains.forEach((p, i) => {
    slides.push({
      type: "painChain",
      index: i + 1,
      total: pains.length,
      title: p.title,
      owner: p.owner,
      category: p.category,
      pain: p.pain,
      causes: p.causes,
      capabilities: p.capabilities,
      orgImpact: p.orgImpact,
      affects: p.affects || [],
    });
  });
  if (caseFile.painHeadline) {
    slides.push({ type: "highlight", eyebrow: "Pain", text: caseFile.painHeadline });
  }

  // ---- Vision ----
  slides.push({ type: "sectionDivider", title: "Vision" });
  const vision = caseFile.vision || {};
  const visionItems = vision.items || [];
  chunk(visionItems, 4).forEach((items, i, all) => {
    slides.push({
      type: "visionGrid",
      breadcrumb: "Vision",
      title: all.length > 1 ? `Customer vision (${i + 1}/${all.length})` : "Customer vision",
      startIndex: i * 4,
      items,
    });
  });
  if (vision.playback) {
    slides.push({ type: "highlight", eyebrow: "Vision", text: vision.playback });
  }

  // ---- Value ----
  slides.push({ type: "sectionDivider", title: "Value" });
  const value = caseFile.value || {};
  const drivers = value.drivers || [];
  const driverSlides = chunk(drivers, 4);
  driverSlides.forEach((items, i) => {
    slides.push({
      type: "valueDrivers",
      breadcrumb: "Value",
      title: "Customer value",
      startIndex: i * 4,
      items: items.map((d) => ({ title: d.driver, detail: `${d.mechanism} ${d.impact}`.trim() })),
    });
  });
  const statements = value.statements || [];
  if (statements.length) {
    slides.push({
      type: "fourColumn",
      breadcrumb: "Value",
      title: "Value statements",
      headers: ["Issue", "Action", "Value", "Check"],
      rows: statements.map((s) => ({ label: s.name, values: [s.issue, s.action, s.value, s.check] })),
    });
  }

  // ---- Consensus ----
  slides.push({ type: "sectionDivider", title: "Consensus" });
  const consensus = caseFile.consensus || {};
  if (consensus.summary) {
    slides.push({ type: "narrative", breadcrumb: "Consensus", title: "Collaboration plan", text: consensus.summary });
  }
  const events = consensus.events || [];
  if (events.length) {
    slides.push({
      type: "timelineTable",
      breadcrumb: "Consensus",
      title: "Collaboration plan events",
      rows: events.map((e) => ({
        event: e.event,
        phase: e.phase,
        weekOf: e.weekOf,
        responsible: e.responsible,
        goNoGo: !!e.goNoGo,
      })),
    });
  }

  // ---- Competitive ----
  slides.push({ type: "sectionDivider", title: "Competitive Positioning" });
  const competitive = caseFile.competitive || {};
  if (competitive.narrative) {
    slides.push({
      type: "narrative",
      breadcrumb: "Competitive Positioning",
      title: `Positioning vs. ${meta.competitor || "the competition"}`,
      text: competitive.narrative,
    });
  }
  const differentiators = competitive.differentiators || [];
  if (differentiators.length) {
    slides.push({
      type: "competitiveQuadrant",
      breadcrumb: "Competitive Positioning",
      title: "Competitive positioning vision",
      items: differentiators.map((d, i) => ({ index: i + 1, title: d.title, uniqueness: d.uniqueness, customerValue: d.customerValue })),
    });
    slides.push({
      type: "competitiveDetail",
      breadcrumb: "Competitive Positioning",
      title: "Competitive positioning vision",
      leadWith: differentiators.map((d, i) => ({ index: i + 1, title: d.title, detail: d.detail, isCenterpiece: i === 0 })),
      parity: competitive.parity || [],
    });
  }
  const objections = competitive.objections || [];
  if (objections.length) {
    slides.push({
      type: "fourColumn",
      breadcrumb: "Competitive Positioning",
      title: "Objection handling",
      headers: ["Acknowledge", "Question", "Position", "Check"],
      rows: objections.map((o) => ({ label: o.objection, values: [o.acknowledge, o.question, o.position, o.check] })),
      calloutTitle: (competitive.redFlags || []).length ? "Red flags to watch" : null,
      calloutItems: competitive.redFlags || [],
    });
  }

  // ---- Health Check ----
  slides.push({ type: "sectionDivider", title: "Opportunity Health Check" });
  const hc = caseFile.healthCheck || {};
  const HEALTH_VITALS = [
    { key: "pain", label: "Pain" },
    { key: "power", label: "Power" },
    { key: "vision", label: "Vision" },
    { key: "value", label: "Value" },
    { key: "consensus", label: "Consensus" },
  ];
  const healthItems = HEALTH_VITALS.map((v) => ({
    key: v.key,
    label: v.label,
    score: hc[v.key]?.score ?? 0,
    rationale: hc[v.key]?.rationale || "",
  }));
  if (Object.keys(hc).length) {
    slides.push({ type: "healthCheck", breadcrumb: "Opportunity Health Check", title: "Opportunity health check", items: healthItems });
  }

  slides.push({ type: "closing" });

  return slides;
}
