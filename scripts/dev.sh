#!/bin/bash
# Run dev with one Ctrl+C killing the whole process tree (frontend, backend, watchers).
# On shutdown, ports 3000 (frontend) and 3003 (backend) are freed so the next yarn dev can bind.
set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Free ports 3000 (frontend) and 3003 (backend) so next yarn dev can bind
free_ports() {
  for port in 3000 3003; do
    pids=$(lsof -ti :$port 2>/dev/null) || true
    if [ -n "$pids" ]; then
      echo "$pids" | xargs kill -9 2>/dev/null || true
    fi
  done
}

trap 'free_ports; echo ""; echo "All shut down."; exit 130' SIGINT
trap 'free_ports; echo ""; echo "All shut down."; exit 143' SIGTERM

chmod +x build.sh 2>/dev/null || true
./build.sh

concurrently --kill-others-on-fail --kill-others \
  "yarn dev:frontend" \
  "yarn dev:backend" \
  "yarn dev:watch-native" \
  "yarn dev:watch-wasm"
EXIT_CODE=$?
free_ports
echo ""
echo "All shut down."
exit $EXIT_CODE
