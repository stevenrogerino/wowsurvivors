#!/usr/bin/env node
/* The Codex: the companion wiki, built from the game.
 *
 * The wiki in site/wiki/ was written by hand once, with its numbers typed in,
 * and within a week it was describing a different game - old unlocks, old
 * health totals, no finales, no lore, and pictures of sprites that had since
 * been redrawn. Its own footer claimed it was generated from the data files.
 * Now it is.
 *
 * This loads the real game in a headless browser, reads every table it
 * ships - survivors and their records, the arsenal and what it evolves and
 * unites into, the discoveries, the passives, the bestiary and its notes,
 * every boss and the minute it arrives, the finales and what their villains
 * say, the battlefields, the deeds and the trainer's lessons - and renders
 * every picture from the game's own painters: the watch-fire scenes, the
 * bestiary pages, the battlefield vistas and the icons. Text is run through
 * WS.template, so a retuned number is a retuned wiki.
 *
 *   node tools/wiki.js            writes site/wiki/index.html and site/wiki/img/
 *
 * Run it after anything a player would read about changes. Set CHROME to
 * point at an existing Chromium binary. */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'site', 'wiki');
const IMG = path.join(OUT, 'img');

const esc = (s) => String(s === undefined || s === null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const num = (n) => Math.round(n).toLocaleString('en-US');

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.join(ROOT, 'index.html'));
  await page.waitForFunction(() => window.WS && WS.Game && WS.Vignette);
  await page.waitForTimeout(600);
  await page.evaluate(() => { if (WS.Prologue && WS.Prologue.active) WS.Prologue.finish(); });

  /* ------------------------------------------------------------ the data */
  const D = await page.evaluate(() => {
    const T = (text, src) => WS.template(text || '', src || {});
    const hex = (c) => WS.hex(c || [0.8, 0.8, 0.8]);
    const schoolHex = (s) => hex(WS.CONST.COLORS[s] || WS.CONST.COLORS.arc);
    const rewardOf = (type, id) => {
      for (const k of WS.AchievementOrder || Object.keys(WS.Achievements)) {
        const a = WS.Achievements[k];
        if (a && a.reward && a.reward.type === type && a.reward.id === id) return a;
      }
      return null;
    };
    const lore = WS.Lore || {};
    const enc = WS.Config.encounters || {};

    const survivors = WS.CharacterOrder.map((id) => {
      const c = WS.Characters[id], w = WS.Weapons[c.weapon] || {};
      const rec = (lore.watchers || {})[id] || {};
      const ach = rewardOf('character', id);
      return {
        id, name: c.name, title: c.title, cls: c.className, color: hex(c.color),
        description: c.description, perk: T(c.perk, c),
        weapon: w.name, school: w.school,
        health: c.maxHealth, speed: c.moveSpeed, armor: c.armor,
        says: rec.says, record: rec.record || [], rumor: T(rec.rumor, enc),
        unlock: ach ? { name: ach.name, how: T(ach.description, enc) } : null,
        hint: c.unlockHint,
      };
    });

    const weaponRow = (id) => {
      const w = WS.Weapons[id];
      const pair = w.evolvePairing && WS.Upgrades[w.evolvePairing];
      return { id, name: w.name, school: w.school, art: w.art, color: schoolHex(w.school),
        description: T(w.description, w), evolveName: w.evolveName,
        evolveDescription: T(w.evolveDescription, w), pairing: pair ? pair.name : null };
    };
    const arsenal = WS.WeaponOrder.filter((id) => WS.Weapons[id]).map(weaponRow);
    const unions = Object.keys(WS.Unions).map((k) => {
      const u = WS.Unions[k], r = WS.Weapons[u.result] || {};
      return { id: u.result, name: r.name, school: r.school, art: r.art, color: schoolHex(r.school),
        description: T(r.description, r),
        from: u.from.map((f) => (WS.Weapons[f] || {}).name),
        fromEvolved: u.from.map((f) => (WS.Weapons[f] || {}).evolveName) };
    });
    const discoveries = (WS.ComboOrder || Object.keys(WS.Combos)).map((k) => {
      const c = WS.Combos[k];
      return { name: c.name, from: c.weapons.map((f) => (WS.Weapons[f] || {}).name),
        description: T(c.description, c), hint: c.hint };
    });
    const passives = (WS.UpgradeOrder || Object.keys(WS.Upgrades)).map((k) => {
      const u = WS.Upgrades[k];
      return { id: k, name: u.name, art: u.art, max: u.max, quality: u.quality,
        description: T(u.description, u), detail: T(u.detail, u) };
    });

    const traits = (t) => {
      const out = [];
      if (t.ranged) out.push(`casts ${t.ranged.school || ''} bolts`.replace('  ', ' '));
      if (t.burst) out.push('bursts where it dies');
      if (t.orbit) out.push('circles at range');
      if (t.lunge) out.push('lunges');
      if (t.trail) out.push('leaves a trail');
      if (t.split) out.push('splits when it dies');
      if (t.stationary) out.push('does not move');
      return out;
    };
    const notes = lore.bestiary || {};
    const regions = [];
    const bossesByMap = [];
    for (const mid of WS.MapOrder) {
      const m = WS.Maps[mid];
      const seen = new Set(), list = [], elites = [];
      for (const ph of m.phases || []) {
        for (const r of ph.roster || []) {
          if (seen.has(r.id) || !WS.Enemies[r.id]) continue;
          seen.add(r.id);
          const t = WS.Enemies[r.id];
          list.push({ id: r.id, name: t.name, family: t.family, health: t.health, first: ph.at,
            traits: traits(t), note: notes[r.id] });
        }
        if (ph.elite && !seen.has(ph.elite) && WS.Elites[ph.elite]) {
          seen.add(ph.elite);
          const t = WS.Elites[ph.elite];
          elites.push({ id: ph.elite, name: t.name, family: t.family, health: t.health, first: ph.at,
            traits: traits(t), note: notes[ph.elite] });
        }
      }
      for (const [eid, t] of Object.entries(WS.Elites)) {
        if (seen.has(eid)) continue;
        if (mid === 'boss_arena' && eid === 'shadow_weaver') {
          seen.add(eid);
          elites.push({ id: eid, name: t.name, family: t.family, health: t.health, traits: traits(t), note: notes[eid] });
        }
      }
      regions.push({ id: mid, name: m.name, sub: m.subtitle, desc: m.description, place: m.art, list, elites });
      bossesByMap.push({ id: mid, name: m.name, place: m.art,
        bosses: (m.bosses || []).filter((b) => WS.Bosses[b.id]).map((b) => {
          const t = WS.Bosses[b.id];
          return { id: b.id, at: b.at, name: t.name, family: t.family, health: t.health,
            school: t.school, yell: t.yell, note: notes[b.id] };
        }) });
    }
    const special = ['death_itself', 'aethelgard'].filter((id) => WS.Bosses[id]).map((id) => {
      const t = WS.Bosses[id];
      return { id, name: t.name, family: t.family, health: t.health, school: t.school, yell: t.yell, note: notes[id] };
    });

    const speakerName = (who) => (WS.FinaleSpeakers[who] || {}).name || '';
    const finales = Object.keys(WS.Finales).map((mid) => {
      const f = WS.Finales[mid];
      const said = (lines) => (lines || []).map(([who, text]) => ({ who, name: speakerName(who),
        colour: (WS.FinaleSpeakers[who] || {}).colour, text }));
      return { map: mid, mapName: WS.Maps[mid].name, place: WS.Maps[mid].art, title: f.title,
        subtitle: f.subtitle, art: f.art, tint: f.tint, intro: said(f.intro), outro: said(f.outro),
        epilogue: Array.isArray(f.epilogue) ? f.epilogue : (f.epilogue ? [f.epilogue] : []) };
    });
    const finaleBosses = Object.keys(WS.Bosses).filter((id) => WS.Bosses[id].finale).map((id) => {
      const t = WS.Bosses[id];
      return { id, name: t.name, health: t.health, school: t.school, yell: t.yell, note: notes[id] };
    });

    const battlefields = WS.MapOrder.map((mid) => {
      const m = WS.Maps[mid];
      const ach = rewardOf('map', mid);
      return { id: mid, name: m.name, sub: m.subtitle, desc: m.description, difficulty: m.difficulty,
        gold: m.goldMult, unlock: ach ? T(ach.description, enc) : null,
        bosses: [...new Set((m.bosses || []).map((b) => (WS.Bosses[b.id] || {}).name).filter(Boolean))],
        finale: WS.Finales[mid] ? WS.Finales[mid].title : null };
    });

    const deeds = (WS.AchievementOrder || Object.keys(WS.Achievements)).map((k) => WS.Achievements[k])
      .filter((a) => a && a.name).map((a) => ({ name: a.name, art: a.art, how: T(a.description, enc),
        reward: a.reward && WS.Achievements.rewardText ? WS.Achievements.rewardText(a) : '—' }));
    const lessons = (WS.MetaUpgradeOrder || Object.keys(WS.MetaUpgrades)).map((k) => {
      const u = WS.MetaUpgrades[k];
      return { name: u.name, art: u.art, max: u.max, cost: u.cost, description: T(u.description, u) };
    });
    const blessings = (WS.BlessingOrder || Object.keys(WS.Blessings)).map((k) => {
      const b = WS.Blessings[k];
      return { name: b.name, art: b.art, quality: b.quality, description: T(b.description, b) };
    });

    return { survivors, arsenal, unions, discoveries, passives, regions, bossesByMap, special,
      finales, finaleBosses, battlefields, deeds, lessons, blessings,
      counts: { survivors: survivors.length, bosses: Object.keys(WS.Bosses).length,
        weapons: arsenal.length, maps: WS.MapOrder.length - 1 } };
  });

  /* ---------------------------------------------------------- the pictures */
  /* Everything drawn by the game's own code. The live vignettes are mounted
     at a fixed size, allowed a few frames to paint, and read back; the flat
     sprites and icons are read straight off their canvases. WebP, because
     eighty picture-sized PNGs would weigh more than the game does. */
  const jobs = [];
  for (const s of D.survivors) jobs.push({ file: `surv_${s.id}`, kind: 'survivor', id: s.id, w: 360, h: 240 });
  /* A creature is pictured on the first battlefield it walks, once - a
     second job for the same file would paint it on the last map's ground. */
  const pictured = new Set();
  const once = (j) => { if (!pictured.has(j.file)) { pictured.add(j.file); jobs.push(j); } };
  for (const r of D.regions) {
    for (const e of r.list) once({ file: `beast_${e.id}`, kind: 'beast', id: e.id, table: 'Enemies', place: r.place, w: 200, h: 200 });
    for (const e of r.elites) once({ file: `beast_${e.id}`, kind: 'beast', id: e.id, table: 'Elites', place: r.place, w: 200, h: 200 });
  }
  for (const m of D.bossesByMap) for (const b of m.bosses) once({ file: `boss_${b.id}`, kind: 'beast', id: b.id, table: 'Bosses', boss: true, place: m.place, w: 240, h: 240 });
  for (const b of D.special) jobs.push({ file: `boss_${b.id}`, kind: 'beast', id: b.id, table: 'Bosses', boss: true, place: b.id === 'aethelgard' ? 'eclipse' : 'none', w: 240, h: 240 });
  for (const f of D.finales) jobs.push({ file: `finale_${f.map}`, kind: 'finale', id: f.map, place: f.place, w: 420, h: 280 });
  for (const b of D.battlefields) jobs.push({ file: `field_${b.id}`, kind: 'field', id: b.id, w: 480, h: 260 });
  for (const w of D.arsenal.concat(D.unions)) jobs.push({ file: `icon_${w.id}`, kind: 'icon', art: w.art, color: w.color, size: 64 });
  for (const p of D.passives) jobs.push({ file: `icon_p_${p.id}`, kind: 'icon', art: p.art, color: '#f5c56b', size: 48 });
  jobs.push({ file: 'ladder', kind: 'ladder', id: 'mage', w: 700, h: 150 });
  for (const s of D.survivors) jobs.push({ file: `rank_${s.id}`, kind: 'ranks', id: s.id, w: 200, h: 100 });

  fs.rmSync(IMG, { recursive: true, force: true });
  fs.mkdirSync(IMG, { recursive: true });
  const BATCH = 12;
  for (let i = 0; i < jobs.length; i += BATCH) {
    const batch = jobs.slice(i, i + BATCH);
    const urls = await page.evaluate(async (batch) => {
      const holder = document.createElement('div');
      holder.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;display:flex;flex-wrap:wrap;';
      document.body.appendChild(holder);
      const out = [];
      const live = [];
      for (const j of batch) {
        if (j.kind === 'icon') {
          out.push(WS.Icons.get(j.art, WS.CONST.COLORS && typeof j.color === 'string'
            ? [1, 3, 5].map((k) => parseInt(j.color.slice(k, k + 2), 16) / 255) : j.color, j.size).toDataURL('image/png'));
          continue;
        }
        if (j.kind === 'ladder' || j.kind === 'ranks') {
          const ch = WS.Characters[j.id];
          const ranks = j.kind === 'ladder' ? [0, 1, 2, 3, 4, 5, 6] : [0, 6];
          const c = document.createElement('canvas');
          c.width = j.w * 2; c.height = j.h * 2;
          const g = c.getContext('2d');
          const cell = c.width / ranks.length, sz = Math.min(cell, c.height) * 1.1;
          ranks.forEach((r, k) => g.drawImage(WS.Sprites.hero(j.id, ch.color, Math.round(sz / 2), false, undefined, null, r),
            k * cell + (cell - sz) / 2, c.height - sz * 0.9, sz, sz));
          out.push(c.toDataURL('image/webp', 0.9));
          continue;
        }
        let canvas;
        if (j.kind === 'survivor') canvas = WS.Vignette.survivor(j.id, WS.Characters[j.id].color, 0);
        else if (j.kind === 'field') canvas = WS.Vignette.battlefield(j.id);
        else if (j.kind === 'beast') {
          const t = WS[j.table][j.id];
          canvas = WS.Vignette.beast(j.id, { art: t.art, tint: t.tint, kit: t.bossKit, known: true, boss: !!j.boss, place: j.place });
        } else if (j.kind === 'finale') {
          const f = WS.Finales[j.id];
          canvas = WS.Vignette.beast('fin_' + j.id, { art: f.art, tint: f.tint, known: true, boss: true, place: j.place });
        }
        canvas.style.width = j.w + 'px'; canvas.style.height = j.h + 'px';
        holder.appendChild(canvas);
        live.push({ canvas, idx: out.length });
        out.push(null);
      }
      // let the vignettes paint a few frames, then read them
      await new Promise((r) => setTimeout(r, 900));
      for (const l of live) out[l.idx] = l.canvas.toDataURL('image/webp', 0.86);
      holder.remove();
      return out;
    }, batch);
    batch.forEach((j, k) => {
      const [meta, b64] = urls[k].split(',');
      const ext = meta.includes('png') ? 'png' : 'webp';
      j.src = `img/${j.file}.${ext}`;
      fs.writeFileSync(path.join(OUT, j.src), Buffer.from(b64, 'base64'));
    });
  }
  const img = {};
  for (const j of jobs) img[j.file] = j.src;
  await browser.close();
  if (errors.length) { console.error('page errors:\n  ' + errors.join('\n  ')); process.exit(1); }

  /* ---------------------------------------------------------- the page */
  const tag = (s) => (s ? `<span class="tag school-${esc(s)}">${esc(s)}</span>` : '');
  const pic = (key, alt, cls) => `<img class="${cls || 'art'}" src="${img[key]}" alt="${esc(alt)}" loading="lazy">`;

  const survivorCards = D.survivors.map((s) => `
      <article class="surv" style="--q:${s.color}">
        ${pic('surv_' + s.id, `${s.name} at the watch fire`, 'art wide')}
        <div class="body">
          <h3 class="name">${esc(s.name)}</h3>
          <div class="title">${esc(s.title)}</div>
          <div class="tags"><span class="tag arc">${esc(s.cls)}</span>${tag(s.school)}</div>
          ${s.says ? `<blockquote class="says">${esc(s.says)}</blockquote>` : ''}
          <p class="desc">${esc(s.description)}</p>
          <dl class="facts">
            <div><dt>Weapon</dt><dd>${esc(s.weapon)}</dd></div>
            <div><dt>Perk</dt><dd>${esc(s.perk)}</dd></div>
            <div><dt>Health</dt><dd>${num(s.health)}</dd></div>
            <div><dt>Speed</dt><dd>${num(s.speed)}</dd></div>
          </dl>
          ${s.record.length ? `<details><summary>Their record</summary>${s.record.map((p) => `<p>${esc(p)}</p>`).join('')}</details>` : ''}
          <div class="unlock${s.unlock ? '' : ' free'}">${s.unlock
            ? `<b>${esc(s.unlock.name)}</b> — ${esc(s.rumor || s.unlock.how)}`
            : 'On watch from the very first night.'}</div>
        </div>
      </article>`).join('');

  const weaponCards = D.arsenal.map((w) => `
      <article class="wpn" style="--q:${w.color}">
        ${pic('icon_' + w.id, w.name, 'icon')}
        <div>
          <h4>${esc(w.name)} ${tag(w.school)}</h4>
          <p>${esc(w.description)}</p>
          ${w.evolveName ? `<p class="evo">Rank 8 + <b>${esc(w.pairing || 'its passive')}</b> → <b class="to">${esc(w.evolveName)}</b>: ${esc(w.evolveDescription)}</p>` : ''}
        </div>
      </article>`).join('');
  const unionCards = D.unions.map((u) => `
      <article class="wpn union" style="--q:${u.color}">
        ${pic('icon_' + u.id, u.name, 'icon')}
        <div>
          <h4>${esc(u.name)} ${tag(u.school)}</h4>
          <p class="evo"><b>${esc(u.fromEvolved[0] || u.from[0])}</b> + <b>${esc(u.fromEvolved[1] || u.from[1])}</b>, both evolved</p>
          <p>${esc(u.description)}</p>
        </div>
      </article>`).join('');
  const discoveryRows = D.discoveries.map((c) => `
      <div class="disc"><h4>${esc(c.name)}</h4><div class="pair">${esc(c.from.join(' + '))}</div><p>${esc(c.description)}</p>${c.hint ? `<p class="hint">“${esc(c.hint)}”</p>` : ''}</div>`).join('');
  const passiveRows = D.passives.map((p) => `
      <div class="pas">${pic('icon_p_' + p.id, p.name, 'icon sm')}<div><h4>${esc(p.name)} <small>${p.max} ranks</small></h4><p>${esc(p.description)}</p>${p.detail ? `<p class="detail">${esc(p.detail)}</p>` : ''}</div></div>`).join('');

  const beastTile = (e, elite) => `
        <article class="beast${elite ? ' elite' : ''}">
          ${pic('beast_' + e.id, e.name)}
          <div class="bt">
            <h4>${esc(e.name)}</h4>
            <div class="fm">${elite ? 'Champion · ' : ''}${esc(e.family)} · ${num(e.health)} health${e.first !== undefined ? ` · from ${clock(e.first)}` : ''}</div>
            ${e.traits.length ? `<div class="traits">${esc(e.traits.join(' · '))}</div>` : ''}
            ${e.note ? `<p class="note">${esc(e.note)}</p>` : ''}
          </div>
        </article>`;
  const bestiary = D.regions.filter((r) => r.list.length || r.elites.length).map((r) => `
      <div class="region">
        <h3>${esc(r.name)} <span>— ${esc(r.sub)}</span></h3>
        <div class="grid g-beast">${r.list.map((e) => beastTile(e)).join('')}${r.elites.map((e) => beastTile(e, true)).join('')}</div>
      </div>`).join('');

  const bossCard = (b, where) => `
        <article class="boss">
          ${pic('boss_' + b.id, b.name)}
          <div class="b">
            <h4>${esc(b.name)}</h4>
            <div class="tags">${tag(b.school)}<span class="tag">${esc(b.family)}</span></div>
            <div class="hp">${num(b.health)} health${where ? ` · ${where}` : ''}</div>
            ${b.yell ? `<blockquote class="yell">${esc(b.yell)}</blockquote>` : ''}
            ${b.note ? `<p class="note">${esc(b.note)}</p>` : ''}
          </div>
        </article>`;
  const bosses = D.bossesByMap.filter((m) => m.bosses.length).map((m) => `
      <div class="region">
        <h3>${esc(m.name)}</h3>
        <div class="grid g-boss">${m.bosses.map((b) => bossCard(b, `arrives at ${clock(b.at)}`)).join('')}</div>
      </div>`).join('') + (D.special.length ? `
      <div class="region">
        <h3>Off the schedule</h3>
        <div class="grid g-boss">${D.special.map((b) => bossCard(b, b.id === 'death_itself' ? 'comes at 30:00 if you are still standing' : 'the Eclipse Arena')).join('')}</div>
      </div>` : '');

  const line = (l) => `<p class="line"><b style="color:${esc(l.colour || '#e8dcc4')}">${esc(l.name || '')}</b> ${esc(l.text)}</p>`;
  const finales = D.finales.map((f) => `
      <article class="finale">
        ${pic('finale_' + f.map, f.title, 'art fin')}
        <div class="fbody">
          <div class="kicker">${esc(f.mapName)} · at dawn</div>
          <h3>${esc(f.title)}</h3>
          <div class="title">${esc(f.subtitle)}</div>
          <div class="dialogue">${f.intro.map(line).join('')}</div>
          ${f.epilogue.length ? `<details><summary>How it ends</summary>${f.outro.map(line).join('')}${f.epilogue.map((p) => `<p>${esc(typeof p === 'string' ? p : (p[1] || p.text || ''))}</p>`).join('')}</details>` : ''}
        </div>
      </article>`).join('');

  const fields = D.battlefields.map((b) => `
      <article class="field">
        ${pic('field_' + b.id, b.name, 'art wide')}
        <div class="body">
          <h3 class="name">${esc(b.name)}</h3>
          <div class="title">${esc(b.sub)}</div>
          <p class="desc">${esc(b.desc)}</p>
          <dl class="facts">
            <div><dt>Difficulty</dt><dd>${b.difficulty}×</dd></div>
            <div><dt>Gold</dt><dd>${b.gold}×</dd></div>
            ${b.bosses.length ? `<div class="wide"><dt>Bosses</dt><dd>${esc(b.bosses.join(' · '))}</dd></div>` : ''}
            ${b.finale ? `<div class="wide"><dt>At dawn</dt><dd>${esc(b.finale)}</dd></div>` : ''}
          </dl>
          <div class="unlock${b.unlock ? '' : ' free'}">${esc(b.unlock || 'Open from the start.')}</div>
        </div>
      </article>`).join('');

  const deeds = D.deeds.map((a) => `<tr><td><b>${esc(a.name)}</b></td><td>${esc(a.how)}</td><td class="rw">${esc(a.reward)}</td></tr>`).join('');
  const lessons = D.lessons.map((l) => `<tr><td><b>${esc(l.name)}</b></td><td>${esc(l.description)}</td><td class="rw">${l.max} ranks · ${num(l.cost)}g</td></tr>`).join('');
  const blessings = D.blessings.map((b) => `<tr><td><b>${esc(b.name)}</b></td><td>${esc(b.description)}</td><td class="rw">${esc(b.quality || '')}</td></tr>`).join('');

  const css = fs.readFileSync(path.join(__dirname, 'wiki.css'), 'utf8');
  const today = new Date().toISOString().slice(0, 10);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ember Watch Codex</title>
