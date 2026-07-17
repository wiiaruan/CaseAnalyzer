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

## Next

El frontend se conecta por `fetch()` a estos endpoints.
