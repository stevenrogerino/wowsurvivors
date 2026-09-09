#!/bin/sh
# The Ember Watch - Tuning Bench. Everything runs on this machine.
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || {
  echo "Node.js is not installed, or is not on your PATH."
  echo "Get it from https://nodejs.org, then run this again."
  exit 1
}
( sleep 2; (command -v xdg-open >/dev/null && xdg-open http://localhost:8770) \
  || (command -v open >/dev/null && open http://localhost:8770) ) &
exec node tools/bench.js
