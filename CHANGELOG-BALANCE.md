# Balance changelog

Written by the tuning bench (`node tools/bench.js`) every time you save, so a
tuning pass leaves a record of itself instead of a mystery diff. Newest first.

<!-- new entries go directly below -->

## 2026-09-24 — Marrowfrost (Pale Wastes finale) holds the end of the story

Playtest: "looked awesome but again too easy and died too fast".
- Heart-Drill: while a coolant line stands it takes `pipeShield` (35%)
  and cannot be broken below `drillFloor` (45%).
- Marrowfrost: `pale_lord` health 560k→700k. His Pale Shards re-form at
  `wardLines` 80% and 60% (with a nova), and he cannot be taken past
  `winterAt` (40%) before the Heart of Winter. Inside it, the last of the
  Pale wards him once more at `lastWardAt` (20%) with a nova and spikes.
- A two-armed frost cross every 15s in the lord phase (it was winter-only).
- `winterEnrage` 100→130s: with the extra ward the harness build finished
  with 10.8s on the clock.
- Any finale that has sized itself to the build says so on arrival
  ("It has taken your measure · ×10 the health").
- Measured: harness build 136→~330s; a 135k-DPS build 138→172s; every
  ward, the winter and the last ward play at both.

## 2026-09-24 — The Stormbreaker (Ochre Plains finale) gets teeth

Playtest: "too easy, very fun though".
- Walk phase: a stomp shockwave (a ring with three gaps) every
  `shockEvery` 8s; missiles 4 every 7s → 5 every 5.5s.
- Kneel: `kneelStagger` 10→8s, `kneelVuln` 1.3→1.2; it comes down with a
  shockwave and calls in Karrash.
- Fortress: the pylons now shield the hull (`pylonShield` 0.30 damage
  taken while any stands) instead of being scenery. It cannot be burned
  past `reraiseAt` (50%) before the pylons come back, nor past
  `destructAt` (15%) after, so the self-destruct always plays.
- Damage scale 11.5→12.5, and the Pale Wastes 12→13.5 so the last fight
  stays the hardest.
- Measured: harness build 235→274s; a 135k-DPS build 86→102s; a
  dodging bot takes ~1430/min (was ~960).

## 2026-09-24 — Ruinform nerf; catching up on 22–23 Sept

Not a bench session — applied directly to the shipped data files. The
Ruinform nerf is today's; everything after it shipped on 22–23 Sept without a
changelog entry and is recorded here.

**Ruinform (24 Sept):**
- Steroid: `Config.metaDamageMult` 2.00→1.85 (with `metaCooldownMult` 0.60,
  output while transformed goes from ×3.33 to ×3.08).
- Recovery window after each form (the "cooldown"), which is what caps uptime
  at duration / (duration + recovery):
  - Ruinseeker who takes the Ruinous Pact: `metaRecoveryBorn` 2.5→3.5s,
    `metaRecoveryBornFloor` 1.5→2.5s. Max uptime (Ruin Hunger 5) 89.7%→83.9%.
  - Everyone else with the Pact: `metaRecovery` 4.0→5.0s,
    `metaRecoveryFloor` 3.4→4.5s. Max uptime 79.3%→74.3%.
  - Measured over a 90s siege (`tools/check-ruin.js`): Ruinseeker 64.0%→80.1%
    from rank 0 to 5, Pact paladin 56.4%→72.2%.
- Net: average damage multiplier from the form at max rank falls about 11%
  for the Ruinseeker and about 10% for everyone else.

**Finales size themselves to the build (24 Sept):**
- The fights were tuned against a test build doing ~5k DPS; a real 30:00
  build was filmed at 130k+ and killed Mordecai in his first exposed window.
  Finale health (bosses and parts) now scales by
  `(dawn DPS / Config.finaleRefDps) ^ Config.finalePowerExp`, capped at
  `finalePowerCap` — 5000 / 0.7 / 40. Dawn DPS is the average over the last
  `finalePowerWindow` (120s) before 30:00. A 135k build gets ×10 health:
  27× the damage ends a fight about 2.7× sooner, not 27×.
