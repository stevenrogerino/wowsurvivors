/* Steam, for the desktop build.
 *
 * Everything Steam gives the game goes through here, in the main process, and
 * reaches the page only through preload.js. The page never loads a native
 * module and never sees more than five calls: info, unlock, cloud read, cloud
 * write, and whether this is a Steam Deck.
 *
 * It is optional in every direction. No steamworks.js installed, no App ID,
 * Steam not running: `client` stays null, every call answers "not available",
 * and the game plays exactly as it does in a browser. Nothing here can stop
 * the window from opening.
 *
 * The App ID comes from, in order: the STEAM_APP_ID environment variable,
 * then a steam_appid.txt beside the executable (or beside this file while
 * developing). Steam itself supplies it when it launches the game, so the
 * shipped build needs neither; steam_appid.txt is for running it by hand
 * during development and must NOT go into the depot. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

let client = null;
let sw = null;
let reason = 'not started';

function readAppId(app) {
  if (process.env.STEAM_APP_ID) return Number(process.env.STEAM_APP_ID) || 0;
  const places = [path.join(path.dirname(app.getPath('exe')), 'steam_appid.txt'),
    path.join(__dirname, 'steam_appid.txt')];
  for (const p of places) {
    try { const n = Number(fs.readFileSync(p, 'utf8').trim()); if (n) return n; } catch (e) { /* not there */ }
  }
  return 0;
}

/** Call before app is ready: the overlay needs switches set early, and a
 *  copy launched outside Steam may need to hand itself to Steam instead.
 *  Returns false if the app should quit because Steam is relaunching it. */
function early(app) {
  try { sw = require('steamworks.js'); } catch (e) { reason = 'steamworks.js is not installed'; return true; }
  const appId = readAppId(app);
  if (!appId) { reason = 'no App ID (set STEAM_APP_ID or steam_appid.txt)'; return true; }
  try {
    /* Launched from a desktop shortcut rather than from Steam: Steam starts
       it properly (overlay, achievements, the right account) and this copy
       bows out. Skipped whenever steam_appid.txt / STEAM_APP_ID is present,
       which is how development builds run it directly. */
    if (app.isPackaged && !process.env.STEAM_APP_ID && sw.restartAppIfNecessary(appId)) return false;
  } catch (e) { /* no Steam client at all: carry on without it */ }
  try {
    client = sw.init(appId);
    sw.electronEnableSteamOverlay();
    reason = 'ok';
  } catch (e) {
    client = null;
    reason = 'Steam is not running (' + (e && e.message ? e.message.split('\n')[0] : e) + ')';
  }
  return true;
}

function info() {
  if (!client) return { available: false, reason };
  let deck = false, player = null;
  try { deck = client.utils.isSteamRunningOnSteamDeck(); } catch (e) { /* older client */ }
  try { player = client.localplayer.getName(); } catch (e) { /* no persona */ }
  return { available: true, deck, player, appId: client.utils.getAppId() };
}

function unlock(apiName) {
  if (!client || typeof apiName !== 'string' || !/^[A-Z0-9_]{1,64}$/.test(apiName)) return false;
  try {
    if (client.achievement.isActivated(apiName)) return true;
    return client.achievement.activate(apiName);
  } catch (e) { return false; }
}

// One file, one name: the page may not read or write anything else.
const CLOUD_NAMES = new Set(['save.json']);

function cloudRead(name) {
  if (!client || !CLOUD_NAMES.has(name)) return null;
  try {
    if (!client.cloud.isEnabledForAccount() || !client.cloud.isEnabledForApp()) return null;
    return client.cloud.fileExists(name) ? client.cloud.readFile(name) : null;
  } catch (e) { return null; }
}

function cloudWrite(name, text) {
  if (!client || !CLOUD_NAMES.has(name) || typeof text !== 'string' || text.length > 4 * 1024 * 1024) return false;
  try {
    if (!client.cloud.isEnabledForAccount() || !client.cloud.isEnabledForApp()) return false;
    return client.cloud.writeFile(name, text);
  } catch (e) { return false; }
}

/** Wire the IPC the preload uses. */
function wire(ipcMain) {
  ipcMain.on('steam:info', (e) => { e.returnValue = info(); });
  ipcMain.on('steam:cloud-read', (e, name) => { e.returnValue = cloudRead(name); });
  ipcMain.handle('steam:cloud-write', (e, name, text) => cloudWrite(name, text));
  ipcMain.handle('steam:unlock', (e, apiName) => unlock(apiName));
}

module.exports = { early, wire, info, get reason() { return reason; } };
