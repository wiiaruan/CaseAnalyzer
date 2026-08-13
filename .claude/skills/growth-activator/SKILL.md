---
name: growth-activator
description: Milestone's Growth Activator methodology for building a sales case pain chain by hand (in chat or in Claude Code) — painDescription vs pain, MEDDIC pain criteria, causes phrasing, product-agnostic capabilities, category selection, value drivers, collaboration plan, competitive value grid. Use whenever authoring or reviewing Growth Activator content outside the CaseAnalyzer app itself.
---

# Growth Activator methodology

This is the methodology CaseAnalyzer's backend applies automatically when it analyzes
a PDF (`backend/server.js`, `EXTRACTION_PROMPT`). This skill exists for the cases where
you're doing the same work **by hand** — drafting a case in chat, editing one directly,
or building training material — and want the same rules without re-deriving them.

**This is a second copy of rules that live in `backend/server.js`.** If the prompt
changes there, this file can drift. When in doubt about a rule, `backend/server.js`
(search `EXTRACTION_PROMPT`) is the source of truth — treat this skill as a distilled,
authoring-time copy, not the canonical version.

The XProtect/Extensions/Partner/Device catalog and product-distinction traps are a
separate skill: [[xprotect-portfolio]]. The enterprise tone/register rules are a
separate skill: [[milestone-tone]]. This skill covers the pain-chain and deal-structure
methodology itself.

## Pain chain — the core distinction

Pain follows Milestone's Validation Communication structure:
**Pain Description → Pain → Causes → Capabilities.** These are different fields —
never blend them:

- **painDescription** — the neutral, factual situation: what is broken, missing, or
  failing, stated without consequence or judgment. Just the observable fact.
- **pain** — ONLY the consequence of that fact, built strictly from the MEDDIC pain
  criteria:
  - **Personal** — a named role/title owns it (is measured, held accountable, or
    answers for it).
  - **Measurable** — quantify the impact wherever supportable: cost, time, headcount,
    fines. When a genuine dollar figure isn't supportable, use the next-best concrete
    unit — regulatory exposure, safety/life-risk, reputational/contractual consequence.
    Never fall back to vague language just because there's no dollar figure.
  - **Negatively stated.**
  - Explicitly links to company strategy or a named business consequence.

  `pain` must NOT restate the fact already given in `painDescription` — it starts from
  that fact and states only what it costs, who answers for it, and why it matters
  strategically.
- Each pain has an **owner**, which may differ from the role named inside the pain
  statement (e.g. a team that tracks the exposure, not the person who feels it).
- **causes** — the underlying reasons for the fact in painDescription. Never phrase as
  "they lack X" or "they need X" — that's a solution framing smuggled into a diagnosis.
- **capabilities** — Issue/Action/Value statements addressing the cause. Must NOT name
  specific products (that's what [[xprotect-portfolio]] and the Solution layer are for).
  Must reuse the specific mechanism named in causes — a capability generic enough to fit
  any cause is wrong.

**category** — pick by the SHAPE of the claim, not its topic:
- "Compliance" = tied to a regulation/audit/mandate
- "Too high / increasing" = a negative metric that is growing
- "Too low / decreasing" = a positive metric that is shrinking
- "Missed opportunity" = a gain being forfeited, not an active problem

**Pain flow**: each pain lists 1-3 other stakeholder roles whose work is also
impacted — one person's pain is often another's cause.

## Stakeholders (Power Model)

Focus = Solution | Transition | Financial. Influence = High | Medium | Low.
- **Solution** — evaluates or will use the capability directly
- **Transition** — owns migration/implementation risk
- **Financial** — owns budget or ROI accountability

Infer focus from the person's role and responsibilities, not their seniority.

## Vision

How the CUSTOMER sees THEMSELVES using the capabilities — their future state, not a
Milestone pitch.

## Value

Quantified drivers + Value Statements (Issue/Action/Value/Check).

Each quantified driver: **Metric/KPI → Baseline → Target → $ Impact.** Name the
specific business metric, its current (measured or realistically inferred) value, the
target once the solution is in place, and the resulting quantified impact (dollars,
hours, headcount, or risk-cost avoided). **Baseline and target must use the same
unit** so the gap is legible at a glance.

Value statement fields: issue (what they told you) / action ("Imagine…" / "Consider…")
/ value (the payoff) / check (a question back to them).

## Consensus — Collaboration Plan

Events across Solution/Transition/Financial phases, co-created with Power, each with
an owner and timing. Mark Go/No-Go milestones where relevant.

## Competitive — Value Grid

Every differentiator scores **uniqueness (0-10, vs the named competitor)** and
**customerValue (0-10)**. `differentiators[0]` must score high on both — the
"Differentiators" quadrant. Lead with unique differentiators, prove parity elsewhere.
Objections via Acknowledge/Question/Position/Check.

## Specificity (non-negotiable)

Every pain/cause/capability/value string must anchor to a concrete noun — a system
name, a number, a role, a metric, a location. Never a generic phrase ("improves
efficiency", "streamlines operations", "enhances security") without saying what
improves and by roughly how much. If a sentence would read the same for any customer
in any industry, rewrite it.

## Provenance

Every field carries `src: "doc"` (the source document states or implies it) or
`"inferred"` (you filled a gap). Never leave a field empty — infer a value faithful to
the context (industry, scale, tech, regulation, goals) and mark it inferred. An
inferred value must survive a fact-check by someone who actually works in that
vertical — realistic ranges, real regulation names, job titles that exist in such an
organization. Preserve this provenance tagging on any new field you add by hand.

## Vertical grounding

Identify the customer's vertical first, then keep every inferred value plausible for
it:
- **Regulations** — cite only ones that actually govern the vertical (healthcare:
  HIPAA, Joint Commission; energy/utilities: NERC CIP; airports: TSA/ICAO; education:
  FERPA, Clery Act; retail: PCI DSS; public safety/corrections: CJIS; EU: GDPR, NIS2).
  Never attach a regulation foreign to the vertical or region.
- **Scale** — stakeholder titles, camera counts, incident types, and budgets must
  match the vertical's typical reality (regional hospital ~200-600 cameras;
  university campus ~400-1500; city surveillance ~500-5000; retail chain ~8-40 per
  store; airport ~1000-3000; logistics hub ~150-500).
- **Competitor** — if unnamed, infer the most likely one for the vertical and deal
  shape: Genetec Security Center (enterprise/airports/city/critical infrastructure),
  Avigilon/Motorola (education/commercial), Verkada (cloud-first SMB/retail), Axis
  Camera Station (small single-site), Hanwha/Bosch BVMS/Honeywell (where regionally
  strong).

**Current-system rule** (training material, [[current-system-not-milestone]] in
memory): the seller must practice displacing a competitor or winning a net-new VMS.
Unless the source explicitly says the customer already runs Milestone/XProtect, the
current system is a competitor VMS or no real VMS (analog/legacy/DVR or greenfield).
A Milestone/XProtect expansion is a rare exception, never the default.
