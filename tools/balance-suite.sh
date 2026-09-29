#!/bin/bash
# THE BALANCE SUITE: every gate, in the order to run them. See docs/BALANCE.md.
#
#   tools/balance-suite.sh            the fast gates (about 25 minutes on 4 cores)
#   FULL=1 tools/balance-suite.sh     and the full bot nights (another hour or so)
#
# Results land in $OUT (default /tmp/balance). Each gate prints ok or FAIL;
# the script exits non-zero if any failed.
set -u
cd "$(dirname "$0")/.."
OUT=${OUT:-/tmp/balance}; mkdir -p "$OUT"
FAILS=0
gate() { echo; echo "== $1"; shift; if "$@"; then :; else FAILS=$((FAILS + 1)); fi; }
shards() { # shards NAME ENV... : run a node tool in 3 shards
  local name=$1; shift
  for s in 1 2 3; do env "$@" SHARD=$s/3 OUT="$OUT/$name-$s.json" node "${TOOL}" > "$OUT/$name-$s.log" 2>&1 & done; wait
}

gate "config, originality, checks" bash -c 'node tools/check-config.js | tail -1 && node tools/check-original.js | head -1 && node tools/check-tides.js | tail -1 && node tools/check-combos.js | tail -1 && node tools/check-unions.js | tail -1'

TOOL=tools/meter-test.js
# Four ways to play each stage: circling near the crowd or keeping away from
# it (the bot's pilot), with all nine weapon passives or a random few. The
# gate is each weapon's mean over the four; the per-condition reports show
# the spread, which a single number cannot remove (docs/BALANCE.md).
for st in s5 s3; do
  for mv in kite pilot; do for ps in all subset; do shards meter-$st-$mv$ps STAGE=$st MOVE=$mv PASSIVES=$ps; done; done
  for c in kiteall kitesubset pilotall pilotsubset; do echo "-- $st $c"; BAND=0.5,1.8 node tools/meter-test.js --report "$OUT"/meter-$st-$c-*.json | tail -1; done
  gate "meter share at $st, mean of four ways to play (x0.8-x1.25 of fair)" env BAND=0.8,1.25 node tools/meter-test.js --report "$OUT"/meter-$st-*.json
done

gate "discoveries on and off (tools/rank-test.js KIND=pair)" bash -c "KIND=pair OUT=$OUT/pair.json node tools/rank-test.js 2>&1 | tail -3"
gate "unions' share of a build (tools/tune-unions.js SHARE=1)" bash -c "SHARE=1 node tools/tune-unions.js 2>&1 | tail -12"

if [ "${FULL:-0}" = "1" ]; then
  for m in thornhollow dustreach mourneholt palewastes; do
    TRACE=10 MAP=$m DIFF=professional SEEDS=${SEEDS:-5} OUT="$OUT/night-$m.json" node tools/botlab.js > "$OUT/night-$m.log" 2>&1
  done
  node tools/bot-share.js "$OUT"/night-*.json | tee "$OUT/bot-share.txt"
  # Every weapon the meter flags: does it lead its own builds more than
  # another evolved weapon would in the same build?
  for w in $(grep '^SWAP ' "$OUT/bot-share.txt" | cut -d' ' -f2-); do
    gate "$w in its own builds, against five others swapped in (x0.8-x1.25)" env WEAPON=$w node tools/swap-test.js "$OUT"/night-*.json
  done
  gate "the shape of the nights" node tools/night-curve.js "$OUT"/night-*.json
fi

echo; echo "$FAILS gate(s) failed"; exit $FAILS
