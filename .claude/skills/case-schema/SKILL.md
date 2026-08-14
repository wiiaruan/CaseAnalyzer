---
name: case-schema
description: Checklist and exact anchors for changing CaseAnalyzer's case JSON schema — every field lives in five places, not the four listed in the repo's CLAUDE.md, and missing one causes a silent runtime break (API rejection, blank tab, or an import that throws). Use before adding, renaming, or removing any field on the analysis output.
---

# Changing the case schema — five places, not four

`.github/copilot-instructions.md` (loaded into every session as CLAUDE.md) already
flags that a schema change touches multiple places. This skill exists because it
undercounts: the field shape is enforced in **two separate objects** inside
`backend/server.js`, not one — the tool's `input_schema` (`CASE_ANALYSIS_SCHEMA`) is
what Anthropic's API actually validates against, and it's a distinct object from the
prose template inside `EXTRACTION_PROMPT`. They can drift independently. Miss the
schema object and the field either gets silently stripped (Anthropic tool calls
reject `additionalProperties` the schema doesn't declare) or the whole call errors.

## The five touch points

1. **`backend/server.js` — `CASE_ANALYSIS_SCHEMA`** (starts ~line 155). This is the
   actual `input_schema` passed to the `emit_case_analysis` tool
   (`tools: [{ name: "emit_case_analysis", input_schema: CASE_ANALYSIS_SCHEMA }]`,
   ~line 538). Every object in it sets `additionalProperties: false` and lists
   `required` fields explicitly — add/rename/remove the field here or the API will
   reject the call or drop the field.
2. **`backend/server.js` — `EXTRACTION_PROMPT`** (starts ~line 25). The prose
   instructions telling the model *what* to put in each field and how (word budgets,
   specificity rules, the calibration example). The schema object controls shape;
   this controls content quality. Both need the new field described consistently.
   If the field feeds the Health Check re-score path, also check
   `HEALTH_CHECK_PROMPT`/`HEALTH_CHECK_SCHEMA` (~lines 100, 136).
3. **`CaseAnalyzer.jsx` — `TABS` array** (~line 1902). Maps a tab id to its display
   component. A new top-level section needs an entry here (or a new field on an
   existing tab's component) or it never renders.
4. **`CaseAnalyzer.jsx` — `TAB_EDIT_KEYS`** (~line 2007). Maps each tab id to the
   top-level case-JSON keys Edit Mode is allowed to touch. A field that exists in the
   schema and renders on-screen but is missing here can be viewed but not edited —
   easy to miss because nothing errors, the Save button just silently doesn't persist
   the change.
5. **`CaseAnalyzer.jsx` — `migrateCaseFile()`** (~line 244) + **`SCHEMA_VERSION`**
   (~line 239, currently `5`). Every prior export a user re-opens gets run through
   this function. A new required field needs a default here so old exports don't
   throw on import; a renamed/restructured field needs the old shape mapped to the
   new one (see the existing `pains[]` migration for the pattern: check
   `n.newField === undefined`, backfill from the old key, `delete` the old key).
   **Bump `SCHEMA_VERSION` only for breaking changes** — additive fields with a safe
   default don't need a version bump, restructured/renamed fields do.

## Order that avoids half-finished states

1. Decide the shape, then update `CASE_ANALYSIS_SCHEMA` and `EXTRACTION_PROMPT`
   together (they must agree or generation quality suffers even if the API accepts
   the call).
2. Update `TABS`/tab component to render the new field.
3. Update `TAB_EDIT_KEYS` so Edit Mode can touch it.
4. Update `migrateCaseFile()` and bump `SCHEMA_VERSION` if the change is breaking.
5. Test with both a fresh analysis (new field populated by the model) and an import
   of an old export (new field backfilled by migration) — these exercise different
   code paths and either one can be fine while the other silently breaks.
