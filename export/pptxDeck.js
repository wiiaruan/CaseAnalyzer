import pptxgen from "pptxgenjs";
import { buildDeckModel, slugForCase } from "./deckModel.js";
import {
  ACCENT, DARK, LIGHT_BG, CARD_BG, TEXT_DARK, TEXT_MUTED, TEXT_ON_DARK,
  TEXT_MUTED_ON_DARK, RED, RED_BG, LOGO_URL, LOGO_ASPECT, SOLUTION_TIER_COLORS, PHASE_COLORS,
} from "./brand.js";

// pptxgenjs wants hex without the leading '#'.
const hx = (c) => (c || "").replace("#", "");
// pptxgenjs needs explicit w+h per image; derive h from a target width so the
// wide logo asset never looks squashed/stretched.
const logoBox = (w) => ({ w, h: w / LOGO_ASPECT });

const PAGE_W = 13.333, PAGE_H = 7.5;
const MARGIN = 0.55;
const CONTENT_W = PAGE_W - MARGIN * 2;
const CONTENT_TOP = 1.25;

// Absolute URL so pptxgenjs's browser image fetch resolves correctly
// regardless of the current route.
const logoSrc = () => new URL(LOGO_URL, window.location.origin).toString();

function baseSlide(pptx, { dark } = {}) {
  const slide = pptx.addSlide();
  slide.background = { color: hx(dark ? DARK : LIGHT_BG) };
  return slide;
}

function header(slide, breadcrumb, title, dark) {
  if (breadcrumb) {
    slide.addText(breadcrumb.toUpperCase(), {
      x: MARGIN, y: 0.4, w: CONTENT_W, h: 0.28,
      fontSize: 11, bold: true, color: hx(ACCENT), charSpacing: 1,
    });
  }
  slide.addText(title, {
    x: MARGIN, y: 0.68, w: CONTENT_W, h: 0.5,
    fontSize: 24, bold: true, color: hx(dark ? TEXT_ON_DARK : TEXT_DARK),
  });
}

function footer(slide) {
  const box = logoBox(0.9);
  slide.addImage({ path: logoSrc(), x: MARGIN, y: PAGE_H - 0.35 - box.h, ...box });
}

function lightSlide(pptx, { breadcrumb, title }) {
  const slide = baseSlide(pptx);
  header(slide, breadcrumb, title, false);
  footer(slide);
  return slide;
}

function fourColCard(pptx, slide, { x, y, w, h, label, color, text }) {
  const barH = 0.32;
  slide.addShape(pptx.ShapeType.rect, { x, y, w, h: barH, fill: { color: hx(color || DARK) }, line: { type: "none" } });
  slide.addText(label, { x: x + 0.06, y, w: w - 0.12, h: barH, fontSize: 9.5, bold: true, color: hx("#FFFFFF"), valign: "middle" });
  slide.addShape(pptx.ShapeType.rect, { x, y: y + barH, w, h: h - barH, fill: { color: hx(CARD_BG) }, line: { color: hx("#DCE1E6"), width: 0.75 } });
  slide.addText(text || "", { x: x + 0.08, y: y + barH + 0.05, w: w - 0.16, h: h - barH - 0.1, fontSize: 8.5, color: hx(TEXT_DARK), valign: "top" });
}

/* ---------- slide builders, one per deckModel slide type ---------- */

function buildTitle(pptx, s) {
  const slide = baseSlide(pptx, { dark: true });
  slide.addImage({ path: logoSrc(), x: MARGIN, y: 1.7, ...logoBox(2.6) });
  const sub = [s.industry, s.stage, s.competitor && `vs. ${s.competitor}`].filter(Boolean).join("   ·   ");
  slide.addText("GROWTH ACTIVATOR · CASE BRIEFING", { x: MARGIN, y: 3.7, w: CONTENT_W, h: 0.3, fontSize: 12, bold: true, color: hx(ACCENT), charSpacing: 2 });
  slide.addText(s.customer || "Customer", { x: MARGIN, y: 4.05, w: CONTENT_W, h: 0.9, fontSize: 40, bold: true, color: hx(TEXT_ON_DARK) });
  if (sub) slide.addText(sub, { x: MARGIN, y: 4.95, w: CONTENT_W, h: 0.4, fontSize: 14, color: hx(TEXT_MUTED_ON_DARK) });
}

