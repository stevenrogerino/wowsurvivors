# The Tuning Bench

A balance tool that runs on your machine. **No internet, no account, no
tokens.** Open it whenever you like, change anything in the game, watch it
happen in a live frame beside the controls, and save — it writes the change
into the game and writes you the patch notes.

```
Windows      double-click  bench.bat
macOS/Linux  ./bench.sh          (or: node tools/bench.js)
```

Then open **http://localhost:8770**. Leave the server window open while you
tune; close it when you are done. Node.js is the only requirement, and the
game itself still has none.

## What you can change

Everything. That is not a figure of speech: **the bench is generated from the
game's own data at runtime**, not written out by hand. It reads `WS.Config`,
`WS.Weapons`, `WS.Enemies`, `WS.Bosses`, `WS.Maps`, `WS.Characters`,
`WS.Upgrades`, `WS.MetaUpgrades`, `WS.Blessings`, `WS.Combos`, `WS.Unions`,
`WS.Elites`, `WS.Achievements`, `WS.CONST` (the global damage/speed scalars and
pool ceilings) and `WS.Arena.tuning` (the entire Eclipse Arena fight), walks
whatever it finds, and builds a control per field from the shape of the value:

| what it finds | what you get |
| --- | --- |
| a number | a number box |
| a name, a description, a boast | a text box — rename anything |
| true / false | a checkbox |
| `[0.62, 0.62, 0.68]` | a colour swatch and a picker |
| `[300, 630, 960, 1320, 1620]` | an editable list |
| a map's spawn phases, a boss's patterns | a nested editor, one row per entry |

Two things are shown rather than edited:

- **`apply()` functions** appear as read-only code. A function is not data, and
  a tuning file that could contain one would not be a tuning file. It is shown
  because it is the most useful thing on a boon's card — it says what the
  number above it actually *does*.
- **Rank tables.** Every weapon, level-up boon and Trainer lesson shows what
  each rank is worth. This is *measured*, not described: the weapon table asks
  `WS.Weapon.preview`, the same derivation the game fires with, and the boon
  and lesson tables **run the real `apply()`** on a throwaway survivor and
  report what moved. That matters because Might adds (rank 5 = ×1.5) and Haste
  multiplies (rank 5 = 0.92⁵ = ×0.659), and the only thing that knows which is
  a one-line function. The Trainer table also carries cost per rank and total
  gold spent — maxing a 200g lesson is 11,000g.

**Add a field to any data file and it appears in the bench** — typed
correctly, with its shipped value already known. Add a weapon and its card is
there. Nothing has to be told about it. `tools/check-bench.js` enforces this
by inventing a field on a live object and failing if no control appears for
it.

## How it saves

Shipped values live in the data files under `src/data/` and the bench **never
touches them**. What it writes is `src/data/tuning.js`: a flat list of
overrides keyed by a dotted path, applied over the top when the game loads.

```js
"Weapons.cinderfall.damage": 42,
"Enemies.wolf.name": "Longtooth Stalker",
"Maps.thornhollow.phases.2.interval": 0.8,
```

That separation is what makes the tool safe to lean on:

- **Reset all** is real, not a promise — the originals were never overwritten.
- Each value shows *was 34* beside it, with a **⟲** to put just that one back.
- A tuning session is one small file in `git diff`, not a hundred scattered
  edits.
- The patch notes come free, because a change is exactly the difference
  between a path's value and what the game ships at it.

Every save appends to **`CHANGELOG-BALANCE.md`**:

```
## 2026-09-09 — Faster wolves

### Creatures
- Longtooth Wolf health 22 → 30 (+36%)
- Longtooth Wolf renamed "Longtooth Wolf" → "Longtooth Stalker"
- Longtooth Wolf speed 92 → 108 (+17%)
```

Name the pass in the box above the notes and that becomes the heading.

