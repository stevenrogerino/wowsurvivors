#!/usr/bin/env node
/* Is the thing we tell people to upload actually the whole game?
 *
 * dist/the-ember-watch.html is a single file with every script, stylesheet and
 * typeface inlined, and the claim made for it - drop it on any static host,
 * rename it index.html, done - is only worth as much as the last time somebody
 * checked. It is easy to break by accident and impossible to notice locally,
 * because from a file:// path a stray relative reference to src/ still
 * resolves: the developer's machine has the folder next to it and the host
 * does not.
 *
 * So this serves the bundle the way a host would - alone, over HTTP, in an
 * otherwise EMPTY directory, with nothing else reachable - then plays ninety
 * seconds of a real run inside it and fails on any request that leaves the
 * host, any request that 404s, and any error at all. One request should ever
 * be made: the page itself.
 *
 * NEGATIVE TEST: adding a single <script src="src/main.js"> to a copy of the
 * bundle gives "404 http://127.0.0.1:PORT/src/main.js".
 *
 *   npm i playwright && npx playwright install chromium
 *   node tools/check-shippable.js
 *
 * Set CHROME to point at an existing Chromium binary. */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

(async () => {
  const src = process.env.BUNDLE
    || path.resolve(__dirname, '..', 'dist', 'the-ember-watch.html');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'host-'));
  fs.copyFileSync(src, path.join(dir, 'index.html'));   // the only file on the server
  const bytes = fs.statSync(src).size;

  const server = http.createServer((req, res) => {
    const wanted = req.url.split('?')[0];
    const file = path.join(dir, wanted === '/' ? 'index.html' : wanted);
    if (!file.startsWith(dir) || !fs.existsSync(file)) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(file));
  });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;

  const b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const requests = [], failures = [], errors = [];
  p.on('request', (r) => requests.push(r.url()));
  p.on('requestfailed', (r) => failures.push(r.url() + ' :: ' + (r.failure() || {}).errorText));
  p.on('response', (r) => { if (r.status() >= 400) failures.push(r.status() + ' ' + r.url()); });
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await p.goto(`http://127.0.0.1:${port}/`);
  await p.waitForFunction(() => window.WS && window.WS.Game, { timeout: 15000 });

  // Actually play it, so anything lazily fetched would show up.
  const played = await p.evaluate(() => {
    /* A fresh profile gets the prologue, and its layer covers the whole
       screen - which is the point of it. A harness has to walk past it
       before it can drive anything. */
    if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish();
    WS.Save.db.seenManual = true;
    WS.Save.unlockAll();
    WS.Game.startRun('thornhollow', 'shaman');
    for (let i = 0; i < 60 * 90; i++) {
      if (WS.Game.state === 'levelup' || WS.Game.state === 'blessing') {
        const c = document.querySelectorAll('#overlay:not(.hidden) .card');
        if (c[0]) { c[0].click(); continue; }
      }
      if (WS.Game.state !== 'playing') break;
      WS.Game.player.health = WS.Game.player.maxHealth;
      WS.Game.tick(WS.CONST.TICK_RATE);
    }
    WS.Renderer.draw(9);
    return { time: Math.round(WS.Game.run.time), kills: WS.Game.run.kills,
      level: WS.Game.player.level, fonts: document.fonts.size };
  });
  await p.waitForTimeout(500);

  const offsite = requests.filter((u) => !u.startsWith(`http://127.0.0.1:${port}`));
  console.log(`file:      ${path.basename(src)}  (${(bytes / 1024).toFixed(0)} KB)`);
  console.log(`served as: index.html, alone in an otherwise empty directory`);
  console.log(`requests:  ${requests.length} total, ${offsite.length} to anywhere but this host`);
  for (const u of offsite) console.log('   OFFSITE ' + u);
  console.log(`failed:    ${failures.length}`);
  for (const f of failures) console.log('   ' + f);
  console.log(`errors:    ${errors.length}`);
  for (const e of errors.slice(0, 5)) console.log('   ' + e);
  console.log(`played:    ${played.time}s, level ${played.level}, ${played.kills} kills, `
    + `${played.fonts} font faces loaded from inside the file`);
  await b.close();
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  const bad = offsite.length + failures.length + errors.length;
  console.log(bad === 0 ? '\nSELF-CONTAINED: this one file is the whole game.'
    : `\nNOT self-contained: ${bad} problem(s) above.`);
  process.exitCode = bad ? 1 : 0;
})();
