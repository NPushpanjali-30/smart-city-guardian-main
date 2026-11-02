#!/usr/bin/env bash
# ==============================================================================
# SmartCity Guardian — Academic Demo Launcher
# AI-Powered Real-Time Urban Flood Prediction & Emergency Navigation Platform
# ==============================================================================

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "======================================================================"
echo "🛡️  SMARTCITY GUARDIAN — LIVE ACADEMIC WEB DEMO"
echo "    AI-Powered Flood Prediction, Traffic Optimization & Emergency Mobility"
echo "======================================================================"
echo ""

# Ensure build exists
if [ ! -d "apps/web/dist" ]; then
  echo "📦 Building web assets for demo..."
  npm run build:web
fi

PORT=5173

# Check if port 5173 is already running
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
  echo "✅ Web Demo server is already running on port $PORT."
else
  echo "🚀 Starting Web Demo server on http://localhost:$PORT ..."
  (cd apps/web && npx -y vite preview --port $PORT --host) &
  SERVER_PID=$!
  sleep 1.5
fi

# Open in browser
URL="http://localhost:$PORT"
echo ""
echo "🌐 Opening demo in your web browser: $URL"
echo "🎓 Tip: Click the floating 'Teacher & Evaluator Guide' button in the demo"
echo "    for 1-click guided interactive scenarios!"
echo ""

if which xdg-open > /dev/null; then
  xdg-open "$URL"
elif which open > /dev/null; then
  open "$URL"
fi

echo "======================================================================"
echo "Press CTRL+C at any time to stop the demo server."
echo "======================================================================"

# Keep running if backgrounded
if [ -n "$SERVER_PID" ]; then
  wait $SERVER_PID
fi
