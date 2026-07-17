# CaseAnalyzer - Deployment Local (Quick Start)

## 📋 Requirements

- Node.js 16+
- tu API key de Anthropic

## 🚀 Paso 1: Configurar Backend

```bash
cd backend
cp .env.example .env.local
# Editar .env.local con tu ANTHROPIC_API_KEY
npm install
npm run dev
```

Backend levantará en **http://localhost:5000**.

Verifica health:

```bash
curl http://localhost:5000/health
# Expected: {"status":"ok"}
```

## 🎨 Paso 2: Ejecutar Frontend

Frontend es React puro (sin build requerido si usas React CDN).

### Opción A: Vite Dev Server

```bash
npm install vite react react-dom lucide-react
npm run dev
```

### Opción B: Artifact (Claude Editor)

Copia `CaseAnalyzer.js` a un nuevo Artifact en Claude.

- Frontend automáticamente apunta a `localhost:5000/api`

## ✅ Test Quick

1. **Backend levantado?** → `curl http://localhost:5000/health`
2. **Frontend cargado?** → Abre en navegador
3. **Analizar PDF?** → Upload PDF → debería enviarse a backend → Claude analiza → respuesta regresa como JSON
4. **Guardar caso?** → "Save case" → debería persistir en SQLite local

## 📊 Arquitectura

```
Frontend (React)
  ↓ fetch() calls
Backend (Node/Express)
  ↓ Claude API call
Anthropic
  ↓ response JSON
Backend → SQLite (cases.db)
  ↓ stored case
Frontend ← retrieve lista de casos guardados
```

## 🔧 Troubleshooting

| Problema                            | Solución                                         |
| ----------------------------------- | ------------------------------------------------ |
| `Cannot find module 'lucide-react'` | `npm install lucide-react` en frontend dir       |
| `CORS error`                        | Backend tiene `cors()` habilitado en todas rutas |
| `API key error`                     | Verifica `.env.local` tiene clave válida         |
| `Cannot reach localhost:5000`       | ¿Backend levantado? `npm run dev` en `/backend`  |

## 📦 Deployment (después)

- Frontend: Vercel, Netlify, GitHub Pages
- Backend: Railway, Fly.io, Heroku, tu servidor
- DB: SQLite local → migrar a PostgreSQL en prod

## 🎯 Siguiente paso

Integra auth (JWT o supabase) si múltiples users.
