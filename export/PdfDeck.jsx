import React from "react";
import { Document, Page, View, Text, Image, Svg, Circle, Line, Rect, Polygon, pdf } from "@react-pdf/renderer";
import {
  ACCENT, DARK, LIGHT_BG, CARD_BG, TEXT_DARK, TEXT_MUTED, TEXT_ON_DARK,
  TEXT_MUTED_ON_DARK, RED, RED_BG, LOGO_URL, SOLUTION_TIER_COLORS, PHASE_COLORS,
} from "./brand.js";
import { buildDeckModel, slugForCase } from "./deckModel.js";

// 16:9 slide, in points (72pt = 1in) — 13.33in x 7.5in.
const PAGE = { width: 960, height: 540 };

// react-pdf ships Helvetica built in with zero network/font-loading risk;
// Bricolage Grotesque (the app's headline font) needs a remote font fetch at
// export time, which would make deck generation depend on a third-party CDN
// being reachable — not worth the fragility for a document users need to
// reliably export offline-ish. Helvetica-Bold stands in for headlines.
const s = {
  lightPage: { width: PAGE.width, height: PAGE.height, backgroundColor: LIGHT_BG, padding: 40, fontFamily: "Helvetica" },
  darkPage: { width: PAGE.width, height: PAGE.height, backgroundColor: DARK, padding: 40, fontFamily: "Helvetica" },
  breadcrumb: { fontSize: 10, fontFamily: "Helvetica-Bold", color: ACCENT, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 6 },
  title: { fontSize: 26, fontFamily: "Helvetica-Bold", color: TEXT_DARK, marginBottom: 18 },
  titleOnDark: { fontSize: 26, fontFamily: "Helvetica-Bold", color: TEXT_ON_DARK, marginBottom: 18 },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  footerLogo: { width: 72, height: undefined },
  body: { fontSize: 10.5, color: TEXT_DARK, lineHeight: 1.5 },
};

function Footer({ dark }) {
  return (
    <View style={s.footer} fixed>
      <Image src={LOGO_URL} style={{ width: 72 }} />
      <View />
    </View>
  );
}

function LightFrame({ breadcrumb, title, children }) {
  return (
    <Page size={[PAGE.width, PAGE.height]} style={s.lightPage}>
      {breadcrumb ? <Text style={s.breadcrumb}>{breadcrumb}</Text> : null}
      <Text style={s.title}>{title}</Text>
      <View style={{ flex: 1 }}>{children}</View>
      <Footer />
    </Page>
  );
}

function Card({ children, style }) {
  return (
    <View style={[{ backgroundColor: CARD_BG, borderRadius: 6, padding: 14, borderWidth: 1, borderColor: "#DCE1E6" }, style]}>
      {children}
    </View>
  );
}

function CardLabel({ children, color = ACCENT }) {
  return <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>{children}</Text>;
}

/* ---------- slide components ---------- */

function TitleSlide({ customer, industry, stage, competitor }) {
  const sub = [industry, stage, competitor && `vs. ${competitor}`].filter(Boolean).join("   ·   ");
  return (
    <Page size={[PAGE.width, PAGE.height]} style={s.darkPage}>
      <View style={{ flex: 1, justifyContent: "center" }}>
        <Image src={LOGO_URL} style={{ width: 140, marginBottom: 28 }} />
        <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", color: ACCENT, textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>
          Growth Activator · Case Briefing
        </Text>
        <Text style={{ fontSize: 40, fontFamily: "Helvetica-Bold", color: TEXT_ON_DARK, marginBottom: 12 }}>{customer || "Customer"}</Text>
        {sub ? <Text style={{ fontSize: 13, color: TEXT_MUTED_ON_DARK }}>{sub}</Text> : null}
      </View>
      <Footer dark />
    </Page>
  );
}

function SectionDividerSlide({ title }) {
  return (
    <Page size={[PAGE.width, PAGE.height]} style={s.darkPage}>
      <Image src={LOGO_URL} style={{ width: 90, marginBottom: 8 }} />
      <View style={{ flex: 1, justifyContent: "center" }}>
        <Text style={{ fontSize: 46, fontFamily: "Helvetica-Bold", color: ACCENT }}>{title}</Text>
      </View>
      <Footer dark />
    </Page>
  );
}

function NarrativeSlide({ breadcrumb, title, text }) {
  return (
    <LightFrame breadcrumb={breadcrumb} title={title}>
      <Text style={[s.body, { fontSize: 13, lineHeight: 1.6 }]}>{text}</Text>
    </LightFrame>
  );
}

