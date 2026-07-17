#!/bin/bash

# Quick test script for CaseAnalyzer backend
# Usage: bash test.sh

BASE_URL="http://localhost:5000"

echo "🔍 Testing CaseAnalyzer Backend..."
echo ""

# 1. Health check
echo "1️⃣  Health Check..."
curl -s "$BASE_URL/health" | jq . || echo "❌ Backend not running"
echo ""

# 2. List cases (empty initially)
echo "2️⃣  List Cases..."
curl -s "$BASE_URL/api/cases" | jq . || echo "❌ Failed"
echo ""

# 3. Test analyze endpoint (requires valid case text)
echo "3️⃣  Test Analyze Endpoint (needs valid API key in .env.local)..."
curl -s -X POST "$BASE_URL/api/analyze" \
  -H "Content-Type: application/json" \
  -d '{"caseText":"A company is evaluating video surveillance systems to improve security."}' \
  | jq . || echo "❌ Analysis failed (check ANTHROPIC_API_KEY)"
echo ""

echo "✅ Basic tests complete!"
