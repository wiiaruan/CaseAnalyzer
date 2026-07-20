import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { initDb, saveCase, loadIndex, fetchCase, deleteCase } from "./db.js";

dotenv.config({ path: ".env.local" });

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const EXTRACTION_PROMPT = `You are a sales-enablement analyst at Milestone Systems (open-platform VMS: XProtect, BriefCam analytics, Arcules cloud). Analyse the customer case below using the Growth Activator methodology and return ONE JSON object.

PURPOSE: this output is role-play practice material for a Milestone seller rehearsing Growth Activator strategy. Everything must be concrete enough to rehearse against — stakeholders the seller can question, pains they can quantify in discovery, objections a real customer in this vertical would actually raise. Generic filler makes the practice worthless.

VERTICAL GROUNDING: first identify the customer's vertical (healthcare, education, transportation/transit, airports, critical infrastructure/energy/utilities, city surveillance & public safety, corrections, retail, logistics/manufacturing, casinos/gaming, commercial/corporate). Every inferred value must be plausible FOR THAT VERTICAL:
- Regulations: cite only ones that actually govern it (healthcare: HIPAA, Joint Commission; energy/utilities: NERC CIP; airports: TSA/ICAO; education: FERPA, Clery Act; retail: PCI DSS; public safety/corrections: CJIS; EU customers: GDPR, NIS2). Never attach a regulation foreign to the vertical or region.
- Scale: stakeholder titles, camera counts, incident types and budgets must match the vertical's typical reality (regional hospital ~200-600 cameras; university campus ~400-1500; city surveillance ~500-5000; retail chain ~8-40 per store; airport ~1000-3000; logistics hub ~150-500).
- Competitor: if unnamed, infer the most likely one for the vertical and deal shape (Genetec Security Center in enterprise/airports/city/critical infrastructure; Avigilon (Motorola) in education/commercial; Verkada in cloud-first SMB/retail; Axis Camera Station in small single-site; Hanwha, Bosch BVMS, Honeywell where regionally strong).

MILESTONE CONTEXT (ground value and competitive positioning here; NEVER invent products or numbers): open-platform VMS XProtect (editions Essential+ through Corporate), BriefCam video analytics (forensic smart-search, real-time behavioural alerts), Arcules cloud/hybrid VSaaS, Milestone Interconnect for multi-site federation, XProtect extensions (Access, LPR, Transact, Smart Wall, Incident Manager, Hospital Assist), ~13,000 supported devices via broad device-driver library, ~3,500 technology partners, sold and delivered through a certified reseller/integrator channel, Milestone Care/Care Plus support. Differentiators must map to these real capabilities; parity claims must be genuine parity; never claim a capability Milestone does not have.

METHODOLOGY:
- Pain follows Milestone's Validation Communication structure: Pain -> Causes -> Capabilities -> Organizational impact. Criteria for the pain itself: Personal, Measurable, Negatively stated. Each pain has an OWNER. Causes are the underlying reasons for the pain — never phrase as "they lack X" or "they need X". Capabilities are Issue/Action/Value statements addressing the cause and must NOT name specific products; capabilities must reuse the specific mechanism named in causes — a capability generic enough to fit any cause is wrong. Organizational impact states what is impacted, who owns it, and the link to company strategy.
  category: pick by the SHAPE of the claim, not its topic — "Compliance" = tied to a regulation/audit/mandate; "Too high / increasing" = a negative metric that is growing; "Too low / decreasing" = a positive metric that is shrinking; "Missed opportunity" = a gain being forfeited, not an active problem.
- Key players: Focus = Solution|Transition|Financial; Influence = High|Medium|Low. focus: "Solution" = evaluates or will use the capability directly; "Transition" = owns migration/implementation risk; "Financial" = owns budget or ROI accountability. Infer from the person's role and responsibilities, not their seniority.
- Vision = how the CUSTOMER sees THEMSELVES using the capabilities (their future state, not a pitch).
- Value = quantified drivers + Value Statements (Issue/Action/Value/Check).
- Consensus = Collaboration Plan: events across Solution/Transition/Financial phases, cocreated with Power, each with an owner and timing; mark Go/No-Go milestones where relevant.
- Competitive = Value Grid: every differentiator scores uniqueness (0-10, vs the named competitor) and customerValue (0-10); differentiators[0] must score high on both (the "Differentiators" quadrant — high uniqueness + high value). Lead with unique differentiators, prove parity elsewhere; objections via Acknowledge/Question/Position/Check.
- Pain flow: each pain lists 1-3 other stakeholder roles (from the stakeholders list, or plausible roles) whose work is also impacted — one person's pain is often another's cause (Milestone's Pain Flow tool).
- solution = the open-platform solution map for THIS case, layered like Milestone's architecture slide. Pick ONLY from these canonical catalogs — never invent an item; leave a layer short (or empty for extensions/analytics/cloud) if the case genuinely doesn't need it. Each item's purpose ties it to a specific requirement or pain of this case in ≤ 20 words.
  deviceIntegration catalog: fixed/PTZ/fisheye/multisensor cameras, thermal cameras, LPR cameras, body-worn cameras, radar, lidar, GPS, audio (microphones/speakers/intercom), hardware sensors & I/O, access control hardware, servers/storage.
  platform catalog (native XProtect): Alarm Manager, Audio Management, Bandwidth/Storage Optimization, Centralized Management, Encryption & Cyber Security, Distributed Architecture, Edge Recording Integration, Evidence Export & Storyboarding, Fisheye Dewarp, Hardware Accelerated Decoding, High Availability / Failover Support, I/O Events & Alarm Management, Metadata Support, XProtect Mobile & Web Client, Privacy Masking, PTZ Control & Priority, Rules Engine, System Health Monitoring, User Authentication & Rights Management, Video Smart Search.
  extensions catalog: XProtect Access, XProtect Evidence Manager, XProtect Incident Manager, XProtect Management Server Failover, XProtect LPR, XProtect Smart Wall, XProtect Transact, XProtect Hospital Assist, Milestone Interconnect.
  analytics catalog (BriefCam): forensic multi-camera search & video synopsis review, real-time behavioural alerting, people/vehicle classification & attribute filtering, LPR analytics, heatmaps/counting/dwell business intelligence.
  cloud catalog (Arcules): cloud/hybrid VSaaS, multi-site cloud management, cloud archiving & redundancy, remote/mobile cloud access.
  CATALOG PRECISION: every catalog item is a distinct capability — never blend, conflate, or borrow another item's defining mechanism just because two items sound similar or sit in adjacent layers. In particular: "Milestone Interconnect" federates SEPARATE, independent XProtect systems across sites with limited/intermittent bandwidth, pulling video on demand — it is NOT "Distributed Architecture", which is ONE XProtect system's recording servers spread across locations with reliable connectivity; do not describe Interconnect using Distributed Architecture's mechanism or vice versa. "XProtect Management Server Failover" (a licensed extension protecting the management server itself) is distinct from native "High Availability / Failover Support" (platform-level recording-server redundancy). "I/O Events & Alarm Management" (hardware I/O triggers and rules) is distinct from "Alarm Manager" (the broader alarm workflow/dispatch tool). If unsure exactly what differentiates two similarly-named items, describe only what the item's own name unambiguously implies — never pad a purpose by borrowing a sibling item's capability.
- meta.stage is exactly one of: "Investigate" | "Develop" | "Propose" | "Negotiate" | "Ensure Procurement" (Milestone's Salesforce buying-process stages) — pick the closest match for where this case sits in the sales cycle.
- Opportunity Health Check: score PAIN, POWER, VISION, VALUE, CONSENSUS 0-6 using Milestone's rubric below, based ONLY on what THIS DOCUMENT evidences about the sales process itself (not the customer's business situation). A case briefing rarely documents live deal history — most scores will be 0-2. Do NOT invent meetings, agreements or collaboration the document doesn't describe.
  PAIN: 0 none·1 admitted·2 documented pain+causes confirmed·3 discussed with power·4 pain flow explored org-wide·5 power committed to a time-based reason to act·6 power confirms link to strategy.
  POWER: 0 not identified·1 potential key players identified·2 power identified·3 access to power documented·4 decision process/criteria confirmed by power·5 collaboration plan started with power·6 power agreed to move forward.
  VISION: 0 none·1 discussed with contact·2 co-creation started with contact·3 co-creation started with power·4 implementation plan approved by power·5 proof accepted by power·6 proof approved by power.
  VALUE: 0 none·1 discussed with contact·2 documented value confirmed by contact·3 discussion started with sponsor·4 power accepts value of differentiated solution·5 success criteria agreed with power·6 business case jointly developed.
  CONSENSUS: 0 no plan·1 plan co-created with power·2 agreement on pains from all in power·3 agreement on vision from all in power·4 agreement on differentiated solution from all power·5 agreement on business case/proposal from all in power·6 agreement on commercial/legal terms.

SPECIFICITY: every pain/cause/capability/orgImpact/value string must anchor to a concrete noun from the document or a realistic inferred one — a system name, a number, a role, a metric, a location. Never a generic phrase ("improves efficiency", "streamlines operations", "enhances security") without saying what improves and by roughly how much. If a sentence would read the same for any customer in any industry, rewrite it.

CALIBRATION EXAMPLE (match this level of specificity and register — do not reuse its content):
  pain: "The Director of Security cannot approve access-list changes without physically visiting each site, delaying critical revocations by up to 48 hours."
  causes: "Card-access management is siloed per building with no centralized directory sync between sites."
  capabilities: "A unified access-management layer lets one administrator update multi-site permissions from a single console in minutes."
  orgImpact: "Security operations owns this; delayed revocations create an audit-flagged compliance exposure with the risk and compliance team."
  Value statement — issue: "You mentioned that 80% of these incidents involve aggression directed at staff, driving high turnover — estimated at $2M+ in rehiring costs." action: "Imagine if analytics could detect escalating aggression before it turns physical." value: "This directly reduces turnover and the associated $2M annual cost." check: "How does that resonate with your team?"

PROVENANCE: every field with a "src" key = "doc" if the document states/implies it, else "inferred". NEVER leave a field empty. If missing, infer a value faithful to the context (industry, scale, tech, regulation, goals) and mark it "inferred". Inferred values must survive a fact-check by someone who works in that vertical: realistic ranges, real regulation names, job titles that exist in such an organization — an implausible inference poisons the seller's practice.

Call the emit_case_analysis tool exactly once with the complete analysis — the tool's schema defines the exact field shape, do not respond with plain text.

CASE OVERVIEW (the seller's SCENARIO BRIEFING — describe the situation, do NOT diagnose it):
This section only sets the stage. The seller must DISCOVER the pains, vision, value and positioning themselves in the other sections — so the Overview must NOT contain pain analysis, business impact, quantified value, competitive strategy, or any "answer". Facts of the scenario = yes; interpretations/findings = no.
- overview.summary: a 3-4 sentence narrative situating the case — who the customer is, why they're evaluating now (their stated goal), and where we are in the sales cycle. Neutral framing, no pain/impact analysis.
- overview.snapshot: 6-10 hard facts about the CURRENT situation as label/value cards (current system, scale, technology, constraints, budget/timeline if known). Raw facts only — the material the seller will later mine for pains. Infer realistic values where absent.
  CURRENT-SYSTEM RULE (training material): the seller must practice DISPLACING a competitor or winning a NET-NEW VMS — not selling to a site that already runs Milestone. So unless the document explicitly states the customer already uses Milestone/XProtect, the current system is one of two dominant scenarios: (a) a competitor VMS already installed — the one inferred in VERTICAL GROUNDING (Genetec, Avigilon, Verkada, Bosch BVMS, Hanwha, Axis, Honeywell…), which the seller enters to replace or coexist with; or (b) NO real VMS — analog/legacy cameras, isolated DVR/NVR recorders, or a first-time greenfield purchase. Default strongly to (a) or (b). A Milestone/XProtect EXPANSION is a rare exception, allowed only occasionally for variety and NEVER as the default. Never infer "Milestone XProtect" as the current system just because this is a Milestone briefing.
- stakeholders: 3-6 people the seller will engage. For each: name (or role if unnamed), title, Power-Model focus (Solution|Transition|Financial), influence (High|Medium|Low), and "cares" (2-3 neutral bullets on what matters to that person in their job). Do NOT list their pain points and do NOT give tips on how to win them — the seller discovers those. Infer plausible stakeholders for the industry if the document names none.

REQUIREMENTS: rfi.sections mirror the document's own numbering/titles (e.g. "2.7 Degraded Mode") and hold only the facts of each requirement; mark hard requirements critical:true. solution.narrative is 1-2 sentences on how the layered solution answers this case; solution layers hold 2-6 items each (deviceIntegration and platform are never empty; extensions/analytics/cloud may be empty when genuinely irrelevant). Do NOT add a Milestone response in the Overview. 5-6 pains. 6-8 vision items. 5-6 value drivers with figures. exactly 3 value statements (action starts "Imagine…"/"Consider…"). 4-6 collaboration-plan events spanning Solution/Transition/Financial phases, at least one marked goNoGo:true. differentiators[0] is the demo centerpiece (solves the hardest requirement, uniqueness 8-10 and customerValue 8-10). pains[].affects is empty only if the case genuinely has one isolated stakeholder. 2 fully-worked objections. 3 red flags. If no competitor is named, infer the most likely one. healthCheck scores are always src:"doc"-grade judgment calls, not inferred facts — each rationale is one sentence citing what is (or isn't) evidenced in the document.

WORD BUDGETS (compact ≠ vague — use the budget to be specific, don't pad to fill it, don't cut a concrete detail to save words): titles, labels, category names, discovery statements ≤ 15 words. summary, painHeadline, narrative, healthCheck rationale, rfi section summaries ≤ 30 words. pain-chain fields (pain/causes/capabilities/orgImpact), value statement fields (issue/action/value/check), objection fields (acknowledge/question/position/check), differentiator/red-flag detail ≤ 40 words. This keeps the analysis within the output budget — do not exceed these caps or generation may run out of tokens mid-call.

The user message contains the customer case to analyse.`;

