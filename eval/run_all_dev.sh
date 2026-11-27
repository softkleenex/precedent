#!/bin/sh
# All development sets (tuned on). The frozen held-out set is eval/heldout2 and is NOT run here.
cd "$(dirname "$0")/.."
printf 'dev69     '; node eval/run_rules.mjs 2>/dev/null | head -1
for d in heldout heldout2 redteam_r2 redteam_r3 redteam_r4 redteam_r5; do
  [ -f eval/$d/cases.json ] && { printf '%-10s' "$d"; node eval/run_heldout.mjs eval/$d 2>/dev/null | head -1; }
done
