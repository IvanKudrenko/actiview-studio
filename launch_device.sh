#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PORT="${ACTIVEVIEW_WEB_PORT:-8765}"
python3 "$ROOT/device_server.py" --root "$ROOT/web" --host 127.0.0.1 --port "$PORT" &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT INT TERM

for browser in chromium-browser chromium google-chrome; do
  if command -v "$browser" >/dev/null 2>&1; then
    exec "$browser" --kiosk --app="http://127.0.0.1:$PORT/device.html" --no-first-run --disable-session-crashed-bubble --disable-infobars
  fi
done

echo "No compatible Chromium browser found." >&2
exit 1