// JSON Schema for the tool call below. Forcing this tool (tool_choice) makes
// the API itself guarantee well-typed, schema-shaped JSON — no more freeform
// text to scan for stray preambles or truncated braces.
const SRC_ENUM = ["doc", "inferred"];
const srcField = () => ({
  type: "object",
  properties: { value: { type: "string" }, src: { type: "string", enum: SRC_ENUM } },
  required: ["value", "src"],
  additionalProperties: false,
});
const solutionLayer = (min, max) => ({
  type: "array",
  minItems: min,
  maxItems: max,
  items: {
    type: "object",
    properties: {
      item: { type: "string" },
      purpose: { type: "string" },
      src: { type: "string", enum: SRC_ENUM },
    },
    required: ["item", "purpose", "src"],
    additionalProperties: false,
  },
});

const CASE_ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    meta: {
      type: "object",
      properties: {
        customer: { type: "string" },
        industry: { type: "string" },
        stage: {
          type: "string",
          enum: ["Investigate", "Develop", "Propose", "Negotiate", "Ensure Procurement"],
        },
        competitor: { type: "string" },
        docType: { type: "string" },
      },
      required: ["customer", "industry", "stage", "competitor", "docType"],
      additionalProperties: false,
    },
    overview: {
      type: "object",
      properties: {
        summary: srcField(),
        snapshot: {
          type: "array",
          minItems: 6,
          maxItems: 10,
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              value: { type: "string" },
              src: { type: "string", enum: SRC_ENUM },
            },
            required: ["label", "value", "src"],
            additionalProperties: false,
          },
        },
      },
      required: ["summary", "snapshot"],
      additionalProperties: false,
    },
    rfi: {
      type: "object",
      properties: {
        intro: srcField(),
        sections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              no: { type: "string" },
              title: { type: "string" },
              summary: srcField(),
              rows: {
                type: "array",
                items: {
                  type: "object",
                  properties: { k: { type: "string" }, v: srcField() },
                  required: ["k", "v"],
                  additionalProperties: false,
                },
              },
              critical: { type: "boolean" },
            },
            required: ["no", "title", "summary", "rows", "critical"],
            additionalProperties: false,
          },
        },
      },
      required: ["intro", "sections"],
      additionalProperties: false,
    },
    solution: {
      type: "object",
      properties: {
        narrative: { type: "string" },
        deviceIntegration: solutionLayer(2, 6),
        platform: solutionLayer(2, 6),
        extensions: solutionLayer(0, 6),
        analytics: solutionLayer(0, 6),
        cloud: solutionLayer(0, 6),
      },
      required: ["narrative", "deviceIntegration", "platform", "extensions", "analytics", "cloud"],
      additionalProperties: false,
    },
    discovery: {
      type: "object",
      properties: {
        statements: { type: "array", items: srcField() },
        competitorAlert: srcField(),
      },
      required: ["statements", "competitorAlert"],
      additionalProperties: false,
    },
    stakeholders: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          title: { type: "string" },
          focus: { type: "string", enum: ["Solution", "Transition", "Financial"] },
          influence: { type: "string", enum: ["High", "Medium", "Low"] },
          cares: { type: "array", minItems: 2, maxItems: 3, items: { type: "string" } },
          src: { type: "string", enum: SRC_ENUM },
        },
        required: ["name", "title", "focus", "influence", "cares", "src"],
        additionalProperties: false,
      },
    },
    pains: {
      type: "array",
      minItems: 5,
      maxItems: 6,
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          category: {
            type: "string",
            enum: ["Compliance", "Too high / increasing", "Too low / decreasing", "Missed opportunity"],
          },
          owner: { type: "string" },
          pain: { type: "string" },
          causes: { type: "string" },
          capabilities: { type: "string" },
          orgImpact: { type: "string" },
          affects: { type: "array", items: { type: "string" } },
          src: { type: "string", enum: SRC_ENUM },
        },
        required: ["title", "category", "owner", "pain", "causes", "capabilities", "orgImpact", "affects", "src"],
        additionalProperties: false,
      },
    },
    painHeadline: { type: "string" },
    vision: {
      type: "object",
      properties: {
        items: {
          type: "array",
          minItems: 6,
          maxItems: 8,
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              detail: { type: "string" },
              src: { type: "string", enum: SRC_ENUM },
            },
            required: ["title", "detail", "src"],
            additionalProperties: false,
          },
        },
        playback: { type: "string" },
      },
      required: ["items", "playback"],
      additionalProperties: false,
    },
    value: {
      type: "object",
      properties: {
        drivers: {
          type: "array",
          minItems: 5,
          maxItems: 6,
          items: {
            type: "object",
            properties: {
              driver: { type: "string" },
              mechanism: { type: "string" },
              impact: { type: "string" },
              src: { type: "string", enum: SRC_ENUM },
            },
            required: ["driver", "mechanism", "impact", "src"],
            additionalProperties: false,
          },
        },
        statements: {
          type: "array",
          minItems: 3,
          maxItems: 3,
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              issue: { type: "string" },
              action: { type: "string" },
              value: { type: "string" },
              check: { type: "string" },
            },
            required: ["name", "issue", "action", "value", "check"],
            additionalProperties: false,
          },
        },
      },
      required: ["drivers", "statements"],
      additionalProperties: false,
    },
    consensus: {
      type: "object",
      properties: {
        summary: { type: "string" },
        events: {
          type: "array",
          minItems: 4,
          maxItems: 6,
          items: {
            type: "object",
            properties: {
              event: { type: "string" },
              phase: { type: "string", enum: ["Solution", "Transition", "Financial"] },
              weekOf: { type: "string" },
              responsible: { type: "string" },
              goNoGo: { type: "boolean" },
              src: { type: "string", enum: SRC_ENUM },
            },
            required: ["event", "phase", "weekOf", "responsible", "goNoGo", "src"],
            additionalProperties: false,
          },
        },
      },
      required: ["summary", "events"],
      additionalProperties: false,
    },
    competitive: {
      type: "object",
      properties: {
        narrative: { type: "string" },
        differentiators: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              detail: { type: "string" },
              uniqueness: { type: "integer", minimum: 0, maximum: 10 },
              customerValue: { type: "integer", minimum: 0, maximum: 10 },
            },
            required: ["title", "detail", "uniqueness", "customerValue"],
            additionalProperties: false,
          },
        },
        parity: { type: "array", items: { type: "string" } },
        objections: {
          type: "array",
          minItems: 2,
          maxItems: 2,
          items: {
            type: "object",
            properties: {
              objection: { type: "string" },
              acknowledge: { type: "string" },
              question: { type: "string" },
              position: { type: "string" },
              check: { type: "string" },
            },
            required: ["objection", "acknowledge", "question", "position", "check"],
            additionalProperties: false,
          },
        },
        redFlags: { type: "array", minItems: 3, maxItems: 3, items: { type: "string" } },
      },
      required: ["narrative", "differentiators", "parity", "objections", "redFlags"],
      additionalProperties: false,
    },
    healthCheck: {
      type: "object",
      properties: Object.fromEntries(
        ["pain", "power", "vision", "value", "consensus"].map((k) => [
          k,
          {
            type: "object",
            properties: {
              score: { type: "integer", minimum: 0, maximum: 6 },
              rationale: { type: "string" },
            },
            required: ["score", "rationale"],
            additionalProperties: false,
          },
        ])
      ),
      required: ["pain", "power", "vision", "value", "consensus"],
      additionalProperties: false,
    },
  },
  required: [
    "meta", "overview", "rfi", "solution", "discovery", "stakeholders", "pains",
    "painHeadline", "vision", "value", "consensus", "competitive", "healthCheck",
  ],
  additionalProperties: false,
};

