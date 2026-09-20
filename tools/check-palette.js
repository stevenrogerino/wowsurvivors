#!/usr/bin/env node
/* What a thing looks like, measured off the pixels rather than the palette.
 *
 * A player reported that enemy projectiles looked like lodestones. The first
 * numbers I took said the opposite of the truth twice over, and both mistakes
 * are worth writing down because this harness exists to not make them again:
 *
 *   1. RGB distance between PALETTE ENTRIES. It put the frost school 54 units
 *      from the lodestone tint and called that fine. But nothing on screen is
 *      a palette entry: a bolt is a dark rim, a school-coloured body and a
 *      white core, and a lodestone is a bright ring around a dim pad. The
 *      numbers described values no pixel ever takes.
 *
 *   2. Mean colour of the rendered pixels. Better, but the dark rim and the
 *      white core are the SAME on every bolt, and they are most of the ink, so
 *      the mean mostly measured what all bolts share instead of what tells
 *      them apart.
 *
 * What this measures is the colour a player would NAME: every painted pixel
 * weighted by its own chroma, so the shared rim and core drop out and the hue
 * decides. On that metric the frost bolt sat 16.1 from the lodestone and the
 * arcane bolt 13.7 from the hourglass - the same hue family, which is what
 * the report meant. They now sit at 24.3 and 22.3.
 *
 * The floor is 17 because the pair that was REPORTED sat at 16.1. A guard set
 * under the bug it was written for is not a guard, so the bar goes above it -
 * which caught a third pair on the way, a holy bolt against a coin at 16.9,
 * and a fourth this only sees because bolts are checked against each other
 * too: holy and physical bolts, two pale warm golds, 14.0 apart.
 *
 * The distance is CIEDE2000, not RGB, because the question is whether a human
 * can tell two things apart and that is the metric built to answer it.
 *
 * One more thing this forbids, found on the way: adding a warm "danger" glow
 * to hostile bolts, which sounds right and measures terrible. Every hue tried,
 * at every lightness, made things WORSE - a glow pulls the named colour toward
 * itself, and most of the ground pickups are already warm gold, so the bolts
 * moved onto the coins. The best glow scored 7.5 against 13.6 for no glow.
 *
 *   npm i playwright && npx playwright install chromium
 *   node tools/check-palette.js
 */
'use strict';

const { chromium } = require('playwright');
const path = require('path');

const fail = [];

/* ---------------------------------------------------------------- colour -- */
function srgb(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function lab(rgb) {
  const r = srgb(rgb[0]), g = srgb(rgb[1]), b = srgb(rgb[2]);
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const X = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
  const Y = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
  const Z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}
/** CIEDE2000. Roughly: under 2 is a match, 10 is obvious, 25 is unrelated. */
function dE(c1, c2) {
  const [L1, a1, b1] = lab(c1), [L2, a2, b2] = lab(c2);
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))));
  const ap1 = (1 + G) * a1, ap2 = (1 + G) * a2;
  const Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
  const ang = (b, ap) => { if (b === 0 && ap === 0) return 0; const h = Math.atan2(b, ap) * 180 / Math.PI; return h < 0 ? h + 360 : h; };
  const hp1 = ang(b1, ap1), hp2 = ang(b2, ap2);
  const dLp = L2 - L1, dCp = Cp2 - Cp1;
  let dhp = 0;
  if (Cp1 * Cp2 !== 0) { dhp = hp2 - hp1; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
  const dHp = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin(dhp * Math.PI / 360);
  const Lbp = (L1 + L2) / 2, Cbp = (Cp1 + Cp2) / 2;
  let hbp;
  if (Cp1 * Cp2 === 0) hbp = hp1 + hp2;
  else { hbp = (hp1 + hp2) / 2; if (Math.abs(hp1 - hp2) > 180) hbp += hp1 + hp2 < 360 ? 180 : -180; }
  const T = 1 - 0.17 * Math.cos((hbp - 30) * Math.PI / 180) + 0.24 * Math.cos(2 * hbp * Math.PI / 180)
    + 0.32 * Math.cos((3 * hbp + 6) * Math.PI / 180) - 0.20 * Math.cos((4 * hbp - 63) * Math.PI / 180);
  const Rc = 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7)));
  const Sl = 1 + (0.015 * Math.pow(Lbp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbp - 50, 2));
  const Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * (30 * Math.exp(-Math.pow((hbp - 275) / 25, 2))) * Math.PI / 180) * Rc;
  return Math.sqrt(Math.pow(dLp / Sl, 2) + Math.pow(dCp / Sc, 2) + Math.pow(dHp / Sh, 2)
    + Rt * (dCp / Sc) * (dHp / Sh));
}

