# CaseAnalyzer - Deployment Guide

## 🚀 Deployment Completo en 10 minutos

### **1️⃣ Frontend a Vercel**

#### Paso 1: Preparar repositorio

```bash
cd CaseAnalyzer
git init
git add .
git commit -m "Initial commit: CaseAnalyzer app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/caseanalyzer.git
git push -u origin main
```

#### Paso 2: Conectar a Vercel

1. Ve a https://vercel.com/new
2. Selecciona "Import Git Repository"
3. Pega tu URL del repo
4. **Framework Preset**: React
5. **Root Directory**: ./
6. **Build Command**: npm run build
7. **Output Directory**: dist
8. **Environment Variables** (Vercel Dashboard):
   ```
   VITE_API_BASE=https://caseanalyzer-backend.railway.app/api
   ```
9. Click **Deploy**

**Tu frontend estará en**: `https://caseanalyzer.vercel.app`

---

### **2️⃣ Backend a Railway**

#### Paso 1: Crear cuenta Railway

1. Ve a https://railway.app
2. Sign up con GitHub
3. Click "New Project" → "Deploy from GitHub"

#### Paso 2: Conectar Backend

1. Selecciona tu repo `caseanalyzer`
2. Selecciona solo el directorio `backend/`
3. Railway auto-detecta Node.js
4. **Start Command**: `node server.js`

#### Paso 3: Configurar Variables

En el dashboard de Railway, agrega:

```
ANTHROPIC_API_KEY=sk-ant-[TU_CLAVE_AQUI]
PORT=3000
```

5. Click **Deploy**

**Tu backend estará en**: `https://caseanalyzer-backend.railway.app`

---

### **3️⃣ Verificar Integración**

Una vez deployado:

```bash
# Test backend health
curl https://caseanalyzer-backend.railway.app/health

# Test frontend conecta con backend
# Abre https://caseanalyzer.vercel.app
# Upload un PDF y verifica que se analiza
```

---

## 🔄 Actualizar después de cambios

### Frontend

```bash
git add .
git commit -m "Update: feature description"
git push
# Vercel auto-redeploya
```

### Backend

```bash
cd backend
git add .
git commit -m "Backend fix"
git push
# Railway auto-redeploya
```

---

## 📊 Arquitectura Final

```
https://caseanalyzer.vercel.app (React + Vite)
        ↓ fetch() calls
https://caseanalyzer-backend.railway.app/api (Express)
        ↓ Claude API call
Anthropic API
        ↓ response
Railway → Railway Postgres (optional migration)
```

---

## 🛟 Troubleshooting

| Problema                         | Solución                                               |
| -------------------------------- | ------------------------------------------------------ |
| 401 Unauthorized en /api/analyze | Verifica ANTHROPIC_API_KEY en Railway dashboard        |
| CORS error                       | Backend ya tiene `cors()` habilitado                   |
| Vercel build falla               | Verifica npm run build funciona local: `npm run build` |
| Railway crash                    | Verifica logs: Railway Dashboard → Deployments → Logs  |

---

## ✅ Checklist Pre-Deploy

- [ ] Backend .env.local tiene API key válida (testear local)
- [ ] Frontend conecta a localhost:5000 local (npm run dev)
- [ ] Git repository creado y commiteado
- [ ] Vercel account creado
- [ ] Railway account creado
- [ ] Backend railway.json en repo
- [ ] Frontend vercel.json en repo

---

## 📞 URLs Finales

| Recurso      | URL                                             |
| ------------ | ----------------------------------------------- |
| Frontend     | https://caseanalyzer.vercel.app                 |
| Backend      | https://caseanalyzer-backend.railway.app        |
| Backend API  | https://caseanalyzer-backend.railway.app/api    |
| Health Check | https://caseanalyzer-backend.railway.app/health |
