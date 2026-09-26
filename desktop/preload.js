/* The only thing the page can see of the desktop shell: `window.emberSteam`,
 * five calls wide, each one a message to steam.js in the main process. The
 * page stays sandboxed and never touches Node or a native module.
 * src/core/platform.js is the one reader. */
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('emberSteam', {
  /** { available, deck, player, appId } - synchronous, asked once at boot. */
  info: () => ipcRenderer.sendSync('steam:info'),
  /** Unlock one achievement by its Steam API name. */
  unlock: (apiName) => ipcRenderer.invoke('steam:unlock', String(apiName)),
  /** The cloud copy of the account, or null. Synchronous: the save needs it
   *  while it loads. */
  cloudRead: (name) => ipcRenderer.sendSync('steam:cloud-read', String(name)),
  cloudWrite: (name, text) => ipcRenderer.invoke('steam:cloud-write', String(name), String(text)),
});
