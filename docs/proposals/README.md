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
