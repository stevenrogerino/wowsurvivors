# Balance: how to measure it, and what each instrument cannot see

Balance has been re-measured several times because each instrument answered
one question and the gaps between them were where problems hid. The clearest
case: evolved Arcweb (Skybreak) passed every solo test, and took a median 61%
of the damage meter in real nights, which a tester screenshotted at 59%. This
page is the fixed procedure, so a change is checked the same way every time.

Run it all with `tools/balance-suite.sh` (the fast gates, about 25 minutes on
four cores) or `FULL=1 tools/balance-suite.sh` (and full bot nights). Every
gate prints `ok` or `FAIL`; the script exits with the number that failed.

## The instruments

| Tool | What it measures | What it cannot see |
|---|---|---|
| `tools/meter-test.js` | Each weapon's **share of the meter in company**: 60 seeded random builds of 5, real waves, damage that actually landed, as a share of what the five weapons did. `STAGE=s1`..`s5` (1:00 rank 1 to 20:00 evolved), `STAGE=lead` (the first evolution: one evolved beside four at rank 6). `MOVE=kite` circles near the crowd, `MOVE=pilot` moves like the bot (keeps its distance); `PASSIVES=all` gives all nine weapon passives, `PASSIVES=subset` a random few. **Gate: every weapon's mean over the four movement x passive conditions within x0.8 to x1.25 of fair, and no single condition past x0.65 to x1.35 without a reason written down.** | Bosses; one weapon's absolute strength. |
| `tools/rank-test.js` | A weapon **alone** at five stages (1:00 to 20:00): crowd dummies, a drifting boss, and the real waves (`landed`). `KIND=aux` each passive at nothing and at its cap; `KIND=pair` each discovery on and off. | Kill-stealing: alone, a weapon that hits close to the survivor never has its targets taken by one that reaches out. |
| `tools/tune-unions.js` | Unions, `SHARE=1` as a share of a build beside four evolved weapons. **Gate: 15% to 30%.** | Early game. |
| `tools/botlab.js` | **Full nights** played by the bot: every survivor, real drafting, real drops. `TRACE=10` records a ten-second timeline; `TIDES=1` plays Tides nights. | Human skill; the drafter's taste (see below). |
| `tools/bot-share.js` | The meter across full bot nights; names any evolved weapon whose median share passes 35% for the swap test. | Why: a lone evolved weapon leads whichever it is. |
| `tools/swap-test.js` | Real bot builds where a weapon is evolved, replayed with it and with five other evolved weapons in its place. **Gate: it leads its own builds within x0.8 to x1.25 of what the others would.** | Builds the bot never makes. |
| `tools/night-curve.js` | The shape of a night from `TRACE` timelines: intensity, waves, how nights end. | Whether a near miss was exciting. |
| `tools/slot-test.js` | One ability at 20:00 against a crowd and a boss; the oldest instrument. | Company, and every stage but the last. |

## What the meter test taught us (29 September)

The first fit used one condition: the circling kite, all nine passives. It
passed, and the bot nights still showed Arcweb at 52%. Two things it could
not see:

- **Movement.** A survivor who keeps their distance drags the crowd into a
  trailing clump. Chains and bouncing discs feed on that and the weapons that
  strike around you starve: the same rank-5 build gave Arcweb 15% under the
  kite and 24% under the pilot, Rend and Mend x0.74 and x0.39.
- **Passives.** A weapon that needs crits or Duplicity (Arcweb, Reckoning,
  Mote Cascade) was fitted as if you always had them; with a random few it
  fell to x0.6, and the weapons that ignore passives rose to x1.4 to x1.8.

No one number makes a weapon fair under every way of playing: a melee weapon
is better for a player who stands in the crowd. So the fit targets the mean
over the four conditions and the spread is reported, not hidden. A weapon
whose spread is wide needs a design change (how it scales), not a number.

## Two false alarms, and how they were caught (29 September)

**"The fairer fit costs dawns."** On 24 nights a battlefield (two seeds) the
Dustreach went 18 -> 12. On 60 distinct nights (five seeds) it was 43 -> 39,
and paired by seed 11 nights reached dawn only with the old numbers and 7
only with the new: within chance. Two seeds were unlucky. Bot nights are
deterministic, so re-running the same seeds is not a second sample; use
`SEEDS=5` or more, and compare paired by seed.

**"Skybreak takes half the meter in real nights."** Its median share once
evolved stayed near 50% through every fit, while every lab test called it
fair. The lab was right: in the same real builds (tools/swap-test.js),
Skybreak led at 48% and every other evolved weapon swapped into its place
led at 57% to 69%. A lone evolved weapon beside five low-rank ones takes the
meter, whichever it is. tools/bot-share.js now names such weapons for the
swap test instead of failing them.

Both were settled by the controlled test, not the aggregate. When an
aggregate over bot nights says a weapon is strong, replay the builds with
the weapon swapped before touching a number.

## Targets

- **Share in company** (`meter-test`, all four conditions): every weapon's
  mean within x0.8 to x1.25 of fair at rank 5 and evolved. This is what the
  damage meter shows a player.
- **Bosses**: a weapon's damage to a boss is set by `bossDamage` (every rank)
  and `evolvedBossDamage` (once evolved) in `src/data/weapons.js`. When a
  crowd number moves, move the boss factor the other way so single-target
  damage stays where the boss fit put it.
- **Discoveries**: +5% to +60% to the pair at every stage, never negative.
- **Passives**: no passive makes any weapon it touches worse at its cap.
- **Unions**: 15% to 30% of a build.
- **Nights**: at Professional the bot reaches dawn on most nights on the first
  three battlefields and on a few on the last two; deaths come after a stretch
  at the edge, not straight out of a stretch ahead.

## When you change a number

1. Try it as an override first; every tool takes `WEAPONS='{"id":{...}}'`,
   `COMBOS`, `CONFIG`.
2. Run the meter test at both stages under all four conditions
   (`MOVE=kite|pilot` x `PASSIVES=all|subset`). If a weapon's mean leaves the
   band, fix it before anything else; it is what players will see.
3. Check bosses with `KIND=rank HORDE=0` on the weapons you touched.
4. Run the full suite before shipping (`FULL=1`, five seeds a battlefield),
   and compare dawns paired by seed with the last shipped numbers.

## The bot's drafter

The drafter values cards with the game's reach model, which spreads the horde
evenly over the field; against real waves that rated area weapons dozens of
times below piercing bolts. `tools/bot/calibrate.js` corrects it from
`rank-test` real-wave damage (`KIND=rank STAGES=s3,s5`), damped half way, into
`tools/bot/reach-calibration.json`. Re-run it after a big weapon change, or
the bot will draft for the old numbers.

## Where the numbers live

`src/data/weapons.js` (damage, rank growth, evolution, boss factors),
`src/data/combos.js` (discoveries), `src/data/upgrades.js` (passives),
`src/data/config.js` (the night: scaling, Tides, reliquaries). Every balance
change gets an entry in `CHANGELOG-BALANCE.md`.
