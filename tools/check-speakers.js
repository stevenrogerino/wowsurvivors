#!/usr/bin/env node
/* Every finale speaker has a voice.
 *
 * A finale line is babbled under its speech box by WS.Audio.babble, which
 * looks the speaker up in the voice table and, finding nothing, returns
 * without a sound. Brother Kael shipped that way: the one speaker added
 * after the others, every line of his fight delivered in silence, and no
 * check noticed because nothing failed. This one fails. Every speaker in
 * WS.FinaleSpeakers but the narrator must have a voice, and so must every
 * speaker any finale's script names.
 *
 * Set CHROME to point at an existing Chromium binary. */
'use strict';
const { chromium } = require('playwright');
const path = require('path');

const GAME = 'file://' + path.resolve(__dirname, '..', 'index.html');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto(GAME);
  await page.waitForFunction(() => window.WS && WS.Audio && WS.FinaleSpeakers && WS.Finales);
  const r = await page.evaluate(() => {
    const who = new Set(Object.keys(WS.FinaleSpeakers));
    // Everyone a finale's script gives a line to, whether or not they are
    // in the speaker table.
    for (const def of Object.values(WS.Finales)) {
      for (const bank of [def.say, def.intro, def.outro, def.lines]) {
        if (!bank) continue;
        for (const l of Object.values(bank)) if (Array.isArray(l) && typeof l[0] === 'string') who.add(l[0]);
      }
    }
    who.delete('narrator');
    return { all: [...who], silent: [...who].filter((w) => !WS.Audio.hasVoice(w)) };
  });
  await browser.close();
  if (r.silent.length) {
    console.log('FAIL');
    for (const w of r.silent) console.log(`  - ${w} speaks in a finale but has no voice`);
    process.exit(1);
  }
  console.log(`ok: all ${r.all.length} finale speakers have a voice (${r.all.join(', ')})`);
})();
