#!/usr/bin/env node
/* A real run to dawn, then its finale, then overtime - with the build the
 * run actually earned.
 *
 * tools/finale-dodge.js puts a synthetic body into each finale: 840 health,
 * 16 armour, no healing, no lifesteal. That answers "what does this fight
 * throw", but not "is a player who got here in danger", because a player who
 * got here is not that body. Their healing grows with their damage, and the
 * finale's health grows with their damage too - its hits do not. A tester
 * fought Brother Kael for minutes and was never in danger, then died almost
 * at once to ordinary creatures when they stayed on after him.
 *
 * So this plays the real game (tools/archetype-sim.js's autopilot, real wave
 * director, real draft) to 30:00 on the chosen battlefield, faces the finale
 * with tools/finale-dodge.js's bot driving, and if it is won, stays for
 * overtime with the kiting bot. For each stage it records the low-water
 * mark on the health bar, what was taken and what was healed.
 *
 * THE NIGHT IS CARRIED, the finale and overtime are not. The autopilot kites
 * by fleeing the nearest creature, which is enough on Thornhollow and nowhere
 * near enough on the harder fields (Highmoor is x2.2; the bot fell there
 * inside three minutes, and topped up fifty times it was still one-shot by a
 * drake). What the night is for here is the BUILD it earns, so through the
 * night the survivor cannot be hurt.
 * From 30:00 on nothing is propped up: they can die, and the report says
 * where and to what.
 *
 *   node tools/dawn-fight.js --map highmoor --only warrior --seeds 2
 *   node tools/dawn-fight.js --map highmoor --overtime 180
 *   node tools/dawn-fight.js --map highmoor --carry-finale   (overtime only)
 *
 * Set CHROME to point at an existing Chromium binary. */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const { ARCHETYPES, scoreChoice, pickBest, pickBlessing } = require('./archetype-sim.js');
const { installBot } = require('./finale-dodge.js');

const GAME = 'file://' + path.resolve(__dirname, '..', 'index.html');
const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const MAP = arg('--map', 'highmoor');
const ONLY = arg('--only', null);
const NSEEDS = +arg('--seeds', 2);
const OVERTIME = +arg('--overtime', 180);
const JOBS = +arg('--jobs', 3);
// Carry the survivor through the finale too, to measure the overtime after
// it: the fight still takes as long as it takes.
const CARRY_FINALE = process.argv.includes('--carry-finale');

