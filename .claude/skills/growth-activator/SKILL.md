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

**Caveat on this table's source**: it's calibrated partly against Milestone's own
published customer-success stories. Those stories skew heavily toward analog/legacy
replacement, greenfield builds, or the customer expanding an *existing* Milestone
deployment — a named-competitor VMS being displaced is rare in what Milestone
chooses to publish (survivorship bias, not a signal that competitor displacement is
rare in real deals). Don't let this table's "infer a competitor" guidance soften for
**training material**, where [[current-system-not-milestone]] still applies — that
rule exists precisely because reps need practice against a competitor, which real
published cases underrepresent.

### Additional verticals (calibrated against ~55 published Milestone case studies, 2026-08-18)

The table above covers the common verticals; these are less-common ones worth the
same discipline, with realistic ranges pulled from real published cases:

- **Public safety / municipal command center** — scale tracks command-center
  maturity more than city population: community safety network 50-300 cameras;
  mid-size city (200-500k pop) unifying analog sprawl 1,500-3,000+; US real-time
  crime center 400-800 municipal + registered-private cameras; critical-infra
  corridor (tunnels/bridges) tens-to-low-hundreds. Regulation: EU Tunnel Safety
  Directive 2004/54/EC for road tunnels, GDPR (EU), CJIS (US) — Latin American
  cases typically cite no named regulation. Competitor: generic "legacy analog CCTV
  / siloed municipal cameras," rarely a named VMS brand.
- **Smart city / government platform** — single government facility ~20-25
  cameras floor; small/mid US city cloud-first 250-1,400; regional European city
  100-300+ (roadmap 1,000+); large metro/port city 2,000-2,700+; national
  capital/ministry-grade 2,500+. Regulation: EU AI Act (AI training-data
  traceability), FEMA/DHS polling-place assessment (US election security), Italy's
  Three-Year Plan for IT in Public Administration, EU ITS/road-safety directives.
  Competitor: almost never named — these are self-modernization stories.
- **Ports / maritime** — major seaport ~150-300 cameras; regional port ~50-150.
  Regulation: likely ISPS Code / NIS2 for cyber — not explicitly named in published
  cases, treat as inferred, not confirmed. No named competitor; authority-managed
  legacy or greenfield.
- **Airports** — split by tier: small regional/general-aviation ~150-300; twin or
  multi-site regional-international ~400-800; large hub keeps the existing
  1,000-3,000. Camera-count is often reported per-subsystem (e.g. only the
  perimeter-radar cameras), not the airport total — don't assume a silent total.
- **Multi-tenant retail / mall** — neighborhood mall ~50-150 cameras; large
  mixed-use precinct (retail + hotel + museum) 800-1,500+; a shopping-centre
  *portfolio* (multiple malls, one operator) can reach 10,000+ nationally.
- **Banking — ATM managed-service** — a distinct pattern from branch security: a
  third-party MSSP centrally operates XProtect across many client ATM sites
  (~1 camera + 1 intercom + door-access unit per ATM). PCI DSS is inferred, not
  something published cases actually cite by name — don't force the citation.
- **Senior living / continuing-care campus** — ~500-1,500 residents, 80-150
  cameras for a large campus. Regulation: state assisted-living licensing/life-safety
  code, not HIPAA (these aren't clinical-record environments).
- **Medical-device / FDA-regulated manufacturing** — large multi-site medtech
  ~900+ cameras across 5+ global sites. Regulation: FDA/GMP for the production
  floor, alongside whatever the site's home country adds.
- **Multi-site industrial / FMCG manufacturing** — refine the general "logistics
  hub ~150-500": single-line/single-factory ~10-50 cameras; large multi-country
  industrial group 300-700+ across 5+ sites; multi-site food/CPG manufacturer
  ~15-40 cameras per site across 3-5 sites. Most industrial cases cite **no named
  regulation at all** — "efficiency/safety-driven, not compliance-driven" is a
  legitimate industrial profile; don't force a regulation into every case. Trade
  compliance (e.g. AEO/Authorized Economic Operator customs certification with a
  retention-length requirement) is a real but under-used regulatory hook here.
- **Remote / unmanned-site monitoring** — a value-driver pattern that cuts across
  verticals (power generation, water/dam infrastructure, remote industrial sites):
  the core metric is travel/headcount cost avoidance from not physically dispatching
  staff, not incident-detection rate. Look for this shape whenever a case involves
  geographically dispersed unmanned sites.
- **Live events / festivals / motorsport venues** — temporary/seasonal
  infrastructure: multi-day festival (~40k attendees) ~60 cameras; motorsport venue
  (50-70k capacity) ~25 fixed + mobile push cameras. Staffing swings enormously
  (single digits routine → 1,000+ during the event) — a distinct pain shape from
  fixed-site security. Regulation: crowd-density/fire-code constraints, rarely a
  named formal code.
- **Ski resort / cableway (mountain leisure)** — mid-size Alpine resort: 13-25
  lifts, 100+ cameras. Regulation nuance: some jurisdictions split retention by
  operator on the *same shared platform* (e.g. municipal footage 7 days vs private
  operator 24 hours) — a real multi-tenant-privacy pattern worth using in
  discrimination material.
- **Museum / heritage site** — museum-scale ~100+ cameras. Driver is
  vandalism/heritage-preservation, a category distinct from generic "security."
- **Residential / smart-building virtual concierge (MSSP)** — an MSSP builds a
  *service business* on XProtect rather than an end-customer securing its own site:
  large portfolio example ~400+ buildings, ~30k residents, 6,500+ cameras run from
  one remote SOC. Prior state is almost always staffed on-site guards or manual
  logs/phone verification, not a competitor VMS.
- **Education refinements** — regional/non-flagship university can run as low as
  ~80-150 cameras (below the general "university campus" floor); private
  international K-12 runs a much denser camera-per-student ratio than a public
  district; a large US public K-12 district can reach city-surveillance scale
  (1,000+ cameras); pupil transportation/fleet (buses, up to ~4 cameras/vehicle,
  synced via Interconnect) is its own sub-vertical. US K-12 capital security
  projects are commonly funded via voter-approved bond measures — a distinct
  economic-buyer/procurement pattern worth using in MEDDIC-style training content.
  FERPA/Clery/Title IX/GDPR are rarely named explicitly even in cases where they'd
  clearly apply — keep them as plausible inferred citations, not evidence-required
  facts.

**Current-system rule** (training material, [[current-system-not-milestone]] in
memory): the seller must practice displacing a competitor or winning a net-new VMS.
Unless the source explicitly says the customer already runs Milestone/XProtect, the
current system is a competitor VMS or no real VMS (analog/legacy/DVR or greenfield).
A Milestone/XProtect expansion is a rare exception, never the default.
