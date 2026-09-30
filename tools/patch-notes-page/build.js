#!/usr/bin/env node
/* The illustrated patch notes page, "The Night Breathes".
 *
 *   node tools/patch-notes-page/build.js            -> tools/patch-notes.html
 *   node tools/patch-notes-page/build.js --inline F -> F, one self-contained file
 *
 * page.html is the page, ledger.json every change in it, media/ the clips,
 * sprite strips and sounds (captured from the game itself). The default build
 * writes the latest patch notes, which tools/wiki.js copies into the codex
 * with media/ beside it as notes/; its pictures are the codex's own, under
 * img/. --inline embeds everything as data URIs instead, for sharing the page
 * on its own. */
'use strict';
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const IMG = path.join(HERE, '..', '..', 'site', 'wiki', 'img');
const MEDIA = path.join(HERE, 'media');
const at = process.argv.indexOf('--inline');
const inline = at >= 0;
const out = inline ? path.resolve(process.argv[at + 1] || 'the-night-breathes.html') : path.join(HERE, '..', 'patch-notes.html');

const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', wav: 'audio/wav' };
const uri = (file) => `data:${MIME[path.extname(file).slice(1)]};base64,${fs.readFileSync(file).toString('base64')}`;
const picture = (name) => {
  if (!inline) return 'img/' + name;
  const file = path.join(IMG, name);
  if (!fs.existsSync(file)) { console.error(`${name} is not in site/wiki/img: run node tools/wiki.js first`); process.exit(1); }
  return uri(file);
};
const media = (name) => (inline ? uri(path.join(MEDIA, name)) : 'notes/' + name);

let page = fs.readFileSync(path.join(HERE, 'page.html'), 'utf8');
const ledger = JSON.parse(fs.readFileSync(path.join(HERE, 'ledger.json'), 'utf8'));

const asset = {};
for (const n of ['pack', 'breakout', 'stones', 'admiral', 'night']) asset[n] = media(n + '.jpg');
for (const n of ['wolf', 'ghoul']) asset[n] = media(n + '.webp');
for (const n of ['fire', 'frost', 'arcane', 'holy', 'nature', 'shadow', 'physical', 'elite', 'boss', 'beans']) asset['snd_' + n] = media(`snd_${n}.wav`);
const pictures = new Set([
  ...[...page.matchAll(/%%([\w.]+\.(?:png|webp))%%/g)].map((m) => m[1]),
  ...[...page.matchAll(/'((?:icon|surv|boss)_\w+\.(?:png|webp))'/g)].map((m) => m[1]),
  ...ledger.map((e) => e.img).filter(Boolean),
]);
for (const name of pictures) {
  asset[name] = picture(name);
  page = page.split(`%%${name}%%`).join(asset[name]);
}
page = page
  .replace('%%SITELINKS%%', inline ? ''
    : '<a class="chap" href="patch-notes-2026-09-28.html">Previous patch</a><a class="chap" href="index.html">Codex</a>')
  .replace('%%ASSETS%%', () => JSON.stringify(asset))
  .replace('%%LEDGER%%', () => JSON.stringify(ledger));
const left = page.match(/%%[\w.]+%%/g);
if (left) { console.error('unfilled: ' + [...new Set(left)].join(', ')); process.exit(1); }

/* The artifact host wraps a page in its own document; a site page needs one. */
if (!inline) {
  page = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
    + '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
    + page.replace(/<\/style>\n/, '</style>\n</head>\n<body>\n') + '\n</body>\n</html>\n';
}
fs.writeFileSync(out, page);
console.log(`patch notes: ${ledger.length} changes, ${pictures.size} pictures, ${Math.round(page.length / 1024)} KB -> ${path.relative(process.cwd(), out)}`);