// The connect phase gets one retry on a hung connection or a transient
// 429/5xx — otherwise a blip throws away the client's PDF extraction and
// makes the user redo the whole upload. Once the stream is flowing we no
// longer retry (the client is already receiving live progress); instead
// each read is bounded by an idle timeout so a stalled connection is
// detected quickly instead of hanging for minutes.
const ANTHROPIC_CONNECT_TIMEOUT_MS = 30000;
const ANTHROPIC_IDLE_TIMEOUT_MS = 60000;
const ANTHROPIC_RETRY_DELAY_MS = 1000;
const MAX_OUTPUT_TOKENS = 20000;
// A typical completed analysis runs ~18-20K JSON characters (well under the
// max_tokens ceiling, which is a hard cap, not the expected size) — used to
// turn the live byte count into a percentage for the progress bar.
const EXPECTED_OUTPUT_CHARS = 20000;

async function openAnthropicStream(body) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set in .env.local");

  const attempt = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ANTHROPIC_CONNECT_TIMEOUT_MS);
    try {
      return await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  for (let i = 0; ; i++) {
    try {
      const res = await attempt();
      if (res.ok || i > 0 || (res.status !== 429 && res.status < 500)) return res;
    } catch (e) {
      if (i > 0) {
        const detail = e.name === "AbortError" ? "could not reach the API in time" : e.message;
        throw new Error("NETWORK: " + detail);
      }
    }
    await new Promise((r) => setTimeout(r, ANTHROPIC_RETRY_DELAY_MS));
  }
}

