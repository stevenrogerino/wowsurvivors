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
