#!/usr/bin/env node
/* The finales: can each one actually be played from 30:00 to the end?
 *
 * Nobody reaches these in testing by accident - it takes half an hour of
 * play to get to one - so this drives every map there on purpose:
 *
 *   dawn      Reaching 30:00 banks the win and opens the dawn panel, and
 *             that panel offers the finale BESIDE the endless choices,
 *             not instead of them.
 *   flow      Taking it burns the horde off the field, offers a third
 *             blessing, gives thirty seconds, and then the boss arrives.
 *   phases    Every encounter walks through every phase it has - the label
 *             the HUD shows is the record of that - and ends in the
 *             finale's own victory, not in a stall.
 *   pace      With a finished build the fight takes a real amount of time:
 *             long enough to be a fight, short enough not to be a chore.
 *   bites     The mechanics land. A survivor standing still in the middle
 *             of all of it takes real damage (this pass is immortal, so it
 *             can finish; what it WOULD have taken is the measurement).
 *
 *   node tools/check-finale.js                  every map
 *   node tools/check-finale.js --only ochre     one
 *   node tools/check-finale.js --shots out/     and save screenshots
 *
 * Set CHROME to point at an existing Chromium binary. */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const GAME = 'file://' + path.resolve(__dirname, '..', 'index.html');
const MAPS = ['thornhollow', 'dustreach', 'mourneholt', 'ochre', 'palewastes'];
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const shotDir = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
const BUILD = ['seeking_motes', 'umbral_bolt', 'cinderfall', 'arcweb', 'hallowed_ring', 'knifestorm'];
const fail = [];

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  if (shotDir) fs.mkdirSync(shotDir, { recursive: true });

  for (const map of MAPS) {
    if (only && map !== only) continue;
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(GAME);
    await page.waitForFunction(() => window.WS && WS.Game && WS.Finale);
    await page.waitForTimeout(300);

    const dawn = await page.evaluate(({ map, build }) => {
      if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
      WS.UI.closeOverlay();
      WS.Save.db.seenManual = true;
      WS.Save.unlockAll();
      WS.Save.settings.victoryCinematic = false;
      WS.setSeed(4242);
      WS.Game.startRun(map, 'mage');
      WS.Game.chooseBlessing(WS.Game.blessingChoices[0]);
      WS.Game.state = 'playing'; WS.Game.running = true;
      WS.Game.leveling = false; WS.Game.pendingLevelUps = 0; WS.Game.settle = 0;
      WS.UI.closeOverlay();
      const p = WS.Game.player;
      p.weapons.length = 0; p.weaponLevels = {};
      for (const id of build) {
        WS.Player.addWeapon(p, id);
        const w = WS.Player.getWeapon(p, id);
        w.level = 8; p.weaponLevels[id] = 8; w.evolved = true;
      }
      p.damageMultiplier += 0.5; p.cooldownMultiplier *= 0.75; p.areaMultiplier += 0.3;
      p.projectileBonus += 1; p.critChance += 0.15;
      p.maxHealth = 1e7; p.health = 1e7;
      WS.Game.run.secondBlessing = true;
      WS.Game.run.time = WS.Config.deathTime - 0.5;
      for (let i = 0; i < 120 && WS.Game.state === 'playing'; i++) WS.Game.update(1 / 60);
      const buttons = [...document.querySelectorAll('#overlay button')].map((b) => b.textContent);
      return { state: WS.Game.state, victorious: WS.Game.run.victorious, buttons };
    }, { map, build: BUILD });

    if (!dawn.victorious) fail.push(`${map}: reaching 30:00 did not bank the win`);
    const face = dawn.buttons.find((b) => b.startsWith('Face'));
    if (!face) fail.push(`${map}: the dawn panel offers no finale (buttons: ${dawn.buttons.join(', ')})`);
    for (const want of ['Fight to the end', 'True Endless', 'Claim the win']) {
      if (!dawn.buttons.includes(want)) fail.push(`${map}: the dawn panel lost "${want}"`);
    }

    const shoot = async (name) => {
      if (!shotDir) return;
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await page.screenshot({ path: path.join(shotDir, `${map}-${name}.png`) });
    };

    // Into the finale, stepping in slices so screenshots can be taken.
    await page.evaluate(() => {
      window.__fin = { stages: [], labels: [], taken: 0, purged: 0, blessing: false,
        fightStart: 0, end: 0 };
      const before = WS.Enemy.count();
      WS.Game.faceFinale();
      window.__fin.before = before;
    });

    let done = false, slices = 0, shots = 0;
    const SHOT_AT = [2, 40, 90, 160, 240];
    while (!done && slices < 400) {
      slices++;
      const st = await page.evaluate(() => {
        const f = window.__fin, G = WS.Game, F = WS.Finale;
        const p = G.player;
        for (let i = 0; i < 180; i++) {
          if (G.state === 'blessing') { f.blessing = true; G.chooseBlessing(G.blessingChoices[0]); }
          if (G.state === 'levelup') G.chooseLevelUp(G.levelChoices[0]);
          if (G.state !== 'playing') break;
          const hp = p.health;
          G.update(1 / 60);
          if (p.health < hp) f.taken += hp - p.health;
          p.health = p.maxHealth;
          if (f.stages[f.stages.length - 1] !== F.stage) {
            f.stages.push(F.stage);
            if (F.stage === 'fight') f.fightStart = G.run.time;
            if (F.stage === 'breather') f.purged = WS.Enemy.count();
          }
          const lab = F.s && F.s.label;
          if (lab && f.labels[f.labels.length - 1] !== lab.replace(/\d+/g, '#')) {
            f.labels.push(lab.replace(/\d+/g, '#'));
          }
          if (F.stage === 'outro' && !f.end) f.end = G.run.time;
        }
        return { stage: F.stage, state: G.state, cleared: !!G.run.finaleCleared,
          t: G.run.time, fight: f.fightStart ? G.run.time - f.fightStart : 0 };
      });
      if (st.stage === 'fight' && shots < SHOT_AT.length && st.fight >= SHOT_AT[shots]) {
        await shoot('fight' + SHOT_AT[shots]);
        shots++;
      }
      if (st.stage === 'breather' && shots === 0 && slices % 5 === 0) await shoot('breather');
      if (st.cleared || st.state === 'over' || st.state === 'dying') done = true;
      if (st.stage === 'fight' && st.fight > 600) done = true;
    }
    await shoot('end');

    const r = await page.evaluate(() => {
      const f = window.__fin;
      return { ...f, cleared: !!WS.Game.run.finaleCleared, state: WS.Game.state,
        fight: f.end && f.fightStart ? f.end - f.fightStart : null,
        buttons: [...document.querySelectorAll('#overlay button')].map((b) => b.textContent),
        finales: WS.Save.stats.finales };
    });
    console.log(`\n${map}`);
    console.log(`  stages : ${r.stages.join(' > ')}`);
    console.log(`  phases : ${r.labels.join(' > ')}`);
    console.log(`  fight  : ${r.fight ? r.fight.toFixed(1) + 's' : 'did not finish'}`
      + `   damage a standing target would have taken: ${Math.round(r.taken)}`);
    console.log(`  horde  : ${r.before} on the field at 30:00, ${r.purged} left after first light`);
    if (!r.cleared) fail.push(`${map}: the finale never finished (stuck in ${r.stages.slice(-1)[0]})`);
    if (!r.blessing) fail.push(`${map}: no third blessing was offered`);
    if (r.purged > 0) fail.push(`${map}: ${r.purged} enemies survived first light`);
    if (r.fight !== null && (r.fight < 45 || r.fight > 420)) {
      fail.push(`${map}: the fight took ${r.fight.toFixed(0)}s with a finished build`);
    }
    if (r.taken < 150) fail.push(`${map}: a survivor standing in it took only ${Math.round(r.taken)}`);
    if (r.cleared && r.buttons.some((b) => b.startsWith('Face'))) {
      fail.push(`${map}: the panel after the finale still offers to face it`);
    }
    for (const e of errs.slice(0, 5)) fail.push(`${map}: page error: ${e}`);
    await page.close();
  }

  await browser.close();
  if (fail.length) {
    console.log('\nFAIL\n  ' + fail.join('\n  '));
    process.exit(1);
  }
  console.log('\nok - every finale plays from dawn to its end');
})();
