/* The Ember Watch, as a desktop application.
 *
 * The game itself is untouched: this loads the exact single file that
 * tools/bundle.js produces and that a web host would serve, so the desktop
 * build and the browser build are the same bytes. Everything here is window
 * management and the three things a browser gives you for free that a shell
 * has to arrange deliberately.
 *
 * 1. A REAL ORIGIN, SO SAVES PERSIST. The obvious thing is loadFile(), which
 *    serves the game from file://, and file:// is an opaque origin - storage
 *    written there is not reliably the same storage next launch. A player
 *    losing thirty hours of unlocks because the shell used the convenient
 *    loader is the worst bug this application could have. So the game is
 *    served over a registered scheme with a stable origin, which localStorage
 *    treats like any other site, and tools/check-desktop.js proves it the only
 *    way worth proving: it banks gold in one launch, quits the app, launches it
 *    again and reads the gold back.
 *
 * 2. NO NAVIGATION, NO NEW WINDOWS. A game has exactly one page. Anything that
 *    tries to leave it is a bug or worse, so both are refused outright.
 *
 * 3. SOUND WITHOUT A CLICK FIRST. Browsers require a gesture before audio;
 *    a desktop game the player just launched does not need to ask.
 */
'use strict';
const { app, BrowserWindow, protocol, net, Menu, shell } = require('electron');
const path = require('node:path');
const url = require('node:url');

const SCHEME = 'emberwatch';
const ROOT = path.join(__dirname, 'game');
const ENTRY = 'the-ember-watch.html';

/* Must be declared before the app is ready, and `standard` is the load-bearing
 * word here. It is what gives the scheme a real, parseable origin, and storage
 * is keyed to the origin - measured, dropping it makes localStorage throw on
 * the very first write and the account comes back empty next launch. `secure`
 * is not what carries the save; keeping `standard` and dropping `secure`
 * leaves the account perfectly intact. What it buys is a secure context, so
 * the page gets the same platform guarantees an https:// page does.
 */
protocol.registerSchemesAsPrivileged([{
  scheme: SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true },
}]);

// The player launched a game. It may make a noise.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 854,
    minHeight: 480,
    useContentSize: true,
    center: true,
    backgroundColor: '#06070b',      // the game's own obsidian, so no white flash
    show: false,                     // ...and nothing at all until it can paint
    title: 'The Ember Watch',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,   // a paused game is the game's decision
    },
  });

  Menu.setApplicationMenu(null);     // File/Edit/View belongs to a text editor
  win.once('ready-to-show', () => win.show());
  win.loadURL(`${SCHEME}://game/${ENTRY}`);

  // One page, forever.
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:/.test(target)) shell.openExternal(target);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, target) => {
    if (target !== win.webContents.getURL()) e.preventDefault();
  });

  /* Fullscreen on F11 and Alt+Enter, the two bindings a desktop player will
   * try. NOT Escape - the game uses that for pause, and a shell stealing a key
   * the game already means something by is the most annoying kind of bug. */
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const f11 = input.key === 'F11';
    const altEnter = input.alt && input.key === 'Enter';
    if (f11 || altEnter) {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    }
  });
  return win;
}

app.whenReady().then(() => {
  /* Serve the bundle over the registered scheme. The path is resolved inside
   * ROOT and anything that climbs out of it is refused - the game only ever
   * asks for one file, so a request for anything else is not the game asking. */
  protocol.handle(SCHEME, (request) => {
    const wanted = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, '');
    const file = path.join(ROOT, wanted || ENTRY);
    // ROOT + separator, not ROOT: otherwise a sibling folder named `gamesave`
    // would read as being inside `game`.
    if (!file.startsWith(ROOT + path.sep)) return new Response('no', { status: 403 });
    return net.fetch(url.pathToFileURL(file).toString());
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Windows and Linux expect the app to end with its window; macOS does not.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
