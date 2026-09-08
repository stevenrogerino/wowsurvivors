#!/usr/bin/env node
/* The desktop shell, launched and played twice.
 *
 * THE SAVE IS THE WHOLE TEST. A browser game that becomes a desktop game
 * inherits one genuinely dangerous bug: loadFile() serves the page from
 * file://, file:// is an opaque origin, and storage written to an opaque
 * origin is not reliably the same storage next launch. Nothing about that
 * failure is visible while you develop - you launch, you play, the gold is
 * there. It shows up as a player who closed the game on Tuesday and opened an
 * empty account on Wednesday, which is the worst thing this application could
 * do to someone.
 *
 * So desktop/main.js serves the bundle over a registered `standard` + `secure`
 * scheme, which has a real origin that localStorage treats like any other
 * site's - and this tool proves it by banking gold in one launch, quitting the
 * app for real, launching it again, and reading the gold back out of
 * WS.Save.db. Through the game's own save path, not through a poke at
 * localStorage, because it is the game's save that has to survive.
 *
 * It also holds the shell to the other promises it makes: the page is loaded
 * over the scheme and not off the disk, the scheme refuses a path that climbs
 * out of the game folder, there is no application menu, nothing can navigate
 * away or open a second window, and the canvas has actually painted rather
 * than the window merely having opened.
 *
 * Both launches share one throwaway user-data directory, so the check never
 * touches - or is fooled by - a real player profile on the machine running it.
 *
 * NEGATIVE TESTS, both confirmed. Swapping the loadURL for the obvious
 * `win.loadFile(path.join(ROOT, ENTRY))` fails at "the shell is serving the
 * game off the disk (file:///...)". Dropping the scheme's `standard` privilege
 * fails three rules at once, the last of them the one this exists for: "the
 * account did not survive the relaunch ... came back to 0 gold".
 *
 * `standard` is the word doing the work, and that is worth writing down here
 * because the guess goes the other way round: dropping `secure` and keeping
 * `standard` leaves the save perfectly intact. Storage is keyed to the origin,
 * and `standard` is what makes there be an origin at all.
 *
 *   npm i playwright electron
 *   node tools/check-desktop.js
 *
 * Needs a display; under CI or a container, run it through xvfb-run. Set
 * ELECTRON to point at an existing Electron binary. */
const { _electron } = require('playwright');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const REPO = path.resolve(__dirname, '..');
const DESKTOP = path.join(REPO, 'desktop');
const GOLD = 424242;              // a number no ordinary play could produce
const fail = [];

/* Running as root - which is every container - trips Chromium's setuid
 * sandbox before Electron gets a word in. That is a property of the machine
 * this check runs on, not of the shipped app, which keeps its renderer
 * sandboxed either way. */
const ARGS = process.getuid && process.getuid() === 0 ? ['--no-sandbox'] : [];