function buildSectionDivider(pptx, s) {
  const slide = baseSlide(pptx, { dark: true });
  slide.addImage({ path: logoSrc(), x: MARGIN, y: 0.55, ...logoBox(1.6) });
  slide.addText(s.title, { x: MARGIN, y: PAGE_H / 2 - 0.6, w: CONTENT_W, h: 1.2, fontSize: 44, bold: true, color: hx(ACCENT) });
}

function buildNarrative(pptx, s) {
  const slide = lightSlide(pptx, s);
  slide.addText(s.text, { x: MARGIN, y: CONTENT_TOP, w: CONTENT_W, h: 3, fontSize: 15, color: hx(TEXT_DARK), lineSpacingMultiple: 1.4 });
}

function cardGrid(pptx, s, items, renderCard) {
  const slide = lightSlide(pptx, s);
  const perRow = items.length > 3 ? 4 : 3;
  const gap = 0.25;
  const w = (CONTENT_W - gap * (perRow - 1)) / perRow;
  const h = 3.6;
  items.forEach((it, i) => {
    const x = MARGIN + i * (w + gap);
    const y = CONTENT_TOP;
    slide.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color: hx(CARD_BG) }, line: { color: hx("#DCE1E6"), width: 0.75 } });
    renderCard(slide, it, i, x, y, w, h);
  });
}

function buildFactGrid(pptx, s) {
  cardGrid(pptx, s, s.items, (slide, it, i, x, y, w, h) => {
    slide.addText(it.label, { x: x + 0.15, y: y + 0.15, w: w - 0.3, h: 0.3, fontSize: 9.5, bold: true, color: hx(ACCENT), charSpacing: 0.5 });
    slide.addText(it.value, { x: x + 0.15, y: y + 0.5, w: w - 0.3, h: h - 0.65, fontSize: 10.5, color: hx(TEXT_DARK) });
  });
}

function buildStakeholderGrid(pptx, s) {
  cardGrid(pptx, s, s.items, (slide, p, i, x, y, w, h) => {
    slide.addText(p.name, { x: x + 0.15, y: y + 0.15, w: w - 0.3, h: 0.3, fontSize: 12, bold: true, color: hx(TEXT_DARK) });
    slide.addText(p.title, { x: x + 0.15, y: y + 0.45, w: w - 0.3, h: 0.28, fontSize: 9.5, color: hx(TEXT_MUTED) });
    slide.addText(`${p.focus}   ·   ${p.influence} influence`, { x: x + 0.15, y: y + 0.78, w: w - 0.3, h: 0.3, fontSize: 8.5, bold: true, color: hx(ACCENT) });
    slide.addText((p.cares || []).map((c) => ({ text: c, options: { bullet: true, breakLine: true } })), {
      x: x + 0.15, y: y + 1.15, w: w - 0.3, h: h - 1.3, fontSize: 9, color: hx(TEXT_DARK), lineSpacingMultiple: 1.3,
    });
  });
}

function buildBulletCallout(pptx, s) {
  const slide = lightSlide(pptx, s);
  if (s.bullets.length) {
    slide.addText(s.bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true, paraSpaceAfter: 8 } })), {
      x: MARGIN, y: CONTENT_TOP, w: CONTENT_W, h: 3, fontSize: 12.5, color: hx(TEXT_DARK),
    });
  }
  if (s.calloutText) {
    const y = CONTENT_TOP + 3.1;
    slide.addShape(pptx.ShapeType.rect, { x: MARGIN, y, w: CONTENT_W, h: 1.1, fill: { color: hx(RED_BG) }, line: { color: hx(RED), width: 0 } });
    slide.addShape(pptx.ShapeType.rect, { x: MARGIN, y, w: 0.05, h: 1.1, fill: { color: hx(RED) }, line: { type: "none" } });
    slide.addText(s.calloutTitle, { x: MARGIN + 0.2, y: y + 0.1, w: CONTENT_W - 0.4, h: 0.3, fontSize: 9.5, bold: true, color: hx(RED) });
    slide.addText(s.calloutText, { x: MARGIN + 0.2, y: y + 0.42, w: CONTENT_W - 0.4, h: 0.6, fontSize: 10.5, color: hx(TEXT_DARK) });
  }
}