If you would rather not run the server at all, **Copy tuning.js** puts the
whole file on the clipboard — paste it over `src/data/tuning.js` and reload.

### Typing into a rank

The rank tables are not read-only. Rank 4's damage is not a field anywhere —
it's the base times a step — so **type the number you want and the bench solves
backwards onto the field that produces it.** Want Rimeshard doing 90 dps at
rank 8? Type 90 into that cell. It bisects over `rankDamageStep`, measuring
each guess with the game's own `Weapon.preview`, and tells you what it moved.

- Typing into **rank 1** moves the base (`damage`, `cooldown`).
- Typing into a **later rank** moves `rankDamageStep`, so the weapon starts
  where it started and *grows* differently.
- Typing into the **evolved** row moves `evolveDamageMult`.
- On a boon or a lesson, any rank solves `v`; a Trainer cost cell solves `cost`.

The solve doesn't know whether the relationship is linear — that's the point. A
boon that multiplies and a weapon that adds go through the same eight lines,
and neither can go stale when a formula changes.

## Projections

The first tab is charts, all computed from the game's own functions and redrawn
from whatever you've tuned:

- **Single-target output** — every weapon on one axis, showing rank 1 → rank 8 →
  evolved. This is the chart that tells you Knifestorm is nine times Hallowed
  Ring.
- **Crowd projection** — the same weapons against a field of enemies, with a
  slider for how many. This is where a splash radius or a pierce count shows up.
  It is a *projection* and the model is printed under it: enemies assumed spread
  evenly over the field, area effects reaching `crowd × πr² / field`, chains
  reaching their chain count, pierce reaching pierce + 1. Real crowds bunch, so
  area weapons do better than this says.
- **Time to kill, as the night goes on** — seconds to kill, minute by minute,
  using the game's real `WaveManager.enemyScale` and `bossScale`. Three small
  multiples (a creature, the map's toughest creature, its final boss), each on
  its own scale, because a 600-second boss on a shared axis flattens everything
  else to a line.

Every chart has a **show as table** toggle.

## Working in it

- **Live.** Most values reach the running game the instant you type. Spawn
  tables, map timelines and survivor base stats are read when a run *starts* —
  pick a battlefield and a survivor and hit **Start run** to see those.
- **The frame keeps its own save.** It is served over `http://localhost`, a
  different origin from the file you play from, so tuning never touches the
  account with your real gold and unlocks in it.
- **Search** covers every table at once — field names, ids, and values. Typing
  `cooldown` finds every cooldown in the game.
- **Changed only** collapses everything to what you have actually touched.
- Changed values are gold; so is the count beside each section in the sidebar.
- Cards start collapsed with **expand all / collapse all** at the top, and each
  card's fields lay out in as many columns as the window is wide.
- **Drag the dividers** between the sidebar, the editor and the live game — the
  widths are remembered per browser. The dropdown next to *changed only* sets
  how wide the field columns are, down to a single column.

## Shipping tuning

`src/data/tuning.js` is loaded by `index.html` like any other data file, so
`node tools/bundle.js` carries your tuning into the single-file build and into
the desktop app. To ship the game exactly as designed, hit **Reset all** and
save — an empty override list is the shipped game.

## The guard

`node tools/check-bench.js` drives the whole loop against a throwaway copy of
the repository: it launches the server, builds the bench, invents a field to
prove the introspection is real, types into a box and checks the *running
game* changed, saves, checks the file and the patch notes, reloads, and checks
the change survived with its shipped value still recoverable. It also checks
a tuning path cannot reach outside the data tables and that a page on another
origin cannot make the server write anything.

Both of those last two started as failures. The forbidden-key list was written
as `{ __proto__: 1, ... }`, which sets an object's prototype rather than
creating a key called `__proto__` — so the guard against `__proto__` did not
contain the word `__proto__`, and `Weapons.__proto__.anything` walked straight
through to `Object.prototype`. The bench's own check found it.
