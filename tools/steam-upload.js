#!/usr/bin/env node
/* Upload a build to Steam (SteamPipe), from the unpacked desktop builds.
 *
 *   cd desktop && npm run dist:steam              # this OS's unpacked build, in desktop/release
 *   STEAM_APP_ID=1234560 STEAM_BUILD_USER=you node tools/steam-upload.js --dry
 *   STEAM_APP_ID=1234560 STEAM_BUILD_USER=you node tools/steam-upload.js --desc "0.9.1 beta" --branch beta
 *
 * What it does: writes the app build script and one depot script per
 * platform into steam/build/ (not committed: they carry your IDs), then runs
 * steamcmd with them. Only the platforms that have been built are uploaded:
 *
 *   Windows   desktop/release/win-unpacked         depot  APP_ID + 1
 *   macOS     desktop/release/mac*                 depot  APP_ID + 2
 *   Linux     desktop/release/linux-unpacked       depot  APP_ID + 3
 *
 * The depot numbers are the ones Steamworks hands out by default when you add
 * depots in order; if yours differ, set STEAM_DEPOT_WIN / _MAC / _LINUX.
 *
 *   --dry            write the scripts, do not run steamcmd
 *   --preview        run steamcmd in preview mode: it scans and reports, uploads nothing
 *   --desc TEXT      the build's description in Steamworks (default: version and commit)
 *   --branch NAME    set the build live on this branch (never "default": do that by hand
 *                    in Steamworks, where you can see what you are releasing)
 *
 * steamcmd: on PATH, or STEAMCMD=/path/to/steamcmd. The first login asks for
 * your password and Steam Guard code interactively and caches them; after
 * that STEAM_BUILD_USER alone is enough. Use a dedicated builder account with
 * only "Edit App Metadata" and "Publish App Changes To Steam" permissions,
 * not the account that owns the partner organisation. */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const REL = path.join(ROOT, 'desktop', 'release');
const OUT = path.join(ROOT, 'steam', 'build');
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const flag = (k) => process.argv.includes(k);

const appId = Number(process.env.STEAM_APP_ID);
if (!appId) { console.error('Set STEAM_APP_ID to your App ID (Steamworks > App Admin).'); process.exit(2); }
const user = process.env.STEAM_BUILD_USER;
if (!user && !flag('--dry')) { console.error('Set STEAM_BUILD_USER to the Steam account that uploads builds.'); process.exit(2); }
const branch = arg('--branch');
if (branch === 'default') { console.error('Set the default branch live by hand in Steamworks, not from a script.'); process.exit(2); }

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'desktop', 'package.json'), 'utf8'));
let commit = '';
try { commit = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch (e) { /* not a checkout */ }
const desc = arg('--desc') || `${pkg.version}${commit ? ' (' + commit + ')' : ''}`;

const macDir = fs.existsSync(REL) ? fs.readdirSync(REL).find((d) => /^mac/.test(d) && fs.statSync(path.join(REL, d)).isDirectory()) : null;
const PLATFORMS = [
  { key: 'win', name: 'Windows', depot: Number(process.env.STEAM_DEPOT_WIN) || appId + 1, dir: path.join(REL, 'win-unpacked') },
  { key: 'mac', name: 'macOS', depot: Number(process.env.STEAM_DEPOT_MAC) || appId + 2, dir: macDir ? path.join(REL, macDir) : null },
  { key: 'linux', name: 'Linux', depot: Number(process.env.STEAM_DEPOT_LINUX) || appId + 3, dir: path.join(REL, 'linux-unpacked') },
];
const built = PLATFORMS.filter((p) => p.dir && fs.existsSync(p.dir));
if (!built.length) {
  console.error('No unpacked builds in desktop/release. Run `npm run dist:steam` in desktop/ first.');
  process.exit(2);
}

/* VDF is Valve's key/value format: quoted keys, quoted values, braces. */
const q = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
function vdf(name, obj, pad = '') {
  let s = `${pad}${q(name)}\n${pad}{\n`;
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') s += vdf(k, v, pad + '\t');
    else s += `${pad}\t${q(k)}\t${q(v)}\n`;
  }
  return s + `${pad}}\n`;
}

fs.mkdirSync(path.join(OUT, 'output'), { recursive: true });
const depots = {};
for (const p of built) {
  const file = path.join(OUT, `depot_build_${p.depot}.vdf`);
  fs.writeFileSync(file, vdf('DepotBuildConfig', {
    DepotID: p.depot,
    ContentRoot: p.dir,
    FileMapping: { LocalPath: '*', DepotPath: '.', recursive: '1' },
    // A development App ID file must never ship: with it, Steam cannot
    // relaunch a copy started outside the client (desktop/steam.js).
    FileExclusion: 'steam_appid.txt',
  }));
  depots[p.depot] = file;
}
const appFile = path.join(OUT, `app_build_${appId}.vdf`);
const app = { AppID: appId, Desc: desc, BuildOutput: path.join(OUT, 'output'), ContentRoot: ROOT,
  Preview: flag('--preview') ? '1' : '0' };
if (branch) app.SetLive = branch;
app.Depots = depots;
fs.writeFileSync(appFile, vdf('AppBuild', app));

console.log(`App ${appId}: "${desc}"${branch ? ', live on ' + branch : ''}${flag('--preview') ? ' (preview)' : ''}`);
for (const p of built) console.log(`  ${p.name.padEnd(8)} depot ${p.depot}  <- ${path.relative(ROOT, p.dir)}`);
for (const p of PLATFORMS.filter((x) => !built.includes(x))) console.log(`  ${p.name.padEnd(8)} not built, skipped`);
console.log(`  scripts in ${path.relative(ROOT, OUT)}/`);
if (flag('--dry')) process.exit(0);

const steamcmd = process.env.STEAMCMD || 'steamcmd';
const r = spawnSync(steamcmd, ['+login', user, '+run_app_build', appFile, '+quit'], { stdio: 'inherit' });
if (r.error) { console.error(`Could not run ${steamcmd}: ${r.error.message}`); process.exit(1); }
process.exit(r.status || 0);