function buildSolutionStack(pptx, s) {
  const slide = lightSlide(pptx, s);
  const barW = 2.1, gap = 0.18, rowH = (5.0 - gap * (s.layers.length - 1)) / Math.max(1, s.layers.length);
  const h = Math.min(rowH, 0.85);
  s.layers.forEach((layer, i) => {
    const y = CONTENT_TOP + i * (h + gap);
    slide.addShape(pptx.ShapeType.rect, { x: MARGIN, y, w: barW, h, fill: { color: hx(SOLUTION_TIER_COLORS[layer.key] || DARK) }, line: { type: "none" } });
    slide.addText(layer.name, { x: MARGIN + 0.1, y, w: barW - 0.2, h, fontSize: 10.5, bold: true, color: hx("#FFFFFF"), valign: "middle" });
    const itemsText = layer.items.map((it) => it.item).join("   •   ");
    slide.addText(itemsText, {
      x: MARGIN + barW + 0.2, y, w: CONTENT_W - barW - 0.2, h,
      fontSize: 9, color: hx(TEXT_DARK), valign: "middle", fill: { color: hx(CARD_BG) },
      line: { color: hx("#DCE1E6"), width: 0.75 },
    });
  });
}

function buildPainChain(pptx, s) {
  const slide = lightSlide(pptx, { breadcrumb: `Customer Pain #${s.index} of ${s.total}`, title: s.title });
  slide.addText(`Owner: ${s.owner}   ·   Category: ${s.category}`, { x: MARGIN, y: 1.18, w: CONTENT_W, h: 0.25, fontSize: 9.5, color: hx(TEXT_MUTED) });
  const cols = [
    { label: "Pain", text: s.pain },
    { label: "Causes", text: s.causes },
    { label: "Capabilities", text: s.capabilities },
    { label: "Organizational impact", text: s.orgImpact },
  ];
  const gap = 0.18, w = (CONTENT_W - gap * 3) / 4, h = 3.0, y = 1.55;
  cols.forEach((c, i) => fourColCard(pptx, slide, { x: MARGIN + i * (w + gap), y, w, h, label: c.label, text: c.text }));
  if (s.affects.length) {
    slide.addText(`Also impacts: ${s.affects.join(", ")}`, { x: MARGIN, y: y + h + 0.2, w: CONTENT_W, h: 0.4, fontSize: 9.5, color: hx(TEXT_MUTED) });
  }
}

function buildHighlight(pptx, s) {
  const slide = baseSlide(pptx, { dark: true });
  if (s.eyebrow) slide.addText(s.eyebrow.toUpperCase(), { x: 1, y: 2.3, w: CONTENT_W, h: 0.35, fontSize: 12, bold: true, color: hx(ACCENT), charSpacing: 2 });
  slide.addText(s.text, { x: 1, y: 2.75, w: CONTENT_W - 1, h: 2, fontSize: 22, bold: true, color: hx(TEXT_ON_DARK), lineSpacingMultiple: 1.3 });
}

function numberedCardGrid(pptx, s) {
  cardGrid(pptx, s, s.items, (slide, it, i, x, y, w, h) => {
    slide.addShape(pptx.ShapeType.ellipse, { x: x + 0.15, y: y + 0.15, w: 0.32, h: 0.32, fill: { color: hx(ACCENT) }, line: { type: "none" } });
    slide.addText(String(s.startIndex + i + 1), { x: x + 0.15, y: y + 0.15, w: 0.32, h: 0.32, fontSize: 10, bold: true, color: hx("#FFFFFF"), align: "center", valign: "middle" });
    slide.addText(it.title, { x: x + 0.15, y: y + 0.6, w: w - 0.3, h: 0.55, fontSize: 11, bold: true, color: hx(TEXT_DARK) });
    slide.addText(it.detail, { x: x + 0.15, y: y + 1.15, w: w - 0.3, h: h - 1.3, fontSize: 9, color: hx(TEXT_MUTED) });
  });
}