function FactGridSlide({ breadcrumb, title, items }) {
  return (
    <LightFrame breadcrumb={breadcrumb} title={title}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {items.map((it, i) => (
          <Card key={i} style={{ width: 205 }}>
            <CardLabel>{it.label}</CardLabel>
            <Text style={s.body}>{it.value}</Text>
          </Card>
        ))}
      </View>
    </LightFrame>
  );
}

function StakeholderGridSlide({ breadcrumb, title, items }) {
  return (
    <LightFrame breadcrumb={breadcrumb} title={title}>
      <View style={{ flexDirection: "row", gap: 14 }}>
        {items.map((p, i) => (
          <Card key={i} style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontFamily: "Helvetica-Bold", color: TEXT_DARK, marginBottom: 2 }}>{p.name}</Text>
            <Text style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 8 }}>{p.title}</Text>
            <View style={{ flexDirection: "row", gap: 6, marginBottom: 10 }}>
              <Text style={{ fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#fff", backgroundColor: ACCENT, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 6 }}>{p.focus}</Text>
              <Text style={{ fontSize: 8.5, fontFamily: "Helvetica-Bold", color: TEXT_DARK, backgroundColor: "#E7EAED", borderRadius: 3, paddingVertical: 2, paddingHorizontal: 6 }}>{p.influence} influence</Text>
            </View>
            {(p.cares || []).map((c, j) => (
              <Text key={j} style={[s.body, { fontSize: 9.5, marginBottom: 4 }]}>• {c}</Text>
            ))}
          </Card>
        ))}
      </View>
    </LightFrame>
  );
}

function BulletCalloutSlide({ breadcrumb, title, bullets, calloutTitle, calloutText }) {
  return (
    <LightFrame breadcrumb={breadcrumb} title={title}>
      {bullets.map((b, i) => (
        <Text key={i} style={[s.body, { fontSize: 12, marginBottom: 8 }]}>• {b}</Text>
      ))}
      {calloutText ? (
        <View style={{ marginTop: 14, backgroundColor: RED_BG, borderLeftWidth: 3, borderLeftColor: RED, borderRadius: 4, padding: 12 }}>
          <CardLabel color={RED}>{calloutTitle}</CardLabel>
          <Text style={s.body}>{calloutText}</Text>
        </View>
      ) : null}
    </LightFrame>
  );
}

function SolutionStackSlide({ breadcrumb, title, layers }) {
  return (
    <LightFrame breadcrumb={breadcrumb} title={title}>
      <View style={{ gap: 10 }}>
        {layers.map((layer, i) => (
          <View key={i} style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ width: 130, backgroundColor: SOLUTION_TIER_COLORS[layer.key] || DARK, borderRadius: 4, padding: 8, justifyContent: "center" }}>
              <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: "#fff" }}>{layer.name}</Text>
            </View>
            <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
              {layer.items.map((it, j) => (
                <View key={j} style={{ backgroundColor: CARD_BG, borderRadius: 3, borderWidth: 1, borderColor: "#DCE1E6", paddingVertical: 3, paddingHorizontal: 7 }}>
                  <Text style={{ fontSize: 8.5, color: TEXT_DARK }}>{it.item}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    </LightFrame>
  );
}

function FourColCard({ label, color, children }) {
  return (
    <View style={{ flex: 1, backgroundColor: CARD_BG, borderRadius: 5, overflow: "hidden", borderWidth: 1, borderColor: "#DCE1E6" }}>
      <View style={{ backgroundColor: color || DARK, paddingVertical: 6, paddingHorizontal: 8 }}>
        <Text style={{ fontSize: 9.5, fontFamily: "Helvetica-Bold", color: "#fff" }}>{label}</Text>
      </View>
      <View style={{ padding: 8 }}>
        <Text style={{ fontSize: 8.7, color: TEXT_DARK, lineHeight: 1.4 }}>{children}</Text>
      </View>
    </View>
  );
}

function PainChainSlide({ index, total, title, owner, category, pain, causes, capabilities, orgImpact, affects }) {
  return (
    <LightFrame breadcrumb={`Customer Pain #${index} of ${total}`} title={title}>
      <Text style={{ fontSize: 9.5, color: TEXT_MUTED, marginBottom: 10 }}>Owner: {owner}   ·   Category: {category}</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <FourColCard label="Pain">{pain}</FourColCard>
        <FourColCard label="Causes">{causes}</FourColCard>
        <FourColCard label="Capabilities">{capabilities}</FourColCard>
        <FourColCard label="Organizational impact">{orgImpact}</FourColCard>
      </View>
      {affects.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 12 }}>
          <Text style={{ fontSize: 9, color: TEXT_MUTED, marginRight: 4 }}>Also impacts:</Text>
          {affects.map((a, i) => (
            <Text key={i} style={{ fontSize: 8.5, color: TEXT_DARK, backgroundColor: "#E7EAED", borderRadius: 3, paddingVertical: 2, paddingHorizontal: 6 }}>{a}</Text>
          ))}
        </View>
      ) : null}
    </LightFrame>
  );
}

