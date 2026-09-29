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
| `tools/meter-test.js` | Each weapon's **share of the meter in company**: 60 seeded random builds of 5, real waves, damage that actually landed. `STAGE=s5` evolved at 20:00, `STAGE=s3` rank 5 at 9:00. **Gate: every weapon x0.65 to x1.35 of a fair share.** | Bosses; one weapon's absolute strength. |
| `tools/rank-test.js` | A weapon **alone** at five stages (1:00 to 20:00): crowd dummies, a drifting boss, and the real waves (`landed`). `KIND=aux` each passive at nothing and at its cap; `KIND=pair` each discovery on and off. | Kill-stealing: alone, a weapon that hits close to the survivor never has its targets taken by one that reaches out. |
| `tools/tune-unions.js` | Unions, `SHARE=1` as a share of a build beside four evolved weapons. **Gate: 15% to 30%.** | Early game. |
| `tools/botlab.js` | **Full nights** played by the bot: every survivor, real drafting, real drops. `TRACE=10` records a ten-second timeline; `TIDES=1` plays Tides nights. | Human skill; the drafter's taste (see below). |
| `tools/bot-share.js` | The meter across full bot nights. **Gate: no evolved weapon's median share over 35%.** | Anything before 15:00. |
| `tools/night-curve.js` | The shape of a night from `TRACE` timelines: intensity, waves, how nights end. | Whether a near miss was exciting. |
| `tools/slot-test.js` | One ability at 20:00 against a crowd and a boss; the oldest instrument. | Company, and every stage but the last. |

## Targets

- **Share in company** (`meter-test`): every weapon within x0.65 to x1.35 of
  fair at rank 5 and evolved. This is what the damage meter shows a player.
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
2. Run the meter test at both stages. If a weapon leaves the band, fix it
   before anything else; it is what players will see.
3. Check bosses with `KIND=rank HORDE=0` on the weapons you touched.
4. Run the full suite before shipping.

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
