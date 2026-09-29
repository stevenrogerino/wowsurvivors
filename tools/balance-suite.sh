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
shards meter-s5 STAGE=s5
gate "meter share, evolved at 20:00 (every weapon x0.65-x1.35 of fair)" node tools/meter-test.js --report "$OUT"/meter-s5-*.json
shards meter-s3 STAGE=s3
gate "meter share, rank 5 at 9:00" node tools/meter-test.js --report "$OUT"/meter-s3-*.json

gate "discoveries on and off (tools/rank-test.js KIND=pair)" bash -c "KIND=pair OUT=$OUT/pair.json node tools/rank-test.js 2>&1 | tail -3"
gate "unions' share of a build (tools/tune-unions.js SHARE=1)" bash -c "SHARE=1 node tools/tune-unions.js 2>&1 | tail -12"

if [ "${FULL:-0}" = "1" ]; then
  for m in thornhollow dustreach mourneholt palewastes; do
    TRACE=10 MAP=$m DIFF=professional SEEDS=2 OUT="$OUT/night-$m.json" node tools/botlab.js > "$OUT/night-$m.log" 2>&1
  done
  gate "no evolved weapon over 35% of the meter in full nights" node tools/bot-share.js "$OUT"/night-*.json
  gate "the shape of the nights" node tools/night-curve.js "$OUT"/night-*.json
fi

echo; echo "$FAILS gate(s) failed"; exit $FAILS
