#!/usr/bin/env node
/* Thirty minutes of the real game, to answer a question the training ground
 * cannot: is a FINISHED build ever actually threatened?
 *
 * The crucible in tools/sim.js sends a great many unscaled creatures. Hyper
 * sends fewer that are 13.4x tougher by the half hour, and 1.33x as often.
 * Those are different kinds of pressure and only the second one ships, so
 * this runs the real wave director on the real clock with no script at all -
 * one build, thirty minutes, and the low-water mark on its health.
 *
 * Level-ups are ANSWERED rather than suppressed, because this is a real run
 * and a thirty-minute one earns eighty of them. The declared six stay the
 * build.
 *
 *   node tools/endure.js hyper evolved
 *   node tools/endure.js hyper raw
 *   node tools/endure.js normal evolved
 */
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto('file://' + require('path').resolve(__dirname, '..', 'index.html'));
  await page.waitForFunction(() => window.WS && window.WS.Game);
  const out = await page.evaluate(async ([hyper, evolved]) => {
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
    WS.Save.db.seenManual = true; WS.Save.unlockAll();
    WS.setSeed(24680);
    WS.Game.startRun('thornhollow', 'mage');
    if (WS.Game.blessingChoices) WS.Game.chooseBlessing(0);
    WS.Game.run.hyper = hyper;
    WS.Input.poll = function () {};
    const p = WS.Game.player;
    p.weapons.length = 0; p.weaponLevels = {}; p.combosActive = {};
    for (const id of ['seeking_motes', 'cinderfall', 'rimeshard',
      'umbral_bolt', 'moonbrand', 'volley']) {
      WS.Player.addWeapon(p, id);
      const w = WS.Player.getWeapon(p, id);
      if (w) { w.level = 8; p.weaponLevels[id] = 8; if (evolved) w.evolved = true; }
    }
    WS.ComboSystem.check(p);
    /* Level-ups are answered, not suppressed - this is a real run - but the
       declared six stay the build, so the row is about them. */
    const drive = (i) => {
      const leg = Math.floor(i / 240) % 4;
      const k = WS.Input.keys;
      k.up = leg === 0; k.right = leg === 1; k.down = leg === 2; k.left = leg === 3;
    };
    let lowest = 1, died = false, maxEnemies = 0;
    const marks = [];
    const STEP = 1 / 60;
    for (let i = 0; i < 1800 * 60; i++) {
      /* Answer the overlays, do not break on them. Choosing a blessing spends
         a beat of real time before it commits, so at frame zero the state is
         still 'blessing' - breaking on "not playing" ended the run before it
         began and reported 0 seconds and 0 kills, which is a number about
         this file and not about the game. */
      if (WS.Game.state === 'blessing') {
        if (WS.Game.blessingChoices) WS.Game.chooseBlessing(WS.Game.blessingChoices[0]);
        WS.Game.update(STEP);
        continue;
      }
      if (WS.Game.state === 'levelup') {
        if (WS.Game.levelChoices) WS.Game.chooseLevelUp(WS.Game.levelChoices[0]);
        WS.Game.update(STEP);
        continue;
      }
      if (!WS.Game.running) { died = true; break; }
      if (WS.Game.state !== 'playing') { WS.Game.update(STEP); continue; }
      drive(i);
      WS.Game.update(STEP);
      const frac = p.health / p.maxHealth;
      if (frac < lowest) lowest = frac;
      if (WS.Enemy.pool.count > maxEnemies) maxEnemies = WS.Enemy.pool.count;
      if (i % (300 * 60) === 0 && i) {
        marks.push({ min: i / 3600, hp: Math.round(frac * 100), on: WS.Enemy.pool.count });
      }
    }
    return { survived: Math.round(WS.Game.run.time), died, lowest: Math.round(lowest * 100),
      maxEnemies, marks, kills: WS.Game.run.kills, level: p.level };
  }, [process.argv[2] === 'hyper', process.argv[3] !== 'raw']);
  await b.close();
  console.log((process.argv[2] === 'hyper' ? 'HYPER' : 'normal') + ', six weapons r8'
    + (process.argv[3] !== 'raw' ? ' evolved' : ' unevolved') + ':');
  console.log('  lasted ' + out.survived + 's' + (out.died ? ' (DIED)' : ' (survived the full 30)')
    + ', level ' + out.level + ', ' + out.kills + ' kills');
  console.log('  health never fell below ' + out.lowest + '%, most on screen at once ' + out.maxEnemies);
  for (const m of out.marks) console.log('    ' + m.min + ' min: ' + m.hp + '% hp, ' + m.on + ' on the field');
})();
