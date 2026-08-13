# CaseAnalyzer Backend

Backend Node.js seguro para CaseAnalyzer. La API key queda en `.env.local`, no en el frontend.

## Setup

```bash
npm install
cp .env.example .env.local
# Editar .env.local y pegar tu ANTHROPIC_API_KEY
npm run dev
```

El server levanta en `http://localhost:5000`.

## Endpoints

- **POST `/api/analyze`** — Analizar texto de caso
  ```json
  { "caseText": "..." }
  ```
- **POST `/api/cases`** — Guardar caso
  ```json
  { "caseFile": { ... } }
  ```
- **GET `/api/cases`** — Listar índice
- **GET `/api/cases/:id`** — Abrir caso
- **DELETE `/api/cases/:id`** — Borrar caso
- **GET `/health`** — Health check

## Persistencia

SQLite local en `cases.db` (2 tablas: `caseindex`, `cases`).

## Sincronizar casos de entrenamiento

`node ../scripts/sync-cases.js` sube todos los `Cases Json/*.json` a
producción (upsert por `caseFile.meta.customer`). `Cases Json/` está en
`.gitignore` (material interno de Milestone, nunca llega a GitHub), así que
esto NO puede correr como GitHub Action — en su lugar hay un git hook local
(`scripts/git-hooks/post-commit`, instalado en `.git/hooks/post-commit`) que
lo ejecuta en segundo plano después de cada commit en esta máquina. Log en
`scripts/.last-case-sync.log`. Ver la nota de tradeoff en
`Cases Json/A/CHANGELOG.md` antes de deshabilitarlo.

## Next

El frontend se conecta por `fetch()` a estos endpoints.
