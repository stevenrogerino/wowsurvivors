# Balance changelog

Written by the tuning bench (`node tools/bench.js`) every time you save, so a
tuning pass leaves a record of itself instead of a mystery diff. Newest first.

<!-- new entries go directly below -->

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