- Phase lines: Mordecai's "four lives" (`lives: [0.70, 0.45, 0.20]`) — an
  exposed window cannot take him past the next, and reaching it relights the
  lanterns at once. The Candlecrawler's overheat windows stop at 85% and 70%
  (`overheatLines`), then the burrow at 60%, then the meltdown at 25%.
- Measured with a 135k-DPS build (`tools/check-finale.js --strong`): every
  phase of every finale plays; fights run 39–143s. The harness build's
  fights are unchanged.

**Ruinform and class identity (22 Sept, not logged at the time):**
- The Ruinseeker no longer starts with Ruinform; the Ruinous Pact is always
  offered to them, and taking it makes them ruinborn. Recovery floors went
  from 0s (ruinborn) / 1.5s (everyone else) to 1.5s / 3.4s: permanent uptime
  for the class became 89.7%, everyone else 79.3%.

**Curdled Light (22 Sept, not logged at the time):**
- `curdleRadius` 110→140, `curdleCoefficient` 1.00→2.15: a dedicated
  Graveblade healing build lands near 500 DPS on the dummy, other classes a
  little under.

**Finales (23 Sept):**
- Each finale names its own damage scale (`Finales.<map>.tuning.damage`):
  8 / 9 / 10.5 / 11.5 / 12, under one dial `Config.finaleDamage` (1.0). A
  heavy telegraphed hit takes about a quarter of an 840-health, 16-armour bar
  on Thornhollow, rising to about half on the Pale Wastes.
- Finale charges lock their aim 0.3s before they fire; the Admiral's chained
  dashes wind up in 0.5s (was 0.385s); the Candlecrawler marks where it will
  surface for 1s (was 0.05s).

**Beans (23 Sept):**
- `Config.eggVendorStay` 90: Beans packs up 90s after arriving instead of
  waiting on the field indefinitely.

## 2026-09-22 — Section Q buffs, Ruinform nerf, scale-constant renormalization

Not a bench session — applied directly to the shipped data files, following up
on the balance audit report's Section Q findings.

**Buffs (all individually measured with `tools/sim.js` before shipping):**
- Judgement Disc: bounces 3→5, cooldown 2.60s→2.10s (pre-rescale) — measured
  130→247 DPS (+90%)
- Rimeshard: pierce 1→2 — measured 206→309 DPS (+50%)
- Grave Tether: pierce 1→2 — measured 279→387 DPS (+39%)
- Volley: pierce 1→2 — measured 212→248 DPS (+17%)
- Arcweb: chains 4→5 — measured 296→333 DPS (+12.5%)
- Axe Gyre: damage 22→26 (pre-rescale) — measured 694→820 DPS (+18.2%)

**Nerf:**
- Ruinform (`Config.metaDamageMult`): 2.20→2.00, a ~9% cut to damage while the
  form is active. Everything else about Ruinform (uptime, recovery window,
  duration) is untouched.

**Engine change — scale constants renormalized to 1.0:**
`WS.CONST.PLAYER_DAMAGE_SCALE` (was 0.91), `PLAYER_SPEED_SCALE` (was 0.91),
`PLAYER_COOLDOWN_SCALE` (was 1.099) and `ENEMY_SCALE` (was 1.08) are now all
`1.0`. These were a blanket correction layer sitting on top of every weapon's
damage/cooldown/projectile-speed and every enemy/elite/boss's health/damage,
applied uniformly since no weapon carries `noNerf: true`. Every affected field
was rescaled by the old constant so the final in-game numbers are unchanged:
weapon `damage`/`speed` ×0.91, weapon `cooldown` ×1.099, enemy/elite/boss
`health`/`damage` ×1.08, `Config.retributionBase`/`retributionPerRank` ×0.91,
`Familiar.tuning.dmgBase`/`dmgPerLevel` ×0.91 — all computed against the
already-buffed weapon values above, not the pre-buff originals. Verified with
`tools/sim.js` on three untouched weapons (Cinderfall, Dawnpulse, Knifestorm):
dps/kills/left/taken came back byte-identical before and after the rescale.
The four constants are kept (not deleted) as the tuning root for any future
global pass — they just start from a clean 1.0 instead of a legacy fraction.
