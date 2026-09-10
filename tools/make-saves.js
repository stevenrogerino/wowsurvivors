#!/usr/bin/env node
/* Builds the beta-testing save files in beta/.
 *
 * These are made by the GAME, not by hand: the script boots the real build,
 * calls the real WS.Save, and exports through the real WS.Save.export(), so
 * whatever comes out is by construction something the importer will accept and
 * something shaped like the current save format. A save file written by hand
 * against a remembered schema is a save file that stops loading the next time
 * the schema moves, and nothing would say so until a tester tried it.
 *
 *   node tools/make-saves.js
 *
 * Set CHROME to point at an existing Chromium binary. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'beta');

/* Two files, because "unlock everything" is two different testing jobs.
 *
 *   everything  Nothing is in your way: the whole roster, every battlefield,
 *               Hyper armed on all of them, every Trainer rank at its cap, and
 *               a bank you cannot spend.
 *   rich        The same access, but the Trainer is UNTOUCHED and the bank is
 *               enormous - which is the only way to actually test the shop,
 *               because a maxed Trainer has nothing left to sell you.
 */
const BUILDS = [
  { file: 'everything', gold: 1000000, trainer: true,
    note: 'everything unlocked, Trainer maxed' },
  { file: 'rich', gold: 1000000, trainer: false,
    note: 'everything unlocked, Trainer untouched, gold to spend' },
];

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('file://' + path.join(ROOT, 'index.html'));
  await page.waitForFunction(() => window.WS && WS.Save && WS.Save.db);
  await page.waitForTimeout(300);

  fs.mkdirSync(OUT, { recursive: true });
  const made = [];
  for (const b of BUILDS) {
    const out = await page.evaluate((b) => {
      WS.Save.reset();
      if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
      WS.Save.unlockAll(b.gold);
      if (!b.trainer) for (const id of Object.keys(WS.MetaUpgrades)) WS.Save.db.meta[id] = 0;
      // A tester should not be made to sit through the once-only screens.
      WS.Save.db.seenPrologue = true;
      WS.Save.db.seenManual = true;
      WS.Save.save();
      const e = WS.Save.export();
      return { json: e.json, code: e.code, summary: e.summary,
        ranks: Object.keys(WS.MetaUpgrades).reduce((a, id) => a + (WS.Save.db.meta[id] || 0), 0),
        capped: Object.keys(WS.MetaUpgrades).reduce((a, id) => a + WS.MetaUpgrades[id].max, 0) };
    }, b);

    /* Read it back through the real importer before writing it out. A save
       file that the game refuses is worse than no save file: the tester finds
       out at the moment they need it. */
    const check = await page.evaluate((json) => {
      const r = WS.Save.parseImport(json);
      return { ok: r.ok, error: r.error, summary: r.summary };
    }, out.json);
    if (!check.ok) {
      console.error(`${b.file}: the game refuses its own export - ${check.error}`);
      process.exit(1);
    }

    fs.writeFileSync(path.join(OUT, `emberwatch-${b.file}.json`), out.json);
    fs.writeFileSync(path.join(OUT, `emberwatch-${b.file}.txt`), out.code + '\n');
    made.push({ b, out, check });
  }

  if (errs.length) { console.error('page errors: ' + errs.join('; ')); process.exit(1); }
  await browser.close();

  const readme = `# Beta save files

Two accounts, both with everything open. Drop one in and the whole game is
available immediately.

## How to load one

1. Open the game, then **Settings** (from the main menu).
2. Scroll to **Load an account**.
3. Either **Choose file...** and pick the \`.json\`, or open the \`.txt\`,
   copy the whole line, and paste it into the box.
4. It shows you what you are about to replace before it does it. Press
   **Replace my progress**.

Both work the same on the browser build, the single-file build in \`dist/\`,
and the desktop app. The account lives in that browser or app only, so a save
loaded on a laptop is not on the desktop until you load it there too.

## Which one

${made.map(({ b, out }) => `**emberwatch-${b.file}** — ${b.note}.
${out.summary.gold.toLocaleString()} gold, ${out.summary.characters} survivors, `
+ `${out.summary.maps} battlefields, Trainer at ${out.ranks}/${out.capped} ranks.`).join('\n\n')}

## Which one, and this matters more than it sounds

**Use \`rich\` for anything about how the game FEELS.** Pacing, difficulty, the
level curve, whether a weapon is too strong — all of it. It has everything
open and a Trainer at zero, so a run plays exactly the way a real player's
run plays.

**\`everything\` is deliberately overpowered and will mislead you about pacing.**
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
over. None of this is a bug, but if you sit down with \`everything\` to judge
whether the game levels too fast, you are judging the Trainer and not the
game.

Use \`everything\` to reach content quickly — any survivor, any battlefield, at
full strength.

Neither file fakes achievements or the discovery codex. Those are a record of
things that were actually done; filling them in would not unlock anything, it
would only make the statistics lie.

Regenerate with \`node tools/make-saves.js\` — these are exported by the real
game through the real save code, not written by hand.
`;
  fs.writeFileSync(path.join(OUT, 'README.md'), readme);

  for (const { b, out } of made) {
    console.log(`beta/emberwatch-${b.file}.json  ${out.summary.gold.toLocaleString()}g, `
      + `${out.summary.characters} survivors, ${out.summary.maps} battlefields, `
      + `Trainer ${out.ranks}/${out.capped}`);
  }
  console.log('beta/README.md');
})();
