# Parked balance proposals

Patches here are suggestions, measured but not applied. Apply one with
`git apply docs/proposals/<file>.patch`, then run the gates in
`tools/balance-suite.sh` and rebuild (`node tools/bundle.js`) before shipping.

## 2026-10-05-unions-discoveries-late-bosses.patch

Parked when the work turned to Tides and the difficulty count. Three parts,
each separable:

- **Unions.** Each union gets the damage its two evolved parts did, with its
  damage against bosses held where it was. Stormcall gets a wider orbit (125)
  and Tempest Kata a longer reach (165), because those weapons respond to reach
  more than to damage. Measured with `tools/union-test.js`: today a union plus
  the weapon its freed slot holds lets more damage reach the survivor than the
  pair it replaced did (x1.2 to x1.65), so forging one is a trap. Under the
  patch it comes out level with the pair, within noise.
- **Discoveries.** Truestrike loses its +10% (homing alone made it the top
  discovery late, x1.43 to its pair against a median x1.10). Thunderpalm's and
  Tempest Pact's lightning procs are raised, and Radiant Gyre, Deadly Brew,
  Whirling Discipline and Rotbloom each get about +8 points of damage. Only the
  Truestrike and Thunderpalm changes are clearly larger than the noise of
  `tools/discovery-test.js`.
- **Late bosses.** Scheduled bosses gain health from 10:00 on
  (`bossLateFrom` 600, `bossLateTime` 600): x1.1 at 11:00 and x2.7 at 27:00.
  Every scheduled boss currently dies a median 6 to 14 seconds after it
  arrives. This part was measured without Tides, so measure it again with
  Tides always on before using it.

## 2026-10-05-weapon-tuning-pass.patch (applied 5 October)

Eight weapons, numbers only. Each gets a new unevolved base damage and rank
step; its evolution multiplier is re-fitted so the evolved weapon deals
exactly what it does today, and its boss damage is re-fitted so it hits
bosses at rank 5 exactly as hard as today. Healing is per hit and unchanged.

| Weapon | Rank 1 | Rank 3 | Rank 5 | Rank 8 | Why |
| --- | --- | --- | --- | --- | --- |
| Arcweb (Shaman) | x0.90 | x1.27 | x1.40 | x1.49 | x1.9 at rank 1, then x0.59 to x0.74 |
| Judgement Disc (Paladin) | x0.90 | x1.27 | x1.40 | x1.49 | same shape as Arcweb |
| Verdant Lance (Ruinseeker) | x1.10 | x1.16 | x1.18 | x1.19 | x0.74 at 9:00 and 14:00 |
| Blightfield | x1.30 | x1.30 | x1.30 | x1.30 | under even the healers' band |
| Thornbloom | x1.25 | x1.12 | x1.07 | x1.04 | x0.35 at rank 1 |
| Axe Gyre (Warrior) | x0.95 | x0.87 | x0.81 | x0.75 | x1.38 to x1.58, most kills at 20:00 |
| Iron Palms (Monk) | x1.00 | x0.91 | x0.85 | x0.80 | x1.38 to x1.59 at 5:00 and 9:00 |
| Cinderfall | x0.72 | x0.72 | x0.72 | x0.72 | x1.30 to x1.41, kill share x1.8 |

Starting weapons keep rank 1 within 10%. Reaving Arc (Graveblade's starter,
above the healers' band) is left alone: Graveblade already loses the most
health of any survivor, and a candidate that trimmed it saw Graveblade die
in 3 of 6 nights. Measured with `tools/meter-test.js` (60 seeded builds a
stage, 1:00 to 14:00): shares outside their band drop from 38 of 60 to 31.

Before shipping: `tools/check-scaling.js` reports Blightfield at +1% under
Duplicity with the patch (zero tolerance; Duplicity has no zone path), so
look at that check's tolerance; and run the meter gate in
`tools/balance-suite.sh`.
