# CaseAnalyzer — repo context for AI assistants

CaseAnalyzer turns a customer case PDF into a Growth Activator sales briefing
for Milestone Systems sellers: pain chains, stakeholders, solution map, value,
collaboration plan, competitive positioning and an opportunity health check.

## Architecture

- **Frontend**: React 18 + Vite + Tailwind, single-file UI in `CaseAnalyzer.jsx`.
  Served by GitHub Pages; built and deployed by `.github/workflows/deploy-frontend.yml`
  on every push to `main` (VITE_API_BASE is baked in at build time — it points to
  the Railway backend).
- **Backend**: Express + SQLite in `backend/` (`server.js`, `db.js`). Deployed on
  Railway (service root = `backend/`, auto-redeploys on push to `main`). SQLite
  lives on a Railway volume via `DB_PATH=/data/cases.db`; locally it defaults to
  `backend/cases.db`.
- **Model**: the analysis calls the Anthropic API from `backend/server.js` with
  `claude-opus-4-8`. The static `EXTRACTION_PROMPT` is sent as a `system` block
  with `cache_control` (1h TTL) so repeat analyses read it at 0.1x input price.
  The model string exists ONLY in `server.js` — never hardcode it elsewhere.
- PDF text extraction happens client-side with pdf.js (zero tokens); only the
  extracted text is sent to `/api/analyze`.

## Local development

- Backend: `cd backend && node server.js` → port 5000. Requires
  `backend/.env.local` with `ANTHROPIC_API_KEY` (never commit it).
- Frontend: `npm run dev` → port 5173 (uses localhost:5000 API by default).

## Conventions that matter

- The analysis JSON schema is defined inside `EXTRACTION_PROMPT` in
  `backend/server.js`. When changing the schema, update ALL of:
  1. the JSON template + instructions in the prompt,
  2. the matching tab component and `TABS` array in `CaseAnalyzer.jsx`,
  3. `TAB_EDIT_KEYS` (Edit Mode) in `CaseAnalyzer.jsx`,
  4. `migrateCaseFile()` so imports of older exports still open
     (bump `SCHEMA_VERSION` when the change is breaking).
- Icons come from `lucide-react@0.263` — verify an icon exists in
  `node_modules/lucide-react/dist/esm/icons/` before importing it; missing
  icons crash the whole app at load with a blank page.
- The prompt enforces vertical grounding (real regulations, realistic scale,
  vertical-typical competitor) and restricts positioning to Milestone's actual
  portfolio (XProtect, BriefCam, Arcules). The Solution tab picks items only
  from the canonical catalogs embedded in the prompt — keep it that way.
- Every field carries `src: "doc" | "inferred"` provenance; UI shows an
  "inferred" chip. Preserve this on any new field.
- Verify UI changes by driving the real app (Playwright against
  localhost:5173) — not just by building.

## Deploy

`git push` to `main` deploys everything: Railway rebuilds the backend and the
Pages workflow rebuilds the frontend. There is no manual deploy step.
