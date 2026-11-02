#!/usr/bin/env bash
# ==============================================================================
# SmartCity Guardian — macOS 1-Click Teacher Demo Launcher
# Double-click this file in Finder to immediately launch the web demo!
# ==============================================================================

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

chmod +x "$DIR/run-demo.sh" 2>/dev/null || true
exec "$DIR/run-demo.sh"