function HighlightSlide({ eyebrow, text }) {
  return (
    <Page size={[PAGE.width, PAGE.height]} style={s.darkPage}>
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 60 }}>
        {eyebrow ? <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", color: ACCENT, textTransform: "uppercase", letterSpacing: 2, marginBottom: 14 }}>{eyebrow}</Text> : null}
        <Text style={{ fontSize: 24, fontFamily: "Helvetica-Bold", color: TEXT_ON_DARK, lineHeight: 1.4 }}>{text}</Text>
      </View>
      <Footer dark />
    </Page>
  );
}

function VisionGridSlide({ breadcrumb, title, items, startIndex }) {
  return (
    <LightFrame breadcrumb={breadcrumb} title={title}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {items.map((it, i) => (
          <Card key={i} style={{ width: 205 }}>
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: ACCENT, alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
              <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: "#fff" }}>{startIndex + i + 1}</Text>
            </View>
            <Text style={{ fontSize: 10.5, fontFamily: "Helvetica-Bold", color: TEXT_DARK, marginBottom: 4 }}>{it.title}</Text>
            <Text style={{ fontSize: 9, color: TEXT_MUTED, lineHeight: 1.4 }}>{it.detail}</Text>
          </Card>
        ))}
      </View>
    </LightFrame>
  );
}

function ValueDriversSlide({ breadcrumb, title, items, startIndex }) {
  return (
    <LightFrame breadcrumb={breadcrumb} title={title}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {items.map((it, i) => (
          <Card key={i} style={{ width: 205 }}>
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: ACCENT, alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
              <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: "#fff" }}>{startIndex + i + 1}</Text>
            </View>
            <Text style={{ fontSize: 10.5, fontFamily: "Helvetica-Bold", color: TEXT_DARK, marginBottom: 4 }}>{it.title}</Text>
            <Text style={{ fontSize: 9, color: TEXT_MUTED, lineHeight: 1.4 }}>{it.detail}</Text>
          </Card>
        ))}
      </View>
    </LightFrame>
  );
}

function FourColumnSlide({ breadcrumb, title, headers, rows, calloutTitle, calloutItems }) {
  return (
    <LightFrame breadcrumb={breadcrumb} title={title}>
      <View style={{ gap: 14 }}>
        {rows.map((row, i) => (
          <View key={i}>
            <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: TEXT_DARK, marginBottom: 5 }}>{row.label}</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {headers.map((h, j) => (
                <FourColCard key={j} label={h}>{row.values[j]}</FourColCard>
              ))}
            </View>
          </View>
        ))}
      </View>
      {calloutItems && calloutItems.length ? (
        <View style={{ marginTop: 14, backgroundColor: RED_BG, borderLeftWidth: 3, borderLeftColor: RED, borderRadius: 4, padding: 12 }}>
          <CardLabel color={RED}>{calloutTitle}</CardLabel>
          {calloutItems.map((r, i) => (
            <Text key={i} style={[s.body, { fontSize: 9, marginBottom: 3 }]}>• {r}</Text>
          ))}
        </View>
      ) : null}
    </LightFrame>
  );
}

