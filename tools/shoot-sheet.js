#!/usr/bin/env node
/* A contact sheet of every weapon firing, at three ranks.
 *
 * Not a guard - a place to LOOK. The weapons are the thing a player stares at
 * for an entire run and the only way to see one is to roll it, rank it and
 * stand still, which is not a thing anybody can do twenty-one times in a row.
 * This sets up the same scene for each: the survivor at a fixed point, a
 * target the same distance away, the weapon fired, and the frame grabbed a
 * fixed number of ticks later so the shot is caught in flight rather than at
 * the muzzle or after it lands.
 *
 *   node tools/shoot-sheet.js [outdir]
 *
 * Set CHROME to point at an existing Chromium binary. */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = process.argv[2] || path.resolve(__dirname, '..', 'shots');
const INDEX = 'file://' + path.resolve(__dirname, '..', 'index.html');
/* Ranks worth seeing: where it starts, the middle, and everything it can be.
 * A weapon that changes between 1 and 8 is doing its job; one that looks
 * identical is the bug this sheet exists to show. */
const RANKS = [1, 4, 8];
/* Ticks after firing. Long enough that a travelling shot has left the hand
 * and short enough that a beam has not faded (its life is 0.22s, 13 ticks). */
const AFTER = 8;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.error('page error: ' + e.message));
  await page.goto(INDEX);
  await page.waitForTimeout(700);
  await page.evaluate(() => { if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish(); });

  const ids = await page.evaluate(() => {
    WS.Save.db.seenManual = true; WS.Save.unlockAll();
    /* Every weapon in the game, unions included - the unions are half the
       reason to look, since they are the ones nobody sees until very late. */
    return Object.keys(WS.Weapons);
  });
  console.log(ids.length + ' weapons');

  for (const id of ids) {
    for (const rank of RANKS) {
      const ok = await page.evaluate(async ([id, rank, AFTER]) => {
        const W = WS.CONST.WORLD_WIDTH, H = WS.CONST.WORLD_HEIGHT;
        WS.Game.startRun('thornhollow', 'mage');
        /* Clear the run's opening blessing card. A fresh run comes up in the
           'blessing' state with a full-screen panel over the field, and the
           first sheet photographed twenty-one weapons through it. */
        let guard = 0;
        while (WS.Game.state !== 'playing' && guard++ < 12) {
          if (WS.Game.state === 'blessing') {
            WS.Game.chooseBlessing((WS.Game.blessingChoices || [])[0]);
          } else if (WS.Game.state === 'levelup') {
            WS.Game.chooseLevelUp((WS.Game.levelChoices || [])[0]);
          } else break;
          /* Choosing does not land on the same frame - the UI holds the
             commit for a beat - so the card has to be ticked away, and a
             harness that only called choose watched the next card appear
             underneath the first. */
          for (let t = 0; t < 40; t++) WS.Game.tick(1 / 60);
        }
        /* And let the panel finish leaving. It fades rather than cutting, so
           a shot taken the frame after the state flips is taken through it. */
        for (let t = 0; t < 90; t++) WS.Game.tick(1 / 60);
        const p = WS.Game.player;
        /* One weapon, so what is on screen is that weapon and not whatever
           the character happened to start with. */
        p.weapons.length = 0;
        /* And the LEDGER with it. addWeapon defers to levelWeapon when
           weaponLevels already knows the id, and levelWeapon looks the weapon
           up in the array we just emptied - so the character's own starting
           weapon was the one weapon this sheet could not photograph. */
        for (const k of Object.keys(p.weaponLevels)) delete p.weaponLevels[k];
        WS.Player.addWeapon(p, id);
        const w = p.weapons[0];
        if (!w) return false;
        w.rank = rank;
        p.x = W * 0.34; p.y = H * 0.56;
        WS.Enemy.pool.releaseAll();
        WS.Projectile.clear();
        /* A target to shoot AT, off to the right and a little up, so the
           shot crosses open ground rather than leaving along an axis. */
        const e = WS.Enemy.spawn('mongrel', W * 0.66, H * 0.44, 1, true);
        if (e) { e.hp = e.maxHp = 1e9; }
        // a second one further out, so chains and bounces have somewhere to go
        const e2 = WS.Enemy.spawn('mongrel', W * 0.78, H * 0.62, 1, true);
        if (e2) { e2.hp = e2.maxHp = 1e9; }
        w.cooldown = 0;
        WS.Game.tick(1 / 60);
        for (let i = 0; i < AFTER; i++) WS.Game.tick(1 / 60);
        /* Photograph the FIELD. The blessing and level-up panels are DOM
           over the canvas, and ticking them away is a race this harness kept
           losing - clearing one spends ninety frames, in which the weapon
           kills enough to open the next. Hiding the overlay is the only
           version that cannot be out-raced, and what is being looked at here
           is the weapon anyway. */
        for (const id of ['overlay', 'hud']) {
          const el = document.getElementById(id);
          if (el) el.style.display = 'none';
        }
        WS.Renderer.draw(performance.now());
        return WS.Game.state;
      }, [id, rank, AFTER]);
      if (!ok) { console.log('  skip ' + id); continue; }
      await page.screenshot({
        path: path.join(OUT, `${id}-r${rank}.png`),
        clip: { x: 300, y: 180, width: 700, height: 420 },
      });
    }
    console.log('  ' + id);
  }
  await browser.close();
  console.log('-> ' + OUT);
})();
