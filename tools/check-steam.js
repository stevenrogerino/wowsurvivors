#!/usr/bin/env node
/* Steam, from the game's side, against a stand-in for the desktop bridge.
 *
 * The real bridge needs a Steam client and an App ID, which no CI has. What
 * matters on the game's side is the contract with desktop/preload.js, so this
 * hands the page a fake `window.emberSteam` before any script runs and holds
 * src/core/platform.js and the save to it:
 *
 *   achieve   an achievement awarded in play is unlocked on Steam under its
 *             API name, once; and every achievement an account already holds
 *             is unlocked at launch, so a pre-Steam account loses nothing.
 *   cloud     saves reach the cloud (coalesced, then flushed on the way out),
 *             and at launch the newer copy wins in both directions - a newer
 *             cloud save replaces an older local one, and an older one never
 *             overwrites newer local progress.
 *   deck      on a Steam Deck the first launch raises the interface text to
 *             115%, once, and never overrides the player's later choice.
 *   web       with no bridge the platform is 'web' and nothing above runs.
 *
 * Set CHROME to point at an existing Chromium binary. */
'use strict';
const { chromium } = require('playwright');
const path = require('path');

const INDEX = 'file://' + path.resolve(__dirname, '..', 'index.html');
const KEY = 'emberwatch.save.v1';

function fakeBridge(opts) {
  /* Runs in the page before any game script. `opts.cloud` is the cloud copy. */
  window.__steam = { unlocked: [], writes: [], cloud: opts.cloud || null };
  window.emberSteam = {
    info: () => ({ available: true, deck: !!opts.deck, player: 'Tester', appId: 480 }),
    unlock: (api) => { window.__steam.unlocked.push(api); return Promise.resolve(true); },
    cloudRead: (name) => (name === 'save.json' ? window.__steam.cloud : null),
    cloudWrite: (name, text) => { window.__steam.writes.push(name); window.__steam.cloud = text; return Promise.resolve(true); },
  };
  // Seed storage on the first load only; a reload must see what was saved.
  if (!sessionStorage.getItem('__seeded')) {
    sessionStorage.setItem('__seeded', '1');
    if (opts.local) localStorage.setItem(opts.key, opts.local);
    else localStorage.removeItem(opts.key);
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const fails = [];
  const errors = [];
  const open = async (opts) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    if (opts) await page.addInitScript(fakeBridge, Object.assign({ key: KEY }, opts));
    await page.goto(INDEX);
    await page.waitForFunction(() => window.WS && WS.Save && WS.Save.db && WS.Platform);
    return { page, ctx };
  };

  /* ---- web: no bridge ---------------------------------------------------- */
  {
    const { page, ctx } = await open(null);
    const r = await page.evaluate(() => ({ name: WS.Platform.name, steam: WS.Platform.steam }));
    if (r.name !== 'web' || r.steam) fails.push(`with no bridge the platform is '${r.name}'`);
    await ctx.close();
  }

  /* ---- achieve: resync at launch, then one awarded in play --------------- */
  {
    const local = JSON.stringify({ schema: 3, savedAt: 1000, gold: 5,
      achievements: { first_blood: true, snarlbane: true }, statistics: { totalKills: 1 } });
    const { page, ctx } = await open({ local });
    const r = await page.evaluate(() => {
      const atBoot = window.__steam.unlocked.slice();
      WS.Save.stats.bosses.grimtunnel = 1;
      WS.Achievements.check();
      WS.Achievements.check();
      return { atBoot, after: window.__steam.unlocked.slice(), name: WS.Platform.name };
    });
    if (r.name !== 'steam') fails.push(`with a bridge the platform is '${r.name}'`);
    for (const api of ['FIRST_BLOOD', 'SNARLBANE']) {
      if (!r.atBoot.includes(api)) fails.push(`${api}, already earned, was not unlocked on Steam at launch`);
    }
    const n = r.after.filter((a) => a === 'TAKE_HIS_CANDLE').length;
    if (n !== 1) fails.push(`an achievement earned in play reached Steam ${n} times, not once`);
    await ctx.close();
  }

  /* ---- cloud: newer wins, both ways, and saves reach it ------------------ */
  {
    const older = JSON.stringify({ schema: 3, savedAt: 1000, gold: 111 });
    const newer = JSON.stringify({ schema: 3, savedAt: 9000, gold: 999 });
    let o = await open({ local: older, cloud: newer });
    let g = await o.page.evaluate(() => [WS.Save.db.gold, WS.Save.fromCloud]);
    if (g[0] !== 999 || !g[1]) fails.push(`a newer cloud save did not replace an older local one (gold ${g[0]})`);
    await o.ctx.close();

    o = await open({ local: newer, cloud: older });
    g = await o.page.evaluate(() => [WS.Save.db.gold, WS.Save.fromCloud]);
    if (g[0] !== 999 || g[1]) fails.push(`an older cloud save overwrote newer local progress (gold ${g[0]})`);
    const w = await o.page.evaluate(async () => {
      WS.Save.db.gold = 4242; WS.Save.save(); WS.Save.db.gold = 4343; WS.Save.save();
      const before = window.__steam.writes.length;
      await new Promise((r) => setTimeout(r, 4500));
      const coalesced = window.__steam.writes.length - before;
      WS.Save.db.gold = 5000; WS.Save.save(); WS.Platform.flush();
      const cloud = JSON.parse(window.__steam.cloud);
      return { coalesced, gold: cloud.gold, stamped: cloud.savedAt > 9000 };
    });
    if (w.coalesced !== 1) fails.push(`two quick saves made ${w.coalesced} cloud writes, not one`);
    if (w.gold !== 5000) fails.push(`the flush on the way out did not reach the cloud (gold ${w.gold})`);
    if (!w.stamped) fails.push('a save written to the cloud carries no newer savedAt');
    await o.ctx.close();
  }

  /* ---- deck: bigger text once, and the player's choice after that --------- */
  {
    const o = await open({ deck: true });
    const r = await o.page.evaluate(() => [WS.Platform.deck, WS.Save.settings.textScale, WS.Save.db.deckSetup]);
    if (!r[0]) fails.push('the bridge said Deck and the platform did not hear it');
    if (r[1] !== 1.15 || !r[2]) fails.push(`a first launch on a Deck left text at ${r[1]}`);
    await o.page.evaluate(() => { WS.Save.settings.textScale = 1; WS.Save.save(); });
    await o.page.reload();
    await o.page.waitForFunction(() => window.WS && WS.Save && WS.Save.db);
    const again = await o.page.evaluate(() => WS.Save.settings.textScale);
    if (again !== 1) fails.push(`the Deck default overrode the player's own text size (${again})`);
    await o.ctx.close();
  }

  await browser.close();
  if (errors.length) fails.push('page errors: ' + errors.slice(0, 3).join(' | '));
  if (fails.length) {
    console.log('FAIL');
    for (const f of fails) console.log('  - ' + f);
    process.exit(1);
  }
  console.log('ok: with no bridge the game is plain web; on Steam every achievement already earned is '
    + 'unlocked at launch and one earned in play is unlocked once, under its API name; a newer cloud '
    + 'save wins in both directions, quick saves coalesce into one cloud write and the way out flushes; '
    + 'and a Deck gets 115% text on its first launch and never again over the player\'s choice');
})();