<meta name="description" content="A companion guide to The Ember Watch: every survivor and their record, the arsenal and what it becomes, the bestiary of every battlefield, every boss, and what waits at dawn.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Alegreya:ital,wght@0,400;0,700;0,800;1,500&family=Archivo:wght@400;600;700;800&family=IBM+Plex+Mono:wght@500;700&display=swap">
<style>
${css}
</style>
</head>
<body>
<nav class="top"><div class="bar wrap">
  <a class="mark" href="../"><b>THE EMBER WATCH</b> — Codex</a>
  <div class="links">
    <a href="#vigil">The Vigil</a><a href="#survivors">Survivors</a><a href="#arsenal">Arsenal</a>
    <a href="#bestiary">Bestiary</a><a href="#bosses">Bosses</a><a href="#dawn">At Dawn</a>
    <a href="#battlefields">Battlefields</a><a href="#ledger">Ledger</a>
  </div>
</div></nav>

<header class="hero">
  <div class="eyebrow">A companion codex</div>
  <h1>The Ember&nbsp;Watch</h1>
  <div class="sub">Thirty minutes until dawn</div>
  <p class="lede">${D.counts.survivors} survivors, ${D.counts.maps} battlefields, ${D.counts.weapons} weapons and ${D.counts.bosses} bosses,
    and the light that holds the dark back. <b>You only move</b> — everything you carry fights on its own.
    <a class="play" href="../">Play it in your browser →</a></p>
