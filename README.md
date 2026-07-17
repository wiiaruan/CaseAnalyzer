# CaseAnalyzer - Growth Activator Sales Intelligence Tool

**AI-powered sales case analyzer** that processes PDF documents and extracts structured sales intelligence using Claude AI.

## 🎯 What It Does

1. **Upload PDF** → Extract raw text
2. **Claude Analysis** → Growth Activator framework (pains, vision, value, competitive)
3. **Structured Output** → JSON with salesenable intelligence
4. **Save & Search** → Store cases locally for team access

## 🏗️ Architecture

| Layer | Tech | URL |
|-------|------|-----|
| **Frontend** | React + Vite + Tailwind | http://localhost:5173 |
| **Backend** | Express.js + SQLite | http://localhost:5000 |
| **AI** | Claude (Anthropic API) | api.anthropic.com |

## 🚀 Quick Start (Local)

### Prerequisites
- Node.js 16+
- Anthropic API key (https://console.anthropic.com/)

### 1️⃣ Backend Setup
```bash
cd backend
cp .env.example .env.local
# Edit .env.local: paste your ANTHROPIC_API_KEY
npm install
npm run dev
# Backend runs on http://localhost:5000
```

### 2️⃣ Frontend Setup
```bash
# In root directory
npm install
npm run dev
# Frontend runs on http://localhost:5173
```

### 3️⃣ Test the App
1. Open http://localhost:5173 in browser
2. Upload a case PDF or paste text
3. Wait for Claude analysis (~5-10 sec)
4. View results in tabs: Overview, Pain, Vision, Value, Competitive
5. Click "Save case" to persist

## 📦 Deployment

**Frontend**: Vercel
**Backend**: Railway
**Database**: SQLite (local) or PostgreSQL (production)

See [DEPLOY.md](./DEPLOY.md) for step-by-step instructions.

## 📁 Project Structure

```
CaseAnalyzer/
├── CaseAnalyzer.js        # Main React component
├── main.jsx              # React entry
├── index.html            # Root HTML
├── package.json          # Frontend deps (React, Tailwind, Lucide)
├── vite.config.js        # Vite build config
├── vercel.json           # Vercel deployment config
├── SETUP_LOCAL.md        # Local development guide
├── DEPLOY.md             # Deployment instructions
│
└── backend/
    ├── server.js         # Express API (5 endpoints)
    ├── db.js             # SQLite interface
    ├── package.json      # Backend deps
    ├── .env.example      # Env template
    ├── railway.json      # Railway deployment config
    └── cases.db          # SQLite database (auto-created)
```

## 🔌 API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/analyze` | Analyze case text with Claude |
| `GET` | `/api/cases` | List all saved cases |
| `POST` | `/api/cases` | Save a case |
| `GET` | `/api/cases/:id` | Fetch specific case |
| `DELETE` | `/api/cases/:id` | Delete case |
| `GET` | `/health` | Health check |

## 🔐 Security

- ✅ API key stored in backend `.env.local` (not in frontend)
- ✅ CORS enabled for local dev
- ✅ No sensitive data in code
- ✅ SQLite encryption optional (for production)

## 🛠️ Tech Stack

### Frontend
- **React 18** — UI components
- **Vite** — Fast build tool
- **Tailwind CSS** — Styling
- **Lucide React** — Icons
- **pdf.js** — PDF text extraction

### Backend
- **Express.js** — REST API
- **SQLite3** — Local database
- **Anthropic API** — Claude AI

## 📊 Case Schema

```json
{
  "meta": {
    "customer": "Company Name",
    "industry": "Tech",
    "stage": "Evaluation",
    "competitor": "Competitor Name",
    "docType": "RFP"
  },
  "overview": { ... },
  "pain": [ ... ],
  "vision": { ... },
  "value": { ... },
  "competitive": { ... }
}
```

## 🤝 Contributing

1. Clone repo
2. Create feature branch: `git checkout -b feature/my-feature`
3. Commit: `git commit -m "Add feature"`
4. Push: `git push origin feature/my-feature`
5. Open PR

## 📝 License

MIT

## 🆘 Support

- **Local issues?** See [SETUP_LOCAL.md](./SETUP_LOCAL.md)
- **Deployment issues?** See [DEPLOY.md](./DEPLOY.md)
- **API key errors?** Check backend/.env.local has valid key

---

**Made with ❤️ for sales teams**