function buildFourColumn(pptx, s) {
  const slide = lightSlide(pptx, s);
  const gap = 0.18, w = (CONTENT_W - gap * 3) / 4, h = 1.55;
  let y = CONTENT_TOP;
  s.rows.forEach((row) => {
    slide.addText(row.label, { x: MARGIN, y, w: CONTENT_W, h: 0.3, fontSize: 10.5, bold: true, color: hx(TEXT_DARK) });
    y += 0.35;
    s.headers.forEach((hLabel, j) => fourColCard(pptx, slide, { x: MARGIN + j * (w + gap), y, w, h, label: hLabel, text: row.values[j] }));
    y += h + 0.25;
  });
  if (s.calloutItems && s.calloutItems.length) {
    const ch = 0.35 + s.calloutItems.length * 0.28;
    slide.addShape(pptx.ShapeType.rect, { x: MARGIN, y, w: CONTENT_W, h: ch, fill: { color: hx(RED_BG) }, line: { type: "none" } });
    slide.addShape(pptx.ShapeType.rect, { x: MARGIN, y, w: 0.05, h: ch, fill: { color: hx(RED) }, line: { type: "none" } });
    slide.addText(s.calloutTitle, { x: MARGIN + 0.2, y: y + 0.06, w: CONTENT_W - 0.4, h: 0.28, fontSize: 9.5, bold: true, color: hx(RED) });
    slide.addText(s.calloutItems.map((it) => ({ text: it, options: { bullet: true, breakLine: true } })), {
      x: MARGIN + 0.2, y: y + 0.35, w: CONTENT_W - 0.4, h: ch - 0.4, fontSize: 9, color: hx(TEXT_DARK),
    });
  }
}

function buildTimelineTable(pptx, s) {
  const slide = lightSlide(pptx, s);
  const headerRow = ["Event", "Phase", "Week of", "Responsible", "Go/No-Go"].map((t) => ({
    text: t, options: { bold: true, color: hx("#FFFFFF"), fill: { color: hx(DARK) }, fontSize: 10 },
  }));
  const rows = s.rows.map((r) => [
    { text: r.event, options: { fontSize: 9.5, color: hx(TEXT_DARK) } },
    { text: r.phase, options: { fontSize: 9, bold: true, color: hx("#FFFFFF"), fill: { color: hx(PHASE_COLORS[r.phase] || DARK) } } },
    { text: r.weekOf, options: { fontSize: 9.5, color: hx(TEXT_DARK) } },
    { text: r.responsible, options: { fontSize: 9.5, color: hx(TEXT_DARK) } },
    { text: r.goNoGo ? "Go/No-Go" : "—", options: { fontSize: 9.5, bold: r.goNoGo, color: hx(r.goNoGo ? ACCENT : TEXT_MUTED) } },
  ]);
  slide.addTable([headerRow, ...rows], {
    x: MARGIN, y: CONTENT_TOP, w: CONTENT_W,
    colW: [4.2, 1.5, 1.3, 2.6, 1.4],
    border: { type: "solid", color: hx("#DCE1E6"), pt: 0.5 },
    autoPage: false,
  });
}

