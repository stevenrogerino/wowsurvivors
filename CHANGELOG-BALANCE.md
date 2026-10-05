# Balance changelog

Written by the tuning bench (`node tools/bench.js`) every time you save, so a
tuning pass leaves a record of itself instead of a mystery diff. Newest first.

<!-- new entries go directly below -->

## 2026-10-05 (later): Weeks 3-4 of the balance plan (W6, W8, W2-A, W9, Skybreak)

- **Skybreak (evolved Arcweb), testers' "steals damage": no change.** The
  first-evolution test (STAGE=lead: one weapon evolved, four beside it)
  put it the weakest lead of all twenty at every setting: x0.67 kiting,
  x0.75 piloting with partners at rank 6, x0.66 with partners at rank 3
  (240 builds each). All evolved at s5: x0.88 of fair. The planned fix,
  hops passing over what is at the survivor's feet (`evolveHopSkip`), moved
  neither its share (x0.68) nor the close weapons' beside it (Axe Gyre
  75.6% -> 76%), so it ships off. Counting landed damage (W0) already took
  away the overkill a chain used to be credited with.
- **W6, Curdled Light at 0.6x a weapon.** The pulse grows with Might and the
  arsenal (`Player.curdleScale`: mean over held weapons of 1 +
  `curdleRankStep` 0.20 a rank, x `curdleEvolvedMult` 5 evolved), and it
  erupts on the nearest creature within `curdleReach` 380 instead of at
  the survivor's feet - late, the weapons kill everything before it gets
  close, and the pulse struck air. `curdleCoefficient` 2.15 -> 0.21.
  Committed build (Blood Rite, Curdled Light 5, Recovery 4) beside five
  weapons, `CURDLE=1 node tools/meter-test.js`, 24 builds: s3 2.12x ->
  0.59x of a weapon, s5 0.07x -> 0.62x.
- **W8, Death.** m = minutes past 30:00: a new Death every max(25, 60 -
  5m)s, at most min(8, 1 + m/2) alive, his touch `deathContactBase` 30% +
  5% a minute of the survivor's health (armour applies), and on one clock
  every max(6, 15 - m)s the oldest blinks: a 110px ring 0.4s ahead of the
  survivor, 0.8s fuse, 20% + 3% a minute (cap 60%) and healing x0.5 for 4s
  (Withering). Probe over ten minutes: alive 1 -> 5, touch 30% -> 71%,
  blinks 4 -> 10 a minute; killable, each kill announced with the count,
  `deathsSlain` in run codes.
- **W2-A, Dread Command is a weapon.** The passive retires; the weapon's
  sigil (damage 14, r78, 2.2s) marks the nearest crowd and sends every
  summon at it; Spirit Companion and Grave Call are offered only while it
  is held. Summon power: +4% damage and +2% speed a rank, evolved (The
  Dread Host, paired with Might) +250% and +30% and every sigil readies
  their next bite. Wolves' `maulDmg` 0.2 -> 0.1, `killRebite` 0.5 -> 0.8.
  Package (sigil + three ranks of a summon) against the four other weapons,
  `SUMMON=wolf|ghoul`, 24 builds: wolves s3 1.66x, s5 0.59x (a horde; their
  work is bosses and elites); ghouls s3 1.60x, s5 1.13x.
- **W9, the late rise without Tides.** `defaultLateRamp` 1800: once the last
  phase begins the ambient pace rises one 1800th a second (x1.4 by 30:00;
  Tides keeps its own 900). More to kill, not tougher. Bot nights, 3
  survivors x 2 battlefields, Professional: kills a minute at 25:00-30:00
  1.2k -> 1.6k, one death in six either way.
- **Fix:** drops are held back only while the horde gathers for a boss
  (`Wave.cresting`), not whenever the tide is up: on a Tides night the
  late rise kept the tide above 1.15 and no bomb or hourglass would have
  dropped after the last phase.

## 2026-10-05: Weeks 1-2 of the balance plan (SP research plan W0-W7)

- **W0, the meter counts what landed.** `run.landedByWeapon` counts
  min(blow, health above any floor); `damageByWeapon` stays raw. The
  difference is the Overkill hover. A ghoul's rot is credited to its own
  line (`ghoul_rot`), not to the weapon it amplified. meter-test, botlab,
  afk-test and run codes read landed. Shares below are landed.
- **W1, run codes (v4).** Pickup drops, 5s kills and luck, landed meter
  snapshots, overkill/overheal/curdle at the end; run-code.js filters
  (`--diff --char --map --bal`), `--builds` and per-stretch aggregates.
- **W2, summons.** Measured in full five-weapon builds with three ranks
  of the summon (`SUMMON=wolf|ghoul node tools/meter-test.js`, x of the
  mean weapon). The plan's dmgPerLevel cut was rejected: summon power is
  kills (a bite or maul finishes trash whatever it does), so it took the
  late game down with the early (s5 wolves 0.30 -> 0.12). Probes at s2:
  no maul 5.25 -> 1.45; ghoulCdMult x2 4.38 -> 2.89 and s5 unchanged.
  `biteCooldown 0.55 -> 0.85, dmgBase 12.74 -> 0, dmgPerLevel 0.91 ->
  1.35, maulDmg 0.7 -> 0.2, mauleRadius 1.0 -> 0.8, killRebite 0.12 ->
  0.5, packBonus 0.25 -> 0.5, ghoulCdMult 1.45 -> 3.5, ghoulRadiusMult
  1.35 -> 1.1`. 24 builds a stage:

  | | s2 5:00 | s3 9:00 | s4 14:00 | s5 20:00 |
  |---|---|---|---|---|
  | wolves | 5.25 -> 2.82 | 2.32 -> 1.26 | 1.49 -> 0.91 | 0.30 -> 0.23 |
  | ghouls | 4.38 -> 1.64 | 2.30 -> 0.94 | 0.94 -> 0.83 | 0.79 -> 0.92 |

