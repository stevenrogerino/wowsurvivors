/* The Arclight UI layer: menus, overlays and the heads-up display.
 * The DOM owns everything that is text or chrome; the canvas owns the world.
 * This layer reads game state and never mutates the simulation directly - it
 * calls into WS.Game for anything that changes the run. */
'use strict';
(function (WS) {

  const UI = {
    root: null, overlay: null, hud: null,
    tab: 'roster',
    banishMode: false,
    els: {},
  };

  /* ------------------------------------------------------------- helpers - */
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function icon(art, colour, size) {
    const img = new Image();
    img.src = WS.Icons.url(art, colour, size || 64);
    img.width = size || 64; img.height = size || 64;
    img.alt = '';
    return img;
  }

  function qualityColour(key) {
    return WS.CONST.QUALITY[key] || WS.CONST.QUALITY.common;
  }

  /** A choice's accent: its school palette for weapons, its quality otherwise. */
  function choiceColour(choice) {
    if (choice.school) return WS.CONST.COLORS[choice.school];
    if (choice.quality) return qualityColour(choice.quality);
    if (choice.type === 'evolve' || choice.type === 'union') return qualityColour('legendary');
    if (choice.type === 'new_weapon') return qualityColour('rare');
    if (choice.type === 'bread') return qualityColour('common');
    return qualityColour('uncommon');
  }

  function svgArc(radius, stroke, cls) {
    const ns = 'http://www.w3.org/2000/svg';
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', '50%'); c.setAttribute('cy', '50%');
    c.setAttribute('r', radius);
    c.setAttribute('class', cls);
    if (stroke) c.setAttribute('stroke-width', stroke);
    return c;
  }

  /* ================================================================= HUD == */
  UI.buildHUD = function () {
    const hud = this.hud;
    hud.innerHTML = '';
    const ns = 'http://www.w3.org/2000/svg';

    /* -- portrait + arcs -------------------------------------------------- */
    const portraitWrap = el('div'); portraitWrap.id = 'hud-portrait';
    const gauge = el('div', 'gauge-wrap');
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 92 92');
    const rHP = 43, rXP = 36;
    const tHP = svgArc(rHP, 5, 'track');
    const aHP = svgArc(rHP, 5, 'arc-hp');
    const tXP = svgArc(rXP, 3, 'track');
    const aXP = svgArc(rXP, 3, 'arc-xp');
    svg.append(tHP, aHP, tXP, aXP);
    const portrait = el('div', 'portrait');
    const lvl = el('div', 'lvl', 'LV 1');
    gauge.append(svg, portrait, lvl);

    const vitals = el('div'); vitals.id = 'hud-vitals';
    const name = el('div', 'name', '');
    const hpText = el('div', 'hp-text', '');
    const meters = el('div'); meters.id = 'hud-meters';
    vitals.append(name, hpText, meters);
    portraitWrap.append(gauge, vitals);

    /* -- timer rail ------------------------------------------------------- */
    const timer = el('div'); timer.id = 'hud-timer';
    const timeText = el('div', 'time', '0:00');
    const rail = el('div', 'rail');
    const railFill = el('div', 'fill');
    rail.append(railFill);
    for (const at of WS.Config.bossTimes) {
      const tick = el('i', 'tick');
      tick.style.left = (at / WS.Config.deathTime * 100) + '%';
      rail.append(tick);
    }
    const mode = el('div', 'label mode', '');
    timer.append(timeText, rail, mode);

    /* -- boss arc --------------------------------------------------------- */
    const boss = el('div', 'hidden'); boss.id = 'hud-boss';
    const bossName = el('div', 'boss-name', '');
    const bossSvg = document.createElementNS(ns, 'svg');
    bossSvg.setAttribute('viewBox', '0 0 720 26');
    bossSvg.setAttribute('preserveAspectRatio', 'none');
    const bTrack = document.createElementNS(ns, 'path');
    bTrack.setAttribute('class', 'b-track');
    bTrack.setAttribute('d', 'M4,22 Q360,-6 716,22');
    const bFill = document.createElementNS(ns, 'path');
    bFill.setAttribute('class', 'b-fill');
    bFill.setAttribute('d', 'M4,22 Q360,-6 716,22');
    bossSvg.append(bTrack, bFill);
    boss.append(bossName, bossSvg);

    /* -- gold / kills ----------------------------------------------------- */
    const stats = el('div'); stats.id = 'hud-stats';
    const goldLine = el('div', 'stat-line gold');
    const goldV = el('span', 'v', '0');
    goldLine.append(el('span', 'label', 'Gold'), goldV);
    const killLine = el('div', 'stat-line');
    const killV = el('span', 'v', '0');
    killLine.append(el('span', 'label', 'Slain'), killV);
    stats.append(goldLine, killLine);

    const weapons = el('div'); weapons.id = 'hud-weapons';
    const passives = el('div'); passives.id = 'hud-passives';
    const toasts = el('div'); toasts.id = 'hud-toasts';

    hud.append(portraitWrap, timer, boss, stats, weapons, passives, toasts);

    this.els = {
      aHP, aXP, portrait, lvl, name, hpText, meters,
      timeText, railFill, mode,
      boss, bossName, bFill,
      goldV, killV, weapons, passives, toasts,
      hpCirc: 2 * Math.PI * rHP, xpCirc: 2 * Math.PI * rXP,
      bossLen: 0,
      weaponSlots: new Map(), passiveSlots: new Map(), toastNodes: new Map(),
    };
    aHP.style.strokeDasharray = this.els.hpCirc;
    aXP.style.strokeDasharray = this.els.xpCirc;
    // Measure the boss curve once so the fill can be dash-offset along it.
    this.els.bossLen = (bFill.getTotalLength && bFill.getTotalLength()) || 745;
    bFill.style.strokeDasharray = this.els.bossLen;
  };

  UI.enterGame = function () {
    this.closeOverlay();
    this.hud.classList.remove('hidden');
    const p = WS.Game.player;
    // The portrait shows the survivor's actual silhouette, not a glyph.
    this.els.portrait.innerHTML = '';
    const img = new Image();
    img.src = WS.Sprites.hero(p.characterId, p.character.color, 64).toDataURL();
    img.width = img.height = 64;
    this.els.portrait.append(img);
    this.els.name.textContent = p.character.name;
    this.rebuildWeapons();
    this.rebuildPassives();
  };

  UI.rebuildWeapons = function () {
    const wrap = this.els.weapons;
    wrap.innerHTML = '';
    this.els.weaponSlots.clear();
    const ns = 'http://www.w3.org/2000/svg';
    for (const w of WS.Game.player.weapons) {
      const slot = el('div', 'wslot');
      if (w.evolved) slot.classList.add('evolved');
      const img = icon(w.data.art, WS.Weapon.colour(w), 52);
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('viewBox', '0 0 60 60');
      const track = svgArc(26, 2.5, 'cd-track');
      const arc = svgArc(26, 2.5, 'cd-arc');
      const circ = 2 * Math.PI * 26;
      arc.style.strokeDasharray = circ;
      svg.append(track, arc);
      const rank = el('div', 'rank', w.evolved ? 'MAX' : String(w.level));
      slot.append(img, svg, rank);
      slot.title = `${w.evolved ? w.data.evolveName : w.data.name}\n${w.data.description}`;
      wrap.append(slot);
      this.els.weaponSlots.set(w.id, { arc, circ, rank, slot });
    }
  };

  UI.rebuildPassives = function () {
    const wrap = this.els.passives;
    wrap.innerHTML = '';
    const p = WS.Game.player;
    for (const id of WS.UpgradeOrder) {
      const rank = p.upgradeLevels[id];
      if (!rank) continue;
      const up = WS.Upgrades[id];
      const slot = el('div', 'pslot');
      slot.append(icon(up.art, qualityColour(up.quality), 34), el('div', 'rank', String(rank)));
      slot.title = `${up.name} - rank ${rank}/${up.max}\n${up.description}`;
      wrap.append(slot);
    }
  };

  UI.updateHUD = function () {
    const game = WS.Game;
    if (!game.player || !game.run) return;
    const p = game.player, run = game.run, e = this.els;

    const hpPct = WS.clamp(p.health / p.maxHealth, 0, 1);
    e.aHP.style.strokeDashoffset = e.hpCirc * (1 - hpPct);
    e.aHP.style.stroke = hpPct < 0.28 ? '#ff5a4a' : 'var(--blood)';
    const xpPct = WS.clamp(p.xp / p.xpToNext, 0, 1);
    e.aXP.style.strokeDashoffset = -e.xpCirc * (1 - xpPct);
    e.lvl.textContent = 'LV ' + p.level;
    e.hpText.innerHTML = `${WS.max(0, WS.floor(p.health))}<small> / ${WS.floor(p.maxHealth)}</small>`;

    e.timeText.textContent = WS.formatTime(run.time);
    e.railFill.style.width = WS.min(100, run.time / WS.Config.deathTime * 100) + '%';
    const modeBits = [];
    if (run.hyper) modeBits.push('Hyper');
    if (run.mode === 'endless') modeBits.push('True Endless');
    else if (run.victorious) modeBits.push('Overtime');
    if (run.map.arena) modeBits.push('Eclipse Arena - Phase ' + WS.Arena.phase);
    e.mode.textContent = modeBits.join(' · ');

    e.goldV.textContent = WS.formatNumber(run.gold);
    e.killV.textContent = WS.formatNumber(run.kills);

    // Boss arc: whichever boss has the most health left is the one shown.
    let boss = null;
    for (let i = 0; i < WS.Enemy.pool.count; i++) {
      const en = WS.Enemy.pool.active[i];
      if (en.boss && (!boss || en.health > boss.health)) boss = en;
    }
    if (boss) {
      e.boss.classList.remove('hidden');
      e.bossName.textContent = boss.template.name;
      const pct = WS.clamp(boss.health / boss.maxHealth, 0, 1);
      e.bFill.style.strokeDashoffset = e.bossLen * (1 - pct);
    } else {
      e.boss.classList.add('hidden');
    }

    // Weapon cooldown arcs.
    for (const w of p.weapons) {
      const slot = e.weaponSlots.get(w.id);
      if (!slot) { this.rebuildWeapons(); break; }
      const total = WS.Weapon.cooldown(p, w);
      const k = WS.clamp(1 - w.cooldown / total, 0, 1);
      slot.arc.style.strokeDashoffset = slot.circ * (1 - k);
      const label = w.evolved ? 'MAX' : String(w.level);
      if (slot.rank.textContent !== label) {
        slot.rank.textContent = label;
        slot.slot.classList.toggle('evolved', !!w.evolved);
      }
    }
    if (e.weaponSlots.size !== p.weapons.length) this.rebuildWeapons();

    // Resource meters: fel while attuned, Metamorphosis while transformed.
    this.updateMeters(p);
    this.updateToasts();
  };

  UI.updateMeters = function (p) {
    const wrap = this.els.meters;
    const want = [];
    if (p.metaTimer > 0) {
      const total = WS.Config.metaDuration + WS.Config.metaDurationPerRank * p.soulRending;
      want.push({ key: 'meta', cls: 'meta', label: 'Metamorphosis', pct: p.metaTimer / total });
    } else if (p.felAttuned > 0) {
      want.push({ key: 'fel', cls: 'fel', label: 'Fel', pct: p.fel / WS.Config.felToMeta });
    }
    if (wrap.childElementCount !== want.length
      || (want.length && wrap.firstChild.dataset.key !== want[0].key)) {
      wrap.innerHTML = '';
      for (const m of want) {
        const node = el('div', 'meter ' + m.cls);
        node.dataset.key = m.key;
        const label = el('div', 'meter-label', m.label);
        const track = el('div', 'meter-track');
        const fill = el('div', 'meter-fill');
        track.append(fill);
        node.append(label, track);
        wrap.append(node);
      }
    }
    let i = 0;
    for (const m of want) {
      const fill = wrap.children[i].querySelector('.meter-fill');
      if (fill) fill.style.width = WS.clamp(m.pct, 0, 1) * 100 + '%';
      i++;
    }
  };

  UI.updateToasts = function () {
    const wrap = this.els.toasts;
    const live = WS.Game.toasts;
    if (wrap.childElementCount === live.length) return;
    wrap.innerHTML = '';
    for (const t of live) {
      const node = el('div', 'toast');
      node.append(el('div', 't-title', t.title));
      if (t.body) node.append(el('div', 't-body', t.body));
      wrap.append(node);
    }
  };

  /* ============================================================ overlays == */
  UI.closeOverlay = function () {
    this.overlay.classList.add('hidden');
    this.overlay.innerHTML = '';
    this.banishMode = false;
  };

  function shell(title, sub) {
    const inner = el('div', 'overlay-inner');
    const head = el('div', 'overlay-head');
    const h1 = el('h1', null, title);
    head.append(h1);
    if (sub) head.append(el('div', 'sub', sub));
    const body = el('div', 'overlay-body');
    const foot = el('div', 'overlay-foot');
    inner.append(head, body, foot);
    return { inner, head, body, foot };
  }

  UI.show = function (inner) {
    this.overlay.innerHTML = '';
    this.overlay.append(inner);
    this.overlay.classList.remove('hidden');
  };

  /* ------------------------------------------------------------- cards --- */
  function cardFor(choice, onPick) {
    const colour = choiceColour(choice);
    const card = el('div', 'card bracketed');
    card.style.setProperty('--q', WS.hex(colour));
    const img = icon(choice.art || 'rune', colour, 64);
    img.className = 'icon';
    card.append(img);
    card.append(el('div', 'card-name', choice.name));
    if (choice.note) card.append(el('div', 'card-note', choice.note));
    card.append(el('div', 'card-body', choice.description || ''));
    if (choice.detail && WS.Save.settings.levelUpTooltips) {
      card.append(el('div', 'card-detail', choice.detail));
    }
    card.addEventListener('click', () => onPick(choice));
    return card;
  }

  /* ---------------------------------------------------------- main menu -- */
  UI.openMenu = function () {
    this.hud.classList.add('hidden');
    const s = shell('WoWSurvivors 2', 'Arclight');

    const title = el('div'); title.id = 'title-wrap';
    const h = el('h1', 'game-title');
    h.innerHTML = 'WoW<b>Survivors</b> 2';
    const sub = el('div', 'game-sub', 'A Warcraft arcade survival game');
    title.append(h, sub);
    s.head.replaceChildren(title);

    const tabs = el('div', 'tabs');
    const panes = el('div');
    const TABS = [
      ['roster', 'Survivor'],
      ['battlefields', 'Battlefield'],
      ['trainer', 'Trainer'],
      ['codex', 'Codex'],
      ['bestiary', 'Bestiary'],
      ['stats', 'Statistics'],
      ['settings', 'Settings'],
    ];
    const render = () => {
      for (const btn of tabs.children) btn.classList.toggle('active', btn.dataset.tab === UI.tab);
      panes.replaceChildren(UI.buildPane(UI.tab, render));
    };
    for (const [id, label] of TABS) {
      const b = el('button', 'tab', label);
      b.dataset.tab = id;
      b.addEventListener('click', () => { UI.tab = id; WS.Audio.play('ui'); render(); });
      tabs.append(b);
    }
    s.body.append(tabs, panes);
    render();

    const bank = el('div', 'bank');
    bank.append(el('span', 'label', 'Banked'), el('span', 'v', WS.formatNumber(WS.Save.db.gold) + 'g'));

    const begin = el('button', 'btn primary', 'Begin Run');
    begin.addEventListener('click', () => {
      const c = WS.Game.selection.character, m = WS.Game.selection.map;
      if (!WS.Save.isCharacterUnlocked(c) || !WS.Save.isMapUnlocked(m)) return;
      WS.Audio.init(); WS.Audio.resume();
      WS.Audio.play('select');
      WS.Game.startRun(m, c);
    });

    const diff = el('button', 'btn', '');
    const setDiffLabel = () => {
      const d = WS.Config.difficulties[WS.Save.settings.difficulty];
      diff.textContent = 'Difficulty: ' + d.label;
    };
    setDiffLabel();
    diff.addEventListener('click', () => {
      const order = WS.Config.difficultyOrder;
      const i = order.indexOf(WS.Save.settings.difficulty);
      WS.Save.settings.difficulty = order[(i + 1) % order.length];
      WS.Save.save();
      setDiffLabel();
      WS.Audio.play('ui');
    });

    const hyper = el('button', 'btn', '');
    const setHyperLabel = () => {
      hyper.textContent = 'Hyper: ' + (WS.Save.db.hyperArmed ? 'ON' : 'off');
      hyper.disabled = !Object.keys(WS.Save.db.unlocks.hyper).length;
    };
    setHyperLabel();
    hyper.addEventListener('click', () => {
      WS.Save.db.hyperArmed = !WS.Save.db.hyperArmed;
      WS.Save.save(); setHyperLabel(); WS.Audio.play('ui');
    });

    s.foot.append(bank, el('div', 'spacer'), diff, hyper, begin);
    this.show(s.inner);
  };

  UI.buildPane = function (tab, rerender) {
    if (tab === 'roster') return this.paneRoster();
    if (tab === 'battlefields') return this.paneMaps();
    if (tab === 'trainer') return this.paneTrainer(rerender);
    if (tab === 'codex') return this.paneCodex();
    if (tab === 'bestiary') return this.paneBestiary();
    if (tab === 'stats') return this.paneStats();
    return this.paneSettings(rerender);
  };

  UI.paneRoster = function () {
    const grid = el('div', 'pick-grid');
    grid.style.marginTop = '16px';
    for (const id of WS.CharacterOrder) {
      const c = WS.Characters[id];
      const unlocked = WS.Save.isCharacterUnlocked(id);
      const node = el('div', 'pick' + (unlocked ? '' : ' locked')
        + (WS.Game.selection.character === id ? ' selected' : ''));
      const img = new Image();
      img.src = WS.Sprites.hero(id, unlocked ? c.color : [0.18, 0.19, 0.24], 46).toDataURL();
      img.width = img.height = 46;
      if (!unlocked) img.style.filter = 'brightness(.6) contrast(.7)';
      const main = el('div');
      main.append(el('div', 'pick-name', unlocked ? c.name : '???'));
      main.append(el('div', 'pick-sub', unlocked
        ? `${c.className} · ${WS.Weapons[c.weapon].name}`
        : c.unlockHint || 'Locked'));
      if (unlocked) {
        main.append(el('div', 'pick-sub', WS.template(c.perk, c)));
      }
      node.append(img, main);
      if (unlocked) {
        node.addEventListener('click', () => {
          WS.Game.selection.character = id;
          WS.Audio.play('select');
          for (const n of grid.children) n.classList.remove('selected');
          node.classList.add('selected');
        });
      }
      grid.append(node);
    }
    return grid;
  };

  UI.paneMaps = function () {
    const grid = el('div', 'pick-grid');
    grid.style.marginTop = '16px';
    for (const id of WS.MapOrder) {
      const m = WS.Maps[id];
      const unlocked = WS.Save.isMapUnlocked(id);
      const node = el('div', 'pick' + (unlocked ? '' : ' locked')
        + (WS.Game.selection.map === id ? ' selected' : ''));
      const art = { forest: 'leaf', plains: 'wheat', haunted: 'deadtree', savannah: 'sun', glacier: 'crystal', arena: 'sovereign' }[m.art] || 'rune';
      node.append(icon(art, m.groundAlt, 46));
      const main = el('div');
      main.append(el('div', 'pick-name', m.name));
      main.append(el('div', 'pick-sub', unlocked ? m.subtitle : (m.unlockHint || 'Locked')));
      if (unlocked) {
        const bits = [`Difficulty x${m.difficulty}`, `Gold x${m.goldMult}`];
        if (WS.Save.db.unlocks.hyper[id]) bits.push('Hyper unlocked');
        main.append(el('div', 'pick-sub', bits.join(' · ')));
      }
      node.append(main);
      if (unlocked) {
        node.addEventListener('click', () => {
          WS.Game.selection.map = id;
          WS.Audio.play('select');
          for (const n of grid.children) n.classList.remove('selected');
          node.classList.add('selected');
        });
      }
      grid.append(node);
    }
    return grid;
  };

  UI.paneTrainer = function (rerender) {
    const wrap = el('div');
    wrap.style.marginTop = '16px';
    const intro = el('div', 'card-body',
      'Permanent training, bought with banked gold and applied to every future run.');
    intro.style.marginBottom = '12px';
    const rows = el('div', 'rows');
    for (const id of WS.MetaUpgradeOrder) {
      const m = WS.MetaUpgrades[id];
      const rank = WS.Save.metaRank(id);
      const cost = WS.Save.metaCost(id);
      const row = el('div', 'row');
      row.append(icon(m.art, WS.CONST.COLORS.arc, 40));
      const main = el('div', 'row-main');
      main.append(el('div', 'row-name', m.name));
      main.append(el('div', 'row-sub', `${m.description} · Rank ${rank}/${m.max}`));
      if (m.max <= 10) {
        const pips = el('div', 'rank-pips');
        for (let i = 0; i < m.max; i++) {
          const pip = el('i');
          if (i < rank) pip.classList.add('on');
          pips.append(pip);
        }
        main.append(pips);
      }
      row.append(main);
      if (cost === null) {
        row.append(el('div', 'row-value', 'MAXED'));
      } else {
        const buy = el('button', 'btn small', `${WS.formatNumber(cost)}g`);
        buy.disabled = WS.Save.db.gold < cost;
        buy.addEventListener('click', () => {
          if (WS.Save.buyMeta(id)) { WS.Audio.play('coin'); rerender(); }
        });
        row.append(buy);
      }
      rows.append(row);
    }
    wrap.append(intro, rows);
    return wrap;
  };

  UI.paneCodex = function () {
    const wrap = el('div');
    wrap.style.marginTop = '16px';

    const achHead = el('h3'); achHead.className = 'panel-title'; achHead.style.padding = '0 0 10px';
    achHead.textContent = 'Achievements';
    const achRows = el('div', 'rows');
    for (const id of WS.AchievementOrder) {
      const a = WS.Achievements[id];
      const done = !!WS.Save.db.achievements[id];
      const row = el('div', 'row ' + (done ? 'done' : 'undone'));
      row.append(icon(a.art, done ? WS.CONST.QUALITY.uncommon : [0.35, 0.38, 0.45], 40));
      const main = el('div', 'row-main');
      main.append(el('div', 'row-name', a.name));
      main.append(el('div', 'row-sub', a.description));
      row.append(main);
      if (a.reward) row.append(el('div', 'row-value', WS.Achievements.rewardText(a)));
      achRows.append(row);
    }

    const comboHead = el('h3'); comboHead.className = 'panel-title'; comboHead.style.padding = '20px 0 10px';
    comboHead.textContent = 'Discoveries';
    const comboRows = el('div', 'rows');
    for (const id of WS.ComboOrder) {
      const c = WS.Combos[id];
      const found = !!WS.Save.db.combos[id];
      const row = el('div', 'row ' + (found ? 'done' : 'undone'));
      row.append(icon(found ? 'arcane' : 'rune', found ? WS.CONST.QUALITY.epic : [0.35, 0.38, 0.45], 40));
      const main = el('div', 'row-main');
      main.append(el('div', 'row-name', found ? c.name : '? ? ?'));
      main.append(el('div', 'row-sub', found
        ? `${WS.Weapons[c.weapons[0]].name} + ${WS.Weapons[c.weapons[1]].name} - ${WS.template(c.description, c)}`
        : c.hint));
      row.append(main);
      comboRows.append(row);
    }

    wrap.append(achHead, achRows, comboHead, comboRows);
    return wrap;
  };

  UI.paneBestiary = function () {
    const wrap = el('div');
    wrap.style.marginTop = '16px';
    const rows = el('div', 'rows');
    const all = [];
    for (const id of Object.keys(WS.Enemies)) all.push([id, WS.Enemies[id], 'Creature']);
    for (const id of Object.keys(WS.Elites)) all.push([id, WS.Elites[id], 'Elite']);
    for (const id of Object.keys(WS.Bosses)) all.push([id, WS.Bosses[id], 'Boss']);
    for (const [id, t, kind] of all) {
      const kills = WS.Save.stats.bestiary[id] || WS.Save.stats.bosses[id] || 0;
      const known = kills > 0;
      const row = el('div', 'row ' + (known ? '' : 'undone'));
      const img = new Image();
      img.src = WS.Sprites.creature(t.art, known ? t.tint : [0.3, 0.32, 0.38], 40).toDataURL();
      img.width = img.height = 40;
      row.append(img);
      const main = el('div', 'row-main');
      main.append(el('div', 'row-name', known ? t.name : '???'));
      main.append(el('div', 'row-sub', known
        ? `${kind} · ${t.family} · ${t.health} health · ${t.damage} damage`
        : `${kind} - not yet slain`));
      row.append(main);
      row.append(el('div', 'row-value', known ? `${WS.formatNumber(kills)} slain` : ''));
      rows.append(row);
    }
    wrap.append(rows);
    return wrap;
  };

  UI.paneStats = function () {
    const s = WS.Save.stats;
    const wrap = el('div');
    wrap.style.marginTop = '16px';
    const grid = el('div', 'stat-grid');
    const items = [
      ['Runs', WS.formatNumber(s.totalRuns)],
      ['Victories', WS.formatNumber(s.totalVictories)],
      ['Enemies slain', WS.formatNumber(s.totalKills)],
      ['Gold earned', WS.formatNumber(s.totalGold)],
      ['Gems gathered', WS.formatNumber(s.gemsCollected)],
      ['Time survived', WS.formatTime(s.totalTime)],
      ['Longest run', WS.formatTime(s.bestRunTime)],
      ['Highest level', WS.formatNumber(s.bestLevel)],
      ['Best damage in a run', WS.formatNumber(s.bestDamage)],
      ['Evolutions', WS.formatNumber(s.evolutions)],
      ['Unions forged', WS.formatNumber(s.unions)],
      ['Longest unhurt streak', WS.formatTime(s.bestNoHitStreak)],
    ];
    for (const [label, value] of items) {
      const node = el('div', 'stat');
      node.append(el('div', 'stat-value', value));
      node.append(el('div', 'label stat-label', label));
      grid.append(node);
    }
    const best = el('div', 'rows');
    best.style.marginTop = '16px';
    for (const id of WS.MapOrder) {
      if (!WS.Save.isMapUnlocked(id)) continue;
      const row = el('div', 'row');
      const main = el('div', 'row-main');
      main.append(el('div', 'row-name', WS.Maps[id].name));
      main.append(el('div', 'row-sub', 'Best survival time'));
      row.append(main, el('div', 'row-value', WS.formatTime(s.bestTime[id] || 0)));
      best.append(row);
    }
    wrap.append(grid, best);
    return wrap;
  };

  UI.paneSettings = function (rerender) {
    const wrap = el('div', 'rows');
    wrap.style.marginTop = '16px';
    const st = WS.Save.settings;

    const toggle = (key, name, desc) => {
      const row = el('div', 'setting');
      const main = el('div');
      main.append(el('div', 's-name', name));
      if (desc) main.append(el('div', 's-desc', desc));
      const sw = el('div', 'switch' + (st[key] ? ' on' : ''));
      sw.addEventListener('click', () => {
        st[key] = !st[key];
        sw.classList.toggle('on', st[key]);
        WS.Save.save();
        WS.Audio.applySettings();
        WS.Audio.play('ui');
      });
      row.append(main, sw);
      wrap.append(row);
    };

    const slider = (key, name) => {
      const row = el('div', 'setting');
      row.append(el('div', 's-name', name));
      const input = el('input');
      input.type = 'range'; input.min = 0; input.max = 1; input.step = 0.05;
      input.value = st[key];
      input.addEventListener('input', () => {
        st[key] = parseFloat(input.value);
        WS.Audio.applySettings();
      });
      input.addEventListener('change', () => WS.Save.save());
      row.append(input);
      wrap.append(row);
    };

    toggle('sound', 'Sound effects');
    slider('effectsVolume', 'Effects volume');
    toggle('music', 'Music');
    slider('musicVolume', 'Music volume');
    toggle('screenShake', 'Screen shake');
    toggle('damageNumbers', 'Floating damage numbers');
    toggle('healNumbers', 'Floating healing numbers');
    toggle('showHealthBars', 'Health bars on trash mobs', 'Elites and bosses always keep theirs.');
    toggle('levelUpTooltips', 'Detailed level-up cards');

    const danger = el('div', 'setting');
    const dmain = el('div');
    dmain.append(el('div', 's-name', 'Progress'));
    dmain.append(el('div', 's-desc', 'Unlocks, gold, Trainer ranks and statistics.'));
    const btns = el('div');
    btns.style.display = 'flex'; btns.style.gap = '8px';
    const unlockBtn = el('button', 'btn small', 'Unlock all');
    unlockBtn.addEventListener('click', () => { WS.Save.unlockAll(); rerender(); });
    const resetBtn = el('button', 'btn small', 'Wipe progress');
    resetBtn.addEventListener('click', () => {
      if (resetBtn.dataset.armed) { WS.Save.reset(); rerender(); }
      else { resetBtn.dataset.armed = '1'; resetBtn.textContent = 'Really wipe?'; }
    });
    btns.append(unlockBtn, resetBtn);
    danger.append(dmain, btns);
    wrap.append(danger);
    return wrap;
  };

  /* -------------------------------------------------------- run overlays -- */
  UI.openBlessing = function (choices) {
    const s = shell('Choose a Blessing', 'One boon, permanent for this run.');
    const row = el('div', 'card-row');
    for (const c of choices) row.append(cardFor(c, (choice) => WS.Game.chooseBlessing(choice)));
    s.body.append(row);
    this.show(s.inner);
  };

  UI.openLevelUp = function (choices) {
    const p = WS.Game.player;
    const s = shell('Level ' + p.level, WS.Game.pendingLevelUps > 1
      ? `${WS.Game.pendingLevelUps} level-ups pending` : 'Choose a boon.');
    const row = el('div', 'card-row');
    if (this.banishMode) row.classList.add('banish-mode');

    for (const c of choices) {
      row.append(cardFor(c, (choice) => {
        if (this.banishMode) {
          this.banishMode = false;
          if (!WS.Game.banishLevelUp(choice)) this.openLevelUp(WS.Game.levelChoices);
          return;
        }
        WS.Game.chooseLevelUp(choice);
      }));
    }

    const bar = el('div', 'choice-bar');
    const reroll = el('button', 'btn small', `Reroll (${p.rerolls})`);
    reroll.disabled = p.rerolls <= 0;
    reroll.addEventListener('click', () => { this.banishMode = false; WS.Game.rerollLevelUp(); });
    const banish = el('button', 'btn small', `Banish (${p.banishes})`);
    banish.disabled = p.banishes <= 0;
    banish.addEventListener('click', () => {
      this.banishMode = !this.banishMode;
      this.openLevelUp(WS.Game.levelChoices);
    });
    bar.append(reroll, banish);
    if (this.banishMode) {
      bar.append(el('span', 'label', 'Pick a card to banish it from this run'));
    }
    s.body.append(row);
    s.foot.append(el('div', 'spacer'), bar, el('div', 'spacer'));
    this.show(s.inner);
  };

  /* ---------------------------------------------------------- build sheet - */
  function buildSheet() {
    const p = WS.Game.player, run = WS.Game.run;
    const sheet = el('div', 'sheet');

    const left = el('div', 'panel bracketed');
    left.style.padding = '16px';
    left.append(el('h3', null, 'Arsenal'));
    for (const w of p.weapons) {
      const row = el('div', 'row');
      row.style.background = 'transparent';
      row.style.border = 'none';
      row.style.padding = '6px 0';
      row.append(icon(w.data.art, WS.Weapon.colour(w), 40));
      const main = el('div', 'row-main');
      main.append(el('div', 'row-name', (w.evolved ? w.data.evolveName : w.data.name)
        + (w.evolved ? '' : `  ·  rank ${w.level}/${WS.WEAPON_MAX_LEVEL}`)));
      const stats = WS.Weapon.describe(p, w);
      main.append(el('div', 'row-sub', stats.map(([k, v]) => `${k} ${v}`).join('   ·   ')));
      if (!w.evolved && w.data.evolvePairing) {
        const pair = WS.Upgrades[w.data.evolvePairing];
        const has = (p.upgradeLevels[w.data.evolvePairing] || 0) > 0;
        main.append(el('div', 'row-sub',
          `Evolves with ${pair.name}${has ? ' (learned)' : ''} into ${w.data.evolveName}`));
      }
      row.append(main);
      left.append(row);
    }

    const right = el('div', 'panel bracketed');
    right.style.padding = '16px';
    right.append(el('h3', null, 'Survivor'));
    const kv = (k, v) => {
      const line = el('div', 'kv');
      line.append(el('span', null, k), el('span', null, String(v)));
      right.append(line);
    };
    kv('Health', `${WS.floor(p.health)} / ${WS.floor(p.maxHealth)}`);
    kv('Armor', `${p.armor} (${WS.round(p.armor / (p.armor + WS.Config.armorConstant) * 100)}% reduction)`);
    kv('Damage', `x${p.damageMultiplier.toFixed(2)}`);
    kv('Cooldowns', `x${p.cooldownMultiplier.toFixed(2)}`);
    kv('Effect area', `x${p.areaMultiplier.toFixed(2)}`);
    kv('Move speed', WS.round(p.moveSpeed));
    kv('Crit', `${WS.round(p.critChance * 100)}% for x${p.critDamage.toFixed(2)}`);
    kv('Projectiles', `+${p.projectileBonus}`);
    kv('Pickup radius', WS.round(p.pickupRadius));
    kv('Luck', `x${p.luck.toFixed(2)}`);
    kv('Experience', `x${p.xpMultiplier.toFixed(2)}`);
    kv('Gold', `x${p.goldMultiplier.toFixed(2)}`);
    if (p.healthRegen > 0) kv('Regeneration', p.healthRegen.toFixed(1) + '/s');
    if (p.dodgeChance > 0) kv('Evasion', WS.round(p.dodgeChance * 100) + '%');
    if (p.lifesteal > 0) kv('Lifesteal', (p.lifesteal * 100).toFixed(1) + '%');
    if (p.desecration > 0) kv('Desecration dealt', WS.formatNumber(p.desecrationDealt));
    if (p.felAttuned > 0) kv('Metamorphoses', p.metamorphoses);
    if (p.blessingNames.length) kv('Blessings', p.blessingNames.join(', '));

    right.append(el('h3', null, 'Run'));
    kv('Time', WS.formatTime(run.time));
    kv('Slain', WS.formatNumber(run.kills));
    kv('Bosses', run.bossesSlain);
    kv('Damage dealt', WS.formatNumber(run.damageDone));
    kv('Damage taken', WS.formatNumber(run.damageTaken));
    kv('Damage prevented', WS.formatNumber(run.damagePrevented));
    kv('Healing', WS.formatNumber(run.healingDone));
    kv('Gold this run', WS.formatNumber(run.gold));

    // The damage meter, largest first.
    const meter = el('div');
    meter.append(el('h3', null, 'Damage meter'));
    const entries = Object.entries(run.damageByWeapon).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((sum, e) => sum + e[1], 0) || 1;
    for (const [key, value] of entries.slice(0, 10)) {
      const w = WS.Weapons[key];
      const label = w ? w.name : key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
      const line = el('div', 'kv');
      line.append(el('span', null, label),
        el('span', null, `${WS.formatNumber(value)}  (${WS.round(value / total * 100)}%)`));
      meter.append(line);
    }
    right.append(meter);

    sheet.append(left, right);
    return sheet;
  }

  UI.openPause = function () {
    const s = shell('Paused', WS.Game.run.map.name);
    s.body.append(buildSheet());
    const resume = el('button', 'btn primary', 'Resume');
    resume.addEventListener('click', () => WS.Game.resume());
    const quit = el('button', 'btn', 'Abandon run');
    quit.addEventListener('click', () => {
      if (quit.dataset.armed) WS.Game.endRun('abandoned');
      else { quit.dataset.armed = '1'; quit.textContent = 'Really abandon?'; }
    });
    s.foot.append(el('div', 'spacer'), quit, resume);
    this.show(s.inner);
  };

  UI.openVictory = function () {
    const s = shell('Victory', `${WS.Game.run.map.name} survived. Hyper Mode unlocked.`);
    s.body.append(buildSheet());
    const claim = el('button', 'btn primary', 'Claim the win');
    claim.addEventListener('click', () => WS.Game.endRun('victory'));
    const fight = el('button', 'btn', 'Fight to the end');
    fight.addEventListener('click', () => {
      WS.Game.run.victorious = true;
      WS.Game.running = true;
      WS.Game.state = 'playing';
      UI.closeOverlay();
      WS.Game.announce('Overtime', 'Death arrives at 30:00.', 3.0);
    });
    const endless = el('button', 'btn', 'True Endless');
    endless.addEventListener('click', () => WS.Game.continueEndless());
    s.foot.append(el('div', 'spacer'), fight, endless, claim);
    this.show(s.inner);
  };

  UI.openGameOver = function (reason) {
    const run = WS.Game.run;
    const titles = {
      defeated: 'Defeated',
      victory: 'Victory',
      abandoned: 'Run abandoned',
      arena_victory: 'The Eclipse Breaks',
    };
    const sub = reason === 'defeated'
      ? `Slain by ${run.killedBy ? run.killedBy.name : 'the endless horde'} at ${WS.formatTime(run.time)}.`
      : `${WS.formatTime(run.time)} on ${run.map.name}.`;
    const s = shell(titles[reason] || 'Run over', sub);
    s.body.append(buildSheet());
    const again = el('button', 'btn primary', 'Run again');
    again.addEventListener('click', () => WS.Game.startRun(run.mapId, run.characterId));
    const menu = el('button', 'btn', 'Main menu');
    menu.addEventListener('click', () => WS.Game.quitToMenu());
    const banked = el('div', 'bank');
    banked.append(el('span', 'label', 'Banked this run'),
      el('span', 'v', WS.formatNumber(run.gold) + 'g'));
    s.foot.append(banked, el('div', 'spacer'), menu, again);
    this.show(s.inner);
  };

  /* ------------------------------------------------------------- wiring -- */
  UI.init = function (root, overlay, hud) {
    this.root = root; this.overlay = overlay; this.hud = hud;
    this.buildHUD();

    WS.Input.onKey = (e) => {
      if (e.code === 'Escape') {
        if (WS.Game.state === 'playing') WS.Game.pause();
        else if (WS.Game.state === 'paused') WS.Game.resume();
        return;
      }
      if (WS.Game.state === 'levelup' || WS.Game.state === 'blessing') {
        // 1-3 pick a card; R rerolls; B arms the banish.
        const idx = { Digit1: 0, Digit2: 1, Digit3: 2 }[e.code];
        const cards = this.overlay.querySelectorAll('.card');
        if (idx !== undefined && cards[idx]) { cards[idx].click(); return; }
        if (e.code === 'KeyR' && WS.Game.state === 'levelup') WS.Game.rerollLevelUp();
        if (e.code === 'KeyB' && WS.Game.state === 'levelup') {
          this.banishMode = !this.banishMode;
          this.openLevelUp(WS.Game.levelChoices);
        }
      }
    };
  };

  WS.UI = UI;

})(window.WS);
