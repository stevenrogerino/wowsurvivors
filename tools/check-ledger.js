#!/usr/bin/env node
/* The ledger, the Nightly, the Oaths, the report and the accessibility
 * settings, measured.
 *
 *   nightly   One day is one night: the same key gives the same battlefield,
 *             survivor, Oaths and draft seed, and a different day gives a
 *             different night. And the DRAFT holds: two runs of the same
 *             Nightly deal the same blessings and the same first level-up,
 *             however much the shared stream has been used in between.
 *
 *   oaths     A sworn Oath does what it says - Iron Hides raises a fresh
 *             spawn's health by its factor, Giants raises a boss's on top -
 *             and the score multiplier is one plus the sum of the bonuses.
 *             No Oath touches the Eclipse Arena.
 *
 *   ledger    Ending a run writes one entry with a score, sets the records it
 *             beat, and the Nightly keeps its best of the day. A malformed
 *             history row in a save is dropped on load, not trusted.
 *
 *   score     More time held, more kills and a harder setting are each worth
 *             more, never less.
 *
 *   report    The tester's report carries the run, the kit in the lab's
 *             format, frame timings and settings, and is valid JSON.
 *
 *   access    Vivid changes the danger palette, a rebound key moves the
 *             survivor, and the arrows still move after a rebind.
 *
 * Set CHROME to point at an existing Chromium binary. */
'use strict';
const { chromium } = require('playwright');
const path = require('path');

