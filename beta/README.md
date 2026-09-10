# Beta save files

Two accounts, both with everything open. Drop one in and the whole game is
available immediately.

## How to load one

1. Open the game, then **Settings** (from the main menu).
2. Scroll to **Load an account**.
3. Either **Choose file...** and pick the `.json`, or open the `.txt`,
   copy the whole line, and paste it into the box.
4. It shows you what you are about to replace before it does it. Press
   **Replace my progress**.

Both work the same on the browser build, the single-file build in `dist/`,
and the desktop app. The account lives in that browser or app only, so a save
loaded on a laptop is not on the desktop until you load it there too.

## Which one

**emberwatch-everything** — everything unlocked, Trainer maxed.
1,000,000 gold, 10 survivors, 6 battlefields, Trainer at 171/171 ranks.

**emberwatch-rich** — everything unlocked, Trainer untouched, gold to spend.
1,000,000 gold, 10 survivors, 6 battlefields, Trainer at 0/171 ranks.

## Which one, and this matters more than it sounds

**Use `rich` for anything about how the game FEELS.** Pacing, difficulty, the
level curve, whether a weapon is too strong — all of it. It has everything
open and a Trainer at zero, so a run plays exactly the way a real player's
run plays.

**`everything` is deliberately overpowered and will mislead you about pacing.**
A maxed Trainer is not a neutral starting point. Measured over five minutes of
Thornhollow against a fresh account:

| | fresh | everything |
|---|---|---|
| Level-ups before you take a step | 0 | **3** |
| Experience gained | ×1.00 | ×1.32 |
| Weapon damage | ×1.08 | ×1.38 |
| Maximum health | 150 | 350 |
| Cheat death once per run | no | **yes** |
| Level reached at 5:00 | 13 | 15 |

The three level-ups at the start are Veteran's Instincts, which is a Trainer
rank that does exactly that; the game names it on screen when it hands them
over. None of this is a bug, but if you sit down with `everything` to judge
whether the game levels too fast, you are judging the Trainer and not the
game.

Use `everything` to reach content quickly — any survivor, any battlefield, at
full strength.

Neither file fakes achievements or the discovery codex. Those are a record of
things that were actually done; filling them in would not unlock anything, it
would only make the statistics lie.

Regenerate with `node tools/make-saves.js` — these are exported by the real
game through the real save code, not written by hand.