// Uses pptxgenjs's native scatter-chart plumbing for the two axes, plus
// hand-drawn quadrant backgrounds/labels — pptxgenjs's scatter chart has no
// per-point label/callout support, so the numbered dots+legend are drawn as
// shapes rather than chart data points (keeps the quadrant fully faithful to
// the reference deck's layout, at the cost of the chart not being a live
// editable PowerPoint chart object here).
function buildCompetitiveQuadrant(pptx, s) {
  const slide = lightSlide(pptx, s);
  const ox = MARGIN, oy = CONTENT_TOP, W = 6.2, H = 4.2;
  const toX = (v) => ox + (v / 10) * W;
  const toY = (v) => oy + H - (v / 10) * H;
  slide.addShape(pptx.ShapeType.rect, { x: ox, y: oy, w: W / 2, h: H / 2, fill: { color: hx("#F4F5F6") }, line: { type: "none" } });
  slide.addShape(pptx.ShapeType.rect, { x: ox + W / 2, y: oy, w: W / 2, h: H / 2, fill: { color: hx("#E4F3FB") }, line: { type: "none" } });
  slide.addShape(pptx.ShapeType.rect, { x: ox, y: oy + H / 2, w: W / 2, h: H / 2, fill: { color: hx("#F9FAFA") }, line: { type: "none" } });
  slide.addShape(pptx.ShapeType.rect, { x: ox + W / 2, y: oy + H / 2, w: W / 2, h: H / 2, fill: { color: hx("#F4F5F6") }, line: { type: "none" } });
  slide.addShape(pptx.ShapeType.line, { x: ox, y: oy, w: 0, h: H, line: { color: hx("#B7BEC4"), width: 1 } });
  slide.addShape(pptx.ShapeType.line, { x: ox, y: oy + H, w: W, h: 0, line: { color: hx("#B7BEC4"), width: 1 } });
  slide.addText("COOL STUFF", { x: ox + 0.05, y: oy + 0.03, w: 2, h: 0.2, fontSize: 8, color: hx(TEXT_MUTED) });
  slide.addText("DIFFERENTIATORS", { x: ox + W / 2 + 0.05, y: oy + 0.03, w: 2.5, h: 0.2, fontSize: 8, bold: true, color: hx(TEXT_DARK) });
  slide.addText("TRIVIAL", { x: ox + 0.05, y: oy + H - 0.22, w: 2, h: 0.2, fontSize: 8, color: hx(TEXT_MUTED) });
  slide.addText("CORE", { x: ox + W / 2 + 0.05, y: oy + H - 0.22, w: 2, h: 0.2, fontSize: 8, color: hx(TEXT_MUTED) });
  s.items.forEach((it) => {
    const x = toX(it.customerValue), y = toY(it.uniqueness), r = 0.2;
    slide.addShape(pptx.ShapeType.ellipse, { x: x - r, y: y - r, w: r * 2, h: r * 2, fill: { color: hx(ACCENT) }, line: { type: "none" } });
    slide.addText(String(it.index), { x: x - r, y: y - r, w: r * 2, h: r * 2, fontSize: 9, bold: true, color: hx("#FFFFFF"), align: "center", valign: "middle" });
  });
  const legend = s.items.map((it) => ({ text: `${it.index}. ${it.title}`, options: { breakLine: true, paraSpaceAfter: 6 } }));
  slide.addText(legend, { x: ox + W + 0.4, y: oy + 0.3, w: CONTENT_W - W - 0.4, h: H, fontSize: 10, color: hx(TEXT_DARK) });
}

function buildCompetitiveDetail(pptx, s) {
  const slide = lightSlide(pptx, s);
  slide.addText("LEAD WITH — HIGH VALUE + UNIQUE", { x: MARGIN, y: CONTENT_TOP, w: CONTENT_W, h: 0.25, fontSize: 10, bold: true, color: hx(ACCENT) });
  const gap = 0.2, w = (CONTENT_W - gap) / 2, h = 1.3;
  s.leadWith.forEach((d, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = MARGIN + col * (w + gap), y = CONTENT_TOP + 0.35 + row * (h + 0.15);
    slide.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color: hx(CARD_BG) }, line: { color: hx("#DCE1E6"), width: 0.75 } });
    const tag = d.isCenterpiece ? "  [DEMO CENTERPIECE]" : "";
    slide.addText(`${d.index}. ${d.title}${tag}`, { x: x + 0.12, y: y + 0.08, w: w - 0.24, h: 0.4, fontSize: 10.5, bold: true, color: hx(TEXT_DARK) });
    slide.addText(d.detail, { x: x + 0.12, y: y + 0.48, w: w - 0.24, h: h - 0.56, fontSize: 8.7, color: hx(TEXT_MUTED) });
  });
  if (s.parity.length) {
    const parityY = CONTENT_TOP + 0.35 + Math.ceil(s.leadWith.length / 2) * (h + 0.15) + 0.15;
    slide.addText("PROVE PARITY — HIGH VALUE, CONTESTED", { x: MARGIN, y: parityY, w: CONTENT_W, h: 0.25, fontSize: 10, bold: true, color: hx(ACCENT) });
    slide.addText(s.parity.map((p) => ({ text: p, options: { bullet: true, breakLine: true } })), {
      x: MARGIN, y: parityY + 0.32, w: CONTENT_W, h: 1.4, fontSize: 10, color: hx(TEXT_DARK),
    });
  }
}