- **W3, bombs and hourglasses.** A bomb's kills and kills during a freeze
  no longer roll them (`Pickup.onKill(e, source)`), and none drop while
  the tide is above `dropCrestSuppress` 1.15. After one drops, the next
  one's per-kill chance is scaled by min(1, (seconds since / recharge)^2),
  `bombRecharge` 20, `glassRecharge` 25: still a roll on every kill, but no
  showers. (A first cut used token purses, a hard ceiling of one per ~18s;
  replaced: late luck builds ticked like a clock.) `dropFadeMinutes`, a
  per-kill fade, exists and is off. Warlock bot, 25 min, per 5 minutes
  from 0:00, bombs / hourglasses:

  | luck | before | after |
  |---|---|---|
  | 1 (3 nights, 20:00-25:00) | 1.60 / 1.13 a minute | ~1.1 / ~0.9 a minute |
  | 3 | 1 6 9 14 16 / 3 4 3 5 9 | 2 0 8 8 10 / 2 3 2 6 8 |
  | 5 | 1 11 13 16 27 / 5 5 9 17 22 | 3 8 10 16 12 / 3 6 5 9 9 |

- **W5, Tether of Anguish.** `evolvedHealTaper` 0.35: evolved, the mend
  lands in full at or below half health and tapers linearly to 35% at
  full; the withheld part is overheal (`Player.heal(p, a, src, keep)`).
- **W7, Ruthless (alone).** `ruthlessExecute` 0.03 a rank -> 0.06 flat;
  every rank adds `ruthlessLow` 8% to crits on anything below
  `ruthlessLowLine` 35% health, elites and bosses included
  (`Calling.ruthlessCrit`). About +1.6% boss damage a rank at 40% crit.
- **W4, Rend and Mend.** The s5 four-condition gate on landed damage
  (240 builds, kite/pilot x all/subset passives) still put it at x1.23 of
  the pure-damage mean, against the healer band x0.72-0.90 (raw had said
  x1.19). `evolveDamageMult 5.93 -> 3.99`; `evolvedBossDamage 2.452 ->
  3.65` holds its evolved boss damage. Evolved Arcweb, flagged by
  testers, measured x0.88 of fair on landed damage: unchanged. Dawnpulse
  (x1.01) and Hallowed Ring (x0.93) are also above the healer band; left
  for the re-gate. Skybreak unchanged.

## 2026-09-29 (later): The meter fit, done over four ways to play and three ranks

Supersedes the weapon numbers in the entry below. The first fit measured one
condition (a circling kite, all nine weapon passives, rank 5 and evolved);
bot nights still showed Arcweb leading, which led to three more findings:

- Movement: a survivor who keeps their distance (the bot's pilot) drags the
  crowd into a trailing clump; chains and discs feed on it. Same build:
  Arcweb 15% under the kite, 24% under the pilot.
- Passives: weapons that lean on crits or Duplicity fall with only a few
  passives (x0.6); weapons that ignore them rise (x1.4 to x1.8).
- Ranks: real nights keep most weapons at low ranks. At rank 3 Arcweb took
  about twice a fair share under the pilot; the step a rank ranged 0.12 to
  0.35 and only damage was being fitted.

The fit now targets each weapon's mean over kite/pilot x all/subset
passives (tools/meter-test.js MOVE, PASSIVES) at rank 3 (s2), rank 5 (s3)
and evolved (s5), fitting `damage` and `rankDamageStep` together (a step
moves half way a round, bounded 0.10 to 0.45) and then `evolveDamageMult`.
Each weapon's share of a five-weapon build, before -> after: evolved
10%-56% -> 18%-22%, rank 5 10%-26% -> 18%-21%, rank 3 11%-30% -> 16%-26%
(Verdant Lance's rank 3 is held up by the step bound). Evolved (rank 8)
damage was held through the rank-curve step; `bossDamage` and
`evolvedBossDamage` hold boss damage at rank 5 and evolved (spot checks
within 3%; Skybreak and Gale Chakram measured and set by hand).

| weapon | damage | step | per rank | evolved mult | boss |
|---|---|---|---|---|---|
| verdant_lance | 32.23 -> 22.44 | 0.35 -> 0.45 | rank 1 32.2 -> 22.4, rank 3 54.8 -> 42.6, rank 5 77.4 -> 62.8, rank 8 111.2 -> 93.1 | evolve x4.883 -> x5.83 | boss x1.169 -> x1.439 |
| arcweb | 79.8 -> 58.83 | 0.35 -> 0.45 | rank 1 79.8 -> 58.8, rank 3 135.7 -> 111.8, rank 5 191.5 -> 164.7, rank 8 275.3 -> 244.2 | evolve x0.818 -> x0.922 | boss x0.743 -> x0.864 |
| judgement_disc | 41.54 -> 31.36 | 0.35 -> 0.45 | rank 1 41.5 -> 31.4, rank 3 70.6 -> 59.6, rank 5 99.7 -> 87.8, rank 8 143.3 -> 130.1 | evolve x0.529 -> x0.583 | boss x1.92 -> x2.18 |
| thornbloom | 3.79 -> 2.07 | 0.17 -> 0.45 | rank 1 3.8 -> 2.1, rank 3 5.1 -> 3.9, rank 5 6.4 -> 5.8, rank 8 8.3 -> 8.6 | evolve x7.131 -> x6.88 | boss x3.084 -> x3.383 |
| blightfield | 2.36 -> 1.8 | 0.12 -> 0.211 | rank 1 2.4 -> 1.8, rank 3 2.9 -> 2.6, rank 5 3.5 -> 3.3, rank 8 4.3 -> 4.5 | evolve x6.189 -> x6.031 | boss x5.907 -> x6.219 |
| hallowed_ring | 2.93 -> 2.22 | 0.13 -> 0.222 | rank 1 2.9 -> 2.2, rank 3 3.7 -> 3.2, rank 5 4.5 -> 4.2, rank 8 5.6 -> 5.7 | evolve x6.369 -> x6.298 | boss x5.626 -> x5.989 |
| reaving_arc | 24.64 -> 16.73 | 0.22 -> 0.45 | rank 1 24.6 -> 16.7, rank 3 35.5 -> 31.8, rank 5 46.3 -> 46.8, rank 8 62.6 -> 69.4 | evolve x6.579 -> x5.93 | boss x2.532 -> x2.504 |
| spirit_herd | 11.54 -> 9.23 | 0.19 -> 0.28 | rank 1 11.5 -> 9.2, rank 3 15.9 -> 14.4, rank 5 20.3 -> 19.6, rank 8 26.9 -> 27.3 | evolve x5.01 -> x4.933 | boss x4.689 -> x4.869 |
| dawnpulse | 20.55 -> 19.1 | 0.22 -> 0.258 | rank 1 20.6 -> 19.1, rank 3 29.6 -> 29.0, rank 5 38.6 -> 38.8, rank 8 52.2 -> 53.6 | evolve x5.032 -> x4.902 | boss x3.036 -> x3.023 |
| volley | 19.54 -> 19 | 0.23 -> 0.238 | rank 1 19.5 -> 19.0, rank 3 28.5 -> 28.0, rank 5 37.5 -> 37.1, rank 8 51.0 -> 50.7 | evolve x2.015 -> x2.029 | boss x1.04 -> x1.052 |
| seeking_motes | 7.94 -> 8.84 | 0.35 -> 0.293 | rank 1 7.9 -> 8.8, rank 3 13.5 -> 14.0, rank 5 19.1 -> 19.2, rank 8 27.4 -> 27.0 | evolve x0.639 -> x0.649 | boss x1.3 -> x1.291 |
| iron_palms | 6.77 -> 7.49 | 0.18 -> 0.152 | rank 1 6.8 -> 7.5, rank 3 9.2 -> 9.8, rank 5 11.6 -> 12.0, rank 8 15.3 -> 15.5 | evolve x4.864 -> x4.813 | boss x1.025 -> x0.991 |
| knifestorm | 12.95 -> 15.57 | 0.35 -> 0.266 | rank 1 12.9 -> 15.6, rank 3 22.0 -> 23.9, rank 5 31.1 -> 32.1, rank 8 44.7 -> 44.6 | evolve x3.276 -> x3.285 | boss x2.882 -> x2.787 |
| rimeshard | 23.61 -> 33.15 | 0.21 -> 0.1 | rank 1 23.6 -> 33.1, rank 3 33.5 -> 39.8, rank 5 43.4 -> 46.4, rank 8 58.3 -> 56.3 | evolve x2.069 -> x2.141 | boss x1.399 -> x1.31 |
| umbral_bolt | 21.43 -> 30.51 | 0.2 -> 0.1 | rank 1 21.4 -> 30.5, rank 3 30.0 -> 36.6, rank 5 38.6 -> 42.7, rank 8 51.4 -> 51.9 | evolve x2.074 -> x2.057 | boss x1.48 -> x1.337 |
| moonbrand | 23.3 -> 28.53 | 0.12 -> 0.1 | rank 1 23.3 -> 28.5, rank 3 28.9 -> 34.2, rank 5 34.5 -> 39.9, rank 8 42.9 -> 48.5 | evolve x2.212 -> x1.955 | boss x0.919 -> x0.793 |
| cinderfall | 24.67 -> 29.61 | 0.12 -> 0.1 | rank 1 24.7 -> 29.6, rank 3 30.6 -> 35.5, rank 5 36.5 -> 41.5, rank 8 45.4 -> 50.3 | evolve x1.501 -> x1.354 | boss x1.318 -> x1.161 |
| axe_gyre | 7.26 -> 9.02 | 0.12 -> 0.1 | rank 1 7.3 -> 9.0, rank 3 9.0 -> 10.8, rank 5 10.7 -> 12.6, rank 8 13.4 -> 15.3 | evolve x11.65 -> x10.15 | boss x3.402 -> x2.895 |
| gale_chakram | 9.07 -> 12.68 | 0.19 -> 0.1 | rank 1 9.1 -> 12.7, rank 3 12.5 -> 15.2, rank 5 16.0 -> 17.8, rank 8 21.1 -> 21.6 | evolve x3.759 -> x3.684 | boss x2.724 -> x2.449 |
| grave_tether | 33.52 -> 50.77 | 0.21 -> 0.1 | rank 1 33.5 -> 50.8, rank 3 47.6 -> 60.9, rank 5 61.7 -> 71.1, rank 8 82.8 -> 86.3 | evolve x2.189 -> x2.1 | boss x1.305 -> x1.132 |

Two alarms on the way, both false, both settled by a controlled test:
- Dawns: 24 nights a battlefield said the Dustreach fell 18 -> 12. Sixty
  distinct nights said 43 -> 39, paired by seed 11 vs 7: within chance.
- Skybreak at ~50% of the meter in real nights once evolved: in the same
  builds (tools/swap-test.js) it led at 48% and every other evolved weapon
  swapped in led at 57%-69%. A lone evolved weapon takes the meter.
  tools/bot-share.js now names such weapons for the swap test.

Drafter recalibrated to the new curves (tools/bot/reach-calibration.json).

## 2026-09-29: Every weapon's share of the meter; Tides as a mode; the Nightly draw

- The meter audit. A tester's evolved Arcweb (Skybreak) did 59% of a night's
  damage. Across 475 bot nights the median share once evolved was Skybreak
  61%, Reckoning 41%, Mote Cascade 35%, Arrowfall 30%, and every weapon that
  strikes around the survivor 2% to 8%. Every earlier instrument measured a
  weapon alone, where reach does not matter; in a build, whatever reaches
  out first kills the crowd before the close weapons see it.
- New gate, `tools/meter-test.js`: 60 seeded random builds of 5, real waves
  on the Pale Wastes at Professional, landed damage by source; every weapon
  must sit within x0.65 to x1.35 of a fair share (20%). Before: evolved
  (`STAGE=s5`) Skybreak x3.10, Reckoning x2.30, Mote Cascade x1.67, down to
  Rend and Mend x0.30; rank 5 (`STAGE=s3`) Verdant Lance x0.34 up to Axe Gyre
  x1.23. After: evolved x0.71 to x1.14, rank 5 x0.68 to x1.01.
- Fitted with a damped multiplicative fit (share toward fair, normalised to
  the geometric mean): `evolveDamageMult` on the evolved stage (three
  rounds), `damage` on rank 5 (two rounds). Skybreak's chain is cut
  structurally, `evolveChains` 30 -> 14 and `evolveChainFalloff` 0.01 -> 0.03,
  so one cast no longer clears the screen whatever its damage.
- Bosses held in place: `bossDamage` is divided by each weapon's rank-5
  change, and the new `evolvedBossDamage` (used by `Enemy.hit` when the
  survivor's own weapon is evolved; shown as "Vs bosses" on the card) holds
  evolved damage to a boss where the boss fit put it. Spot checks with
  `KIND=rank HORDE=0`: Arcweb, Judgement Disc and Axe Gyre within 8%.

  | Weapon | damage | evolveDamageMult | bossDamage | evolvedBossDamage |
  |---|---|---|---|---|
  | arcweb | 69.8 -> 97.05 | 1.61 -> 0.589 | 0.85 -> 0.611 | 1.671 |
  | verdant_lance | 13 -> 27.73 | 6.3 -> 4.757 | 2.9 -> 1.359 | 1.801 |
  | hallowed_ring | 4.36 -> 3.53 | 4.21 -> 5.888 | 3.78 -> 4.665 | 3.336 |
  | reaving_arc | 10.4 -> 16.14 | 6.37 -> 10.453 | 6 -> 3.866 | 2.356 |
  | gale_chakram | 14.8 -> 10.75 | 3.7 -> 3.5 | 1.67 -> 2.299 | 2.43 |
  | judgement_disc | 53.9 -> 58.09 | 1.75 -> 0.463 | 1.48 -> 1.373 | 5.19 |
  | dawnpulse | 10.4 -> 17.36 | 4.87 -> 6.398 | 6 -> 3.594 | 2.736 |
  | iron_palms | 6.94 -> 5.42 | 3.27 -> 5.726 | 1 -> 1.28 | 0.731 |
  | spirit_herd | 18.6 -> 13.41 | 3.05 -> 4.845 | 2.91 -> 4.037 | 2.542 |
  | blightfield | 3.63 -> 2.87 | 4 -> 4.908 | 3.84 -> 4.855 | 3.957 |
  | rimeshard | 23.6 -> 24.14 | 2 -> 2.001 | | |
  | knifestorm | 18.3 -> 14.17 | 2.63 -> 3.935 | | |
  | volley | 24.2 -> 21.77 | 3.37 -> 2.109 | | |
  | cinderfall | 18.9 -> 18.66 | 1.97 -> 1.951 | | |
  | grave_tether | 32.4 -> 34.86 | 2.14 -> 1.973 | | |
  | seeking_motes | 8.39 -> 9.28 | 1.3 -> 0.547 | | 2.643 |
  | axe_gyre | 10.7 -> 6.52 | 2.42 -> 9.391 | 2.31 -> 3.79 | 0.977 |
  | moonbrand | 16.1 -> 15.23 | 2.72 -> 2.495 | | |
  | umbral_bolt | 24.4 -> 22.27 | 2 -> 2.135 | | |
  | thornbloom | 3.96 -> 4.14 | 6.32 -> 6.511 | | |

- The procedure is written down in `docs/BALANCE.md`, and
  `tools/balance-suite.sh` runs every gate (checks, meter s5 and s3,
  discoveries, unions; with `FULL=1` bot nights, `tools/bot-share.js` with
  its 35% cap on any evolved median, and the night curve).
- Tides is a mode, armed per account beside Hyper (`Save.db.tidesArmed`,
  `run.tides`), open once any night has been held to dawn; the Nightly and
  the arena play without it. The Settings switch (`nightRhythm`) is gone.
  Reliquaries drop only in Tides nights. Results and history mark a Tides
  night.
- The Nightly drew from an FNV-1a hash of the date with no finalizer, and
  neighbouring dates drew alike (Abbot Eisen on 5 of the 7 days to 29
  September, 7 of 30).
  The hash now ends with the MurmurHash3 fmix32 finalizer; over a year every
  survivor comes up 21 to 39 times (about 30 expected), every battlefield 54
  to 70.

## 2026-09-28 (evening): The night breathes; passives and discoveries that did nothing

Full nights played by the bot on every battlefield at Professional, every
survivor, recorded every 10 seconds (`TRACE=10` in `tools/botlab.js`, read by
`tools/night-curve.js`): health lost, how low it went, creatures within 250px,
kill distance, level, and every pick, evolution, discovery, boss and
reliquary as events.

- The night had one wall and no waves. Every battlefield stops raising its
  spawn rate at about 18:00 and its last swarm comes by 20:00; after that only
  creature health grows (+57% over the last twelve minutes) while an evolved
  build multiplies. Across 72 nights on the Dustreach, Mourneholt and the
  Ochre Plains, 0 of 14 that never evolved a weapon reached dawn, and a build
  with two evolved weapons often killed everything within a second of it
  stepping on screen for the rest of the night.
- The rhythm (`Config.tides`, on): the ambient pace rises to x1.5 over the
  40s before a scheduled boss (`tideGather`, `tideCrest`), drops to x0.35
  for 45s after one falls and eases back (`tideLull`, `tideLow`); creature
  health steps +10/+15/+25/+30% after the first four bosses' lulls, eased
  over 60s and announced (`tideSteps`, `tideStepTime`); after a map's last
  phase the pace keeps rising, 1/900 a second (`tideLateRamp`). Each step
  lands in proportion to how little the night has been hurting: damage taken
  a second as a share of max health, smoothed over 90s, at 0 the full step,
  at 0.006 none (`tideStrainTime`, `tideStrainFull`); the late climb follows
  the latest step. The banner says what landed: deepens (75% of the step
  or more), deepens a little, or holds back (under 25%). The lull is 22.5s
  (`tideLull`, was 45). Settings, "The night's rhythm" (`nightRhythm`)
  switches the rhythm and reliquaries off for a player. Strain is health
  drained, not damage taken: damage less healing received, smoothed over
  90s, plus how low the bar has been (from tideLowBar 50% down to 20% it
  holds the step back entirely). Counting blows alone gave a warrior who
  healed 98% of what he took 48% of each step, so the builds made to take
  hits got the softest nights. And the deep night pays: after a step, the
  next reliquary's odds of three and five gifts are x(1 + share) and
  x(1 + 2 share) (`reliquaryDeepThree`, `reliquaryDeepFive`), and each step's
  share adds 5% to the score (`depthScore`, `run.depthTaken`). With full steps for everyone the hardest battlefields at
  Professional went from 6 dawns in 24 to none (Pale Wastes) and 10 to 2
  (the Ochre Plains): the steps are for a build that has run away with the
  night.
- Reliquaries (`Config.reliquaries`, on): every boss but Death leaves one.
  1, 3 or 5 gifts (3 at 20%, 5 at 5%, each times luck), each the next step
  of the build: a ready evolution, the passive a rank-8 weapon waits on, a
  rank on the weapon nearest evolution, else Might (`LevelUp.bestow`).
- Every battlefield at Professional, every survivor, two nights each, the
  same seeds off and on (dawns; returns to the edge after a stretch ahead):
  Thornhollow 24 -> 23, 1.2 -> 1.6; the Dustreach 18 -> 19, 1.2 -> 2.2;
  Mourneholt 23 -> 19, 1.9 -> 1.8; the Ochre Plains 10 -> 11, 1.0 -> 1.9;
  the Pale Wastes 6 -> 7, 0.4 -> 0.8; Highmoor 3 -> 3, 0.3 -> 0.5.
  Intensity dips after every boss and the night's sharpest peak comes
  around the last boss instead of in the middle.
- Velocity also makes projectiles hit 7.5% harder a rank
  (`projectileImpact`, in `fillSpec`, the reach model and the damage row).
  At its cap speed alone was worth -12% to +3% to most weapons; now +8% to
  +53%. Gale Chakram's ring widens with Area (the longer throw alone made it
  -21% evolved; now +5%).
- Discoveries, on vs off at 5:00/9:00/14:00/20:00: Shadowflame's burst marks
  what it touches, so an evolved (pierce-everything) Umbral Bolt skipped them
  and the discovery was worth +2%; past pierce 99 the flame goes into the
  bolt instead (`pierceFlame` 1.35, now +15%). Truestrike +10% arrow damage
  (was -1% to -5% before the volley evolved). Moonlit Herd +12% herd damage
  (was +3-7% late), Radiant Gyre +8% blade damage (was +5% evolved),
  Hallowed Hands area 1.10 -> 1.15.
- Evolved weapons against the real waves (damage landed, `rank-test`
  KIND=rank) sit within 2x but not in the dummy order: Knifestorm
  evolveDamageMult 2.39 -> 2.63, Reaving Arc 5.79 -> 6.37, Gale Chakram
  4 -> 3.7.
- DZ (Graveblade), 3 of 8 dawns and the shortest nights of anyone: health
  155 -> 170, regeneration 2 -> 2.5.
- The bot, not the game: the drafter's try-on of a passive did not restore
  Velocity's new bonus (fixed); its weapon values come from the reach model,
  which spreads the horde over the whole field and rated area weapons dozens
  of times below piercing bolts against what they land, so it now corrects
  the model from real-wave damage (`tools/bot/calibrate.js`, damped half
  way); the chain reach model floors each hop at zero as `chainFrom` does
  (an evolved Arcweb came out negative).

## 2026-09-28 (later): Weapons in one band at every rank; discoveries; bursts and homing

Measured with `tools/rank-test.js`: every weapon at rank 1 (1:00), 3 (5:00),
5 (9:00), 8 (14:00) and evolved (20:00), each with that minute's share of the
damage passives, against dummies placed where a kiting survivor's crowd was
measured standing at that minute, a drifting boss, and the real waves (kills,
and damage that actually came off a creature). Pale Wastes, Professional,
Hyper.

- Before evolving, area weapons did 2-5x the stage average and chains,
  bounces and bolts 0.1-0.3x: 33x apart at 5:00, 27x at 14:00. Fitted per
  role to a band at every stage (area 1.2-2.0x on a crowd and 0.6-1.2x on a
  boss; lines 0.8-1.4x and 0.75-1.3x; bolts 0.55-1.0x and 1.1-1.8x) with
  the smallest change, then evolution re-set so 20:00 holds. Now 4-7x apart
  in the real waves at every stage. Values in `src/data/weapons.js`:
  area base damage roughly halved with gentler rank growth and bigger
  evolution multipliers; bolts pierce 2 -> 6; Volley pierce 6, Knifestorm 4,
  Judgement Disc 12 ricochets, Arcweb 10 hops, Seeking Motes 4 motes and
  pierce 4; boss factors re-fitted.
- A bot (`tools/botlab.js`) playing every survivor, four full runs each on
  the Pale Wastes, Professional, Hyper: 1.5 to 12.8 minutes survived by
  starting weapon before, 5.0 to 11.4 after; average 7.1 -> 7.5 minutes,
  level reached 52 -> 63.
- Bursts (Seeking Motes, Iron Palms' flurry) fit inside the cooldown: the
  next cast used to restart a burst still firing, so an evolved Motes got
  x0.95 from Haste and x1.00 from Duplicity. Now x1.51 and x1.40.
- Velocity scales a seeking bolt's turn rate, so a faster bolt no longer
  swings wide (Velocity at its cap cut an evolved Motes to x0.60).
- Discoveries on and off at four stages: Shadowflame burst 20 -> 12 (+79%
  at 5:00 with Umbral Bolt's new pierce); Verdict +1 -> +3 ricochets and
  1.10 -> 1.30; Radiant Gyre pulse 0.8 -> 2.0 (`gyrePulseDamage`); Deadly
  Brew adds 1.15 knife damage; Frostfire, Hailwheel and Razor Wind -> 1.15.
- Unions re-measured beside the new weapons: 15-30% of a build.

## 2026-09-28: One damage band for evolved weapons and unions; Conviction's Judgement

A tester's strongest builds stood still from 20:00 and won, and a few
abilities did most of every build's damage. Measured with
`tools/slot-test.js`: each ability alone, evolved at rank 8, level 150 with
every passive capped, 20:00 Pale Wastes Professional Hyper, against 320
immortal dummies placed where a real horde stands (crowd) and one drifting
boss dummy (boss). Evolved weapons ran from 3k to 552k a second on the
crowd and 0.6k to 3.0k on the boss.

- All changes are on evolution (per-weapon `evolve*` overrides, new
  `evolveSplash` and `evolveChainFalloff`) or on unions, so nothing changes
  before a weapon evolves. Targets by role: area ~150k crowd / 2k boss;
  lines, bounces, chains ~90k / 3k; bolts ~65k / 4k. Result: 50k-167k crowd,
  1.9k-4.1k boss. Every value is in `src/data/weapons.js`.
- Unions, by share of a build's damage beside four evolved weapons
  (`tune-unions` SHARE=1, 8 seeds): Firmament 24.2, Ruin Unbound 37.9 (vs
  bosses x1.95), Storm of Steel 25 (pierce 12), Sanctuary 109, Stormcall 29,
  Tempest Kata 13.2, The Wild Hunt 46, Rotwood 13.4. All sit at 18-29%;
  Ruin Unbound 18%, down from 59% before the 09-27 nerf. Its per-bolt
  damage is higher than before the nerf because the evolved Umbral Bolt it
  is forged from now pierces everything.
- Shadowflame splash 55 -> 20 (2.3x its pair -> 1.37x).
- Waystones: ember sear per level 1.2 -> 0.4 (282k a second alone -> 104k).
- Conviction: 36 to fill (holyHealPct 10% of max health per point, in place
  of a flat 25), 20s lock; Judgement strikes down every non-boss on the
  field and takes 4% off a boss. Was 48% of Keegan's damage standing still;
  now under 7%.
- Radiant Barrier stops refilling 2s after it soaks a hit and 6s after it
  breaks. Highmoor storm strikes back to 88 wide (a duplicate setting had
  them at 190).

## 2026-09-27: Healing spread across five healers, Ruin Unbound, tanks, blessing outliers

- Healing weapons mend per enemy struck, capped per cast; all heal from
  rank 1. Evolved at 15:00 (as of 09-28): Grave Tether 170-273/s -> 64,
  Hallowed Ring 3.4 -> 62, Blightfield 3.9 -> 52, Reaving Arc 6.6 -> 45,
  Dawnpulse 1.5 -> 43; Sanctuary now heals (51).
- Ruin Unbound: damage 25.5 -> 20.4, splash 82 -> 55 (59% -> 27% of a
  five-weapon build's meter).
- Tanks: `armorConstant` 30 -> 16, Ironhide +2 -> +3 a rank, thorns 40% ->
  60%, Searing Aura +12% per point of armour.
- Ruinform x1.85 -> x1.6, rest 5 -> 8s (Ruinseeker 3.5 -> 6.4s); Stillwater
  recharge 5.5 -> 7s and Eisen's extra step removed; Reaper's Tithe rests
  5s after a Reaping and heals at most 15% (was 25%); Leech Pact heals at
  most 1.2% of max health a second; Bloodthirst at most once every 4s.
- The callings: eight signature blessings for the first eight survivors.

## 2026-09-27: Luck and drops halved, bombs on bosses halved, unions keep discoveries

Tester feedback after six maps on Veteran: "I can easily chain bombs + time
stops together the entire run by grabbing Fortune early." Measured over a
full night before the change: a luck build finished at x2.05 luck with 74
sapper charges and 46 hourglasses.

- Every source of luck halved: Fortune 15% -> 7.5% a rank, Gift of the
  Hourglass 15% -> 7.5%, the shaman's perk 15% -> 7.5%, the Trainer's
  lesson 5% -> 2.5% a rank.
- Per-kill drop chances halved except potions: coins 1.0% -> 0.5%, sapper
  charges 0.18% -> 0.09%, lodestones 0.18% -> 0.09%, hourglasses 0.12% ->
  0.06%. Supply caches and elite chests are not luck rolls and are
  unchanged. Coins were about 8% of a night's gold (chests are most of it),
  so gold income falls about 4%.
- Sapper charges take 4% of a boss's health, not 8% (`bombBossPct`).
- Unions keep their discoveries. Forging used to delete both source weapons
  and every discovery on them, including ones with a third weapon (Storm of
  Steel took Truestrike with it). A union now stands in for both sources:
  their discoveries are applied to it, and one found later is found against
  it. All 19 discoveries a union can inherit were checked against what the
  union reads; the one that did nothing (Celestial Alignment's extra beam on
  Firmament) now adds a falling star.
- Weapon counts on the pause sheet and cards include the extra chain and
  blade at ranks 4 and 7, which they had been leaving out.

## 2026-09-26: Meters, rings, finales that hit a moving target, overtime after a finale

Playtest: Axe Gyre "says like no damage", the healing meter "just shows
schools", the spinning find-the-gap rings are hard to see and the gap can
open out of reach, Brother Kael "took a while to kill but I was never in
danger" and had no voice, and after beating him "I died quite quickly to
mobs in the continued run".

- Axe Gyre was not misattributed: an independent hit counter matched the
  meter to the point for every weapon. It is starved in a mixed build (the
  ranged weapons kill what would reach the blades). `orbitTickPct` 0.5 ->
  0.65 (Axe Gyre, Stormcall). Warrior with five other rank-6 weapons,
  same four seeds: Axe Gyre's share 10.2% -> 12.5%.
- Meters: every weapon keeps a row (the smallest used to fall off a top-10
  cut), rows are named for what did it, evolved weapons by their evolved
  name, and a row's tooltip gives hits and damage per hit. Healing from a
  weapon is credited to the weapon, not "holy".
- Rings (finale and arena): one opening is aimed within reach of the
  survivor (at most 150px of walking, never more than a radian, allowing
  for how far a spinning ring turns before it arrives); openings are framed
  by bright edge bars; the ground at the survivor's distance lights where
  the nearest openings will be when the ring gets there.
- Finales lead their target (`Finale.lead`): a strike aimed at the survivor
  lands where they are going, and in a barrage the second covers where they
  stand. A survivor who never stops walking, 150s of Kael: Lightning 570 ->
  3895, Gale 0 -> 1235. Standing still is unchanged.
- Brother Kael has a voice (`tools/check-speakers.js` now fails any finale
  speaker without one).
- Overtime after a finale resumes where the night stopped: the wave
  director's clock (`WaveManager.clock`) leaves out the time the finale
  took, and Death's first visit is a full interval after overtime begins.
  Before, a five-minute finale left overtime starting five minutes deep and
  Death arrived on its first frame.

## 2026-09-26: The herd's thickets and bursts land where the crowd is

Playtest: "some of the green aura things don't really have an effect, or
sometimes have one". Measured in play at 10:00 over 90s: Blightfield,
Thornbloom and Rotwood fields caught something on 84-100% of their ticks;
Bramble Run's thickets caught nothing on 52% of theirs, and 30% of them
never touched a creature at all.

- A spirit beast runs through the crowd and out the far side, and both
  herd effects went off where the run ENDED: open ground. Bramble Run's
  thicket and the end-of-run burst (Moonlit Herd, The Wild Hunt) now land
  where the beast last trampled something. A beast that met nobody grows
  no thicket. (`src/game/projectile.js`)
- Thickets that never touched anything: 30% to 2%; ticks that hit: 52% to
  73%; thicket damage over the same 90s +51%.
- Discoveries, same loadout off -> on (`tools/check-combos.js`): Moonlit
  Herd -3% -> +58%, Bramble Run -2% -> +47%. Both had been measuring
  WEAKER than not finding them.
- The Wild Hunt against the evolved pair it replaces (`tools/check-unions.js`):
  81% -> 122%, now the one union above its pair. Worth a look on the bench.

## 2026-09-26: Oaths, the Nightly and the score

- A run score: `floor(time) * 10 + kills + bosses * 400 + Deaths * 1500`,
  `+5000` at dawn, `+10000` for a finale won first time, `+15000` for the
  arena; times Beginner 0.75 / Veteran 1 / Professional 1.5, Hyper 1.5, the
  battlefield's difficulty and the Oath multiplier (`src/game/runs.js`).
- Eight Oaths (`src/data/oaths.js`), each `+15..25%` score: Crowd (waves
  ×0.75 interval), Iron Hides (health ×1.4), Teeth (damage ×1.35), Chase
  (speed ×1.15), Lean Night (XP ×0.75), Thirst (potions ×0.25), Captains
  (elites ×2), Giants (boss and finale health ×1.5). All eight: ×2.65.
- Measured, Veteran, 15 builds on Thornhollow, Mourneholt and the Pale
  Wastes, 15 minutes: alive at 10:00 76% with none, 60% with four, 40% with
  all eight; at 15:00 69% / 47% / 20%. All eight on the Pale Wastes is not
  survivable by the lab bot, which is the top of the ladder.
- The Nightly runs on Veteran without Hyper and swears two Oaths chosen from
  the day's seed.

## 2026-09-25: The balance lab pass (all difficulties, mostly the hardest)

Measured on 3,897 bot games (every survivor, all six battlefields, Beginner
to Professional Hyper, finale replays from the same dawn kits, the arena).
Playtest: "some bosses you can literally sit there and they don't die", and
the survivor was not in danger either.

**Finales**
- Health sized from single-target power (the reach model with a crowd of
  one), not total damage before dawn: `finaleRefSingle` 1500,
  `finalePowerExp` 0.7, `finalePowerCap` 6. Area builds read as up to ×20
  power and got bosses they could not finish.
- Difficulty and Hyper raise finale health by the square root of their
  product (`finaleHpDifficultyExp` 0.5); damage keeps the full product.
- Sunrise: after `finaleSunriseAfter` 180s of fight the finale's own units
  take +`finaleSunriseStep` 50% per `finaleSunriseEvery` 60s.
- 1e-6 tolerance on the winter, burrow, meltdown, destruct and storm lines
  (the Pale Lord stuck at 40% in 8 of 219 finales).
- Highmoor damage scale 12.5→9.5; Pale Lord nova 50→40; Admiral dash 50→42,
  keg 46→40.
- Retry: dying in a finale offers "Try again" (full health, the kit you fell
  with, `finaleRetryBreather` 6s, no blessing, no Beans). A retry win is not
  credited to `statistics.finales` or boss kills.
- Measured: Veteran win 38%→73%, stalls 15%→1%. Professional Hyper win
  14%→55%, stalls 42%→0%, fight 7:13→3:32. Deaths at Professional Hyper
  (~45%) kept on purpose.

**Bosses and weapons**
- `bossDamage` on 17 weapons (Sanctuary 3.7 down to Rimeshard 1.1), applied
  to bosses, elites and finale units, shown as "Vs bosses" in tooltips.
  Measured single-target damage spanned 17×.
- Aethelgard 324k→520k. The arena now scales: hazards × difficulty × Hyper,
  Aethelgard health × its square root.
- Ruin Unbound checked, not changed: on a dummy with one shared late kit it
  is mid-pack (1,788 DPS vs Axe Gyre 3,321, Umbral Bolt 2,831).

**Early game**
- Difficulty dials ease in: `difficultyRampStart` 35% of the extra at 0:00,
  all of it by `difficultyRampTime` 360s. Professional Hyper alive at 1:00
  64%→96% (Pale Wastes 7%→80%, Highmoor 20%→93%).
- Geist and Stormwisp burst 0.9→0.6, fuse 0.55→0.7s; Harvest Reaper burst
  1.1→0.8. Lunge wind-ups: Karrash Battlelord and Thunderscale 0.55→0.75s,
  Kerchief Enforcer 0.55→0.7s.
- Health: Shaman 125→145, Hunter 115→130, Rogue 100→115 (armour unchanged).
- Gems drop inside the field.

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