(async () => {
  // Test what a player would get: the bundle as it is built today.
  execFileSync(process.execPath, [path.join(REPO, 'tools', 'bundle.js')], { stdio: 'ignore' });
  fs.mkdirSync(path.join(DESKTOP, 'game'), { recursive: true });
  fs.copyFileSync(path.join(REPO, 'dist', 'the-ember-watch.html'),
    path.join(DESKTOP, 'game', 'the-ember-watch.html'));

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'emberwatch-check-'));
  const launch = () => _electron.launch({
    executablePath: process.env.ELECTRON || require('electron'),
    args: [`--user-data-dir=${profile}`, ...ARGS, DESKTOP],
    cwd: DESKTOP,
  });

  /* ---- launch one: does it come up, and does it come up right? ---------- */
  let app = await launch();
  let page = await app.firstWindow();
  page.on('pageerror', (e) => fail.push('page error on first launch: ' + e.message));
  await page.waitForFunction(() => window.WS && WS.Game && WS.Save && WS.Save.db,
    null, { timeout: 20000 });

  const boot = await page.evaluate(() => ({
    origin: location.origin,
    href: location.href,
    secure: window.isSecureContext,
    storage: (() => { try { localStorage.setItem('_probe', '1'); return true; } catch (e) { return false; } })(),
  }));
  if (/^file:/.test(boot.href)) {
    fail.push(`the shell is serving the game off the disk (${boot.href.slice(0, 40)}...)`
      + ' - saves written to an opaque origin do not reliably survive a relaunch');
  } else if (!/^emberwatch:/.test(boot.href)) {
    fail.push(`the game loaded from ${boot.href.slice(0, 60)}, not the registered scheme`);
  }
  /* Not what carries the save - see the note above - but the game should still
     stand on the same ground an https:// page does rather than a weaker one. */
  if (!boot.secure) fail.push('the page is not a secure context');
  if (!boot.storage) fail.push('localStorage threw on the very first write');

  // A window that opened is not a game that started.
  const painted = await page.evaluate(() => {
    const c = document.getElementById('game-canvas');
    if (!c) return { found: false };
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4 * 97) seen.add(d[i] << 16 | d[i + 1] << 8 | d[i + 2]);
    return { found: true, w: c.width, h: c.height, colours: seen.size };
  });
  if (!painted.found) fail.push('there is no game canvas in the window');
  else if (painted.colours < 8) {
    fail.push(`the canvas is ${painted.w}x${painted.h} of ${painted.colours} colour(s)`
      + ' - the window opened but the game did not draw');
  }

  // The scheme must not hand out anything outside the game folder.
  const climb = await page.evaluate(async () => {
    try {
      const r = await fetch('emberwatch://game/%2e%2e%2f%2e%2e%2fpackage.json');
      return { status: r.status, body: (await r.text()).slice(0, 40) };
    } catch (e) { return { status: 'threw', body: e.message }; }
  });
  if (climb.status === 200) {
    fail.push('the scheme served a file from outside the game folder: ' + climb.body);
  }

  const shell = await app.evaluate(({ Menu, BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows();
    return {
      menu: Menu.getApplicationMenu() === null,
      windows: w.length,
      size: w[0] && w[0].getContentSize(),
      title: w[0] && w[0].getTitle(),
    };
  });
  if (!shell.menu) fail.push('the app is showing a File/Edit/View menu bar');
  if (shell.windows !== 1) fail.push(`the app opened ${shell.windows} windows`);
  if (shell.size && (shell.size[0] !== 1280 || shell.size[1] !== 720)) {
    fail.push(`the window is ${shell.size.join('x')} of content, not 1280x720`);
  }
  if (shell.title !== 'The Ember Watch') fail.push(`the window is titled "${shell.title}"`);

  // One page, forever: neither a popup nor a navigation may take.
  const before = boot.href;
  await page.evaluate(() => { try { window.open('https://example.com'); } catch (e) {} });
  await page.evaluate(() => { try { location.href = 'https://example.com'; } catch (e) {} });
  await page.waitForTimeout(500);
  const after = await app.evaluate(({ BrowserWindow }) => ({
    windows: BrowserWindow.getAllWindows().length,
    href: BrowserWindow.getAllWindows()[0].webContents.getURL(),
  }));
  if (after.windows !== 1) fail.push(`window.open got a second window (${after.windows} open)`);
  if (after.href !== before) fail.push(`the page navigated away to ${after.href.slice(0, 60)}`);

  /* ---- bank something, and end the process for real ---------------------- */
  await page.evaluate((gold) => {
    WS.Save.db.gold = gold;
    WS.Save.db.statistics.totalRuns = 17;
    WS.Save.db.unlocks.characters.graveblade = true;
    WS.Save.flush();
  }, GOLD);
  await page.waitForTimeout(300);     // let the storage write land on disk
  await app.close();

  /* ---- launch two: is it still there? ----------------------------------- */
  app = await launch();
  page = await app.firstWindow();
  page.on('pageerror', (e) => fail.push('page error on second launch: ' + e.message));
  await page.waitForFunction(() => window.WS && WS.Save && WS.Save.db, null, { timeout: 20000 });
  const back = await page.evaluate(() => ({
    gold: WS.Save.db.gold,
    runs: WS.Save.db.statistics.totalRuns,
    graveblade: !!WS.Save.db.unlocks.characters.graveblade,
    href: location.href,
  }));
  if (back.gold !== GOLD || back.runs !== 17 || !back.graveblade) {
    fail.push(`the account did not survive the relaunch: banked ${GOLD} gold, 17 runs and `
      + `an unlocked survivor, came back to ${back.gold} gold, ${back.runs} runs, `
      + `survivor ${back.graveblade ? 'unlocked' : 'locked'}`);
  }
  if (back.href !== before) fail.push('the second launch loaded a different page than the first');
  await app.close();
  fs.rmSync(profile, { recursive: true, force: true });

  if (fail.length) {
    console.error('FAIL');
    for (const f of fail) console.error('  - ' + f);
    process.exit(1);
  }
  console.log(`ok: the desktop shell boots the bundle over ${boot.origin}, paints `
    + `${painted.colours} colours on a ${shell.size.join('x')} canvas, refuses popups, `
    + 'navigation and paths outside the game folder, and an account banked in one '
    + 'launch is still there in the next');
})().catch((e) => { console.error('FAIL\n  - ' + (e.stack || e.message)); process.exit(1); });