// Native PowerPoint radar chart — a genuine advantage over the PDF's
// hand-drawn pentagon (this one stays a live, editable chart object).
function buildHealthCheck(pptx, s) {
  const slide = lightSlide(pptx, s);
  const w = 6.0;
  s.items.forEach((it, i) => {
    const y = CONTENT_TOP + i * 0.85;
    slide.addText(it.label, { x: MARGIN, y, w: 2, h: 0.25, fontSize: 10, bold: true, color: hx(TEXT_DARK) });
    slide.addText(`${it.score}/6`, { x: MARGIN + w - 0.6, y, w: 0.6, h: 0.25, fontSize: 9, color: hx(TEXT_MUTED), align: "right" });
    const segW = (w - 0.05 * 5) / 6;
    for (let seg = 0; seg < 6; seg++) {
      slide.addShape(pptx.ShapeType.rect, {
        x: MARGIN + seg * (segW + 0.05), y: y + 0.28, w: segW, h: 0.12,
        fill: { color: hx(seg < it.score ? ACCENT : "#DCE1E6") }, line: { type: "none" },
      });
    }
    if (it.rationale) {
      slide.addText(it.rationale, { x: MARGIN, y: y + 0.44, w, h: 0.35, fontSize: 8, color: hx(TEXT_MUTED) });
    }
  });
  slide.addChart(pptx.ChartType.radar, [
    { name: "Score", labels: s.items.map((it) => it.label), values: s.items.map((it) => it.score) },
  ], {
    x: MARGIN + w + 0.3, y: CONTENT_TOP, w: CONTENT_W - w - 0.3, h: 4.3,
    chartColors: [hx(ACCENT)], showLegend: false, showTitle: false,
    valAxisMinVal: 0, valAxisMaxVal: 6, valAxisMajorUnit: 2,
    catAxisLabelColor: hx(TEXT_DARK), catAxisLabelFontSize: 9,
    valAxisHidden: true,
  });
}

function buildClosing(pptx) {
  const slide = baseSlide(pptx, { dark: true });
  const box = logoBox(4.0);
  slide.addImage({ path: logoSrc(), x: PAGE_W / 2 - box.w / 2, y: PAGE_H / 2 - box.h / 2 - 0.3, ...box });
  slide.addText("Make the World See", { x: 0, y: PAGE_H / 2 + box.h / 2 + 0.15, w: PAGE_W, h: 0.35, fontSize: 12, color: hx(ACCENT), align: "center", charSpacing: 1 });
}

const BUILDERS = {
  title: buildTitle,
  sectionDivider: buildSectionDivider,
  narrative: buildNarrative,
  factGrid: buildFactGrid,
  stakeholderGrid: buildStakeholderGrid,
  bulletCallout: buildBulletCallout,
  solutionStack: buildSolutionStack,
  painChain: buildPainChain,
  highlight: buildHighlight,
  visionGrid: numberedCardGrid,
  valueDrivers: numberedCardGrid,
  fourColumn: buildFourColumn,
  timelineTable: buildTimelineTable,
  competitiveQuadrant: buildCompetitiveQuadrant,
  competitiveDetail: buildCompetitiveDetail,
  healthCheck: buildHealthCheck,
  closing: buildClosing,
};

export async function downloadPptx(caseFile) {
  const pptx = new pptxgen();
  pptx.defineLayout({ name: "WIDE", width: PAGE_W, height: PAGE_H });
  pptx.layout = "WIDE";

  const slides = buildDeckModel(caseFile);
  slides.forEach((s) => {
    const build = BUILDERS[s.type];
    if (build) build(pptx, s);
  });

  await pptx.writeFile({ fileName: `caseanalyzer-deck-${slugForCase(caseFile)}-${new Date().toISOString().slice(0, 10)}.pptx` });
}