function TimelineTableSlide({ breadcrumb, title, rows }) {
  const colW = [280, 100, 90, 170, 90];
  return (
    <LightFrame breadcrumb={breadcrumb} title={title}>
      <View style={{ borderWidth: 1, borderColor: "#DCE1E6", borderRadius: 6, overflow: "hidden" }}>
        <View style={{ flexDirection: "row", backgroundColor: DARK, paddingVertical: 7 }}>
          {["Event", "Phase", "Week of", "Responsible", "Go/No-Go"].map((h, i) => (
            <Text key={i} style={{ width: colW[i], paddingHorizontal: 8, fontSize: 9, fontFamily: "Helvetica-Bold", color: "#fff" }}>{h}</Text>
          ))}
        </View>
        {rows.map((r, i) => (
          <View key={i} style={{ flexDirection: "row", backgroundColor: i % 2 ? "#F4F5F6" : CARD_BG, paddingVertical: 7, borderTopWidth: 1, borderTopColor: "#EAEDEF" }}>
            <Text style={{ width: colW[0], paddingHorizontal: 8, fontSize: 9, color: TEXT_DARK }}>{r.event}</Text>
            <View style={{ width: colW[1], paddingHorizontal: 8 }}>
              <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: "#fff", backgroundColor: PHASE_COLORS[r.phase] || DARK, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 5, alignSelf: "flex-start" }}>{r.phase}</Text>
            </View>
            <Text style={{ width: colW[2], paddingHorizontal: 8, fontSize: 9, color: TEXT_DARK }}>{r.weekOf}</Text>
            <Text style={{ width: colW[3], paddingHorizontal: 8, fontSize: 9, color: TEXT_DARK }}>{r.responsible}</Text>
            <Text style={{ width: colW[4], paddingHorizontal: 8, fontSize: 9, color: r.goNoGo ? ACCENT : TEXT_MUTED, fontFamily: r.goNoGo ? "Helvetica-Bold" : "Helvetica" }}>{r.goNoGo ? "Go/No-Go" : "—"}</Text>
          </View>
        ))}
      </View>
    </LightFrame>
  );
}

// Score-to-coordinate math ported from CaseAnalyzer.jsx's ValueGrid component
// (an SVG scatter of the same two axes) into react-pdf's SVG primitives.
function CompetitiveQuadrantSlide({ breadcrumb, title, items }) {
  const W = 420, H = 300, ox = 60, oy = 20;
  const toX = (v) => ox + (v / 10) * W;
  const toY = (v) => oy + H - (v / 10) * H;
  return (
    <LightFrame breadcrumb={breadcrumb} title={title}>
      <View style={{ flexDirection: "row", gap: 24 }}>
        <Svg width={ox + W + 40} height={oy + H + 40}>
          <Rect x={ox} y={oy} width={W / 2} height={H / 2} fill="#F4F5F6" />
          <Rect x={ox + W / 2} y={oy} width={W / 2} height={H / 2} fill="#E4F3FB" />
          <Rect x={ox} y={oy + H / 2} width={W / 2} height={H / 2} fill="#F9FAFA" />
          <Rect x={ox + W / 2} y={oy + H / 2} width={W / 2} height={H / 2} fill="#F4F5F6" />
          <Line x1={ox} y1={oy} x2={ox} y2={oy + H} stroke="#B7BEC4" strokeWidth={1} />
          <Line x1={ox} y1={oy + H} x2={ox + W} y2={oy + H} stroke="#B7BEC4" strokeWidth={1} />
          <Text x={ox + 6} y={oy + 14} style={{ fontSize: 8 }}>COOL STUFF</Text>
          <Text x={ox + W / 2 + 6} y={oy + 14} style={{ fontSize: 8, fontFamily: "Helvetica-Bold" }}>DIFFERENTIATORS</Text>
          <Text x={ox + 6} y={oy + H - 6} style={{ fontSize: 8 }}>TRIVIAL</Text>
          <Text x={ox + W / 2 + 6} y={oy + H - 6} style={{ fontSize: 8 }}>CORE</Text>
          {items.map((it, i) => (
            <Circle key={i} cx={toX(it.customerValue)} cy={toY(it.uniqueness)} r={9} fill={ACCENT} />
          ))}
          {items.map((it, i) => (
            <Text key={"t" + i} x={toX(it.customerValue) - 3} y={toY(it.uniqueness) + 3} style={{ fontSize: 8, fontFamily: "Helvetica-Bold", fill: "#fff" }}>{it.index}</Text>
          ))}
        </Svg>
        <View style={{ flex: 1, justifyContent: "center", gap: 6 }}>
          {items.map((it, i) => (
            <Text key={i} style={{ fontSize: 9, color: TEXT_DARK }}><Text style={{ fontFamily: "Helvetica-Bold", color: ACCENT }}>{it.index}. </Text>{it.title}</Text>
          ))}
        </View>
      </View>
    </LightFrame>
  );
}

function CompetitiveDetailSlide({ breadcrumb, title, leadWith, parity }) {
  return (
    <LightFrame breadcrumb={breadcrumb} title={title}>
      <CardLabel>Lead with — high value + unique</CardLabel>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        {leadWith.map((d, i) => (
          <Card key={i} style={{ width: 428 }}>
            <Text style={{ fontSize: 10.5, fontFamily: "Helvetica-Bold", color: TEXT_DARK, marginBottom: 4 }}>
              {d.index}. {d.title} {d.isCenterpiece ? <Text style={{ fontSize: 7.5, color: "#fff", backgroundColor: ACCENT, borderRadius: 3, paddingVertical: 1, paddingHorizontal: 4 }}> DEMO CENTERPIECE </Text> : null}
            </Text>
            <Text style={{ fontSize: 9, color: TEXT_MUTED, lineHeight: 1.4 }}>{d.detail}</Text>
          </Card>
        ))}
      </View>
      {parity.length ? (
        <View>
          <CardLabel>Prove parity — high value, contested</CardLabel>
          {parity.map((p, i) => (
            <Text key={i} style={{ fontSize: 9.5, color: TEXT_DARK, marginBottom: 4 }}>✓ {p}</Text>
          ))}
        </View>
      ) : null}
    </LightFrame>
  );
}

