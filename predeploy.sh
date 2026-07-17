# Quick deployment checklist script
# Run this before deploying

echo "🔍 Pre-Deployment Checks..."
echo ""

# Check 1: Backend has API key
if [ -f "backend/.env.local" ]; then
    if grep -q "ANTHROPIC_API_KEY" backend/.env.local; then
        echo "✅ Backend has ANTHROPIC_API_KEY"
    else
        echo "❌ Backend missing ANTHROPIC_API_KEY"
        exit 1
    fi
else
    echo "❌ backend/.env.local not found"
    exit 1
fi

# Check 2: Frontend build works
echo "🏗️  Testing frontend build..."
if npm run build > /dev/null 2>&1; then
    echo "✅ Frontend builds successfully"
else
    echo "❌ Frontend build failed"
    exit 1
fi

# Check 3: Backend starts
echo "🚀 Testing backend startup (5 sec)..."
cd backend
timeout 5 node server.js > /dev/null 2>&1
if [ $? -eq 124 ]; then
    echo "✅ Backend starts successfully"
else
    echo "❌ Backend failed to start"
    exit 1
fi
cd ..

# Check 4: Git repo exists
if [ -d ".git" ]; then
    echo "✅ Git repository initialized"
else
    echo "⚠️  Git repository not found. Run: git init"
fi

echo ""
echo "✅ All checks passed! Ready for deployment."
echo ""
echo "Next steps:"
echo "1. Push to GitHub: git push"
echo "2. Deploy frontend: https://vercel.com/new"
echo "3. Deploy backend: https://railway.app"
