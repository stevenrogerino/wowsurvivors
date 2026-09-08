# Emberwatch

*Thirty minutes until dawn.*

A complete arcade survival game that runs in a browser. Open `index.html` and
play — no build step, no server, no dependencies, and no network requests:
every sprite, icon and sound is generated at runtime, and both typefaces are
embedded in the stylesheet.

You hold a light through one night. 10 survivors, 21 weapons (16 findable,
plus 5 union super-weapons), 28 creatures, 6 elites, 20 bosses, 5 battlefields
plus a scripted boss arena, 25 passives, 15 blessings, 9 hidden weapon
discoveries, 13 Trainer upgrades and 24 achievements — all drawn on canvas and
dressed in **Arclight**: an obsidian interface lit by arc light, where anything
that measures or matters glows and everything else recedes
(see [`docs/ARCLIGHT-UI.md`](docs/ARCLIGHT-UI.md)).

The game aims at a hard duality: cute but epic. Something you can play at a
stroll, and sweat over if you lean in.

Every name, every sprite and every sound in Emberwatch is its own. See
[`NOTICE.md`](NOTICE.md) for the provenance, and `tools/check-original.js`,
which enforces it.

## Play

```
open index.html            # macOS
xdg-open index.html        # Linux
start index.html           # Windows
```

Or build one self-contained file to host or hand around:

```
node tools/bundle.js       # -> dist/emberwatch.html
```

### Controls

| | |
| --- | --- |
| **WASD** / gamepad / touch | move — that is the only control |
| **hold the left mouse button** and drag | steer one-handed, the same as the touch stick (optional, in Settings) |
| **arrows** / gamepad | move the focus around a menu; **Enter** or **A** picks |
| **1 2 3** | pick a level-up card |
| **R** / **B** | reroll / banish a level-up offer |
| **Esc** | pause (full build sheet and damage meter) |

Your weapons fire on their own. Everything else is where you stand — which is
the one rule nobody guesses, so the game says it before the first run and keeps
it under **How to play**, in the menu and behind Esc.

## The run

- Pick a survivor and a battlefield, then draft one **Blessing** — a
  run-defining boon, from a flat stat to a rule change like Glass Cannon,
  Momentum or the Ruinous Pact.
- Gather experience gems, take a boon each level, and pair a weapon with its
  catalyst passive to **evolve** it at rank 8. Two fully evolved weapons can
  then merge into a **union** super-weapon, freeing a slot.
- Certain weapon pairs quietly unlock **Discoveries** — Frostfire Bolt,
  Tempest Pact, Curdle — recorded permanently in the Codex.
- Bosses arrive at 5:00, 10:30, 16:00, 22:00 and 27:00. Surviving to **30:00**
  is Victory and unlocks that map's Hyper Mode; at that moment **Death itself**
  walks out, and returns every minute after. Claim the win, fight on, or go
  True Endless.
- Elites drop chests (which can jackpot). Kills can drop coins, potions,
  goblin sappers, lodestones and bronze hourglasses; supply caches and a
  wandering egg merchant appear on the field over time.
- Gold banks between runs and buys permanent training from the **Trainer**,
  including the 100-rank Curious Egg.
- Achievements unlock the other eight survivors and four further battlefields.
  Three survivors are not unlocked by a counter at all: the **Paladin** is
  buried on the field in a coffin you have to walk to, the **Graveblade**
  answers a graveblade drawn out by your own Curdled Light, and the
  **Ruinseeker** arrives with twin glaives once you have taken the ruinform
  enough times.

### The Eclipse Arena

A separate mode with no horde and no timer: a bounded duel with Aethelgard, the
Eclipse Sovereign, fought through telegraphed ground mechanics — Solar Flare
rings you must find the opening in, Sunfall Spears that mark the safe ground
green, a spinning Eclipse Cross, and Umbral Chains you break by running through
their anchors. You arrive with a ready-made kit, so it tests the fight rather
than the build. Phase 2 at 60% health, Total Darkness and a hard enrage at 20%.

## Architecture

Classic `<script>` tags in dependency order (see `index.html`), everything
hanging off one global `WS` namespace — deliberately, so the game runs straight
off the filesystem with no module CORS rules and no bundler.