function HealthCheckSlide({ breadcrumb, title, items }) {
  // Local to the 320x320 <Svg> viewport below, NOT page coordinates.
  const cx = 160, cy = 150, R = 100;
  const angleFor = (i) => -90 + i * (360 / items.length);
  const pt = (i, r) => {
    const a = (angleFor(i) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const poly = items.map((it, i) => pt(i, (Math.max(0, Math.min(6, it.score)) / 6) * R).join(",")).join(" ");
  return (
    <LightFrame breadcrumb={breadcrumb} title={title}>
      <View style={{ flexDirection: "row", gap: 20 }}>
        <View style={{ width: 470, gap: 12 }}>
          {items.map((it, i) => (
            <View key={i}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
                <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: TEXT_DARK }}>{it.label}</Text>
                <Text style={{ fontSize: 9, color: TEXT_MUTED }}>{it.score}/6</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 2, marginBottom: 4 }}>
                {[0, 1, 2, 3, 4, 5].map((seg) => (
                  <View key={seg} style={{ flex: 1, height: 8, borderRadius: 2, backgroundColor: seg < it.score ? ACCENT : "#DCE1E6" }} />
                ))}
              </View>
              {it.rationale ? <Text style={{ fontSize: 8.3, color: TEXT_MUTED, lineHeight: 1.4 }}>{it.rationale}</Text> : null}
            </View>
          ))}
        </View>
        <Svg width={320} height={320}>
          {[0.33, 0.66, 1].map((f, i) => (
            <Polygon key={i} points={items.map((_, j) => pt(j, R * f).join(",")).join(" ")} fill="none" stroke="#DCE1E6" strokeWidth={1} />
          ))}
          {items.map((_, i) => {
            const [x, y] = pt(i, R);
            return <Line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#DCE1E6" strokeWidth={1} />;
          })}
          <Polygon points={poly} fill={ACCENT} fillOpacity={0.35} stroke={ACCENT} strokeWidth={1.5} />
          {items.map((it, i) => {
            const [x, y] = pt(i, R + 22);
            return <Text key={i} x={x - 18} y={y} style={{ fontSize: 8, fontFamily: "Helvetica-Bold" }}>{it.label}</Text>;
          })}
        </Svg>
      </View>
    </LightFrame>
  );
}

function ClosingSlide() {
  return (
    <Page size={[PAGE.width, PAGE.height]} style={s.darkPage}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Image src={LOGO_URL} style={{ width: 220, marginBottom: 14 }} />
        <Text style={{ fontSize: 12, color: ACCENT, letterSpacing: 1 }}>Make the World See</Text>
      </View>
    </Page>
  );
}

const SLIDE_COMPONENTS = {
  title: TitleSlide,
  sectionDivider: SectionDividerSlide,
  narrative: NarrativeSlide,
  factGrid: FactGridSlide,
  stakeholderGrid: StakeholderGridSlide,
  bulletCallout: BulletCalloutSlide,
  solutionStack: SolutionStackSlide,
  painChain: PainChainSlide,
  highlight: HighlightSlide,
  visionGrid: VisionGridSlide,
  valueDrivers: ValueDriversSlide,
  fourColumn: FourColumnSlide,
  timelineTable: TimelineTableSlide,
  competitiveQuadrant: CompetitiveQuadrantSlide,
  competitiveDetail: CompetitiveDetailSlide,
  healthCheck: HealthCheckSlide,
  closing: ClosingSlide,
};

function PdfDeck({ slides }) {
  return (
    <Document>
      {slides.map((slide, i) => {
        const Comp = SLIDE_COMPONENTS[slide.type];
        if (!Comp) return null;
        return <Comp key={i} {...slide} />;
      })}
    </Document>
  );
}

export async function downloadPdf(caseFile) {
  const slides = buildDeckModel(caseFile);
  const blob = await pdf(<PdfDeck slides={slides} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `caseanalyzer-deck-${slugForCase(caseFile)}-${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