/* The bar. 18 is where two things stop being "the same colour, a bit off" -
 * every pair below it when this was written was a pair a player had to look
 * twice at. It is deliberately under the 22.3 the worst fixed pair now scores,
 * so ordinary tuning has room and a real regression still trips it. */
const FLOOR = 17;

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => fail.push('page error: ' + e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForFunction(() => window.WS && window.WS.Game);

  const shot = await page.evaluate(() => {
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
    WS.Save.db.seenManual = true;
    WS.Save.unlockAll();
    WS.setSeed(4242);
    WS.Game.startRun('thornhollow', 'mage');
    WS.Game.player.x = 640; WS.Game.player.y = 360;

    /* One thing, alone, on the field's own background, at the same size and
       the same place every time - so the numbers are about the thing. */
    function named(draw) {
      const cv = document.createElement('canvas');
      cv.width = 64; cv.height = 64;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#0c1014';
      ctx.fillRect(0, 0, 64, 64);
      ctx.save();
      ctx.translate(32 - 640, 32 - 360);
      draw(ctx);
      ctx.restore();
      const d = ctx.getImageData(0, 0, 64, 64).data;
      let r = 0, g = 0, b = 0, w = 0;
      for (let i = 0; i < d.length; i += 4) {
        const R = d[i] / 255, G = d[i + 1] / 255, B = d[i + 2] / 255;
        // the background this cell started as is not part of how a thing looks
        if (Math.abs(R - 12 / 255) < 0.02 && Math.abs(G - 16 / 255) < 0.02
          && Math.abs(B - 20 / 255) < 0.02) continue;
        const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
        const chroma = (mx - mn) * mx;     // coloured, and lit enough to see
        r += R * chroma; g += G * chroma; b += B * chroma; w += chroma;
      }
      return w > 1e-6 ? [r / w, g / w, b / w] : [0, 0, 0];
    }

    const out = { pickups: {}, hostiles: {} };
    for (const kind in WS.Pickup.TYPES) {
      WS.Pickup.clear();
      const p = WS.Pickup.spawn(kind, 640, 360, 10);
      p.bob = 0; p.life = 1;
      out.pickups[kind] = named((ctx) => WS.Renderer.drawPickups(ctx, 1));
    }
    WS.Pickup.clear();
    for (const s of ['physical', 'arcane', 'fire', 'frost', 'nature', 'holy', 'shadow']) {
      WS.Projectile.hostiles.releaseAll();
      const h = WS.Projectile.spawnHostile(640, 360, 200, 0, 5, s, 'probe', null);
      h.spin = 0;
      out.hostiles[s] = named((ctx) => WS.Renderer.drawBolts(ctx, 1));
    }
    WS.Projectile.hostiles.releaseAll();
    return out;
  });
  await browser.close();

  /* ---- no enemy bolt may look like anything lying on the ground ---------- */
  const rows = [];
  for (const s in shot.hostiles) {
    for (const k in shot.pickups) {
      const d = dE(shot.hostiles[s], shot.pickups[k]);
      rows.push({ what: s + ' bolt / ' + k, d });
    }
  }
  rows.sort((a, b) => a.d - b.d);
  for (const r of rows) {
    if (r.d < FLOOR) fail.push(`${r.what} are ${r.d.toFixed(1)} apart (floor ${FLOOR})`);
  }

  /* ---- and the schools have to stay apart from each other ---------------- */
  const schools = Object.keys(shot.hostiles);
  for (let i = 0; i < schools.length; i++) {
    for (let j = i + 1; j < schools.length; j++) {
      const d = dE(shot.hostiles[schools[i]], shot.hostiles[schools[j]]);
      /* Lower than the pickup floor on purpose: a bolt's school is a hint,
         a pickup is a decision. Frost's slow still has to be readable, so
         this catches a palette collapsing, not two neighbours. */
      if (d < 8) fail.push(`${schools[i]} and ${schools[j]} bolts are ${d.toFixed(1)} apart`);
    }
  }

  console.log('closest five, enemy bolt against ground pickup:');
  for (const r of rows.slice(0, 5)) console.log('  ' + r.what.padEnd(30), r.d.toFixed(1));

  if (fail.length) {
    console.error('\nFAIL');
    for (const f of fail) console.error('  - ' + f);
    process.exit(1);
  }
  console.log('\nOK  nothing that flies looks like anything you would pick up.');
})();
