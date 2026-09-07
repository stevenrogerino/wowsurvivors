#!/usr/bin/env node
/* Inlines index.html, the stylesheet and every script into one standalone
 * HTML file. The game already runs from index.html with no build step; this
 * exists so the whole thing can be handed over, hosted or emailed as a single
 * file. Usage: node tools/bundle.js [outfile] */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = process.argv[2] || path.join(root, 'dist', 'wowsurvivors2.html');

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const css = html.replace(/[\s\S]*?<link rel="stylesheet" href="([^"]+)">[\s\S]*/, '$1');
const styles = fs.readFileSync(path.join(root, css), 'utf8');

// Preserve the load order declared in index.html - it is the dependency order.
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
if (!scripts.length) {
  console.error('bundle: found no <script src> tags in index.html');
  process.exit(1);
}

const bodies = scripts.map((src) => {
  const code = fs.readFileSync(path.join(root, src), 'utf8');
  return `/* ===== ${src} ===== */\n${code}`;
}).join('\n');

let result = html
  .replace(/<link rel="stylesheet" href="[^"]+">/, `<style>\n${styles}\n</style>`)
  .replace(/<!--[\s\S]*?-->\s*/g, '')
  .replace(/<script src="[^"]+"><\/script>\s*/g, '');

// Drop the now-empty script block and append one combined script before </body>.
result = result.replace('</body>', `<script>\n${bodies}\n</script>\n</body>`);

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, result);
console.log(`bundled ${scripts.length} scripts + 1 stylesheet -> ${path.relative(root, out)} (${(result.length / 1024).toFixed(0)} KB)`);