</header>

<main class="wrap">
  <section id="vigil">
    <div class="kicker">Chapter One</div>
    <h2 class="stitle">The vigil</h2>
    <div class="vigil-grid">
      <div class="lore-lines">
        <p>Every night, the dark comes up out of the ground.</p>
        <p>It has taken every watch before this one.</p>
        <p>What holds it back is ember — and ember will not burn on its own.</p>
        <p>It sleeps in the stones the dead leave behind.</p>
        <p>Break the stone. Take the light out of it. While you carry it, you burn.</p>
        <p>They can smell a light from a long way off.</p>
        <p>You will not kill your way out of this. Nobody ever has.</p>
        <p>You will out-burn it, and you will keep moving.</p>
        <p><b>Hold until the light comes back.</b></p>
      </div>
      <div class="loop-list">
        <div class="loop-item"><h4>Your weapons fire themselves</h4><p>Everything you carry swings, casts and reloads on its own. Your whole job is where you stand.</p></div>
        <div class="loop-item"><h4>Walk over the gems</h4><p>Level up and choose: a new weapon, a rank on one you carry, or a passive.</p></div>
        <div class="loop-item"><h4>Six weapons, and no more</h4><p>Rank one to 8 and learn its paired passive and it evolves. Two evolved weapons can become one, and hand the slot back.</p></div>
        <div class="loop-item"><h4>Thirty minutes, and then dawn</h4><p>Bosses arrive on a schedule and the horde thickens. At 30:00 the field is purged, you breathe, and whatever has been behind all of it comes out to meet you.</p></div>
        <div class="loop-item"><h4>Gold outlives the run</h4><p>Keep every coin whether you win, die, or walk away, and spend it with the Trainer.</p></div>
      </div>
    </div>
    <div class="ember-panel">
      <div><h3>What the ember does to you</h3>
        <p>Every survivor climbs the same six-tier ladder as they rank up in a run: the hem takes light, the shoulders build, the cloak lengthens into sparks, a crown of embers, burning pinions, and at last the brand, the ember showing through the chest.</p></div>
      ${pic('ladder', 'A survivor at every rank of the ember', 'ladder')}
    </div>
  </section>

  <section id="survivors">
    <div class="kicker">Chapter Two</div>
    <h2 class="stitle">The watchers</h2>
    <p class="sdesc">Two are on watch from the first night. The rest are found out there — most of them in trouble, all of them for a reason.</p>
    <div class="grid g-surv">${survivorCards}</div>
  </section>

  <section id="arsenal">
    <div class="kicker">Chapter Three</div>
    <h2 class="stitle">The arsenal</h2>
    <p class="sdesc">Every weapon, what it evolves into, and the passive it needs to get there.</p>
    <div class="grid g-wpn">${weaponCards}</div>
    <h3 class="sub-h">Unions</h3>
    <p class="sdesc">Two evolved weapons, merged into one greater one. The union takes one slot and gives the other back.</p>
    <div class="grid g-wpn">${unionCards}</div>
    <h3 class="sub-h">Discoveries</h3>
    <p class="sdesc">Pairs of weapons that change each other when carried together. The game only hints at them until you find one.</p>
    <div class="grid g-disc">${discoveryRows}</div>
    <h3 class="sub-h">Passives</h3>
    <div class="grid g-pas">${passiveRows}</div>
  </section>

  <section id="bestiary">
    <div class="kicker">Chapter Four</div>
    <h2 class="stitle">The bestiary</h2>
    <p class="sdesc">Every creature by the ground it walks, with the Watch's notes on each. Gold-rimmed tiles are champions — bigger, named, and always carrying a chest.</p>
    ${bestiary}
  </section>

  <section id="bosses">
    <div class="kicker">Chapter Five</div>
    <h2 class="stitle">The bosses</h2>
    <p class="sdesc">Each battlefield sends five on a schedule. Each announces itself, then cycles its patterns — a volley, a ring, a charge, or a summons of its own kind.</p>
    ${bosses}
  </section>

  <section id="dawn">
    <div class="kicker">Chapter Six</div>
    <h2 class="stitle">At dawn</h2>
    <p class="sdesc">Hold to 30:00 and the field is purged. Then the one behind the night comes out — a different one on every battlefield.</p>
    <div class="finales">${finales}</div>
  </section>

  <section id="battlefields">
    <div class="kicker">Chapter Seven</div>
    <h2 class="stitle">The battlefields</h2>
    <div class="grid g-field">${fields}</div>
  </section>

  <section id="ledger">
    <div class="kicker">Chapter Eight</div>
    <h2 class="stitle">The ledger</h2>
    <h3 class="sub-h">Deeds</h3>
    <table class="ledger"><thead><tr><th>Deed</th><th>How</th><th>Reward</th></tr></thead><tbody>${deeds}</tbody></table>
    <h3 class="sub-h">The Trainer's lessons</h3>
    <table class="ledger"><thead><tr><th>Lesson</th><th>What it does</th><th>Cost</th></tr></thead><tbody>${lessons}</tbody></table>
    <h3 class="sub-h">Blessings</h3>
    <table class="ledger"><thead><tr><th>Blessing</th><th>What it does</th><th></th></tr></thead><tbody>${blessings}</tbody></table>
  </section>
</main>

<footer><p>Unofficial companion codex, generated from The Ember Watch's own data and drawn by its own painters on ${today} (tools/wiki.js). Every number here is read from the game.</p></footer>
</body>
</html>
`;
  fs.writeFileSync(path.join(OUT, 'index.html'), html);
  const kb = Math.round(fs.readdirSync(IMG).reduce((s, f) => s + fs.statSync(path.join(IMG, f)).size, 0) / 1024);
  console.log(`wiki: ${D.survivors.length} survivors, ${D.arsenal.length} weapons, ${D.unions.length} unions, `
    + `${D.discoveries.length} discoveries, ${D.regions.reduce((s, r) => s + r.list.length + r.elites.length, 0)} creatures, `
    + `${D.bossesByMap.reduce((s, m) => s + m.bosses.length, 0) + D.special.length} bosses, ${D.finales.length} finales; `
    + `${jobs.length} pictures (${kb} KB) -> ${path.relative(ROOT, OUT)}`);
})();
