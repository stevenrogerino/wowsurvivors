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

Use **everything** to play any survivor on any battlefield at full strength.
Use **rich** to test the Trainer itself — a maxed Trainer has nothing left to
sell you, so the shop cannot be exercised from the other file.

Neither file fakes achievements or the discovery codex. Those are a record of
things that were actually done; filling them in would not unlock anything, it
would only make the statistics lie.

Regenerate with `node tools/make-saves.js` — these are exported by the real
game through the real save code, not written by hand.
