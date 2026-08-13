---
name: milestone-tone
description: Milestone's enterprise voice rules for rewriting a Growth Activator case's prose into consultative, executive-level B2B register — and what must stay byte-for-byte untouched during a tone pass (numbers, roles, src provenance, health-check scores, literal quotes, JSON structure). Use when hand-editing or rewriting an existing case's text, not when generating new case content.
---

# Milestone enterprise tone — rewrite rules

This is the tone contract CaseAnalyzer's backend enforces automatically during
analysis (`backend/server.js`, `EXTRACTION_PROMPT`, "TONE & WORDING" section). Use
this skill for the case that prompt doesn't cover: a case JSON already exists and
you're rewriting its prose by hand — polishing register, fixing a clunky sentence, or
running a full tone pass across a case export — without re-running the analysis.

## The voice

Consultative, not promotional. Executive-level B2B register throughout.

- Center business outcomes — operational efficiency, situational awareness,
  scalability, flexibility, risk reduction — never product features for their own
  sake.
- Present technology as an enabler of business objectives: the sentence's subject is
  the outcome, not the capability.
- Frame technical issues as operational/business challenges. E.g. "cannot centrally
  verify access changes across sites," not "lacks a centralized admin console."
- Strengthen every pain with measurable impact wherever the case supports it — time,
  cost, risk exposure, headcount.
- Prefer verbs: enable, support, improve, simplify, enhance, streamline, reduce.
- Avoid marketing hype, superlatives, and absolute claims — "best-in-class",
  "seamless", "revolutionary", "guarantee", "unmatched" are all disqualifying.
- Follow a Pain → Impact → Outcome narrative wherever a field's structure allows it
  (pain chains, value statements, capabilities).

**This governs register and word choice only.** It never relaxes specificity (concrete
nouns, numbers, roles — see [[growth-activator]]) and it never invents products or
figures Milestone doesn't actually have.

## What a tone pass must NOT touch

A rewrite is a register change, not a content change. Before and after must be the
same case:

- **Numbers** — every $ figure, percentage, camera count, day/hour count, headcount.
  Rewording the sentence around a number is fine; changing the number is not.
- **Names and roles** — customer name, stakeholder names/titles, competitor name,
  system/regulation names cited.
- **`src` provenance** — a field's `"doc"` vs `"inferred"` tag reflects where the fact
  came from, not how it's worded. Never flip it as a side effect of rewriting the
  sentence it's attached to.
- **Health-check scores and rationale citations** — the 0-6 PAIN/POWER/VISION/VALUE/
  CONSENSUS scores are judgment calls already made; a tone pass may polish the
  rationale sentence's wording but must not change what evidence it cites or the score
  itself.
- **Literal quotes** — anything presented as something the customer or a stakeholder
  said, verbatim.
- **JSON structure** — keys, array lengths, field presence. A tone pass changes string
  values, never the shape of the object. If a diff shows anything but string-value
  changes, something went wrong.

## Practical workflow for a full-case pass

1. Read the case JSON. Go field by field, not top-to-bottom prose — it's easy to drift
   on later sections once you're several rewrites in.
2. Rewrite only string fields that carry customer/prose content (painDescription,
   pain, causes, capabilities, overview.summary, value statement fields, competitive
   narrative, etc.). Leave enums, ids, numbers, and `src` tags untouched.
3. After the pass, diff against the original — every changed line should be a
   same-meaning, same-facts reword. Any line where a number, name, or `src` value
   changed is a bug in the pass, not an improvement.