const INDEX = 'file://' + path.resolve(__dirname, '..', 'index.html');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(INDEX);
  await page.waitForFunction(() => window.WS && WS.Runs && WS.Game && WS.UI);
  const r = await page.evaluate(() => {
    window.requestAnimationFrame = () => 0;
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
    WS.Save.save = () => {};
    const G = WS.Game, out = { fails: [] };
    const fail = (m) => out.fails.push(m);

    /* nightly */
    const a = WS.Runs.nightly('2026-01-01'), b = WS.Runs.nightly('2026-01-01'), c = WS.Runs.nightly('2026-01-02');
    if (JSON.stringify(a) !== JSON.stringify(b)) fail('the same day gave two different Nightlies');
    if (a.map === c.map && a.character === c.character && a.draft === c.draft) fail('two days gave the same Nightly');
    if (a.oaths.length !== 2) fail(`the Nightly swore ${a.oaths.length} Oaths, not 2`);
    const deal = () => {
      G.startRun(a.map, a.character, { nightly: a });
      const bl = G.blessingChoices.map((x) => x.id).join();
      G.chooseBlessing(G.blessingChoices[0]);
      const lv = WS.LevelUp.buildChoices(G.player).map((x) => x.id).join();
      const r0 = G.run;
      G.endRun('abandoned');
      return [bl, lv, r0];
    };
    const d1 = deal();
    for (let i = 0; i < 997; i++) WS.random();
    const d2 = deal();
    if (d1[0] !== d2[0]) fail(`the Nightly dealt different blessings: ${d1[0]} vs ${d2[0]}`);
    if (d1[1] !== d2[1]) fail(`the Nightly dealt a different first level-up: ${d1[1]} vs ${d2[1]}`);
    if (d1[2].difficulty !== 'veteran' || d1[2].hyper) fail('the Nightly did not run on Veteran without Hyper');

    /* oaths */
    WS.Save.stats.totalVictories = 1;
    WS.Save.db.oaths = { iron: true, giants: true };
    G.startRun('thornhollow', 'mage');
    if (G.state === 'blessing') G.chooseBlessing(G.blessingChoices[0]);
    const want = 1 + WS.Oaths.iron.bonus + WS.Oaths.giants.bonus;
    if (Math.abs(G.run.oathMult - want) > 1e-9) fail(`two Oaths multiplied the score by ${G.run.oathMult}, not ${want}`);
    const e = WS.Enemy.spawn('ghoul', 400, 400, 1, true);
    const base = Math.floor(WS.Enemies.ghoul.health * WS.CONST.ENEMY_SCALE);
    if (Math.abs(e.maxHealth - Math.floor(base * 1.4)) > 1) fail(`Iron Hides gave a ghoul ${e.maxHealth} health, wanted ${Math.floor(base * 1.4)}`);
    const bossId = Object.keys(WS.Bosses).find((id) => !WS.Bosses[id].arena);
    const bo = WS.Enemy.spawn(bossId, 600, 400, 1, true);
    const bbase = Math.floor(WS.Bosses[bossId].health * WS.CONST.ENEMY_SCALE);
    if (Math.abs(bo.maxHealth - Math.floor(Math.floor(bbase * 1.4) * 1.5)) > 2) fail(`Giants did not raise a boss's health (${bo.maxHealth} from ${bbase})`);
    G.endRun('abandoned');
    G.startRun('boss_arena', 'mage');
    if (G.run.oaths.length) fail('Oaths applied in the Eclipse Arena');
    G.endRun('abandoned');
    WS.Save.db.oaths = {};

    /* ledger */
    WS.Save.db.history = []; WS.Save.db.records = { map: {}, char: {} }; WS.Save.db.nightly = {};
    G.startRun(a.map, a.character, { nightly: a });
    if (G.state === 'blessing') G.chooseBlessing(G.blessingChoices[0]);
    G.run.time = 300; G.run.kills = 900;
    G.endRun('defeated');
    const h = WS.Save.db.history[0];
    if (!h || WS.Save.db.history.length !== 1) fail('ending a run did not write exactly one ledger entry');
    else {
      if (!(h.score > 0)) fail('the ledger entry has no score');
      if (h.nightly !== a.day) fail('the ledger entry did not remember it was the Nightly');
      if (!WS.Save.db.records.map[a.map] || WS.Save.db.records.map[a.map].score !== h.score) fail('the battlefield record was not set');
      if (WS.Save.db.nightly.day !== a.day || WS.Save.db.nightly.score !== h.score || WS.Save.db.nightly.tries !== 1) fail('the Nightly did not keep its best of the day');
    }
    const junk = WS.Save.parseImport(JSON.stringify(Object.assign({}, WS.Save.db, { history: [{ map: 5 }, 'x', h] })));
    if (!junk.ok || junk.db.history.length !== 1) fail('a malformed ledger row survived a load');

    /* score */
    const S = (o) => WS.Runs.score(Object.assign({ time: 600, kills: 1000, bossesSlain: 2, map: WS.Maps.thornhollow,
      difficulty: 'veteran', hyper: false, oathMult: 1 }, o), 'defeated');
    const s0 = S({});
    if (!(S({ time: 900 }) > s0)) fail('holding longer did not score more');
    if (!(S({ kills: 2000 }) > s0)) fail('killing more did not score more');
    if (!(S({ difficulty: 'professional' }) > s0)) fail('Professional did not score more than Veteran');
    if (!(S({ hyper: true }) > s0)) fail('Hyper did not score more');
    if (!(S({ oathMult: 1.5 }) > s0)) fail('Oaths did not score more');
    if (!(S({ map: WS.Maps.palewastes }) > s0)) fail('a harder battlefield did not score more');

    /* report */
    G.startRun('thornhollow', 'hunter');
    if (G.state === 'blessing') G.chooseBlessing(G.blessingChoices[0]);
    for (let i = 0; i < 120; i++) { WS.Runs.noteFrame(16 + (i % 7)); G.update(1 / 60); if (G.state === 'levelup') G.chooseLevelUp(G.levelChoices[0]); }
    let rep;
    try { rep = JSON.parse(JSON.stringify(WS.Runs.report('checking'))); } catch (err) { fail('the report is not JSON: ' + err.message); }
    if (rep) {
      if (!rep.run || rep.run.map !== 'thornhollow' || rep.run.char !== 'hunter') fail('the report did not carry the run');
      if (!rep.kit || !rep.kit.weapons.length || !rep.kit.stats || typeof rep.kit.upgrades !== 'object') fail('the report did not carry the kit');
      if (!(rep.frames.n > 0 && rep.frames.p50 > 0)) fail('the report did not carry frame timings');
      if (rep.note !== 'checking') fail('the report lost the note');
    }

    /* access */
    WS.Save.settings.dangerPalette = 'ember';
    const ember = WS.Renderer.danger().deep;
    WS.Save.settings.dangerPalette = 'vivid';
    if (WS.Renderer.danger().deep === ember) fail('Vivid did not change the danger palette');
    WS.Save.settings.dangerPalette = 'ember';
    WS.Save.settings.keys.up = 'KeyI';
    WS.Input.rebind();
    const press = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code }));
    const lift = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code }));
    press('KeyI');
    if (!WS.Input.held.up) fail('a rebound key did not move the survivor');
    lift('KeyI');
    press('KeyW');
    if (WS.Input.held.up) fail('the old key still moved after a rebind');
    lift('KeyW');
    press('ArrowUp');
    if (!WS.Input.held.up) fail('the arrow keys stopped moving after a rebind');
    lift('ArrowUp');
    WS.Save.settings.keys = Object.assign({}, WS.Config.defaultSettings.keys);
    WS.Input.rebind();
    G.endRun('abandoned');

    out.summary = { nightly: `${a.map}/${a.character}/${a.oaths.join('+')}`, mult: want, score: s0, entry: h && h.score };
    return out;
  });
  await browser.close();
  if (errors.length) r.fails.push('page errors: ' + errors.slice(0, 3).join(' | '));
  if (r.fails.length) {
    console.log('FAIL');
    for (const f of r.fails) console.log('  - ' + f);
    process.exit(1);
  }
  console.log(`ok: the Nightly for 2026-01-01 is ${r.summary.nightly} and deals the same cards twice; `
    + `two Oaths multiply the score by ${r.summary.mult.toFixed(2)} and do what they say; the ledger, records `
    + `and the day's best are written once per run; the score rises with time, kills and every setting; the `
    + `report carries run, kit and frames; Vivid recolours danger and a rebound key moves while the arrows still do`);
})();
