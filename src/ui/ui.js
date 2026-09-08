/* The Arclight UI layer: the illuminated spread, the candlelit HUD, and the
 * cards. The DOM owns everything that is text or chrome; the canvas owns the
 * world. This layer reads game state and never mutates the simulation - it
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

  /** Ranks and levels are set in Roman, as the design has them. */
  const ROMAN = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  function roman(n) {
    n = WS.floor(n);
    if (n <= 0) return '-';
    let out = '';
    for (const [v, s] of ROMAN) { while (n >= v) { out += s; n -= v; } }
    return out;
  }
  UI.roman = roman;

  function icon(art, colour, size) {
    const img = new Image();
    img.src = WS.Icons.url(art, colour, size || 64);
    img.alt = '';
    return img;
  }

  /** A gilt-edged gable tile with an arbitrary face inside. */
  function gable(cls, variant) {
    const wrap = el('div', cls);
    const pane = el('div', 'pane');
    if (variant) { wrap.style.clipPath = variant; pane.style.clipPath = variant; }
    wrap.append(pane);
    wrap.face = pane;   // callers keep saying .face; the class must not collide
    return wrap;
  }

  function ornament(text) {
    const o = el('div', 'ornament');
    o.append(el('div', 'bar l'), el('div', 'lozenge'),
      el('div', 'text', text), el('div', 'lozenge'), el('div', 'bar r'));
    return o;
  }

  function leader(k, v) {
    const line = el('div', 'leader');
    line.append(el('span', 'k', k), el('span', 'dots'), el('span', 'v', String(v)));
    return line;
  }

  /* ================================================================= HUD == */
  UI.buildHUD = function () {
    const hud = this.hud;
    hud.innerHTML = '';

    /* -- the experience rail ---------------------------------------------- */
    const top = el('div'); top.id = 'hud-top';
    const rail = el('div'); rail.id = 'xp-rail';
    const xpFill = el('div', 'fill');
    const xpHead = el('div', 'head');
    rail.append(xpFill, xpHead);
    const underline = el('div'); underline.id = 'xp-underline';

    const row = el('div'); row.id = 'hud-row';

    /* -- who ------------------------------------------------------------- */
    const who = el('div'); who.id = 'hud-who';
    const portrait = gable('gable'); portrait.id = 'hud-portrait';
    const vitals = el('div'); vitals.id = 'hud-vitals';
    const nameLine = el('div', 'line');
    const whoName = el('span', 'who', '');
    const lvl = el('span', 'lvl', 'LVL I');
    nameLine.append(whoName, lvl);
    const hpBar = el('div'); hpBar.id = 'hp-bar';
    const hpFill = el('div', 'fill');
    hpBar.append(hpFill);
    const hpText = el('div'); hpText.id = 'hp-text';
    const meters = el('div'); meters.id = 'hud-meters';
    vitals.append(nameLine, hpBar, hpText, meters);
    who.append(portrait, vitals);

    /* -- clock + boss ----------------------------------------------------- */
    const clockWrap = el('div'); clockWrap.id = 'hud-clock';
    const clock = el('div', null, '0:00'); clock.id = 'clock';
    const boss = el('div', 'hidden'); boss.id = 'hud-boss';
    const bossBar = el('div'); bossBar.id = 'boss-bar';
    const bossFill = el('div', 'fill');
    const bossName = el('div', 'name', '');
    bossBar.append(bossFill, el('div', 'ticks'), bossName);
    boss.append(el('div', 'orb'), bossBar, el('div', 'orb'));
    clockWrap.append(clock, boss);

    /* -- tallies ---------------------------------------------------------- */
    const tallies = el('div'); tallies.id = 'hud-tallies';
    const mkTally = (key, label, cls) => {
      const t = el('div', 'tally' + (cls ? ' ' + cls : ''));
      const v = el('div', 'v', '0');
      t.append(el('div', 'k', label), v);
      tallies.append(t);
      return v;
    };
    const slainV = mkTally('slain', 'SLAIN');
    const dpsV = mkTally('dps', 'DPS', 'dmg');
    const hpsV = mkTally('hps', 'HPS', 'heal');
    const goldV = mkTally('gold', 'GOLD', 'gold');

    row.append(who, clockWrap, tallies);
    top.append(rail, underline, row);

    /* -- foot -------------------------------------------------------------- */
    const foot = el('div'); foot.id = 'hud-foot';
    const arms = el('div'); arms.id = 'hud-arms';
    const diff = el('div'); diff.id = 'hud-diff';
    const passives = el('div'); passives.id = 'hud-passives';
    foot.append(arms, diff, passives);

    const toasts = el('div'); toasts.id = 'hud-toasts';

    hud.append(top, foot, toasts);

    this.els = {
      xpFill, xpHead, portrait, whoName, lvl, hpFill, hpText, meters,
      clock, boss, bossFill, bossName,
      slainV, dpsV, hpsV, goldV,
      arms, diff, passives, toasts,
      armSlots: new Map(),
    };
  };

  UI.enterGame = function () {
    this.closeOverlay();
    this.hud.classList.remove('hidden');
    const p = WS.Game.player;
    const e = this.els;
    e.portrait.face.innerHTML = '';
    const img = new Image();
    img.src = WS.Sprites.hero(p.characterId, p.character.color, 44).toDataURL();
    e.portrait.face.append(img);
    e.whoName.textContent = p.character.name;
    this._passiveSig = null;
    this.rebuildArms();
    this.rebuildPassives();
  };

  UI.rebuildArms = function () {
    const wrap = this.els.arms;
    wrap.innerHTML = '';
    this.els.armSlots.clear();
    for (const w of WS.Game.player.weapons) {
      const slot = gable('arm');
      if (w.evolved) slot.classList.add('evolved');
      const img = icon(w.data.art, WS.Weapon.colour(w), 40);
      const rank = el('div', 'rank', w.evolved ? '*' : roman(w.level));
      slot.face.append(img, rank);
      slot.title = `${w.evolved ? w.data.evolveName : w.data.name}\n${w.data.description}`;
      wrap.append(slot);
      this.els.armSlots.set(w.id, { slot, rank });
    }
    // Empty scabbards, so the six slots always read as a fixed hand.
    for (let i = WS.Game.player.weapons.length; i < WS.MAX_WEAPONS; i++) {
      const slot = gable('arm');
      slot.style.opacity = '.32';
      wrap.append(slot);
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
      const rune = el('div', 'rune');
      rune.append(icon(up.art, WS.CONST.COLORS.arc, 24), el('div', 'rank', roman(rank)));
      rune.title = `${up.name} - rank ${roman(rank)}/${roman(up.max)}\n${up.description}`;
      wrap.append(rune);
    }
  };

  UI.updateHUD = function () {
    const game = WS.Game;
    if (!game.player || !game.run) return;
    const p = game.player, run = game.run, e = this.els;

    const xpPct = WS.clamp(p.xp / p.xpToNext, 0, 1) * 100;
    e.xpFill.style.right = (100 - xpPct) + '%';
    e.xpHead.style.left = xpPct + '%';

    const hpPct = WS.clamp(p.health / p.maxHealth, 0, 1) * 100;
    e.hpFill.style.right = (100 - hpPct) + '%';
    e.hpText.textContent = `${WS.max(0, WS.floor(p.health))} / ${WS.floor(p.maxHealth)}`;
    e.lvl.textContent = 'LVL ' + roman(p.level);

    e.clock.textContent = WS.formatTime(run.time);

    e.slainV.textContent = WS.formatNumber(run.kills);
    e.dpsV.textContent = WS.formatNumber(run.dps);
    e.hpsV.textContent = WS.formatNumber(run.hps);
    e.goldV.textContent = WS.formatNumber(run.gold);

    // Whichever boss has the most health left is the one the bar tracks.
    let boss = null;
    for (let i = 0; i < WS.Enemy.pool.count; i++) {
      const en = WS.Enemy.pool.active[i];
      if (en.boss && (!boss || en.health > boss.health)) boss = en;
    }
    if (boss) {
      e.boss.classList.remove('hidden');
      e.bossName.textContent = boss.template.name;
      const pct = WS.clamp(boss.health / boss.maxHealth, 0, 1) * 100;
      e.bossFill.style.right = (100 - pct) + '%';
    } else {
      e.boss.classList.add('hidden');
    }

    let sig = '';
    for (const id of WS.UpgradeOrder) {
      const r = p.upgradeLevels[id];
      if (r) sig += id + r + ',';
    }
    if (sig !== this._passiveSig) { this._passiveSig = sig; this.rebuildPassives(); }

    // Ranks change on level-up; the hand is rebuilt when its shape changes.
    if (e.armSlots.size !== p.weapons.length) this.rebuildArms();
    else {
      for (const w of p.weapons) {
        const slot = e.armSlots.get(w.id);
        if (!slot) { this.rebuildArms(); break; }
        const label = w.evolved ? '*' : roman(w.level);
        if (slot.rank.textContent !== label) {
          slot.rank.textContent = label;
          slot.slot.classList.toggle('evolved', !!w.evolved);
        }
      }
    }

    const bits = [];
    const d = WS.Config.difficulties[WS.Save.settings.difficulty];
    bits.push(run.hyper ? 'Hyper' : d.label);
    bits.push(run.map.name);
    if (run.map.arena) bits.push('the eclipse holds - phase ' + roman(WS.Arena.phase));
    else if (run.mode === 'endless') bits.push('Death does not arrive');
    else if (run.time >= WS.Config.deathTime) bits.push('Death walks');
    else bits.push('Death arrives in ' + WS.formatTime(WS.Config.deathTime - run.time));
    e.diff.textContent = bits.join(' · ');

    this.updateMeters(p);
    this.updateToasts();
  };

  UI.updateMeters = function (p) {
    const wrap = this.els.meters;
    const want = [];
    if (p.metaTimer > 0) {
      const total = WS.Config.metaDuration + WS.Config.metaDurationPerRank * p.soulRending;
      want.push({ key: 'meta', cls: 'meta', label: 'METAMORPHOSIS', pct: p.metaTimer / total });
    } else if (p.felAttuned > 0) {
      want.push({ key: 'fel', cls: 'fel', label: 'FEL', pct: p.fel / WS.Config.felToMeta });
    }
    if (wrap.childElementCount !== want.length
      || (want.length && wrap.firstChild.dataset.key !== want[0].key)) {
      wrap.innerHTML = '';
      for (const m of want) {
        const node = el('div', 'meter ' + m.cls);
        node.dataset.key = m.key;
        const track = el('div', 'track');
        track.append(el('div', 'fill'));
        node.append(el('div', 'label', m.label), track);
        wrap.append(node);
      }
    }
    let i = 0;
    for (const m of want) {
      const fill = wrap.children[i].querySelector('.fill');
      if (fill) fill.style.right = (100 - WS.clamp(m.pct, 0, 1) * 100) + '%';
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
      node.append(el('div', 't', t.title));
      if (t.body) node.append(el('div', 'b', t.body));
      wrap.append(node);
    }
  };

  /* ============================================================ overlays == */
  UI.closeOverlay = function () {
    if (this.els.toasts) this.els.toasts.style.opacity = '';
    this.overlay.classList.add('hidden');
    this.overlay.classList.remove('band');
    this.overlay.innerHTML = '';
    this.banishMode = false;
  };

  UI.show = function (node, band) {
    this.overlay.innerHTML = '';
    this.overlay.classList.toggle('band', !!band);
    if (this.els.toasts) this.els.toasts.style.opacity = band ? '0' : '';
    this.overlay.append(node);
    this.overlay.classList.remove('hidden');
  };

  /** A gilt-framed spread of one or two parchment pages. */
  function spread(single) {
    const s = el('div', 'spread' + (single ? ' single' : ''));
    for (const c of ['tl', 'tr', 'bl', 'br']) s.append(el('div', 'rivet ' + c));
    return s;
  }

  function page(right) {
    const p = el('div', 'page' + (right ? ' right' : ''));
    return p;
  }

  function pageHead(sigil, title, sub, kicker) {
    const head = el('div', 'page-head');
    if (sigil) head.append(el('div', 'sigil', sigil));
    const box = el('div');
    box.style.paddingTop = '2px';
    if (kicker) box.append(el('div', 'kicker kicker-ink', kicker));
    box.append(el('h2', null, title));
    if (sub) box.append(el('div', 'sub', sub));
    head.append(box);
    return head;
  }

  /* --------------------------------------------------------------- cards - */
  function cardFor(choice, onPick, arcanaNumeral) {
    const card = el('button', 'card' + (arcanaNumeral ? ' arcana' : ''));
    card.style.transform = `rotate(${choice._rot || 0}deg)`;
    const edge = el('div', 'edge');
    const face = el('div', 'face');

    if (arcanaNumeral) {
      const head = el('div');
      head.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:7px;flex:none';
      head.append(el('span', 'numeral-mark', arcanaNumeral), el('div', 'hr'));
      face.append(head);

      const plate = gable('plate-gable');
      plate.classList.add('plate');
      const img = new Image();
      img.src = WS.Icons.glyph(choice.art || 'rune',
        choice.colour || WS.CONST.COLORS.arc, 104).toDataURL();
      plate.face.append(img);
      face.append(plate);
    } else if (choice.kicker) {
      face.append(el('span', 'kick', choice.kicker));
    }

    face.append(el('div', 'name', choice.name));
    if (!arcanaNumeral) face.append(el('div', 'hr'));

    face.append(el('p', 'body', choice.description || ''));
    if (choice.foot) face.append(el('div', 'foot', choice.foot));

    edge.append(face);
    card.append(edge);
    card.addEventListener('click', () => onPick(choice));
    return card;
  }

  /** School palette for weapons, quality for everything else. */
  function choiceColour(choice) {
    if (choice.school) return WS.CONST.COLORS[choice.school];
    if (choice.quality) return WS.CONST.QUALITY[choice.quality] || WS.CONST.QUALITY.common;
    return WS.CONST.COLORS.arc;
  }

  /** Turns a level-up choice into card copy in the manuscript's voice. */
  function dressChoice(c, i) {
    const kickers = {
      weapon_rank: 'WEAPON · RANK ',
      evolve: 'EVOLUTION',
      union: 'UNION',
      new_weapon: 'WEAPON · NEW',
      stat: 'PASSIVE · ',
      bread: 'PROVISION',
      limit_break: 'BEYOND THE LIMIT',
      blessing: 'ARCANUM',
    };
    const d = Object.assign({}, c);
    d.colour = choiceColour(c);
    d._rot = [-1.8, 0.4, 1.9][i % 3];
    if (c.type === 'weapon_rank') {
      const w = WS.Player.getWeapon(WS.Game.player, c.id);
      d.kicker = kickers.weapon_rank + roman((w ? w.level : 0) + 1);
      const pair = WS.Weapons[c.id].evolvePairing;
      d.foot = pair
        ? `Pairs with ${WS.Upgrades[pair].name} → ${WS.Weapons[c.id].evolveName} at rank ${roman(WS.WEAPON_MAX_LEVEL)}`
        : 'Already beyond ranking';
    } else if (c.type === 'stat') {
      const rank = (WS.Game.player.upgradeLevels[c.id] || 0) + 1;
      d.kicker = (rank === 1 ? 'PASSIVE · NEW' : kickers.stat + 'RANK ' + roman(rank));
      d.foot = c.detail && WS.Save.settings.levelUpTooltips ? c.detail : `Rank ${roman(rank)} of ${roman(WS.Upgrades[c.id].max)}`;
    } else if (c.type === 'new_weapon') {
      d.kicker = kickers.new_weapon;
      const pair = WS.Weapons[c.id].evolvePairing;
      d.foot = pair ? `Pairs with ${WS.Upgrades[pair].name} → ${WS.Weapons[c.id].evolveName}` : '';
    } else if (c.type === 'evolve') {
      d.kicker = kickers.evolve;
      d.foot = c.note;
    } else if (c.type === 'union') {
      d.kicker = kickers.union;
      d.foot = c.note;
    } else {
      d.kicker = kickers[c.type] || '';
      d.foot = c.note || '';
    }
    return d;
  }

  /* ------------------------------------------------------- the main menu - */
  UI.openMenu = function () {
    this.hud.classList.add('hidden');
    const sheet = el('div', 'sheet');
    const sp = spread();

    const left = page();
    const right = page(true);
    sp.append(left, right);
    sheet.append(sp);

    const TABS = [
      ['roster', 'The Roster'],
      ['battlefields', 'Battlefields'],
      ['trainer', 'The Trainer'],
      ['codex', 'The Codex'],
      ['bestiary', 'Bestiary'],
      ['annals', 'Annals'],
      ['rites', 'Rites'],
    ];

    const render = () => {
      left.innerHTML = '';
      right.innerHTML = '';

      const seal = el('div', 'seal');
      seal.append(el('div', 'k', 'RUN'), el('div', 'v', String(WS.Save.stats.totalRuns + 1)));
      left.append(seal);

      const tabs = el('div', 'tabs');
      for (const [id, label] of TABS) {
        const b = el('button', 'tab' + (UI.tab === id ? ' active' : ''), label);
        b.addEventListener('click', () => { UI.tab = id; WS.Audio.play('ui'); render(); });
        tabs.append(b);
      }

      const heads = {
        roster: ['Survivors of the Endless Night', 'The Roster'],
        battlefields: ['Where the night falls', 'The Battlefields'],
        trainer: ['Lessons paid for in gold', 'The Trainer'],
        codex: ['What has been done, and found', 'The Codex'],
        bestiary: ['Everything that has come for you', 'The Bestiary'],
        annals: ['The account of every run', 'The Annals'],
        rites: ['How the night is set', 'The Rites'],
      };
      const [kick, title] = heads[UI.tab];
      const unlockedCount = WS.CharacterOrder.filter((c) => WS.Save.isCharacterUnlocked(c)).length;
      const head = pageHead('S', title, UI.tab === 'roster'
        ? `${unlockedCount} of ${WS.CharacterOrder.length} have answered.`
          + (unlockedCount < WS.CharacterOrder.length
            ? ` ${WS.CharacterOrder.length - unlockedCount} remain sealed.` : '')
        : null, kick);
      left.append(head, tabs);

      const body = el('div', 'page-body');
      left.append(body);
      UI.buildLeft(UI.tab, body, render, right);
    };
    render();

    this.show(sheet);
  };

  /** Fills the left page for a tab, and seeds the right page with its detail. */
  UI.buildLeft = function (tab, body, render, right) {
    if (tab === 'roster') {
      const rows = el('div', 'rows');
      for (const id of WS.CharacterOrder) {
        const c = WS.Characters[id];
        const unlocked = WS.Save.isCharacterUnlocked(id);
        const row = el('div', 'entry' + (unlocked ? '' : ' locked')
          + (WS.Game.selection.character === id ? ' selected' : ''));
        row.append(el('div', 'mark'));
        row.append(el('span', 'cls', c.className.toUpperCase()));
        const box = el('div');
        box.style.cssText = 'display:flex;flex-direction:column;gap:2px';
        box.append(el('span', 'name', unlocked ? c.name : '—'),
          el('span', 'title', unlocked ? c.title : (c.unlockHint || 'Sealed')));
        row.append(box);
        if (unlocked) {
          row.addEventListener('click', () => {
            WS.Game.selection.character = id;
            WS.Audio.play('select');
            for (const n of rows.children) n.classList.remove('selected');
            row.classList.add('selected');
            UI.buildSurvivorPage(right, render);
          });
        }
        rows.append(row);
      }
      body.append(rows);
      UI.buildSurvivorPage(right, render);

    } else if (tab === 'battlefields') {
      const rows = el('div', 'rows');
      for (const id of WS.MapOrder) {
        const m = WS.Maps[id];
        const unlocked = WS.Save.isMapUnlocked(id);
        const row = el('div', 'entry' + (unlocked ? '' : ' locked')
          + (WS.Game.selection.map === id ? ' selected' : ''));
        row.append(el('div', 'mark'));
        row.append(el('span', 'cls', 'DIFFICULTY ' + roman(WS.round(m.difficulty * 2) - 1)));
        const box = el('div');
        box.style.cssText = 'display:flex;flex-direction:column;gap:2px';
        box.append(el('span', 'name', m.name),
          el('span', 'title', unlocked ? m.subtitle : (m.unlockHint || 'Sealed')));
        row.append(box);
        if (unlocked) {
          row.addEventListener('click', () => {
            WS.Game.selection.map = id;
            WS.Audio.play('select');
            for (const n of rows.children) n.classList.remove('selected');
            row.classList.add('selected');
            UI.buildSurvivorPage(right, render);
          });
        }
        rows.append(row);
      }
      body.append(rows);
      UI.buildSurvivorPage(right, render);

    } else if (tab === 'trainer') {
      const rows = el('div', 'rows');
      for (const id of WS.MetaUpgradeOrder) {
        const m = WS.MetaUpgrades[id];
        const rank = WS.Save.metaRank(id);
        const cost = WS.Save.metaCost(id);
        const row = el('div', 'row');
        const g = icon(m.art, WS.CONST.COLORS.arc, 36); g.className = 'glyph';
        row.append(g);
        const main = el('div', 'main');
        main.append(el('div', 'n', m.name), el('div', 's', m.description));
        if (m.max <= 10) {
          const pips = el('div', 'pips');
          for (let i = 0; i < m.max; i++) {
            const pip = el('i');
            if (i < rank) pip.classList.add('on');
            pips.append(pip);
          }
          main.append(pips);
        } else {
          main.append(el('div', 's', `${rank} of ${m.max} kept`));
        }
        row.append(main);
        if (cost === null) row.append(el('div', 'v', 'KEPT'));
        else {
          const buy = el('button', 'chip', `${WS.formatNumber(cost)} g`);
          buy.disabled = WS.Save.db.gold < cost;
          buy.addEventListener('click', () => {
            if (WS.Save.buyMeta(id)) { WS.Audio.play('coin'); render(); }
          });
          row.append(buy);
        }
        rows.append(row);
      }
      body.append(rows);
      UI.buildSurvivorPage(right, render);

    } else if (tab === 'codex') {
      const rows = el('div', 'rows');
      for (const id of WS.AchievementOrder) {
        const a = WS.Achievements[id];
        const done = !!WS.Save.db.achievements[id];
        const row = el('div', 'row ' + (done ? 'done' : 'dim'));
        const g = icon(a.art, done ? [0.11, 0.36, 0.27] : [0.35, 0.3, 0.24], 36); g.className = 'glyph';
        row.append(g);
        const main = el('div', 'main');
        main.append(el('div', 'n', a.name), el('div', 's', a.description));
        row.append(main);
        if (a.reward) row.append(el('div', 'v', WS.Achievements.rewardText(a)));
        rows.append(row);
      }
      body.append(rows);
      UI.buildDiscoveriesPage(right);

    } else if (tab === 'bestiary') {
      const rows = el('div', 'rows');
      const all = [];
      for (const id of Object.keys(WS.Enemies)) all.push([id, WS.Enemies[id], 'Creature']);
      for (const id of Object.keys(WS.Elites)) all.push([id, WS.Elites[id], 'Elite']);
      for (const id of Object.keys(WS.Bosses)) all.push([id, WS.Bosses[id], 'Boss']);
      for (const [id, t, kind] of all) {
        const kills = WS.Save.stats.bestiary[id] || WS.Save.stats.bosses[id] || 0;
        const known = kills > 0;
        const row = el('div', 'row ' + (known ? '' : 'dim'));
        const img = new Image();
        img.className = 'glyph';
        img.src = WS.Sprites.creature(t.art, known ? t.tint : [0.3, 0.26, 0.22], 36).toDataURL();
        row.append(img);
        const main = el('div', 'main');
        main.append(el('div', 'n', known ? t.name : '—'),
          el('div', 's', known
            ? `${kind} · ${t.family} · ${t.health} health · ${t.damage} damage`
            : `${kind} — not yet slain`));
        row.append(main);
        if (known) row.append(el('div', 'v', WS.formatNumber(kills)));
        rows.append(row);
      }
      body.append(rows);
      UI.buildSurvivorPage(right, render);

    } else if (tab === 'annals') {
      const s = WS.Save.stats;
      const figures = el('div', 'figures');
      const items = [
        ['Runs', WS.formatNumber(s.totalRuns)],
        ['Victories', WS.formatNumber(s.totalVictories)],
        ['Slain', WS.formatNumber(s.totalKills)],
        ['Gold earned', WS.formatNumber(s.totalGold)],
        ['Gems gathered', WS.formatNumber(s.gemsCollected)],
        ['Time survived', WS.formatTime(s.totalTime)],
        ['Longest run', WS.formatTime(s.bestRunTime)],
        ['Highest level', roman(s.bestLevel)],
        ['Best damage', WS.formatNumber(s.bestDamage)],
        ['Evolutions', WS.formatNumber(s.evolutions)],
        ['Unions forged', WS.formatNumber(s.unions)],
        ['Longest unhurt', WS.formatTime(s.bestNoHitStreak)],
      ];
      for (const [k, v] of items) {
        const f = el('div', 'f');
        f.append(el('div', 'v', v), el('div', 'k', k));
        figures.append(f);
      }
      body.append(figures);
      UI.buildSurvivorPage(right, render);

    } else {
      UI.buildRites(body, render);
      UI.buildSurvivorPage(right, render);
    }
  };

  /** The right-hand page: the chosen survivor, their field and the schedule. */
  UI.buildSurvivorPage = function (right, render) {
    right.innerHTML = '';
    const id = WS.Game.selection.character;
    const mapId = WS.Game.selection.map;
    const c = WS.Characters[id];
    const map = WS.Maps[mapId];

    const wrap = el('div', 'page-body');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:18px';

    const top = el('div');
    top.style.cssText = 'display:flex;gap:22px';
    const plate = gable('plate-gable');
    plate.style.cssText = 'width:158px;height:210px;flex:none';
    const heroImg = new Image();
    heroImg.src = WS.Sprites.hero(id, c.color, 130).toDataURL();
    heroImg.style.cssText = 'width:130px;height:130px';
    plate.face.append(heroImg);

    const bio = el('div');
    bio.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding-top:6px';
    bio.append(el('span', 'kicker kicker-blood',
      `${c.className.toUpperCase()} · ${WS.Weapons[c.weapon].name.toUpperCase()}`));
    const h = el('div', null, c.name);
    h.style.cssText = "font:500 38px/1 var(--title);letter-spacing:.02em;color:var(--ink)";
    const t = el('div', null, c.title);
    t.style.cssText = "font:400 19px var(--prose);font-style:italic;color:var(--ink-dim)";
    const d = el('p', null, c.description);
    d.style.cssText = "margin:6px 0 0;max-width:300px;font:400 17px/1.45 var(--prose);color:var(--ink-soft)";
    bio.append(h, t, d);
    top.append(plate, bio);

    const stats = el('div', 'leaders');
    stats.append(
      leader('MAXIMUM HEALTH', c.maxHealth),
      leader('MOVEMENT', c.moveSpeed),
      leader('ARMOUR', c.armor || '—'),
      leader('PICKUP RADIUS', c.pickupRadius),
      leader('REGENERATION', c.healthRegen ? c.healthRegen.toFixed(1) : '—'));

    const perk = el('div', 'passage');
    perk.append(el('span', 'kicker kicker-blood', 'PERK'));
    perk.append(el('p', null, WS.template(c.perk, c)));

    const fieldHead = el('div');
    fieldHead.style.cssText = 'display:flex;align-items:baseline;justify-content:space-between;margin-bottom:2px';
    fieldHead.append(el('span', 'kicker kicker-ink', 'THE BATTLEFIELD'));
    const fieldName = el('span', null,
      `${map.name} · difficulty ${roman(WS.round(map.difficulty * 2) - 1)}`);
    fieldName.style.cssText = "font:400 15px var(--prose);font-style:italic;color:var(--ink-dim)";
    fieldHead.append(fieldName);

    const schedule = el('div', 'schedule');
    for (const at of WS.Config.bossTimes) {
      const tick = el('div', 'tick');
      tick.style.left = (at / WS.Config.deathTime * 100) + '%';
      schedule.append(tick);
    }
    schedule.append(el('div', 'death'));
    schedule.append(el('div', 'from', WS.formatTime(WS.Config.bossTimes[0])));
    schedule.append(el('div', 'to', '30:00 · DEATH'));

    wrap.append(top, stats, perk, fieldHead, schedule);
    right.append(wrap);

    /* -- the foot: take the field, and the purse ------------------------- */
    const foot = el('div', 'foot-bar');
    const begin = el('button', 'btn');
    begin.append(el('span', null, 'Take the Field'));
    begin.style.flex = '1';
    begin.addEventListener('click', () => {
      if (!WS.Save.isCharacterUnlocked(id) || !WS.Save.isMapUnlocked(mapId)) return;
      WS.Audio.init(); WS.Audio.resume();
      WS.Audio.play('select');
      WS.Game.startRun(mapId, id);
    });
    const banked = el('div', 'banked');
    banked.append(el('span', 'k', 'BANKED'),
      el('span', 'v', WS.formatNumber(WS.Save.db.gold) + ' g'));
    foot.append(begin, banked);
    right.append(foot);
  };

  UI.buildDiscoveriesPage = function (right) {
    right.innerHTML = '';
    right.append(pageHead(null, 'Discoveries',
      'Weapons that recognise one another. Nine are written; the rest is rumour.'));
    const body = el('div', 'page-body');
    const rows = el('div', 'rows');
    for (const id of WS.ComboOrder) {
      const c = WS.Combos[id];
      const found = !!WS.Save.db.combos[id];
      const row = el('div', 'row ' + (found ? 'done' : 'dim'));
      const g = icon(found ? 'arcane' : 'rune', found ? [0.11, 0.36, 0.27] : [0.35, 0.3, 0.24], 36);
      g.className = 'glyph';
      row.append(g);
      const main = el('div', 'main');
      main.append(el('div', 'n', found ? c.name : '? ? ?'));
      main.append(el('div', 's', found
        ? `${WS.Weapons[c.weapons[0]].name} + ${WS.Weapons[c.weapons[1]].name} — ${WS.template(c.description, c)}`
        : c.hint));
      row.append(main);
      rows.append(row);
    }
    body.append(rows);
    right.append(body);
  };

  UI.buildRites = function (body, render) {
    const st = WS.Save.settings;
    const wrap = el('div');

    const diffRow = el('div', 'setting');
    const dmain = el('div');
    dmain.append(el('div', 'n', 'Difficulty'),
      el('div', 's', 'How hard the night presses.'));
    const dbtn = el('button', 'chip', WS.Config.difficulties[st.difficulty].label);
    dbtn.addEventListener('click', () => {
      const order = WS.Config.difficultyOrder;
      st.difficulty = order[(order.indexOf(st.difficulty) + 1) % order.length];
      WS.Save.save();
      dbtn.textContent = WS.Config.difficulties[st.difficulty].label;
      WS.Audio.play('ui');
    });
    diffRow.append(dmain, dbtn);
    wrap.append(diffRow);

    const hyperRow = el('div', 'setting');
    const hmain = el('div');
    hmain.append(el('div', 'n', 'Hyper Mode'),
      el('div', 's', 'Unlocked by winning a battlefield. Faster, denser, richer.'));
    const hbtn = el('button', 'chip', WS.Save.db.hyperArmed ? 'Armed' : 'Off');
    hbtn.disabled = !Object.keys(WS.Save.db.unlocks.hyper).length;
    hbtn.addEventListener('click', () => {
      WS.Save.db.hyperArmed = !WS.Save.db.hyperArmed;
      WS.Save.save();
      hbtn.textContent = WS.Save.db.hyperArmed ? 'Armed' : 'Off';
      WS.Audio.play('ui');
    });
    hyperRow.append(hmain, hbtn);
    wrap.append(hyperRow);

    const toggle = (key, name, desc) => {
      const row = el('div', 'setting');
      const main = el('div');
      main.append(el('div', 'n', name));
      if (desc) main.append(el('div', 's', desc));
      const sw = el('div', 'switch' + (st[key] ? ' on' : ''));
      sw.addEventListener('click', () => {
        st[key] = !st[key];
        sw.classList.toggle('on', st[key]);
        WS.Save.save(); WS.Audio.applySettings(); WS.Audio.play('ui');
      });
      row.append(main, sw);
      wrap.append(row);
    };
    const slider = (key, name) => {
      const row = el('div', 'setting');
      row.append(el('div', 'n', name));
      const input = el('input');
      input.type = 'range'; input.min = 0; input.max = 1; input.step = 0.05;
      input.value = st[key];
      input.addEventListener('input', () => { st[key] = parseFloat(input.value); WS.Audio.applySettings(); });
      input.addEventListener('change', () => WS.Save.save());
      row.append(input);
      wrap.append(row);
    };

    toggle('sound', 'Sound');
    slider('effectsVolume', 'Effects');
    toggle('music', 'Music');
    slider('musicVolume', 'Score');
    toggle('screenShake', 'Screen shake');
    toggle('damageNumbers', 'Damage numbers');
    toggle('healNumbers', 'Healing numbers');
    toggle('showHealthBars', 'Health bars on the horde', 'Elites and bosses always keep theirs.');
    toggle('levelUpTooltips', 'Full card notes');

    const danger = el('div', 'setting');
    const dm = el('div');
    dm.append(el('div', 'n', 'The record'), el('div', 's', 'Unlocks, gold, lessons and annals.'));
    const btns = el('div');
    btns.style.cssText = 'display:flex;gap:8px';
    const unlockBtn = el('button', 'chip', 'Unseal all');
    unlockBtn.addEventListener('click', () => { WS.Save.unlockAll(); render(); });
    const resetBtn = el('button', 'chip blood', 'Burn it');
    resetBtn.addEventListener('click', () => {
      if (resetBtn.dataset.armed) { WS.Save.reset(); render(); }
      else { resetBtn.dataset.armed = '1'; resetBtn.textContent = 'Burn it? Truly'; }
    });
    btns.append(unlockBtn, resetBtn);
    danger.append(dm, btns);
    wrap.append(danger);
    body.append(wrap);
  };

  /* ------------------------------------------------------------ the rites */
  UI.openBlessing = function (choices) {
    const sheet = el('div', 'sheet');
    sheet.style.cssText = 'align-items:center;justify-content:center';

    const rite = el('div', 'rite');
    rite.append(ornament('THREE ARE OFFERED · ONE IS SWORN'));
    rite.append(el('div', 'title', 'The Arcana'));
    rite.append(el('div', 'sub', 'Swear one before the first wave. It holds until you fall.'));

    const hand = el('div', 'hand arcana-hand');
    const rots = [-1.4, 0.6, 1.6];
    choices.forEach((c, i) => {
      const d = Object.assign({}, c);
      d.colour = choiceColour(c);
      d._rot = rots[i % 3];
      d.foot = c.note;
      hand.append(cardFor(d, () => WS.Game.chooseBlessing(c), roman(i + 1)));
    });

    sheet.append(rite, hand);
    this.show(sheet);
  };

  UI.openLevelUp = function (choices) {
    const p = WS.Game.player;
    const sheet = el('div', 'sheet');

    const head = el('div', 'band-head');
    head.append(el('div', 'eyebrow',
      `LEVEL ${roman(p.level)} · ${WS.Game.pendingLevelUps > 1
        ? WS.Game.pendingLevelUps + ' AWAIT' : 'TAKE ONE'}`));
    head.append(el('div', 'title',
      this.banishMode ? 'Strike one from the book' : 'The horde holds its breath'));

    const hand = el('div', 'hand');
    choices.forEach((c, i) => {
      hand.append(cardFor(dressChoice(c, i), (choice) => {
        if (this.banishMode) {
          this.banishMode = false;
          if (!WS.Game.banishLevelUp(choice)) this.openLevelUp(WS.Game.levelChoices);
          return;
        }
        WS.Game.chooseLevelUp(choice);
      }));
    });

    const foot = el('div', 'band-foot');
    const reroll = el('button', 'chip', `REROLL · ${p.rerolls > 0 ? roman(p.rerolls) : '—'}`);
    reroll.disabled = p.rerolls <= 0;
    reroll.addEventListener('click', () => { this.banishMode = false; WS.Game.rerollLevelUp(); });
    const banish = el('button', 'chip blood' + (this.banishMode ? ' active' : ''),
      `BANISH · ${p.banishes > 0 ? roman(p.banishes) : '—'}`);
    banish.disabled = p.banishes <= 0;
    banish.addEventListener('click', () => {
      this.banishMode = !this.banishMode;
      this.openLevelUp(WS.Game.levelChoices);
    });
    foot.append(reroll, banish);

    sheet.append(head, hand, foot);
    this.show(sheet, true);
  };

  /* ------------------------------------------------------- the ledger --- */
  function ledgerSpread(title, sub) {
    const sheet = el('div', 'sheet');
    const sp = spread();
    const left = page(); left.classList.add('ledger');
    const right = page(true); right.classList.add('ledger');
    sp.append(left, right);
    sheet.append(sp);

    const p = WS.Game.player, run = WS.Game.run;

    left.append(pageHead('S', title, sub));
    const lbody = el('div', 'page-body');
    lbody.append(el('h3', null, 'The Arsenal'));
    for (const w of p.weapons) {
      const row = el('div', 'arm-row');
      const g = icon(w.data.art, WS.Weapon.colour(w), 40); g.className = 'glyph';
      row.append(g);
      const main = el('div', 'main');
      main.append(el('div', 'n', (w.evolved ? w.data.evolveName : w.data.name)
        + (w.evolved ? '' : `  ·  rank ${roman(w.level)} of ${roman(WS.WEAPON_MAX_LEVEL)}`)));
      const stats = WS.Weapon.describe(p, w);
      main.append(el('div', 's', stats.map(([k, v]) => `${k} ${v}`).join('   ·   ')));
      if (!w.evolved && w.data.evolvePairing) {
        const pair = WS.Upgrades[w.data.evolvePairing];
        const has = (p.upgradeLevels[w.data.evolvePairing] || 0) > 0;
        main.append(el('div', 's',
          `Evolves with ${pair.name}${has ? ' (learned)' : ''} into ${w.data.evolveName}`));
      }
      row.append(main);
      lbody.append(row);
    }
    if (p.blessingNames.length) {
      lbody.append(el('h3', null, 'Arcana sworn'));
      lbody.append(el('div', 's', p.blessingNames.join(' · ')));
    }
    lbody.append(el('h3', null, 'The Damage'));
    const entries = Object.entries(run.damageByWeapon).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((sum, e) => sum + e[1], 0) || 1;
    const meter = el('div', 'leaders one-col');
    for (const [key, value] of entries.slice(0, 12)) {
      const w = WS.Weapons[key];
      const label = w ? w.name : key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
      meter.append(leader(label.toUpperCase(),
        `${WS.formatNumber(value)}  (${WS.round(value / total * 100)}%)`));
    }
    lbody.append(meter);
    left.append(lbody);

    right.append(pageHead(null, 'The Account', WS.formatTime(run.time) + ' on ' + run.map.name));
    const rbody = el('div', 'page-body');
    const stats = el('div', 'leaders one-col');
    const add = (k, v) => stats.append(leader(k, v));
    add('HEALTH', `${WS.max(0, WS.floor(p.health))} / ${WS.floor(p.maxHealth)}`);
    add('ARMOUR', `${p.armor} (${WS.round(p.armor / (p.armor + WS.Config.armorConstant) * 100)}%)`);
    add('DAMAGE', `×${p.damageMultiplier.toFixed(2)}`);
    add('COOLDOWNS', `×${p.cooldownMultiplier.toFixed(2)}`);
    add('EFFECT AREA', `×${p.areaMultiplier.toFixed(2)}`);
    add('MOVEMENT', WS.round(p.moveSpeed));
    add('CRITICAL', `${WS.round(p.critChance * 100)}% for ×${p.critDamage.toFixed(2)}`);
    add('PROJECTILES', `+${p.projectileBonus}`);
    add('PICKUP RADIUS', WS.round(p.pickupRadius));
    add('LUCK', `×${p.luck.toFixed(2)}`);
    add('EXPERIENCE', `×${p.xpMultiplier.toFixed(2)}`);
    add('GOLD', `×${p.goldMultiplier.toFixed(2)}`);
    if (p.healthRegen > 0) add('REGENERATION', p.healthRegen.toFixed(1) + '/s');
    if (p.dodgeChance > 0) add('EVASION', WS.round(p.dodgeChance * 100) + '%');
    if (p.lifesteal > 0) add('LIFESTEAL', (p.lifesteal * 100).toFixed(1) + '%');
    if (p.desecration > 0) add('DESECRATION', WS.formatNumber(p.desecrationDealt));
    if (p.felAttuned > 0) add('METAMORPHOSES', roman(p.metamorphoses));
    rbody.append(el('h3', null, 'The Survivor'), stats);

    const runStats = el('div', 'leaders one-col');
    const addRun = (k, v) => runStats.append(leader(k, v));
    addRun('SLAIN', WS.formatNumber(run.kills));
    addRun('BOSSES', roman(run.bossesSlain));
    addRun('DAMAGE DEALT', WS.formatNumber(run.damageDone));
    addRun('DAMAGE TAKEN', WS.formatNumber(run.damageTaken));
    addRun('DAMAGE PREVENTED', WS.formatNumber(run.damagePrevented));
    addRun('HEALING', WS.formatNumber(run.healingDone));
    addRun('GEMS', WS.formatNumber(run.gemsCollected));
    addRun('GOLD THIS RUN', WS.formatNumber(run.gold));
    rbody.append(el('h3', null, 'The Run'), runStats);
    right.append(rbody);

    return { sheet, left, right };
  }

  UI.openPause = function () {
    const { sheet, right } = ledgerSpread('The Ledger', 'The night waits.');
    const foot = el('div', 'foot-bar');
    const resume = el('button', 'btn');
    resume.append(el('span', null, 'Resume'));
    resume.style.flex = '1';
    resume.addEventListener('click', () => WS.Game.resume());
    const quit = el('button', 'chip blood', 'Abandon');
    quit.addEventListener('click', () => {
      if (quit.dataset.armed) WS.Game.endRun('abandoned');
      else { quit.dataset.armed = '1'; quit.textContent = 'Abandon? Truly'; }
    });
    foot.append(resume, quit);
    right.append(foot);
    this.show(sheet);
  };

  UI.openVictory = function () {
    const { sheet, right } = ledgerSpread('Victory',
      `${WS.Game.run.map.name} survived. Hyper Mode is open.`);
    const foot = el('div', 'foot-bar');
    const claim = el('button', 'btn');
    claim.append(el('span', null, 'Claim the win'));
    claim.style.flex = '1';
    claim.addEventListener('click', () => WS.Game.endRun('victory'));
    const fight = el('button', 'chip', 'Fight on');
    fight.addEventListener('click', () => {
      WS.Game.run.victorious = true;
      WS.Game.running = true;
      WS.Game.state = 'playing';
      UI.closeOverlay();
      WS.Game.announce('Overtime', 'Death is already walking.', 3.0);
    });
    const endless = el('button', 'chip', 'True Endless');
    endless.addEventListener('click', () => WS.Game.continueEndless());
    foot.append(claim, fight, endless);
    right.append(foot);
    this.show(sheet);
  };

  UI.openGameOver = function (reason) {
    const run = WS.Game.run;
    const titles = {
      defeated: 'You Fell',
      victory: 'Victory',
      abandoned: 'You Withdrew',
      arena_victory: 'The Eclipse Breaks',
    };
    const sub = reason === 'defeated'
      ? `Slain by ${run.killedBy ? run.killedBy.name : 'the endless horde'} at ${WS.formatTime(run.time)}.`
      : `${WS.formatTime(run.time)} on ${run.map.name}.`;
    const { sheet, right } = ledgerSpread(titles[reason] || 'The Run Ends', sub);

    const foot = el('div', 'foot-bar');
    const again = el('button', 'btn');
    again.append(el('span', null, 'Again'));
    again.style.flex = '1';
    again.addEventListener('click', () => WS.Game.startRun(run.mapId, run.characterId));
    const menu = el('button', 'chip', 'The Roster');
    menu.addEventListener('click', () => WS.Game.quitToMenu());
    const banked = el('div', 'banked');
    banked.append(el('span', 'k', 'BANKED'), el('span', 'v', WS.formatNumber(run.gold) + ' g'));
    foot.append(again, menu, banked);
    right.append(foot);
    this.show(sheet);
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
