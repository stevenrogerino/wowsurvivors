#!/usr/bin/env node
/* Icon guard rail.
 *
 * Every glyph draws in the same 100-unit field, and the plate clips whatever
 * leaves it. Two glyphs were leaving it - wing and claw - and the failure was
 * silent: no error, no warning, just a mark quietly cut off at the plate's
 * corner where it looked like a design choice. wing was the instructive one,
 * because it was built as a rotated fan and rotating canvas-local +y by a
 * positive angle sweeps DOWN AND LEFT, not up; getting that backwards threw
 * its longest primary 24 units below the field and nothing said so.
 *
 * This renders every glyph and measures its ink. It also checks the roster
 * size, because the way this file gets damaged is a bad edit deleting a
 * neighbouring glyph, which no visual pass catches.
 *
 *   npm i playwright && npx playwright install chromium
 *   node tools/check-icons.js
 *
 * Set CHROME to point at an existing Chromium binary. */
const { chromium } = require('playwright');
const path = require('path');

const EXPECTED_GLYPHS = 71;
const FIELD = 50;   // half-extent of the 100-unit field: beyond this is clipped

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 900, height: 600 } });
  const fail = [];
  page.on('pageerror', (e) => fail.push('PAGEERROR ' + e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(700);

  await page.evaluate(() => {
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
  });
  const report = await page.evaluate((FIELD) => {
    const S = 400;
    // glyph() insets by 6%, then maps the 100-unit field into what is left.
    const inset = S * 0.06, unit = (S - inset * 2) / 100;
    const keys = WS.Icons.names();
    const rows = [];
    for (const k of keys) {
      const c = WS.Icons.glyph(k, [1, 1, 1], S);
      const g = c.getContext('2d');
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const n = c.width, scale = n / S;
      let axis = 0;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          if (d[(y * n + x) * 4 + 3] < 110) continue;   // ignore the soft glow
          const a = Math.max(Math.abs(x / scale - S / 2), Math.abs(y / scale - S / 2)) / unit;
          if (a > axis) axis = a;
        }
      }
      if (axis > FIELD) rows.push({ k, axis: +axis.toFixed(1) });
    }
    return { count: keys.length, clipped: rows };
  }, FIELD);

  if (report.count !== EXPECTED_GLYPHS) {
    fail.push(`${report.count} glyphs, expected ${EXPECTED_GLYPHS}` +
      ` - a glyph was added or (more likely) an edit deleted one. Update EXPECTED_GLYPHS if deliberate.`);
  }
  for (const r of report.clipped) {
    fail.push(`${r.k}: ink reaches ${r.axis} units from centre, outside the ${FIELD}-unit field - it is being clipped`);
  }

  console.log(fail.length ? fail.join('\n')
    : `ok: ${report.count} glyphs, none clipped by the field`);
  await b.close();
  process.exitCode = fail.length ? 1 : 0;
})();