function readWithTimeout(reader, ms) {
  return Promise.race([
    reader.read(),
    new Promise((_, reject) => setTimeout(() => reject(new Error("stream went idle")), ms)),
  ]);
}

// Streams the Anthropic response and reassembles the forced tool call's
// JSON arguments from `input_json_delta` chunks. onProgress is called with
// the cumulative output token count as it grows, so the UI can show real
// progress instead of a time-based guess.
async function analyzeCase(caseText, onProgress) {
  const res = await openAnthropicStream(
    JSON.stringify({
      model: "claude-fable-5",
      max_tokens: MAX_OUTPUT_TOKENS,
      stream: true,
      // Forcing this tool makes the API return schema-validated JSON directly
      // (see CASE_ANALYSIS_SCHEMA) instead of freeform text we have to parse.
      tools: [
        {
          name: "emit_case_analysis",
          description: "Return the completed Growth Activator case analysis.",
          input_schema: CASE_ANALYSIS_SCHEMA,
          cache_control: { type: "ephemeral", ttl: "1h" },
        },
      ],
      tool_choice: { type: "tool", name: "emit_case_analysis" },
      // The static methodology prompt is cached (1h TTL) so repeat analyses
      // within the hour read it at 0.1x input price; only the case varies.
      system: [
        {
          type: "text",
          text: EXTRACTION_PROMPT,
          cache_control: { type: "ephemeral", ttl: "1h" },
        },
      ],
      messages: [{ role: "user", content: "CUSTOMER CASE:\n" + caseText }],
    })
  );

  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {}
    throw new Error(`API ${res.status}: ${detail}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let jsonInput = "";
  let stopReason = null;
  let usage = null;
  let lastReportedLen = 0;

  try {
    while (true) {
      let chunk;
      try {
        chunk = await readWithTimeout(reader, ANTHROPIC_IDLE_TIMEOUT_MS);
      } catch (e) {
        reader.cancel().catch(() => {});
        throw new Error("NETWORK: " + e.message);
      }
      if (chunk.done) break;
      buf += decoder.decode(chunk.value, { stream: true });

      let idx;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const dataLine = block.split("\n").find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        const payload = dataLine.slice(5).trim();
        if (!payload) continue;

        let evt;
        try {
          evt = JSON.parse(payload);
        } catch {
          continue;
        }

        if (evt.type === "content_block_delta" && evt.delta?.type === "input_json_delta") {
          jsonInput += evt.delta.partial_json || "";
          // `message_delta` (the event carrying usage.output_tokens) fires
          // exactly once, right at the end of the stream — it's useless for
          // live progress. The JSON accumulated so far arrives incrementally
          // across ~thousands of these deltas, so drive progress off its
          // growing length instead (throttled so we're not emitting an SSE
          // event per delta).
          if (onProgress && jsonInput.length - lastReportedLen >= 200) {
            lastReportedLen = jsonInput.length;
            onProgress(jsonInput.length);
          }
        } else if (evt.type === "message_start") {
          usage = evt.message?.usage || usage;
        } else if (evt.type === "message_delta") {
          if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason;
          if (evt.usage) usage = { ...usage, ...evt.usage };
        } else if (evt.type === "error") {
          throw new Error("API error: " + JSON.stringify(evt.error).slice(0, 300));
        }
      }
    }
  } finally {
    if (usage) {
      console.log(
        `usage: in=${usage.input_tokens || 0} cache_write=${usage.cache_creation_input_tokens || 0} ` +
          `cache_read=${usage.cache_read_input_tokens || 0} out=${usage.output_tokens || 0}`
      );
    }
  }

  if (stopReason === "refusal") {
    throw new Error("The model declined to analyze this document.");
  }
  if (stopReason === "max_tokens") {
    throw new Error(
      "The model ran out of output tokens mid-analysis. Try a shorter/simpler case document."
    );
  }
  if (!jsonInput) throw new Error("Model did not call the emit_case_analysis tool.");

  try {
    return JSON.parse(jsonInput);
  } catch (e) {
    throw new Error("Model output was not valid JSON: " + e.message);
  }
}

// Routes

// Analizar texto (POST desde frontend después de extraer PDF)
// Streams progress as SSE so a slow multi-minute generation shows real
// movement instead of the client sitting on one blocking fetch.
app.post("/api/analyze", async (req, res) => {
  const { caseText } = req.body;
  if (!caseText) return res.status(400).json({ error: "caseText required" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const result = await analyzeCase(caseText, (chars) => {
      send("progress", { chars, expectedChars: EXPECTED_OUTPUT_CHARS });
    });
    send("done", result);
  } catch (e) {
    console.error(e);
    send("error", { message: e.message });
  } finally {
    res.end();
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
