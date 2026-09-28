#!/usr/bin/env node
/* No setting in src/data/config.js is defined twice.
 *
 * An object literal keeps the LAST of two keys with the same name, silently.
 * Conviction's blast radius was added as `stormRadius: 190` below Highmoor's
 * own `stormRadius: 88`, and every storm strike on Highmoor landed at 190 -
 * nearly five times the area it was tuned at - with nothing to say so.
 *
 * Top-level settings sit at four spaces; this reads every key at that depth
 * and fails on any that appears twice. */
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'config.js'), 'utf8');
const seen = {};
src.split('\n').forEach((line, i) => {
  if (!/^ {4}[A-Za-z_]/.test(line)) return;
  const code = line.replace(/\/\/.*$/, '');
  for (const m of code.matchAll(/([A-Za-z_]\w*)\s*:/g)) (seen[m[1]] = seen[m[1]] || []).push(i + 1);
});
const dup = Object.entries(seen).filter(([, at]) => at.length > 1);
if (dup.length) {
  console.log('FAIL\n' + dup.map(([k, at]) => `  - ${k} is set on lines ${at.join(', ')}; only the last one counts`).join('\n'));
  process.exitCode = 1;
} else {
  console.log(`ok: ${Object.keys(seen).length} settings in config.js, none defined twice`);
}