async function runOne(browser, build, seed) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(GAME);
  await page.waitForFunction(() => window.WS && WS.Game && WS.Finale);
  await page.evaluate(([build, seed, map, scoreFn, pickFn, blessFn, botSrc]) => {
    /* eslint-disable no-eval */
    window.__score = eval('(' + scoreFn + ')');   // pickBest calls scoreChoice by name
    window.scoreChoice = window.__score;
    window.__pick = eval('(' + pickFn + ')');
    window.__bless = eval('(' + blessFn + ')');
    window.__installBot = eval('(' + botSrc + ')');
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
    WS.Save.db.seenManual = true;
    WS.Save.unlockAll();
    WS.Save.settings.victoryCinematic = false;
    WS.setSeed(seed);
    WS.Input.poll = function () {};
    WS.Game.startRun(map, build.character);
    window.__build = build;
    const st = window.__st = {
      stage: 'night', low: { night: 1, finale: 1, overtime: 1 },
      taken: { night: 0, finale: 0, overtime: 0 }, healed: { night: 0, finale: 0, overtime: 0 },
      hits: {}, died: null, fight: 0, overtime: 0, dawn: null, killedBy: null, carried: 0,
    };
    // What landed, by name, per stage - the same door finale-dodge watches.
    const take = WS.Player.takeDamage;
    WS.Player.takeDamage = function (pl, amount, name) {
      const before = pl.health;
      const r = take.apply(this, arguments);
      const lost = before - pl.health;
      if (lost > 0) {
        st.taken[st.stage] += lost;
        if (st.stage !== 'night') {
          const k = st.stage + ' · ' + (name || 'contact');
          st.hits[k] = st.hits[k] || [0, 0];
          st.hits[k][0] += lost; st.hits[k][1]++;
        }
      }
      return r;
    };
    const heal = WS.Player.recordHeal;
    WS.Player.recordHeal = function (amount) {
      if (amount > 0) st.healed[st.stage] += amount;
      return heal.apply(this, arguments);
    };
  }, [build, seed, MAP, scoreChoice.toString(), pickBest.toString(), pickBlessing.toString(), installBot.toString()]);

  // Drive the whole thing in slices so a long run cannot time the page out.
  for (let slice = 0; slice < 2000; slice++) {
    const done = await page.evaluate(([overtime, carryFinale]) => {
      const G = WS.Game, F = WS.Finale, st = window.__st, p = G.player, build = window.__build;
      const W = WS.CONST.WORLD_WIDTH, H = WS.CONST.WORLD_HEIGHT;
      const kite = () => {
        const t = G.run.time;
        let tx = W / 2 + Math.cos(t * 0.5) * 240, ty = H / 2 + Math.sin(t * 0.5) * 170;
        const near = WS.Enemy.findNearest(p.x, p.y, 160);
        if (near) {
          const dx = p.x - near.x, dy = p.y - near.y, d = Math.hypot(dx, dy) || 1;
          tx = p.x + dx / d * 250; ty = p.y + dy / d * 250;
        }
        const lo = G.arenaBounds || { minX: 60, maxX: W - 60, minY: 60, maxY: H - 60 };
        tx = Math.max(lo.minX + 20, Math.min(lo.maxX - 20, tx));
        ty = Math.max(lo.minY + 20, Math.min(lo.maxY - 20, ty));
        const k = WS.Input.keys, h = WS.Input.held;
        k.left = h.left = tx - p.x < -6; k.right = h.right = tx - p.x > 6;
        k.up = h.up = ty - p.y < -6; k.down = h.down = ty - p.y > 6;
      };
      for (let i = 0; i < 600; i++) {
        if (G.state === 'blessing') { const c = window.__bless(build, G.blessingChoices || []); if (c) G.chooseBlessing(c); G.update(1 / 60); continue; }
        if (G.state === 'levelup') { const c = window.__pick(build, p, G.levelChoices || []); if (c) G.chooseLevelUp(c); G.update(1 / 60); continue; }
        if (G.state === 'dying') { G.update(1 / 60); continue; }
        if (G.state === 'over') {
          if (!p || p.health <= 0 || G.run.killedBy) {
            const k = G.run.killedBy;
            st.died = st.died || { stage: st.stage, at: Math.round(G.run.time), by: (k && (k.name || k)) || '?' };
            return true;
          }
          if (st.stage === 'night') {
            // 30:00: the win is banked, the dawn panel is up. Face the finale.
            st.dawn = { hp: Math.round(p.maxHealth), armor: p.armor, regen: +p.healthRegen.toFixed(1),
              lifesteal: p.lifesteal, dps: Math.round(G.run.dps), hps: Math.round(G.run.hps),
              level: p.level, weapons: p.weapons.map((w) => w.id + ':' + w.level + (w.evolved ? 'E' : '')) };
            st.stage = 'finale';
            window.__installBot();
            G.faceFinale();
            continue;
          }
          if (st.stage === 'finale' && G.run.finaleCleared) {
            st.stage = 'overtime';
            st.otStart = G.run.time;
            G.continueEndless();
            continue;
          }
          return true;
        }
        if (G.state !== 'playing') { G.update(1 / 60); continue; }
        if (st.stage === 'finale' && F.stage === 'fight') window.__bot.step(1 / 60);
        else if (st.stage === 'finale') { const k = WS.Input.held; k.left = k.right = k.up = k.down = false; }
        else kite();
        // Untouchable through the night - it is the build being measured,
        // not the bot's footwork (see the note at the top).
        if (st.stage === 'night' || (carryFinale && st.stage === 'finale')) p.invulnerable = Math.max(p.invulnerable || 0, 0.1);
        G.update(1 / 60);
        if (st.stage === 'finale' && F.stage === 'fight') st.fight += 1 / 60;
        if (st.stage === 'overtime') {
          st.overtime = G.run.time - st.otStart;
          if (st.overtime >= overtime) return true;
        }
        const f = p.health / Math.max(1, p.maxHealth);
        if (st.stage === 'night' && f < 0.3 && p.health > 0) { p.health = p.maxHealth; st.carried++; }
        if (f < st.low[st.stage]) st.low[st.stage] = f;
      }
      return false;
    }, [OVERTIME, CARRY_FINALE]);
    if (done) break;
  }
  const r = await page.evaluate(() => {
    const st = window.__st;
    return { ...st, overtime: Math.round(st.overtime), fight: Math.round(st.fight),
      bossScale: WS.Finale.powerFor ? +WS.Finale.powerFor().toFixed(2) : null };
  });
  if (errs.length) r.errors = errs.slice(0, 3);
  await page.close();
  return r;
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const roster = ONLY ? ARCHETYPES.filter((a) => ONLY.split(',').some((o) => a.name.includes(o))) : ARCHETYPES;
  const jobs = [];
  for (const build of roster) for (let k = 0; k < NSEEDS; k++) jobs.push([build, 1000 + k * 977]);
  const out = [];
  let next = 0;
  await Promise.all(Array.from({ length: JOBS }, async () => {
    while (next < jobs.length) {
      const [build, seed] = jobs[next++];
      const r = await runOne(browser, build, seed);
      out.push({ name: build.name, seed, ...r });
      const pct = (x) => String(Math.round(x * 100)).padStart(3) + '%';
      const d = r.dawn;
      console.log(`${build.name.padEnd(26)} s${seed}  `
        + (d ? `dawn hp ${d.hp} arm ${d.armor} dps ${d.dps} hps ${d.hps}  ` : 'no dawn  ')
        + `carried ${r.carried}  finale ${pct(r.low.finale)} (${r.fight}s, took ${Math.round(r.taken.finale)}, healed ${Math.round(r.healed.finale)})  `
        + `overtime ${r.overtime}s low ${pct(r.low.overtime)}  `
        + (r.died ? `DIED ${r.died.stage} @${r.died.at} by ${r.died.by}` : 'lived')
        + (r.errors ? '  ERR ' + r.errors.join(' | ') : ''));
    }
  }));
  await browser.close();
  // What hurt, across every run, per stage.
  const agg = {};
  for (const r of out) for (const [k, [d, n]] of Object.entries(r.hits)) { agg[k] = agg[k] || [0, 0]; agg[k][0] += d; agg[k][1] += n; }
  console.log('\nwhat landed, all runs:');
  for (const [k, [d, n]] of Object.entries(agg).sort((a, b) => b[1][0] - a[1][0]).slice(0, 16)) {
    console.log(`  ${k.padEnd(40)} ${String(Math.round(d)).padStart(8)}  x${n}`);
  }
  if (process.argv.includes('--json')) require('fs').writeFileSync(arg('--json'), JSON.stringify(out, null, 1));
})();
