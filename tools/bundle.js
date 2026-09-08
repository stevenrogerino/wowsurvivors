#!/usr/bin/env node
/* Inlines index.html, the stylesheet and every script into one standalone
 * HTML file. The game already runs from index.html with no build step; this
 * exists so the whole thing can be handed over, hosted or emailed as a single
 * file.
 *
 *   node tools/bundle.js [outfile]
 *   node tools/bundle.js --artifact [outfile]
 *
 * --artifact emits a fragment instead of a document (title, style, markup,
 * script - no doctype/html/head/body), which is what a host that supplies its
 * own page skeleton expects. */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const artifact = args.includes('--artifact');
const named = args.find((a) => !a.startsWith('--'));
const out = named || path.join(root, 'dist',
  artifact ? 'the-ember-watch.artifact.html' : 'the-ember-watch.html');

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// Every stylesheet, in the order index.html links them (fonts first).
const sheets = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]);
const styles = sheets
  .map((href) => `/* ===== ${href} ===== */\n` + fs.readFileSync(path.join(root, href), 'utf8'))
  .join('\n');

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

let result;
if (artifact) {
  // Just the parts a host skeleton does not already provide.
  const body = html.replace(/[\s\S]*<body>([\s\S]*?)<\/body>[\s\S]*/, '$1')
    .replace(/<!--[\s\S]*?-->\s*/g, '')
    .replace(/<script src="[^"]+"><\/script>\s*/g, '')
    .trim();
  result = `<title>The Ember Watch</title>\n<style>\n${styles}\n</style>\n${body}\n<script>\n${bodies}\n</script>\n`;
} else {
  result = html
    .replace(/<link rel="stylesheet" href="[^"]+">/, `<style>\n${styles}\n</style>`)
    .replace(/<link rel="stylesheet" href="[^"]+">\s*/g, '')
    .replace(/<!--[\s\S]*?-->\s*/g, '')
    .replace(/<script src="[^"]+"><\/script>\s*/g, '');
  // Drop the now-empty script block and append one combined script.
  result = result.replace('</body>', `<script>\n${bodies}\n</script>\n</body>`);
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, result);
console.log(`bundled ${scripts.length} scripts + ${sheets.length} stylesheets -> ${path.relative(root, out)} (${(result.length / 1024).toFixed(0)} KB)`);