```
src/core/      util (math, RNG, pools, spatial hash), save, input
src/data/      pure content: characters, weapons, enemies, bosses, maps,
               upgrades, meta upgrades, blessings, combos, achievements
src/game/      the simulation: player, enemy, weapon, projectile, xp, pickup,
               familiar, waves, levelup, combos, achievements, arena, game
src/render/    procedural sprites, procedural icons, the canvas renderer
src/audio/     WebAudio synth kit and the generative per-zone score
src/ui/        the Arclight stylesheet, its embedded faces, and the DOM layer
tools/         the single-file bundler, and the guard rails:
               playtest.js    headless full run, every map, every survivor
               check-ui.js    bracket collisions, false scroll scrims, and
                              the shop's banked total tracking its purchases
               check-input.js held movement across overlays
               check-fx.js    particle speed and world bounds
               check-icons.js glyphs clipped by their field, roster size
               check-nav.js   spatial menu navigation and the focus ring
               check-steer.js mouse and touch steering, and its hand-back
               check-hud.js   HUD inside the screen and off the middle of the
                              field, the arena read with no colour at all, and
                              a phone held upright told to turn
               check-robust.js a thrown frame, sixteen malformed saves, a save
                              made before the rename, and a run's gold banked
                              by the autosave and by the tab going away
               check-audio.js sound placed in the stereo field, muting that
                              stops the score rather than hiding it, and a
                              stopped clock that takes no bookings
               check-original.js every file and bundle against ~90 borrowed
                              terms - the game owns every name it ships
```

Every guard carries the bug it was written for in its header, and every one of
them has been run against the broken code to confirm it actually fails there —
`check-hud.js` found its own texture threshold set too low that way, passing a
build it was supposed to reject.

- **Simulation** runs at a fixed 60 Hz with a per-frame catch-up cap, so a
  frame hitch never becomes a death spiral of ticks. The playfield is a fixed
  1280×720 world letterboxed into the viewport, so play is identical at every
  window size.
- **Everything is pooled** with hard caps — enemies, projectiles, gems,
  pickups, particles, floating text. Nothing allocates during combat.
  Projectile collision queries an 80px spatial hash rebuilt once per tick, and
  every shot funnels through one reused scratch object.
- **Art is code.** `src/render/sprites.js` composes creatures from shaded
  primitives per archetype (humanoid, quadruped, undead, wraith, mech…) and
  caches each one, supersampled 2×, per tint and size.
  `src/render/icons.js` draws all seventy ability glyphs to one system — a
  shared optical circle, two stroke weights, one density target — on a
  chamfered machined plate.
- **Sound is code.** `src/audio/audio.js` synthesises each effect from
  oscillators and filtered noise (throttled per kit, so a maxed build does not
  stack forty voices), and schedules a generative score per zone whose
  arpeggio density follows how dangerous the run has become.
- **Persistence** is one versioned `localStorage` record merged onto defaults,
  so an older save keeps its gold.
- **Feel is engineered, not incidental**: hit-stop on heavy kills, bodies that
  squash and fade, damage numbers that fan and budget themselves, gems that
  recede with distance, a rim that answers damage, and a level-up that eases
  the world back up to speed. See [`docs/ARCLIGHT-UI.md`](docs/ARCLIGHT-UI.md).

## Extending

- **New enemy / boss / map / passive / achievement** — add an entry to the
  matching file in `src/data/` and its `*Order` list. Maps are fully
  data-driven: spawn phases, swarm events, boss schedule, palette, props.
- **New weapon** — add data in `src/data/weapons.js`. If its behaviour is not
  one of the ten existing handlers (aimed, spray, ring, nova, zone, chain,
  orbit, storm, bounce, beam), register another in `src/game/weapon.js`.
- **New survivor** — add to `src/data/characters.js` plus an achievement in
  `src/data/achievements.js` that rewards `{ type: 'character', id }`.
- **New creature silhouette** — add an archetype to `CREATURES` in
  `src/render/sprites.js` and reference it by `art`.

## Credits

Emberwatch is original work. Its setting, roster, bestiary, spell list and
score are its own, and every pixel and every sound is generated by the code in
this repository — there is not one image or audio file in the tree. The two
typefaces are used under the SIL Open Font License; see [`NOTICE.md`](NOTICE.md).

The game began life as a port of a personal Lua addon that ran inside another
game's client. That addon has been removed from this repository — it could
never have shipped alongside something meant to be sold — and survives only in
git history. Nothing here depends on it.
