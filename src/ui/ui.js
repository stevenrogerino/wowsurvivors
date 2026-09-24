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

  /* ============================================================ TIPS == */
  /* Tooltips in the Watch's hand.
   *
   * Everything that explained itself on hover did it through the browser's
   * native title: a grey system box, a second of delay, plain text only, and
   * nothing at all for a controller. Worse, the HUD lets every pointer through
   * to the field, so the titles on the weapon slots never showed at all.
   *
   * A tip here is a small inked card built on demand from a function, so it
   * can carry what the title never could: the thing's own colour, its rank,
   * its numbers, and above all WHAT IT WORKS WITH - the evolution a weapon is
   * walking toward and how far along it is, the passive that gets it there,
   * the weapons it makes a discovery with, the union it can become; and for a
   * passive, the weapons it evolves. It shows on hover and on keyboard or pad
   * focus, sits where there is room, and never takes a pointer itself.
   */
  const Tip = { node: null, anchor: null, timer: 0 };

  function tipNode() {
    if (!Tip.node) {
      Tip.node = el('div', 'tip hidden');
      Tip.node.setAttribute('role', 'tooltip');
      document.body.append(Tip.node);
    }
    return Tip.node;
  }

  function placeTip(anchor, prefer) {
    const n = Tip.node, r = anchor.getBoundingClientRect();
    const w = n.offsetWidth, h = n.offsetHeight, gap = 10, pad = 8;
    const vw = innerWidth, vh = innerHeight;
    const spots = {
      above: [r.left + r.width / 2 - w / 2, r.top - h - gap],
      below: [r.left + r.width / 2 - w / 2, r.bottom + gap],
      right: [r.right + gap, r.top + r.height / 2 - h / 2],
      left: [r.left - w - gap, r.top + r.height / 2 - h / 2],
    };
    const fits = ([x, y]) => x >= pad && y >= pad && x + w <= vw - pad && y + h <= vh - pad;
    let at = null;
    for (const k of prefer || ['above', 'below', 'right', 'left']) {
      if (fits(spots[k])) { at = spots[k]; break; }
    }
    if (!at) at = spots[(prefer && prefer[0]) || 'above'];
    const x = WS.clamp(at[0], pad, vw - w - pad), y = WS.clamp(at[1], pad, vh - h - pad);
    n.style.left = WS.round(x) + 'px';
    n.style.top = WS.round(y) + 'px';
  }

  function showTip(anchor, build, prefer) {
    const n = tipNode();
    const body = build();
    if (!body) return;
    n.replaceChildren(body);
    n.classList.remove('hidden');
    Tip.anchor = anchor;
    placeTip(anchor, prefer);
    n.classList.add('shown');
  }

  function hideTip(anchor) {
    if (anchor && Tip.anchor !== anchor) return;
    clearTimeout(Tip.timer);
    Tip.anchor = null;
    if (Tip.node) { Tip.node.classList.remove('shown'); Tip.node.classList.add('hidden'); }
  }
  UI.hideTip = () => hideTip();

  /** Attach a tip to a node. `build` returns the tip's contents, or null. */
  function tipOn(node, build, opts) {
    const o = opts || {};
    node.removeAttribute('title');
    const open = () => {
      clearTimeout(Tip.timer);
      Tip.timer = setTimeout(() => { if (node.isConnected) showTip(node, build, o.prefer); }, o.delay || 90);
    };
    node.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') open(); });
    node.addEventListener('pointerleave', () => hideTip(node));
    if (o.focus !== false) {
      node.addEventListener('focus', open);
      node.addEventListener('blur', () => hideTip(node));
    }
    node.addEventListener('pointerdown', () => hideTip(node));
    return node;
  }
  UI.tipOn = tipOn;

  /** A plain sentence, for buttons that used to carry a title. */
  function tipText(text, heading) {
    return () => {
      const b = el('div', 'tip-body');
      if (heading) b.append(el('div', 'tip-name', heading));
      b.append(el('div', 'tip-desc', text));
      return b;
    };
  }
  UI.tipText = tipText;

  /* Anything carrying data-tip gets a plain tip, read when it opens - several
     of these change their text as the player toggles them. */
  (function delegate() {
    const find = (t) => (t && t.closest ? t.closest('[data-tip]') : null);
    const open = (n) => {
      clearTimeout(Tip.timer);
      Tip.timer = setTimeout(() => {
        if (n.isConnected && n.dataset.tip) showTip(n, tipText(n.dataset.tip), ['above', 'below']);
      }, 160);
    };
    document.addEventListener('pointerover', (e) => {
      const n = find(e.target);
      if (n && n !== Tip.anchor && e.pointerType !== 'touch') open(n);
    });
    document.addEventListener('pointerout', (e) => {
      const n = find(e.target);
      if (n && !n.contains(e.relatedTarget)) hideTip(n);
    });
    document.addEventListener('focusin', (e) => { const n = find(e.target); if (n) open(n); });
    document.addEventListener('focusout', (e) => { const n = find(e.target); if (n) hideTip(n); });
  })();

  function tipHead(name, colour, rank, kind) {
    const head = el('div', 'tip-head');
    const nm = el('div', 'tip-name', name);
    if (colour) nm.style.setProperty('--q', WS.hex(colour));
    head.append(nm);
    if (rank) head.append(el('div', 'tip-rank', rank));
    const frag = [head];
    if (kind) frag.push(el('div', 'tip-kind', kind));
    return frag;
  }

  /** One line of "works with": a mark for its state, a small icon, words. */
  function tipLink(state, art, colour, html) {
    const row = el('div', 'tip-link ' + state);
    row.append(el('i', 'tip-mark'));
    if (art) {
      const im = icon(art, colour, 22);
      im.width = im.height = 22;
      row.append(im);
    }
    const t = el('span');
    t.innerHTML = html;
    row.append(t);
    return row;
  }
  const b = (t) => '<b>' + t + '</b>';
  const em = (t) => '<em>' + t + '</em>';

  /** Everything a weapon works with, from where this survivor stands now. */
  function weaponLinks(p, id, level, evolved) {
    const d = WS.Weapons[id];
    const out = [];
    if (!d) return out;
    // The evolution: rank, the passive, and what it becomes.
    if (d.evolvePairing && WS.Upgrades[d.evolvePairing] && !evolved) {
      const up = WS.Upgrades[d.evolvePairing];
      const has = (p.upgradeLevels[d.evolvePairing] || 0) > 0;
      const maxed = level >= WS.WEAPON_MAX_LEVEL;
      const state = has && maxed ? 'ready' : has || maxed ? 'part' : 'need';
      out.push(tipLink(state, up.art, qualityColour(up.quality),
        `Rank ${WS.WEAPON_MAX_LEVEL} + ${b(up.name)}${has ? ' (learned)' : ''} → ${em(d.evolveName)}`
        + (maxed ? '' : `<small>rank ${level || 0} of ${WS.WEAPON_MAX_LEVEL}</small>`)));
    }
    // Discoveries: the partner is always named; the result only once found.
    for (const cid of WS.ComboOrder) {
      const c = WS.Combos[cid];
      if (c.weapons.indexOf(id) < 0) continue;
      const other = c.weapons[0] === id ? c.weapons[1] : c.weapons[0];
      const od = WS.Weapons[other];
      if (!od) continue;
      const found = !!(WS.Save.db.combos && WS.Save.db.combos[cid]);
      const active = !!(p.combosActive && p.combosActive[cid]);
      const held = !!WS.Player.getWeapon(p, other);
      const state = active ? 'done' : held ? 'ready' : 'need';
      out.push(tipLink(state, od.art, WS.CONST.COLORS[od.school],
        `With ${b(od.name)} → ${found ? em(c.name) : em('a discovery')}`
        + (active ? '<small>active</small>' : found ? '' : `<small>${c.hint}</small>`)));
    }
    // Unions: both evolved, made one.
    for (const u of (WS.Unions || [])) {
      if (u.from.indexOf(id) < 0) continue;
      const other = u.from[0] === id ? u.from[1] : u.from[0];
      const od = WS.Weapons[other], res = WS.Weapons[u.result];
      if (!od || !res) continue;
      const ow = WS.Player.getWeapon(p, other);
      const state = evolved && ow && ow.evolved ? 'ready' : ow ? 'part' : 'need';
      out.push(tipLink(state, od.art, WS.CONST.COLORS[od.school],
        `Evolved, with ${b(od.name)} evolved → ${em(res.name)}<small>a union</small>`));
    }
    return out;
  }

  /** A weapon's tip: carried (`w`) or on offer (`id`, `level`). */
  function tipWeapon(p, w, id, level, onlyLinks) {
    return () => {
      const wid = w ? w.id : id;
      const d = WS.Weapons[wid];
      if (!d) return null;
      const evolved = !!(w && w.evolved);
      const lvl = w ? w.level : (level || 1);
      const body = el('div', 'tip-body');
      const kind = (d.school ? d.school.charAt(0).toUpperCase() + d.school.slice(1) + ' ' : '')
        + (d.isUnion ? 'union' : 'weapon');
      body.append(...tipHead(evolved && d.evolveName ? d.evolveName : d.name, WS.CONST.COLORS[d.school],
        d.isUnion ? 'Made one' : evolved ? 'Evolved' : `Rank ${lvl} of ${WS.WEAPON_MAX_LEVEL}`, kind));
      body.append(el('div', 'tip-desc', evolved && d.evolveDescription
        ? WS.template(d.evolveDescription, d) : WS.template(d.description, d)));
      if (w) {
        const stats = el('div', 'tip-stats');
        for (const [k, v] of WS.Weapon.describe(p, w)) {
          const s = el('span');
          s.append(el('b', null, String(v)), el('i', null, ' ' + k.toLowerCase()));
          stats.append(s);
        }
        body.append(stats);
      }
      const links = weaponLinks(p, wid, lvl, evolved);
      if (onlyLinks && !links.length) return null;
      if (links.length) {
        body.append(el('div', 'tip-sec', 'Works with'));
        for (const l of links) body.append(l);
      }
      return body;
    };
  }
  UI.tipWeapon = tipWeapon;

  /** A passive's tip: its rank, what it does, and the weapons it evolves. */
  function tipPassive(p, id, rankShown, onlyLinks) {
    return () => {
      const up = WS.Upgrades[id];
      if (!up) return null;
      const rank = rankShown || p.upgradeLevels[id] || 0;
      const body = el('div', 'tip-body');
      const q = up.quality ? up.quality.charAt(0).toUpperCase() + up.quality.slice(1) + ' passive' : 'Passive';
      body.append(...tipHead(up.name, qualityColour(up.quality), `Rank ${rank} of ${up.max}`, q));
      body.append(el('div', 'tip-desc', WS.template(up.description, up)));
      if (up.detail) body.append(el('div', 'tip-detail', WS.template(up.detail, up)));
      const evo = [];
      for (const wid of WS.WeaponOrder) {
        const d = WS.Weapons[wid];
        if (!d || d.evolvePairing !== id) continue;
        const w = WS.Player.getWeapon(p, wid);
        const state = w && w.evolved ? 'done' : w && w.level >= WS.WEAPON_MAX_LEVEL ? 'ready' : w ? 'part' : 'need';
        evo.push([state, tipLink(state, d.art, WS.CONST.COLORS[d.school],
          `${b(d.name)} at rank ${WS.WEAPON_MAX_LEVEL} → ${em(d.evolveName)}`
          + (w ? (w.evolved ? '<small>evolved</small>' : `<small>carried, rank ${w.level}</small>`) : ''))]);
      }
      if (onlyLinks && !evo.length) return null;
      const order = { ready: 0, part: 1, done: 2, need: 3 };
      evo.sort((x, y) => order[x[0]] - order[y[0]]);
      if (evo.length) {
        body.append(el('div', 'tip-sec', 'Evolves'));
        for (const [, l] of evo) body.append(l);
      }
      return body;
    };
  }
  UI.tipPassive = tipPassive;

  function svgArc(radius, stroke, cls) {
    const ns = 'http://www.w3.org/2000/svg';
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', '50%'); c.setAttribute('cy', '50%');
    c.setAttribute('r', radius);
    c.setAttribute('class', cls);
    if (stroke) c.setAttribute('stroke-width', stroke);
    return c;
  }

  /** A ring drawn in ink: a circle that wanders a fraction off true and
   *  swells and thins as it goes round, returned as an SVG path to fill with
   *  the even-odd rule. The same hand as the frames in src/ui/frames.js, bent
   *  into a circle for the portrait's medallion. */
  function inkRing(cx, cy, r, w, seed) {
    let t = (seed * 2654435761) >>> 0;
    const rnd = () => {
      t = (t + 0x6D2B79F5) >>> 0;
      let q = Math.imul(t ^ (t >>> 15), t | 1);
      q ^= q + Math.imul(q ^ (q >>> 7), q | 61);
      return ((q ^ (q >>> 14)) >>> 0) / 4294967296;
    };
    const p1 = rnd() * 6.28, p2 = rnd() * 6.28, p3 = rnd() * 6.28;
    const out = [], inn = [];
    const n = 72;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = r + 0.45 * Math.sin(a * 2 + p1) + 0.25 * Math.sin(a * 5 + p2);
      const hw = w * (0.5 + 0.22 * Math.sin(a * 3 + p3));
      out.push(`${(cx + Math.cos(a) * (rr + hw)).toFixed(2)} ${(cy + Math.sin(a) * (rr + hw)).toFixed(2)}`);
      inn.push(`${(cx + Math.cos(a) * (rr - hw)).toFixed(2)} ${(cy + Math.sin(a) * (rr - hw)).toFixed(2)}`);
    }
    return 'M' + out.join(' L') + 'Z M' + inn.reverse().join(' L') + 'Z';
  }

  function svgEl(tag, attrs) {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
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
    svg.setAttribute('viewBox', '0 0 112 112');
    /* Health is a painted band - lit at the top, deep at the foot - and
       experience a gilt thread inside it. Both still run on dash offsets;
       what changed is the paint, and the machined graduations are gone. */
    const rHP = 50.5, rXP = 42.5;
    const defs = svgEl('defs', {});
    const grad = svgEl('linearGradient', { id: 'hp-paint', x1: '0', y1: '0', x2: '1', y2: '0' });
    // The svg is turned -90deg, so its x axis runs up the screen.
    grad.append(svgEl('stop', { offset: '0', 'stop-color': '#7a1614' }),
      svgEl('stop', { offset: '0.55', 'stop-color': '#c8322b' }),
      svgEl('stop', { offset: '1', 'stop-color': '#ff7a5c' }));
    defs.append(grad);
    const tHP = svgArc(rHP, 8, 'track');
    const aHP = svgArc(rHP, 8, 'arc-hp');
    const tXP = svgArc(rXP, 3, 'track');
    const aXP = svgArc(rXP, 3, 'arc-xp');
    svg.append(defs, tHP, aHP, tXP, aXP);
    // The ink over it, unturned: the medallion's edges, and a notch at each
    // quarter so a glance still gives a fraction without reading a number.
    const ink = svgEl('svg', { viewBox: '0 0 112 112', class: 'gauge-ink' });
    ink.append(svgEl('path', { d: inkRing(56, 56, 55.2, 1.5, 3), 'fill-rule': 'evenodd', class: 'ink' }),
      svgEl('path', { d: inkRing(56, 56, 45.8, 1.1, 5), 'fill-rule': 'evenodd', class: 'ink soft' }),
      svgEl('path', { d: inkRing(56, 56, 39.6, 1.3, 7), 'fill-rule': 'evenodd', class: 'ink' }));
    // 25%, 50% and 75% of the band, which starts at twelve and runs clockwise.
    for (const q of [0.25, 0.5, 0.75]) {
      const ang = q * Math.PI * 2 - Math.PI / 2;
      const x0 = 56 + Math.cos(ang) * 46.5, y0 = 56 + Math.sin(ang) * 46.5;
      const x1 = 56 + Math.cos(ang) * 55, y1 = 56 + Math.sin(ang) * 55;
      ink.append(svgEl('line', { x1: x0, y1: y0, x2: x1, y2: y1, class: 'notch' }));
    }
    const portrait = el('div', 'portrait');
    // The level is a seal pressed into the foot of the medallion.
    const lvl = el('div', 'lvl', '1');
    gauge.append(svg, portrait, ink, lvl);

    const vitals = el('div'); vitals.id = 'hud-vitals';
    const name = el('div', 'name', '');
    const hpText = el('div', 'hp-text', '');
    const meters = el('div'); meters.id = 'hud-meters';
    vitals.append(name, hpText, meters);
    /* The Breaking Point auto-take, where it is needed rather than in a
       settings list nobody opens mid-run. Hidden until the run first offers
       a Breaking Point - before that there is nothing for it to take - and
       the one clickable thing in a HUD that otherwise lets every pointer
       through to the field. */
    const autoBp = el('button', 'hud-auto hidden');
    autoBp.type = 'button';
    autoBp.setAttribute('role', 'switch');
    autoBp.append(el('span', 'switch'), el('span', 'hud-auto-label', 'Auto Breaking Point'));
    autoBp.dataset.tip = 'Once there is nothing left to choose, take Breaking Point without stopping.';
    // Steering starts on a pointerdown on the stage underneath: keep it there.
    autoBp.addEventListener('pointerdown', (e) => e.stopPropagation());
    autoBp.addEventListener('click', () => {
      const st = WS.Save.settings;
      st.autoBreakingPoint = !st.autoBreakingPoint;
      WS.Save.save();
      WS.Audio.play('ui');
      UI.paintAutoBreaking();
      autoBp.blur();   // or the next Space/Enter in a fight flips it again
    });
    portraitWrap.append(gauge, vitals, autoBp);

    /* -- timer rail ------------------------------------------------------- */
    const timer = el('div'); timer.id = 'hud-timer';
    const timeText = el('div', 'time', '0:00');
    /* The night, as a strip of sky: dusk at the left, dawn at the right,
       stars across it, and the hours still to come under a veil that draws
       back as they pass. The moon rides the edge of the veil - it is where
       you are in the night - and each boss is an inked mark along the top.
       railFill is the veil's complement, kept under its old name. */
    const rail = el('div', 'rail night');
    const railFill = el('div', 'fill');
    const veil = el('div', 'veil');
    const railHead = el('div', 'head');
    railHead.append(svgEl('svg', { viewBox: '0 0 20 20' }));
    railHead.firstChild.append(svgEl('path', { d: 'M13.5 2.6a8 8 0 1 0 3.9 12.6A6.6 6.6 0 0 1 13.5 2.6Z', class: 'moon' }));
    rail.append(railFill, veil, el('i', 'stars'), railHead, el('i', 'sun'));
    for (const at of WS.Config.bossTimes) {
      const tick = el('i', 'tick');
      tick.style.left = (at / WS.Config.deathTime * 100) + '%';
      tick.dataset.at = at;
      rail.append(tick);
    }
    const mode = el('div', 'label mode', '');
    timer.append(timeText, rail, mode);

    /* -- boss arc --------------------------------------------------------- */
    const boss = el('div', 'hidden'); boss.id = 'hud-boss';
    const bossName = el('div', 'boss-name', '');
    /* A painted bar in a drawn frame. Behind the health, a paler band that
       holds where the health was and drains after it, so a big hit reads as
       a big hit; and a seal on the bar at the next phase gate, where the
       finale will not let the health fall past until something breaks. */
    const bar = el('div', 'b-bar');
    const bDrain = el('div', 'b-drain');
    const bFill = el('div', 'b-fill');
    const bGate = el('i', 'b-gate');
    bar.append(bDrain, bFill, bGate);
    const bossPct = el('div', 'b-pct', '');
    boss.append(bossName, bar, bossPct);

    /* -- tallies ---------------------------------------------------------- */
    const stats = el('div'); stats.id = 'hud-stats';
    const tally = (cls, label) => {
      const line = el('div', 'stat-line ' + cls);
      const v = el('span', 'v', '0');
      line.append(el('span', 'label', label), v);
      stats.append(line);
      return v;
    };
    const goldV = tally('gold', 'gold');
    const killV = tally('kills', 'slain');
    const dpsV = tally('dps', 'dps');
    const hpsV = tally('hps', 'hps');

    const weapons = el('div'); weapons.id = 'hud-weapons';
    const passives = el('div'); passives.id = 'hud-passives';
    const toasts = el('div'); toasts.id = 'hud-toasts';

    hud.append(portraitWrap, timer, boss, stats, weapons, passives, toasts);

    this.els = {
      gauge, aHP, aXP, portrait, lvl, name, hpText, meters, autoBp,
      timeText, railFill, railHead, rail, mode,
      boss, bossName, bFill, bDrain, bGate, bossPct,
      goldV, killV, dpsV, hpsV, weapons, passives, toasts,
      hpCirc: 2 * Math.PI * rHP, xpCirc: 2 * Math.PI * rXP,
      bossLen: 0,
      weaponSlots: new Map(), passiveSlots: new Map(),
    };
    aHP.style.strokeDasharray = this.els.hpCirc;
    aXP.style.strokeDasharray = this.els.xpCirc;
    this.els.bossDrain = 1;
    this.els.bossDrainAt = 0;
    this.els.bossRef = null;
  };

  /** The auto-take switch's face: shown once the run has offered a Breaking
   *  Point, and lit while the setting is on. */
  UI.paintAutoBreaking = function () {
    const b = this.els && this.els.autoBp;
    const run = WS.Game.run;
    if (!b || !run) return;
    const seen = !!run.breakingSeen, on = !!WS.Save.settings.autoBreakingPoint;
    if (b._seen !== seen) { b._seen = seen; b.classList.toggle('hidden', !seen); }
    if (b._on !== on) {
      b._on = on;
      b.classList.toggle('on', on);
      b.firstChild.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    }
  };

  /** Puts the chosen HUD layout on the root, so the whole thing is one class
   *  swap rather than two elements being repositioned by script. */
  UI.applyHudLayout = function () {
    const rail = WS.Save.settings.hudLayout === 'rail';
    document.body.classList.toggle('hud-rail', rail);
  };

  /** The HUD portrait, which has to be repainted when the survivor earns
   *  something - it is built once when the run opens and would otherwise show
   *  the figure they started as for the rest of the run. */
  UI.paintPortrait = function (p) {
    this.els.portrait.innerHTML = '';
    const img = new Image();
    img.src = WS.Sprites.hero(p.characterId, p.character.color, 76,
      false, undefined, null, WS.Player.rank(p)).toDataURL();
    img.width = img.height = 76;
    this.els.portrait.append(img);
  };

  UI.enterGame = function () {
    this.closeOverlay();
    this.hud.classList.remove('hidden');
    const p = WS.Game.player;
    // The portrait shows the survivor's actual silhouette, not a glyph.
    this._portraitRank = WS.Player.rank(p);
    this.paintPortrait(p);
    this.els.name.textContent = p.character.name;
    this._passiveSig = null;
    this.rebuildWeapons();
    this.rebuildPassives();
  };

  UI.rebuildWeapons = function () {
    const wrap = this.els.weapons;
    wrap.innerHTML = '';
    this.els.weaponSlots.clear();
    for (const w of WS.Game.player.weapons) {
      const slot = el('div', 'wslot');
      if (w.evolved) slot.classList.add('evolved');
      const img = icon(w.data.art, WS.Weapon.colour(w), 54);
      img.width = img.height = 54;
      /* The cooldown is a swipe across the face of the icon, not a ring
         around it: the dark wedge is the time still owed, and it is taken
         away clockwise from twelve, with a bright hairline on the hand. */
      const swipe = el('div', 'swipe');
      const rank = el('div', 'rank', w.evolved ? '\u2726' : String(w.level));
      const flash = el('div', 'flash');
      slot.append(img, swipe, flash, el('div', 'rim'), rank);

      /* THE SLOT SAYS WHEN THIS ONE IS READY TO REACT.
       *
       * A weapon sitting at rank 8 with its paired passive already learned is
       * one level-up away from evolving, and the strip that shows what you
       * carry said nothing about it - the only hint was the card, if the card
       * happened to come up. A weapon whose partner you now carry is the same
       * story for discoveries. A pip on the slot means this one has somewhere
       * to go, and the tooltip names it. */
      const reacts = WS.LevelUp.reactionsFor
        ? WS.LevelUp.reactionsFor(WS.Game.player, w.id, 'carried', w.level) : [];
      const ready = reacts.filter((r) => r.ready);
      if (ready.length) {
        slot.classList.add('ready');
        slot.append(el('div', 'slot-pip'));
      }
      tipOn(slot, tipWeapon(WS.Game.player, w), { prefer: ['above', 'right'], focus: false });
      slot.setAttribute('aria-label', `${w.evolved ? w.data.evolveName : w.data.name}`
        + `\n${WS.template(w.data.description, w.data)}`
        + (reacts.length ? '\n\n' + reacts.map((r) => (r.ready ? '\u25c6 ' : '\u25c7 ')
          + r.text).join('\n') : ''));
      wrap.append(slot);
      this.els.weaponSlots.set(w.id, { swipe, rank, slot, lastCd: 0, lastA: -1 });
    }
    // Empty scabbards keep the strip a fixed six, so a filling build reads.
    for (let i = WS.Game.player.weapons.length; i < WS.MAX_WEAPONS; i++) {
      const slot = el('div', 'wslot empty');
      slot.append(el('div', 'scabbard'), el('div', 'rim'));
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
      const slot = el('div', 'pslot');
      slot.append(icon(up.art, qualityColour(up.quality), 34), el('div', 'rim'), el('div', 'rank', String(rank)));
      tipOn(slot, tipPassive(p, id), { prefer: ['above', 'left'], focus: false });
      slot.setAttribute('aria-label', `${up.name} - rank ${rank}/${up.max}`
        + `\n${WS.template(up.description, up)}`);
      wrap.append(slot);
    }
  };

  UI.updateHUD = function () {
    const game = WS.Game;
    if (!game.player || !game.run) return;
    const p = game.player, run = game.run, e = this.els;
    // A slot rebuilt under a tip (a rank-up, an evolution) takes the tip with it.
    if (Tip.anchor && !Tip.anchor.isConnected) hideTip();

    const hpPct = WS.clamp(p.health / p.maxHealth, 0, 1);
    e.aHP.style.strokeDashoffset = e.hpCirc * (1 - hpPct);
    e.aHP.style.stroke = hpPct < 0.3 ? '#ff5a4a' : 'var(--blood)';
    e.gauge.classList.toggle('critical', hpPct < 0.3);
    const xpPct = WS.clamp(p.xp / p.xpToNext, 0, 1);
    e.aXP.style.strokeDashoffset = -e.xpCirc * (1 - xpPct);
    const lv = String(p.level);
    if (e.lvl.textContent !== lv) e.lvl.textContent = lv;
    e.hpText.innerHTML = `${WS.max(0, WS.floor(p.health))}<small> / ${WS.floor(p.maxHealth)}</small>`;

    e.timeText.textContent = WS.formatTime(run.time);
    const clockPct = WS.min(100, run.time / WS.Config.deathTime * 100);
    e.railFill.style.width = clockPct + '%';
    e.railHead.style.left = clockPct + '%';
    e.rail.style.setProperty('--night', (clockPct / 100).toFixed(4));
    for (const tick of e.rail.children) {
      if (tick.dataset && tick.dataset.at) {
        tick.classList.toggle('passed', run.time >= +tick.dataset.at);
      }
    }
    const modeBits = [];
    if (run.hyper) modeBits.push('Hyper');
    if ((run.victorious || run.mode === 'endless') && !WS.Finale.running()) modeBits.push('Overtime');
    if (run.map.arena) modeBits.push('Eclipse Arena · Phase ' + WS.Arena.phase);
    if (WS.Finale.running()) modeBits.push(WS.Finale.hudLabel());
    e.mode.textContent = modeBits.join(' · ');
    this.paintAutoBreaking();

    /* Cheap: a number compared once a frame, and a repaint only on the few
       moments in a run when it actually changes. */
    const rank = WS.Player.rank(p);
    if (rank !== this._portraitRank) { this._portraitRank = rank; this.paintPortrait(p); }

    e.goldV.textContent = WS.formatNumber(run.gold);
    e.killV.textContent = WS.formatNumber(run.kills);
    e.dpsV.textContent = WS.formatNumber(run.dps);
    /* HPS, and beside it what the healing could not use. A survivor at full
       health reads 0 HPS whether nothing is healing them or everything is -
       and with Curdled Light those are opposite situations. */
    e.hpsV.textContent = WS.formatNumber(run.hps)
      + (run.ohps >= 1 ? ' +' + WS.formatNumber(run.ohps) : '');

    // Whichever boss has the most health left is the one the arc tracks - and
    // the same one the score reacts to, because both ask Enemy for it.
    const boss = WS.Enemy.leadBoss();
    if (boss) {
      e.boss.classList.remove('hidden');
      const bossName = boss.displayName || boss.template.name;
      if (e.bossName.textContent !== bossName) e.bossName.textContent = bossName;
      const pct = WS.clamp(boss.health / boss.maxHealth, 0, 1);
      const now = performance.now() / 1000;
      if (e.bossRef !== boss) { e.bossRef = boss; e.bossDrain = pct; e.bossDrainAt = now; }
      // The pale band holds for a beat after a hit, then runs down to meet it.
      if (pct >= e.bossDrain) { e.bossDrain = pct; e.bossDrainAt = now; }
      else if (now - e.bossDrainAt > 0.45) {
        // A third of the bar a second, in real time, whatever the frame rate.
        const dt = WS.min(0.1, now - (e.bossDrainTick || now));
        e.bossDrain = WS.max(pct, e.bossDrain - dt * 0.33);
      }
      e.bossDrainTick = now;
      e.bFill.style.width = (pct * 100).toFixed(2) + '%';
      e.bDrain.style.width = (e.bossDrain * 100).toFixed(2) + '%';
      const gate = boss.hpFloor > 0 ? boss.hpFloor / boss.maxHealth : 0;
      e.bGate.style.left = (gate * 100).toFixed(2) + '%';
      e.bGate.classList.toggle('shown', gate > 0);
      e.bossPct.textContent = `${WS.formatNumber(boss.health)} / ${WS.formatNumber(boss.maxHealth)}  ·  ${WS.round(pct * 100)}%`;
    } else {
      e.boss.classList.add('hidden');
    }

    // Passives change on level-up; refresh the strip when its shape does.
    let sig = '';
    for (const id of WS.UpgradeOrder) {
      const r = p.upgradeLevels[id];
      if (r) sig += id + r + ',';
    }
    if (sig !== this._passiveSig) { this._passiveSig = sig; this.rebuildPassives(); }

    if (e.weaponSlots.size !== p.weapons.length) this.rebuildWeapons();
    for (const w of p.weapons) {
      const slot = e.weaponSlots.get(w.id);
      if (!slot) { this.rebuildWeapons(); break; }
      const total = WS.Weapon.cooldown(p, w);
      const k = WS.clamp(1 - w.cooldown / total, 0, 1);
      const a = k >= 0.999 ? 360 : WS.round(k * 360);
      if (a !== slot.lastA) { slot.lastA = a; slot.swipe.style.setProperty('--a', a + 'deg'); }
      // The cooldown jumping back up means the weapon just went off.
      if (w.cooldown > slot.lastCd + 0.01) {
        slot.slot.classList.remove('fired');
        void slot.slot.offsetWidth;          // restart the animation
        slot.slot.classList.add('fired');
      }
      slot.lastCd = w.cooldown;
      const label = w.evolved ? '\u2726' : String(w.level);
      if (slot.rank.textContent !== label) {
        slot.rank.textContent = label;
        slot.slot.classList.toggle('evolved', !!w.evolved);
      }
    }

    this.updateMeters(p);
    this.updateToasts();
  };

  UI.updateMeters = function (p) {
    const wrap = this.els.meters;
    const want = [];
    if (p.metaTimer > 0) {
      const total = WS.Config.metaDuration + WS.Config.metaDurationPerRank * p.soulRending;
      want.push({ key: 'meta', cls: 'meta', label: 'Ruinform', pct: p.metaTimer / total });
    } else if (p.felLock > 0) {
      /* The recovery is a real part of the cycle for everyone but the
         Ruinseeker, so it gets the bar rather than leaving a full one
         sitting there doing nothing and looking broken. */
      const span = WS.max(0.001, WS.Player.ruinRecovery(p));
      want.push({ key: 'felwait', cls: 'fel waiting', label: 'Receding',
        pct: 1 - p.felLock / span });
    } else if (p.felAttuned > 0) {
      want.push({ key: 'fel', cls: 'fel', label: 'Ruin', pct: p.fel / WS.Config.felToMeta });
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
  /* How long the overlay takes to leave, in ms. Kept in one place because the
     CSS animation and this timer have to agree or the panel is torn out from
     under its own fade. Zero when the reader has asked for less motion. */
  const LEAVE_MS = 180;
  UI.leaveMs = function () {
    return window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : LEAVE_MS;
  };

  /* The overlay leaves under its own power.
   *
   * This used to hide the element and wipe its children in the same statement,
   * which is why picking a level-up card felt like the screen being switched
   * off: measured, the overlay was hidden with zero children on the very first
   * animation frame after the click.
   *
   * The token exists because closing and re-opening happen back to back all
   * over the game - resume, quit to menu, a stacked level-up - and a timer
   * from the old screen must never be allowed to wipe the new one. show()
   * bumps the token, and a stale finish quietly does nothing. */
  UI._leaveToken = 0;
  UI._leaveTimer = null;
  UI.closeOverlay = function () {
    hideTip();
    this.banishMode = false;
    this._levelUI = null;
    const o = this.overlay;
    if (o.classList.contains('hidden')) { o.innerHTML = ''; return; }
    const token = ++this._leaveToken;
    const finish = () => {
      if (token !== this._leaveToken) return;    // a new screen got here first
      this._leaveTimer = null;
      o.classList.remove('leaving');
      o.classList.add('hidden');
      o.innerHTML = '';
    };
    const ms = this.leaveMs();
    if (!ms) { finish(); return; }
    o.classList.add('leaving');
    if (this._leaveTimer) clearTimeout(this._leaveTimer);
    this._leaveTimer = setTimeout(finish, ms);
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

  /* Hover feedback, delegated once at the overlay rather than bound per node.
   *
   * The interface was silent until you committed to something, which is the
   * difference between a menu that responds and one that merely accepts. It
   * is delegated because the menu rebuilds its panes constantly and hanging a
   * listener on every tile would leak them; and it tracks the last element it
   * spoke for, so crossing WITHIN one tile - name to icon to sub-label - is
   * one sound, not three. */
  UI.wireHover = function (root) {
    let last = null;
    root.addEventListener('pointerover', (e) => {
      const target = e.target.closest(
        '.pick, .card, .tab, .btn, .beast, .row, .segmented .seg, .switch');
      if (!target || target === last) return;
      last = target;
      if (target.disabled || target.classList.contains('locked')) return;
      WS.Audio.play('hover');
    });
    root.addEventListener('pointerout', (e) => {
      if (!e.relatedTarget || !root.contains(e.relatedTarget)) last = null;
    });
  };

  /* ------------------------------------------------------ menu navigation --
   * The game takes a gamepad on the battlefield and then hands you back to a
   * mouse the moment a menu opens, which is the point at which a controller
   * player puts it down. Everything in the overlay is a real button, so the
   * missing half is only a way to move between them.
   *
   * Spatial, not tab order: with a grid of ten survivors, "down" has to mean
   * the tile below, not the next node in the document. The score prefers
   * candidates close along the pressed axis and penalises drift across it,
   * which is what makes a two-row grid behave like a grid.
   */
  const NAV_SELECTOR = 'button, input, [tabindex]:not([tabindex="-1"])';

  UI.focusables = function () {
    return [...this.overlay.querySelectorAll(NAV_SELECTOR)]
      .filter((n) => !n.disabled && n.offsetParent !== null);
  };

  UI.navigate = function (dx, dy) {
    const items = this.focusables();
    if (!items.length) return false;
    const cur = items.indexOf(document.activeElement) >= 0 ? document.activeElement : null;
    if (!cur) { items[0].focus(); return true; }

    const a = cur.getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bestScore = Infinity;
    for (const n of items) {
      if (n === cur) continue;
      const r = n.getBoundingClientRect();
      const ox = r.left + r.width / 2 - ax, oy = r.top + r.height / 2 - ay;
      const along = ox * dx + oy * dy;
      if (along <= 4) continue;                 // not in the pressed direction
      const across = WS.abs(ox * dy - oy * dx);
      const score = along + across * 2.4;       // drift costs more than distance
      if (score < bestScore) { bestScore = score; best = n; }
    }
    if (!best) return false;
    /* Mark the session as keyboard/pad driven before focusing.
     *
     * :focus-visible is a browser heuristic about how focus was ACQUIRED, and
     * a programmatic .focus() - which is all a spatial navigator can do - does
     * not reliably satisfy it. Relying on it meant arrowing around the menu
     * left the player with the default 1px browser outline or nothing at all.
     * The class says plainly what the heuristic was guessing at. */
    document.body.classList.add('nav-active');
    best.focus();
    WS.Audio.play('hover');
    return true;
  };

  /** The moment a pointer moves, focus rings stop being the way you are
   *  steering, so they stop being drawn. */
  UI.wireNavMode = function () {
    const off = () => document.body.classList.remove('nav-active');
    window.addEventListener('pointerdown', off, { passive: true });
    window.addEventListener('pointermove', off, { passive: true });
  };

  /** Gamepad, polled from the frame loop while an overlay is up. Edge
   *  detected with a repeat delay, so holding a direction walks a list at a
   *  readable pace instead of teleporting to the end of it. */
  const PAD = { axis: 0, held: 0, repeat: 0, a: false, b: false };
  UI.pollMenuPad = function (dt) {
    if (this.overlay.classList.contains('hidden')) { PAD.axis = 0; return; }
    if (!navigator.getGamepads) return;
    const pad = navigator.getGamepads()[WS.Input.gamepadIndex];
    if (!pad) return;

    const dead = 0.5;
    let dx = 0, dy = 0;
    const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    if (ax < -dead) dx = -1; else if (ax > dead) dx = 1;
    if (ay < -dead) dy = -1; else if (ay > dead) dy = 1;
    if (pad.buttons.length > 15) {
      if (pad.buttons[12].pressed) dy = -1;
      if (pad.buttons[13].pressed) dy = 1;
      if (pad.buttons[14].pressed) dx = -1;
      if (pad.buttons[15].pressed) dx = 1;
    }

    const dir = dx * 3 + dy;                    // a cheap direction identity
    if (dir === 0) { PAD.axis = 0; PAD.held = 0; }
    else if (dir !== PAD.axis) {
      PAD.axis = dir; PAD.held = 0; PAD.repeat = 0.34;
      this.navigate(dx, dy);
    } else {
      PAD.held += dt;
      if (PAD.held >= PAD.repeat) { PAD.held = 0; PAD.repeat = 0.12; this.navigate(dx, dy); }
    }

    const a = !!(pad.buttons[0] && pad.buttons[0].pressed);
    if (a && !PAD.a) {
      const f = document.activeElement;
      if (f && this.overlay.contains(f) && !f.disabled) f.click();
      else { const items = this.focusables(); if (items[0]) items[0].focus(); }
    }
    PAD.a = a;

    const back = !!(pad.buttons[1] && pad.buttons[1].pressed);
    if (back && !PAD.b) {
      if (WS.Game.state === 'paused') WS.Game.resume();
    }
    PAD.b = back;
  };

  UI.show = function (inner) {
    hideTip();
    // Any leave still in flight belongs to a screen that is now gone.
    this._leaveToken++;
    if (this._leaveTimer) { clearTimeout(this._leaveTimer); this._leaveTimer = null; }
    this.overlay.classList.remove('leaving');
    this._committing = false;
    this.overlay.innerHTML = '';
    this.overlay.append(inner);
    this.overlay.classList.remove('hidden');
    // Out of a run there is a live scene behind the panels, so the scrim
    // lightens to let it through.
    this.overlay.classList.toggle('scene', !WS.Game.player);
    this.wireScroll(inner);
  };

  /** Keeps a scroll area honest: content that continues must look like it
   *  continues, or it reads as cut off.
   *
   *  This deliberately does not measure scrollHeight. It did, and it latched:
   *  on the first layout the body measured 14px taller than its client box,
   *  the scrim switched on, and nothing ever re-measured - so a level-up whose
   *  three cards fit exactly got a 44px black band painted across their feet.
   *  A ResizeObserver does not help, because no observed box changed; only
   *  scrollHeight did.
   *
   *  Instead a zero-height sentinel sits at the end of the content and an
   *  IntersectionObserver watches whether it is inside the scroll port. That
   *  is the question being asked - "is there more below?" - answered directly,
   *  and it re-fires on scroll, resize and content change without polling.
   */
  UI.wireScroll = function (root) {
    const body = root.querySelector('.overlay-body');
    if (!body) return;
    // append() moves an existing node, so calling this again after a pane swap
    // puts the scrim and the sentinel back at the end where they belong.
    body.append(body.querySelector('.scroll-scrim') || el('div', 'scroll-scrim'));
    const end = body.querySelector('.scroll-end') || el('i', 'scroll-end');
    body.append(end);

    if (!window.IntersectionObserver) return;   // no affordance beats a wrong one
    if (body._scrollWatch) body._scrollWatch.disconnect();
    body._scrollWatch = new IntersectionObserver(
      ([e]) => body.classList.toggle('has-more', !e.isIntersecting),
      { root: body, threshold: 0 });
    body._scrollWatch.observe(end);
  };

  /* ------------------------------------------------------------- cards --- */
  function cardFor(choice, onPick, index) {
    const colour = choiceColour(choice);
    const card = el('button', 'card');
    card.type = 'button';
    card.style.setProperty('--q', WS.hex(colour));

    const inlay = el('div', 'card-inlay');
    for (let i = 0; i < 4; i++) inlay.append(el('i'));
    card.append(inlay);

    const plate = el('div', 'icon-plate');
    plate.append(icon(choice.art || 'rune', colour, 66));
    card.append(plate);

    card.append(el('div', 'card-name', choice.name));
    if (choice.note) card.append(el('div', 'card-note', choice.note));

    /* THE RANK, AS A ROW OF PIPS.
     *
     * "RANK 7 / 8" is a fact about a card and not a feeling about it, and a
     * card taking a weapon to its last rank looked exactly like one taking a
     * passive to its second. A filled row reads at a glance, carries how far
     * along this thing is without being read, and gives the card something to
     * escalate: past two thirds the card takes a gilt edge, and the one that
     * finishes a track takes the full treatment. */
    if (choice.maxRank > 1) {
      const pips = el('div', 'card-pips');
      const at = choice.rank || 1;
      for (let i = 1; i <= choice.maxRank; i++) {
        const pip = el('i', i <= at ? 'on' : null);
        if (i === at) pip.classList.add('now');
        pips.append(pip);
      }
      card.append(pips);
      const k = at / choice.maxRank;
      if (k >= 1) card.classList.add('crowning');
      else if (k >= 0.66) card.classList.add('rising');
    }
    if (choice.type === 'evolve' || choice.type === 'union') card.classList.add('crowning');

    card.append(el('div', 'card-body', choice.description || ''));

    /* What this will react with. See LevelUp.reactionsFor - the whole game is
       built on things combining and the card used to say none of it. */
    if (choice.reacts && choice.reacts.length) {
      const row = el('div', 'card-reacts');
      for (const r of choice.reacts) {
        const tag = el('div', 'react' + (r.ready ? ' ready' : ''));
        tag.append(el('i', 'react-mark'), el('span', null, r.text));
        row.append(tag);
      }
      card.append(row);
    }

    if (choice.detail && WS.Save.settings.levelUpTooltips) {
      card.append(el('div', 'card-detail', choice.detail));
    }
    if (index !== undefined) card.append(el('div', 'card-key', String(index + 1)));
    card.addEventListener('click', () => { hideTip(); onPick(choice, card); });

    /* The card shows the two reactions that matter most; the tip shows all
       of them - every evolution, discovery and union this choice is part of. */
    const p = WS.Game.player;
    if (p) {
      let build = null;
      // Only when it adds something: a card whose thing works with nothing
      // would get a tip that repeats the card and covers its neighbour.
      if (choice.type === 'weapon_rank' || choice.type === 'new_weapon') build = tipWeapon(p, null, choice.id, choice.rank, true);
      else if (choice.type === 'evolve') build = tipWeapon(p, WS.Player.getWeapon(p, choice.id), null, null, true);
      else if (choice.type === 'stat') build = tipPassive(p, choice.id, choice.rank, true);
      if (build) tipOn(card, build, { prefer: ['below', 'above', 'right', 'left'], delay: 260 });
    }
    return card;
  }

  /* ---------------------------------------------------------- main menu -- */
  UI.openMenu = function () {
    this.hud.classList.add('hidden');
    // The watch fire is burning whenever the menu is up.
    WS.Audio.setAmbience('hearth');
    const s = shell('The Ember Watch', 'Arclight');

    const title = el('div'); title.id = 'title-wrap';
    const h = el('h1', 'game-title');
    /* Three parts, because the logotype treats them differently: a small cool
     * article, the EMBER struck in gilt, and the WATCH in cold grey. The lit
     * word is the ember because the ember is the thing that is lit - one warm
     * point held inside something grey and steady, which is the whole title
     * said in type before a word of it is read. */
    const ember = el('span', 'nm', 'Ember');
    /* Sparks leaving the lit word - a handful, on staggered clocks, so the
       title is a fire that is going rather than a picture of one. */
    const sparks = el('span', 'sparks');
    for (let i = 0; i < 7; i++) {
      const sp = el('i');
      sp.style.left = (12 + i * 12.5) + '%';
      sp.style.animationDelay = (i * 0.53 + (i % 3) * 0.31).toFixed(2) + 's';
      sp.style.animationDuration = (2.8 + (i % 4) * 0.55).toFixed(2) + 's';
      sp.style.setProperty('--dx', ((i % 2 ? 1 : -1) * (4 + i * 2)) + 'px');
      sparks.append(sp);
    }
    ember.append(sparks);
    h.append(el('span', 'art', 'The'), ember, el('span', 'wm', 'Watch'));
    // The premise, in five words: what you are doing and for how long.
    const sub = el('div', 'game-sub', 'Thirty minutes until dawn');
    title.append(h, sub, el('div', 'title-arc'));
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
    /* The banked total lives in the footer, but the Trainer - the one screen
     * that spends it - lives in the pane. Building the readout once meant a
     * purchase debited the save, redrew the shop with its new prices, and left
     * the number the player was budgeting against sitting at its old value
     * until the page was reloaded. Measured: buy a 200g rank out of 100,000
     * and the footer still reads 100.0kg. So the readout is refreshed by the
     * same render() that redraws the pane, and there is now one path by which
     * gold changes and one place that reacts to it. */
    const bank = el('div', 'bank');
    const bankValue = el('span', 'v', '');
    bank.append(el('span', 'label', 'Banked'), bankValue);

    const render = () => {
      for (const btn of tabs.children) btn.classList.toggle('active', btn.dataset.tab === UI.tab);
      panes.replaceChildren(UI.buildPane(UI.tab, render));
      bankValue.textContent = WS.formatNumber(WS.Save.db.gold) + ' gold';
      requestAnimationFrame(() => {
        const body = s.inner.querySelector('.overlay-body');
        if (!body) return;
        body.scrollTop = 0;
        UI.wireScroll(s.inner);      // re-seats the scrim behind the new pane
      });
    };
    for (const [id, label] of TABS) {
      const b = el('button', 'tab', label);
      b.dataset.tab = id;
      b.addEventListener('click', () => { UI.tab = id; WS.Audio.play('page'); render(); });
      tabs.append(b);
    }
    /* The tab strip used to scroll away with the pane beneath it - both were
       children of the same scrolling .overlay-body. On a short viewport (a
       phone in landscape, or a browser window that is not maximised) that
       body has little room to begin with, and losing part of it to a tab
       strip the player has already used to get here left almost nothing on
       screen: the roster's detail card reduced to a sliver, the picker row
       scrolled out of sight below it with no hint that was where it went.
       Navigation belongs with the header, not the content - it should still
       be there after you have scrolled. */
    s.inner.insertBefore(tabs, s.body);
    s.body.append(panes);
    render();

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

    /* Hyper is armed globally and applies PER BATTLEFIELD, and this button used
     * to only know about the first half.
     *
     * `hyperArmed` is one flag for the whole account, but a run is only a Hyper
     * run when the map it is on has been won - game.js: `unlocks.hyper[mapId]
     * && hyperArmed`. So arming it and then picking a battlefield you have not
     * cleared gave you a footer reading "Hyper: ON" above a Begin Run that
     * started an ordinary run. Measured: armed, Thornhollow won, begin
     * Thornhollow -> run.hyper true; same armed state, begin Pale Wastes ->
     * run.hyper false, button still reading ON. The summary afterwards was
     * honest about it, which meant the only place the lie appeared was the
     * moment the player was deciding.
     *
     * It reads the selected battlefield now, and says which of the three
     * things is true: this one is armed, this one has to be won first, or -
     * for the Arena, which runs its own fight and never touches the wave
     * scaling Hyper multiplies - it does not apply here at all. */
    const hyper = el('button', 'btn', '');
    const setHyperLabel = () => {
      const id = WS.Game.selection.map;
      const map = WS.Maps[id];
      if (map && map.arena) {
        hyper.textContent = 'Hyper: —';
        hyper.dataset.tip = map.name + ' runs its own fight, so Hyper has nothing to scale.';
        hyper.disabled = true;
        return;
      }
      const has = !!(WS.Save.db.unlocks.hyper && WS.Save.db.unlocks.hyper[id]);
      hyper.disabled = !has;
      hyper.textContent = has
        ? 'Hyper: ' + (WS.Save.db.hyperArmed ? 'ON' : 'off')
        : 'Hyper: win here first';
      hyper.dataset.tip = has
        ? 'Enemies and bosses 40% stronger, and waves a third more often.'
        : (map ? `Survive thirty minutes on ${map.name} to open Hyper there.` : '');
    };
    setHyperLabel();
    hyper.addEventListener('click', () => {
      WS.Save.db.hyperArmed = !WS.Save.db.hyperArmed;
      WS.Save.save(); setHyperLabel(); WS.Audio.play('ui');
    });
    /* Picking a battlefield does not rebuild the menu - it swaps the cartouche
       in place - so the footer has to be told. */
    UI.syncModes = setHyperLabel;

    const help = el('button', 'btn', 'How to play');
    help.addEventListener('click', () => { WS.Audio.play('ui'); UI.openManual(); });

    /* The prologue is shown once unprompted and then lives here, next to the
       manual - the two things a player might want again and can never find
       once a menu has swallowed them. */
    const story = el('button', 'btn', 'Prologue');
    story.addEventListener('click', () => {
      WS.Audio.play('ui');
      UI.closeOverlay();
      WS.Audio.setAmbience(null);
      WS.Prologue.begin(() => UI.openMenu());
    });

    s.foot.append(bank, el('div', 'spacer'), story, help, diff, hyper, begin);
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

  /** The cartouche: the current selection shown whole, above its grid, so a
   *  pick is a decision made with the numbers in front of you. */
  function cartouche() {
    return el('div', 'cartouche bracketed');
  }

  /** A cartouche's figures. `num` rows read figure-first, the way you would
   *  say them - "110 health" - and the rest read as a label and its answer. */
  function statLine(rows) {
    const line = el('div', 'stat-line');
    for (const r of rows) {
      if (!r) continue;
      const box = el('div', 's' + (r[2] ? ' num' : ''));
      box.append(el('span', 'label', r[0]), el('b', null, String(r[1])));
      line.append(box);
    }
    return line;
  }

  function perk(label, text) {
    const p = el('div', 'perk');
    p.append(el('span', 'perk-label', label), el('span', null, text));
    return p;
  }

  /** A battlefield's own colour for its name. Its palette is its ground,
   *  which is dark by design and reads as mud when set in type; this is the
   *  colour of the thing you remember about the place instead. */
  const PLACE_HUES = { forest: '#a8d69a', plains: '#e6c47e', haunted: '#bcaeea',
    savannah: '#f0a06e', glacier: '#a6d8f2', arena: '#d6a4f0' };
  function placeHue(m) { return PLACE_HUES[m.art] || WS.hex(m.groundAlt); }

  /** The old still, for a build without the living pictures. */
  function stillArt(canvas) {
    const img = new Image();
    img.src = canvas.toDataURL();
    img.width = img.height = 184;
    return img;
  }

  function fillSurvivorCartouche(node, id) {
    const c = WS.Characters[id];
    node.innerHTML = '';
    const art = el('div', 'art');
    art.append(WS.Vignette ? WS.Vignette.survivor(id, c.color) : stillArt(WS.Sprites.portrait(id, c.color, 184)),
      el('i', 'frame'));
    art.style.setProperty('--q', WS.hex(c.color));
    node.classList.remove('map');
    node.style.setProperty('--q', WS.hex(c.color));

    const body = el('div');
    body.append(el('h3', null, c.name));
    body.append(el('div', 'label role', `${c.className} · ${c.title}`));
    body.append(el('p', 'flavour', WS.template(c.description, c)));

    body.append(statLine([
      ['Health', c.maxHealth, true],
      ['Speed', c.moveSpeed, true],
      ['Armor', c.armor || 'no', true],
      ['Pickup', c.pickupRadius, true],
      c.healthRegen ? ['Regen', c.healthRegen.toFixed(1) + '/s', true] : null,
      ['Opens with', WS.Weapons[c.weapon].name],
    ]));
    body.append(perk('Knack', WS.template(c.perk, c)));

    node.append(art, body);
  }

  function fillMapCartouche(node, id) {
    const m = WS.Maps[id];
    node.innerHTML = '';
    const art = el('div', 'art');
    const key = { forest: 'leaf', plains: 'wheat', haunted: 'deadtree', savannah: 'sun', glacier: 'crystal', arena: 'sovereign' }[m.art] || 'rune';
    art.append(WS.Vignette ? WS.Vignette.battlefield(id) : stillArt(WS.Sprites.zoneCard(m, key, 184)),
      el('i', 'frame'));
    art.style.setProperty('--q', WS.hex(m.groundAlt));
    node.classList.add('map');
    node.style.setProperty('--q', placeHue(m));

    const body = el('div');
    body.append(el('h3', null, m.name));
    body.append(el('div', 'label role', m.subtitle));
    body.append(el('p', 'flavour', WS.template(m.description, m)));

    const best = WS.Save.stats.bestTime[id] || 0;
    body.append(statLine([
      ['Difficulty', '×' + m.difficulty, true],
      ['Gold', '×' + m.goldMult, true],
      m.arena ? null : ['Bosses', m.bosses.length, true],
      m.arena ? null : ['Swarms', m.events.length, true],
      m.arena ? null : ['Your best', best ? WS.formatTime(best) : 'not yet'],
      WS.Save.db.unlocks.hyper[id] ? ['Hyper', 'unlocked'] : null,
    ]));

    // The roster this battlefield actually fields, so the pick is informed.
    if (!m.arena) {
      const seen = [];
      for (const phase of m.phases) {
        for (const r of phase.roster) if (!seen.includes(r.id)) seen.push(r.id);
      }
      const names = seen.slice(0, 6).map((eid) => WS.Enemies[eid].name).join(', ');
      body.append(perk('Who walks here', names + (seen.length > 6 ? ', and worse.' : '.')));
    }
    node.append(art, body);
  }

  UI.paneRoster = function () {
    const wrap = el('div');
    wrap.style.marginTop = '16px';
    const detail = cartouche();
    fillSurvivorCartouche(detail, WS.Game.selection.character);

    const grid = el('div', 'pick-grid');
    for (const id of WS.CharacterOrder) {
      const c = WS.Characters[id];
      const unlocked = WS.Save.isCharacterUnlocked(id);
      const node = el('button', 'pick' + (unlocked ? '' : ' locked')
        + (WS.Game.selection.character === id ? ' selected' : ''));
      node.type = 'button';
      node.style.setProperty('--q', WS.hex(unlocked ? c.color : [0.3, 0.32, 0.4]));
      // A seated plate rather than a sprite laid on the tile, so the roster
      // is built out of the same parts as the ability icons.
      const seat = el('span', 'pick-seat');
      const img = new Image();
      img.src = WS.Sprites.hero(id, unlocked ? c.color : [0.18, 0.19, 0.24], 44).toDataURL();
      img.width = img.height = 44;
      if (!unlocked) img.style.filter = 'brightness(.55) contrast(.7)';
      seat.append(img);
      const main = el('div');
      main.append(el('div', 'pick-name', unlocked ? c.name : '???'));
      main.append(el('div', 'pick-sub', unlocked
        ? `${c.className} · ${WS.Weapons[c.weapon].name}`
        : c.unlockHint || 'Locked'));
      node.append(seat, main);
      if (unlocked) {
        node.addEventListener('click', () => {
          WS.Game.selection.character = id;
          WS.Audio.play('select');
          for (const n of grid.children) n.classList.remove('selected');
          node.classList.add('selected');
          fillSurvivorCartouche(detail, id);
        });
      }
      grid.append(node);
    }
    wrap.append(detail, grid);
    return wrap;
  };

  UI.paneMaps = function () {
    const wrap = el('div');
    wrap.style.marginTop = '16px';
    const detail = cartouche();
    fillMapCartouche(detail, WS.Game.selection.map);

    const grid = el('div', 'pick-grid');
    for (const id of WS.MapOrder) {
      const m = WS.Maps[id];
      const unlocked = WS.Save.isMapUnlocked(id);
      const node = el('button', 'pick map' + (unlocked ? '' : ' locked')
        + (WS.Game.selection.map === id ? ' selected' : ''));
      node.type = 'button';
      node.style.setProperty('--q', unlocked ? placeHue(m) : WS.hex([0.3, 0.32, 0.4]));
      const art = { forest: 'leaf', plains: 'wheat', haunted: 'deadtree', savannah: 'sun', glacier: 'crystal', arena: 'sovereign' }[m.art] || 'rune';
      const seat = el('span', 'pick-seat');
      const img = icon(art, unlocked ? m.groundAlt : [0.22, 0.23, 0.28], 44);
      img.width = img.height = 44;
      seat.append(img);
      node.append(seat);
      const main = el('div');
      main.append(el('div', 'pick-name', m.name));
      main.append(el('div', 'pick-sub', unlocked ? m.subtitle : (m.unlockHint || 'Locked')));
      node.append(main);
      if (unlocked) {
        node.addEventListener('click', () => {
          WS.Game.selection.map = id;
          WS.Audio.play('select');
          for (const n of grid.children) n.classList.remove('selected');
          node.classList.add('selected');
          fillMapCartouche(detail, id);
          // Hyper is per-battlefield, so the footer changes with this pick.
          if (UI.syncModes) UI.syncModes();
        });
      }
      grid.append(node);
    }
    wrap.append(detail, grid);
    return wrap;
  };

  UI.paneTrainer = function (rerender) {
    const wrap = el('div');
    wrap.style.marginTop = '16px';
    // Every lesson is permanent; the drillmaster says so in his own words.
    const intro = el('div', 'trainer-voice');
    intro.append(el('q', null, 'Gold is no use to the dead. Hand it here and I will give you something that stays with you, every night after this one.'),
      el('span', 'who', 'Harrow, drillmaster of the Watch'));
    const rows = el('div', 'rows');
    for (const id of WS.MetaUpgradeOrder) {
      const m = WS.MetaUpgrades[id];
      const rank = WS.Save.metaRank(id);
      const cost = WS.Save.metaCost(id);
      /* Four columns across the full width: the mark, what it does, how far
         you have taken it, and what the next rank costs. It used to be three
         things crowded into the left quarter with a dim price marooned on the
         far right and the middle sixty per cent empty. */
      const row = el('div', 'row trainer-row' + (rank >= m.max ? ' maxed' : ''));
      row.append(icon(m.art, WS.CONST.COLORS.arc, 40));
      const main = el('div', 'row-main');
      main.append(el('div', 'row-name', m.name.replace(/^Lessons:\s*/, '')));
      main.append(el('div', 'row-sub', WS.template(m.description, m)));
      row.append(main);

      /* Two ways to show a rank, chosen by how many there are.
       *
       * Up to a dozen, one cell per rank: countable, and the next one can be
       * outlined so the purchase has a visible destination. Beyond that a
       * bar, because Curious Egg goes to a hundred and a hundred cells does
       * not degrade gracefully - it squeezed the name column to a two-letter
       * word and stretched the row to a quarter of the page. The old code
       * only drew pips at max <= 10 and I dropped that guard when I rebuilt
       * this row; the bar is the version that has no ceiling to forget. */
      const track = el('div', 'rank-track');
      if (m.max <= 12) {
        const pips = el('div', 'rank-pips');
        for (let i = 0; i < m.max; i++) {
          const pip = el('i');
          if (i < rank) pip.classList.add('on');
          if (i === rank && cost !== null) pip.classList.add('next');
          pips.append(pip);
        }
        track.append(pips);
      } else {
        const bar = el('div', 'rank-bar');
        const fill = el('i');
        fill.style.width = `${(rank / m.max) * 100}%`;
        bar.append(fill);
        track.append(bar);
      }
      track.append(el('span', 'rank-count', `${rank}/${m.max}`));
      row.append(track);

      if (cost === null) {
        row.append(el('div', 'row-value maxed-tag', 'Mastered'));
      } else {
        const buy = el('button', 'btn buy', '');
        buy.append(el('b', null, WS.formatNumber(cost)), el('span', 'g', 'g'));
        buy.disabled = WS.Save.db.gold < cost;
        buy.dataset.tip = buy.disabled
          ? `You have ${WS.formatNumber(WS.Save.db.gold)}g of the ${WS.formatNumber(cost)}g this costs.`
          : `Buy rank ${rank + 1} of ${m.max}.`;
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

    /* Each section says where you stand. A codex without a count is a list you
       scroll to find out whether you are nearly done. */
    const achDone = WS.AchievementOrder.filter((id) => WS.Save.db.achievements[id]).length;
    const achHead = el('div', 'codex-head');
    achHead.append(el('h3', 'panel-title', 'Achievements'));
    achHead.append(el('div', 'codex-count', `${achDone} / ${WS.AchievementOrder.length}`));
    const achRows = el('div', 'rows');
    for (const id of WS.AchievementOrder) {
      const a = WS.Achievements[id];
      const done = !!WS.Save.db.achievements[id];
      const row = el('div', 'row ' + (done ? 'done' : 'undone'));
      row.append(icon(a.art, done ? WS.CONST.QUALITY.uncommon : [0.35, 0.38, 0.45], 40));
      const main = el('div', 'row-main');
      main.append(el('div', 'row-name', a.name));
      main.append(el('div', 'row-sub', WS.template(a.description, a)));
      row.append(main);
      if (a.reward) row.append(el('div', 'row-value', WS.Achievements.rewardText(a)));
      achRows.append(row);
    }

    const comboDone = WS.ComboOrder.filter((id) => WS.Save.db.combos[id]).length;
    const comboHead = el('div', 'codex-head');
    comboHead.style.marginTop = '22px';
    comboHead.append(el('h3', 'panel-title', 'Discoveries'));
    comboHead.append(el('div', 'codex-count', `${comboDone} / ${WS.ComboOrder.length}`));
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

    /* Evolutions and unions: the two things a run can turn up that the codex
       could not show you. Both were counted and neither was named, and a
       count tells you how many you have, not which ones are left - which is
       the only question this page exists to answer.
       
       The recipe is shown whether or not you have earned it, because the
       level-up card already says "Evolves with Precision into Skybreak" the
       moment you pick the weapon up. Hiding it here would not be a secret
       kept, it would be the same fact told in one place and not the other.
       What an unearned row does is sit there greyed, so the gaps are
       countable at a glance. */
    /* Title and count only in the head - the same two things the sections
       above it carry. A third element in there pushes the count into the
       middle of the bar, where it reads as a stray number rather than as
       this section's score. The line belongs under it. */
    const section = (title, rows, done, total, note) => {
      const head = el('div', 'codex-head');
      head.style.marginTop = '22px';
      head.append(el('h3', 'panel-title', title));
      head.append(el('div', 'codex-count', `${done} / ${total}`));
      const out = [head];
      if (note) {
        const line = el('div', 'card-body', note);
        line.style.margin = '-4px 0 10px';
        out.push(line);
      }
      out.push(rows);
      return out;
    };

    const evolvable = WS.WeaponOrder.filter((id) => WS.Weapons[id].evolveName);
    const evoDone = evolvable.filter((id) => WS.Save.db.evolved[id]).length;
    const evoRows = el('div', 'rows');
    for (const id of evolvable) {
      const d = WS.Weapons[id];
      const got = !!WS.Save.db.evolved[id];
      const up = WS.Upgrades[d.evolvePairing];
      const row = el('div', 'row ' + (got ? 'done' : 'undone'));
      row.append(icon(d.art, got ? (WS.CONST.COLORS[d.school] || WS.CONST.QUALITY.epic)
        : [0.35, 0.38, 0.45], 40));
      const main = el('div', 'row-main');
      main.append(el('div', 'row-name', d.evolveName));
      main.append(el('div', 'row-sub',
        `${d.name} at its last rank, with ${up ? up.name : d.evolvePairing}`
        + (d.evolveDescription ? ' - ' + WS.template(d.evolveDescription, d) : '')));
      row.append(main);
      evoRows.append(row);
    }

    const uniDone = WS.Unions.filter((u) => WS.Save.db.unions[u.result]).length;
    const uniRows = el('div', 'rows');
    for (const u of WS.Unions) {
      const d = WS.Weapons[u.result];
      const got = !!WS.Save.db.unions[u.result];
      const row = el('div', 'row ' + (got ? 'done' : 'undone'));
      row.append(icon(d ? d.art : 'rune',
        got ? WS.CONST.QUALITY.legendary : [0.35, 0.38, 0.45], 40));
      const main = el('div', 'row-main');
      main.append(el('div', 'row-name', d ? d.name : u.result));
      main.append(el('div', 'row-sub',
        `${WS.Weapons[u.from[0]].name} and ${WS.Weapons[u.from[1]].name}, both fully evolved`));
      row.append(main);
      uniRows.append(row);
    }

    wrap.append(achHead, achRows, comboHead, comboRows,
      ...section('Evolutions', evoRows, evoDone, evolvable.length,
        'Every weapon becomes something else, if you take the right lesson with it.'),
      ...section('Unions', uniRows, uniDone, WS.Unions.length,
        'Two finished weapons, one slot, something neither of them was.'));
    return wrap;
  };

  /* A compendium, not a list.
   *
   * Fifty-four full-width rows reading "??? - not yet slain" is a page of
   * nothing: at a hundred pixels each you see six of them and 96% of the
   * screen is empty. A grid of plates shows the whole roster at once, which
   * is the only thing this page is actually for - how much is left to find -
   * and an unslain creature reads as a silhouette behind a question mark
   * rather than as a row you have not filled in yet.
   */
  /* ------------------------------------------------------------ bestiary -- */
  /* The Watch's book of everything that has come out of the dark.
   *
   * It was a wall of tiles: a sprite, a name or three question marks, and a
   * kill count on hover. Now it is a book - an index of every entry down the
   * left, and on the right the page of the one you have open: the thing on
   * its own ground under a lantern, what the Watch has written about it, how
   * it fights, where it walks, how many you have put down and when you first
   * did. A page the Watch has not earned yet is a shape against its sky and
   * a line saying where it has been seen. */
  const FINALE_HOME = { candlecrawler: 'thornhollow', dust_galleon: 'dustreach', admiral_ashore: 'dustreach',
    mordecai_bound: 'mourneholt', stormbreaker: 'ochre', heart_drill: 'palewastes', pale_lord: 'palewastes' };

  /** Where a thing walks, from the battlefields' own schedules. */
  function habitat(id) {
    const out = [];
    for (const mid of WS.MapOrder) {
      const m = WS.Maps[mid];
      let how = null;
      const boss = (m.bosses || []).find((x) => x.id === id);
      if (boss) how = 'arrives at ' + WS.formatTime(boss.at);
      else if (FINALE_HOME[id] === mid) how = 'at dawn';
      else if ((m.phases || []).some((ph) => ph.elite === id)) how = 'leads the horde';
      else if ((m.phases || []).some((ph) => (ph.roster || []).some((r) => r.id === id))) how = 'walks';
      else if ((m.events || []).some((ev) => ev.id === id)) how = 'swarms';
      if (m.arena && id === 'aethelgard') how = 'waits';
      if (how) out.push({ mid, m, how });
    }
    return out;
  }

  /** How it fights, said plainly, from what its template actually does. */
  function fightsBy(t) {
    const out = [];
    if (t.lunge) out.push('plants, marks a lane and charges down it');
    if (t.ranged) out.push('strikes from a distance');
    if (t.orbit) out.push('circles at a distance');
    if (t.trail) out.push('leaves poisoned ground behind it');
    if (t.burst) out.push('bursts where it dies');
    if (t.split) out.push('comes apart into smaller things');
    if (t.speed >= 90) out.push('fast');
    else if (t.speed && t.speed <= 55) out.push('slow');
    return out;
  }

  function whenMet(fm) {
    if (!fm) return 'before the Watch kept dates';
    const days = WS.floor((Date.now() - fm.at) / 86400000);
    const when = days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 30 ? days + ' days ago'
      : new Date(fm.at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
    const where = WS.Maps[fm.map] ? ' in ' + WS.Maps[fm.map].name : '';
    return `${when}${where}, ${WS.formatTime(fm.t)} into the night`;
  }

  UI.paneBestiary = function () {
    const wrap = el('div');
    wrap.style.marginTop = '16px';

    const groups = [['Creatures', WS.Enemies, 'Creature'], ['Elites', WS.Elites, 'Elite'], ['Bosses', WS.Bosses, 'Boss']];
    const all = [];
    for (const [, table, kind] of groups) for (const id of Object.keys(table)) all.push({ id, t: table[id], kind });
    const killsOf = (id) => WS.Save.stats.bestiary[id] || WS.Save.stats.bosses[id] || 0;
    const found = all.filter((e) => killsOf(e.id) > 0).length;

    const head = el('div', 'codex-head');
    head.append(el('div', 'card-body pane-intro', 'Everything that has come for you, and everything that has not yet.'));
    head.append(el('div', 'codex-count', `${found} / ${all.length}`));
    wrap.append(head);

    const book = el('div', 'book');
    const index = el('div', 'book-index');
    const page = el('div', 'book-page');
    book.append(index, page);
    wrap.append(book);

    const tiles = new Map();
    const open = (e) => {
      UI.bookSel = e.id;
      for (const [id, n] of tiles) n.classList.toggle('selected', id === e.id);
      fillPage(page, e, killsOf(e.id));
    };

    for (const [title, , kind] of groups) {
      const list = all.filter((e) => e.kind === kind);
      if (!list.length) continue;
      const n = list.filter((e) => killsOf(e.id) > 0).length;
      const h = el('h3', 'book-group');
      h.append(el('span', null, title), el('i', null, `${n} of ${list.length}`));
      index.append(h);
      const grid = el('div', 'book-grid');
      for (const e of list) {
        const known = killsOf(e.id) > 0;
        const tile = el('button', 'book-tab' + (known ? '' : ' unknown') + ' ' + kind.toLowerCase());
        tile.type = 'button';
        const img = new Image();
        img.src = WS.Sprites.creature(e.t.art, known ? e.t.tint : [0.16, 0.17, 0.21], 44, e.t.bossKit).toDataURL();
        img.width = img.height = 44;
        tile.append(img);
        tile.setAttribute('aria-label', known ? e.t.name : 'Not yet met');
        tipOn(tile, tipText(known ? e.t.name : 'Not yet met'), { prefer: ['above', 'below'], delay: 200 });
        tile.addEventListener('click', () => { WS.Audio.play('page'); open(e); });
        tile.addEventListener('focus', () => { if (UI.bookSel !== e.id) open(e); });
        tiles.set(e.id, tile);
        grid.append(tile);
      }
      index.append(grid);
    }
    // Open to the last page read, or the first thing met, or the first entry.
    const start = all.find((e) => e.id === UI.bookSel) || all.find((e) => killsOf(e.id) > 0) || all[0];
    if (start) open(start);
    return wrap;
  };

  function fillPage(page, e, kills) {
    const t = e.t, known = kills > 0, boss = e.kind === 'Boss';
    const home = habitat(e.id);
    const place = home.length ? home[0].m.art : (e.id === 'death_itself' ? 'none' : 'none');
    page.replaceChildren();
    page.classList.toggle('unknown', !known);
    page.style.setProperty('--q', WS.hex(known ? t.tint : [0.4, 0.42, 0.5]));

    const top = el('div', 'bp-top');
    const art = el('div', 'art bp-art');
    art.append(WS.Vignette ? WS.Vignette.beast(e.id, { art: t.art, tint: t.tint, kit: t.bossKit,
      known, boss, place }) : el('div'), el('i', 'frame'));
    const words = el('div', 'bp-words');
    words.append(el('h3', 'bp-name', known ? t.name : 'Not yet met'));
    const fam = t.family ? t.family.charAt(0).toUpperCase() + t.family.slice(1) : '';
    words.append(el('div', 'bp-kind', [e.kind, fam].filter(Boolean).join(' · ')));
    if (known) {
      const note = WS.Lore.bestiary && WS.Lore.bestiary[e.id];
      if (note) words.append(el('p', 'bp-note', note));
      if (t.yell) words.append(el('q', 'bp-cry', t.yell.replace(/^\*|\*$/g, '')));
    } else {
      words.append(el('p', 'bp-note', home.length
        ? `The Watch has no page for this one yet. Something walks in ${home[0].m.name} that you have not met.`
        : 'The Watch has no page for this one yet.'));
    }
    top.append(art, words);
    page.append(top);

    // The ledger sits under the note, beside the picture, so a page is read
    // whole without scrolling.
    const ledger = el('div', 'bp-ledger');
    const line = (k, v) => {
      const row = el('div', 'kv');
      row.append(el('span', null, k), el('span', null, v));
      ledger.append(row);
    };
    if (known) {
      line('Put down', WS.formatNumber(kills));
      line('First met', whenMet(WS.Save.stats.firstMet && WS.Save.stats.firstMet[e.id]));
    }
    if (home.length) line('Walks', home.map((h) => h.how === 'walks' ? h.m.name : `${h.m.name}, ${h.how}`).join('; '));
    if (known) {
      const f = fightsBy(t);
      if (f.length) line('Fights', f.join(', '));
      line('Measure', `${WS.formatNumber(t.health)} health, strikes for ${WS.formatNumber(t.damage)}`);
    }
    words.append(ledger);
  }

  UI.paneStats = function () {
    const s = WS.Save.stats;
    const wrap = el('div');
    wrap.style.marginTop = '16px';
    /* The book opens with a sentence, not a dashboard: what the tiles below
       add up to, said the way a watch captain would write it in the log. */
    const nights = s.totalRuns || 0;
    const plural = (n, one, many) => `${WS.formatNumber(n)} ${n === 1 ? one : many}`;
    wrap.append(el('p', 'pane-intro book-line', nights
      ? `${plural(nights, 'night', 'nights')} on the wall, ${WS.formatNumber(s.totalVictories || 0)} seen through to dawn. `
        + `${plural(s.totalKills || 0, 'thing', 'things')} out there will not be coming back.`
      : 'The book is empty. Every name in it started that way.'));
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
    /* Personal bests, one card per battlefield. These were full-width rows
       carrying three data points each, which is a hundred pixels of chrome
       per number; as cards they fit on one line and each one is unmistakably
       its own place, because it wears the same landscape the picker shows. */
    const head = el('div', 'codex-head');
    head.style.marginTop = '20px';
    head.append(el('div', 'card-body pane-intro', 'The longest you have held each place.'));
    const best = el('div', 'record-grid');
    for (const id of WS.MapOrder) {
      if (!WS.Save.isMapUnlocked(id)) continue;
      const m = WS.Maps[id];
      const time = s.bestTime[id] || 0;
      const card = el('div', 'record' + (time ? '' : ' unset'));
      card.style.setProperty('--q', placeHue(m));
      const img = new Image();
      img.src = WS.Sprites.zoneCard(m, 'rune', 92).toDataURL();
      img.width = img.height = 92;
      const art = el('span', 'record-art');
      art.append(img, el('i', 'frame'));
      card.append(art);
      const body = el('div');
      body.append(el('div', 'record-name', m.name));
      body.append(el('div', 'record-time', time ? WS.formatTime(time) : 'not yet'));
      card.append(body);
      best.append(card);
    }
    wrap.append(grid, head, best);
    return wrap;
  };

  /** `inRun` hides the destructive Progress row: wiping your save from a pause
   *  screen is a footgun, and unlocking everything mid-run is meaningless. */
  UI.paneSettings = function (rerender, inRun) {
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

    /** A segmented choice. Same row furniture as a toggle, so the settings
     *  list stays one list rather than a pile of different controls. */
    const choose = (key, name, desc, options, onPick) => {
      const row = el('div', 'setting');
      const main = el('div');
      main.append(el('div', 's-name', name));
      if (desc) main.append(el('div', 's-desc', desc));
      const seg = el('div', 'segmented');
      for (const [value, label] of options) {
        const b = el('button', 'seg' + (st[key] === value ? ' on' : ''), label);
        b.type = 'button';
        b.addEventListener('click', () => {
          st[key] = value;
          for (const other of seg.children) other.classList.toggle('on', other === b);
          WS.Save.save();
          WS.Audio.play('ui');
          if (onPick) onPick(value);
        });
        seg.append(b);
      }
      row.append(main, seg);
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
    choose('hudLayout', 'Arsenal and passives', 'Where your weapons and traits live.',
      [['strip', 'Along the foot'], ['rail', 'Up the edges']], () => UI.applyHudLayout());
    choose('quality', 'Graphics', 'Balanced drops trails, glows and ground detail for frames on a slower machine.',
      [['high', 'High'], ['balanced', 'Balanced']], () => WS.Renderer.applyQuality());
    /* Two cuts of the prologue exist while the author decides which one to
       keep, and the only way to decide is to watch them one after the other.
       The button that plays it is in the menu footer, so this sits here and
       changes what that button plays. */
    if (WS.Cinematic && WS.PrologueV1 && WS.PrologueV2) {
      choose('cinematic', 'Prologue',
        'Two cuts. Version two adds parallax, cross-fades, weather and the rest '
        + 'of the roster cresting the hill at dawn. Watch either from the menu.',
        [[1, 'Version one'], [2, 'Version two']],
        (v) => WS.Cinematic.select(v));
    }
    toggle('victoryCinematic', 'Victory cinematic',
      'Twenty-three seconds at thirty minutes, starring the survivor you ran, '
      + 'before the results. Off puts you straight on the numbers.');
    toggle('mouseSteer', 'Steer with the mouse',
      'Hold the left button anywhere on the field and drag, the same as touch. '
      + 'Play one-handed, or keep both on the keys.');

    if (inRun) return wrap;

    /* ---- the account, and getting it off this machine -------------------- */
    /* A save that only exists in one browser's localStorage is one cleared
     * cache away from gone, and there is no way to move it to a second
     * machine. Both halves are here, and the import deliberately makes you
     * look at what you are about to replace before it does it. */
    const acct = el('div', 'setting');
    const amain = el('div');
    amain.append(el('div', 's-name', 'Back up this account'));
    const desc = el('div', 's-desc');
    const sum = WS.Save.describe(WS.Save.db);
    desc.textContent = `${sum.gold.toLocaleString()} gold, ${sum.characters} survivors, `
      + `${sum.maps} battlefields, ${sum.runs} runs. Your progress lives in this browser `
      + 'only - copy it somewhere safe, or move it to another machine.';
    amain.append(desc);
    const note = el('div', 's-desc');
    note.style.marginTop = '6px';
    amain.append(note);
    const say = (msg, bad) => {
      note.textContent = msg || '';
      note.style.color = msg ? (bad ? 'var(--blood)' : 'var(--arc)') : '';
    };

    const abtns = el('div');
    abtns.style.display = 'flex'; abtns.style.gap = '8px'; abtns.style.flexWrap = 'wrap';

    const copyBtn = el('button', 'btn small', 'Copy code');
    copyBtn.addEventListener('click', async () => {
      WS.Audio.play('ui');
      const code = await WS.Save.pack();
      if (!code) return say('This browser would not encode the save.', true);
      try {
        await navigator.clipboard.writeText(code);
        say(`Copied - ${code.length.toLocaleString()} characters. Paste it somewhere you `
          + 'will still have next year.');
      } catch (e) {
        // Clipboard is gated in plenty of contexts; the file always works.
        say('The clipboard is blocked here - use Save to file instead.', true);
      }
    });

    const fileBtn = el('button', 'btn small', 'Save to file');
    fileBtn.addEventListener('click', () => {
      WS.Audio.play('ui');
      const out = WS.Save.export();
      try {
        const blob = new Blob([out.json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const day = new Date().toISOString().slice(0, 10);
        a.href = url; a.download = `ember-watch-${day}.json`;
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        say('Saved. It is plain JSON - you can read it, and so can a future you.');
      } catch (e) { say('This browser would not hand over a file.', true); }
    });

    /* Import is two steps on purpose. Step one says what is in the incoming
       account and what it would replace; step two is the only thing that
       writes. Nobody overwrites thirty hours by mis-clicking once. */
    let pending = null;
    const loadBtn = el('button', 'btn small', 'Load from a file or code');
    const box = el('textarea');
    box.className = 'import-box hidden';
    box.rows = 3;
    box.placeholder = 'Drop a save file on the window, choose one below, or paste a code';
    const pickBtn = el('button', 'btn small hidden', 'Choose file...');
    const goBtn = el('button', 'btn small primary hidden', 'Replace my progress');
    const cancelBtn = el('button', 'btn small hidden', 'Cancel');
    const picker = el('input');
    picker.type = 'file'; picker.accept = '.json,application/json,text/plain';
    picker.className = 'hidden';

    const reset = () => {
      pending = null;
      box.value = '';
      box.classList.add('hidden');
      pickBtn.classList.add('hidden');
      goBtn.classList.add('hidden');
      cancelBtn.classList.add('hidden');
      loadBtn.classList.remove('hidden');
      say('');
    };
    const offer = async (text) => {
      // unpack is a no-op on anything that is not a packed code, so this can
      // run over a pasted file, an old code or a new one without asking which
      const r = WS.Save.parseImport(await WS.Save.unpack(text));
      if (!r.ok) { pending = null; goBtn.classList.add('hidden'); return say(r.error, true); }
      pending = r.db;
      goBtn.classList.remove('hidden');
      const i = r.summary, o = r.replacing;
      say(`That account has ${i.gold.toLocaleString()} gold, ${i.characters} survivors and `
        + `${i.runs} runs. It would replace the one on this machine `
        + `(${o.gold.toLocaleString()} gold, ${o.characters} survivors, ${o.runs} runs). `
        + (r.warn ? r.warn + ' ' : '') + 'This cannot be undone.');
    };

    loadBtn.addEventListener('click', () => {
      WS.Audio.play('ui');
      loadBtn.classList.add('hidden');
      box.classList.remove('hidden');
      pickBtn.classList.remove('hidden');
      cancelBtn.classList.remove('hidden');
      box.focus();
    });
    box.addEventListener('input', () => { if (box.value.trim()) offer(box.value); else say(''); });
    pickBtn.addEventListener('click', () => picker.click());
    picker.addEventListener('change', () => {
      const f = picker.files && picker.files[0];
      if (!f) return;
      const fr = new FileReader();
      fr.onload = () => offer(String(fr.result));
      fr.onerror = () => say('That file could not be read.', true);
      fr.readAsText(f);
    });
    cancelBtn.addEventListener('click', () => { WS.Audio.play('ui'); reset(); });
    goBtn.addEventListener('click', () => {
      if (!pending) return;
      WS.Save.adopt(pending);
      WS.Audio.play('level');
      rerender();
    });

    abtns.append(copyBtn, fileBtn, loadBtn, pickBtn, goBtn, cancelBtn, picker);
    acct.append(amain, abtns);
    wrap.append(acct, box);

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
  UI.openBlessing = function (choices, sub) {
    const s = shell('Choose a Blessing', sub || 'One boon, and it stays with you.');
    const row = el('div', 'card-row');
    this._committing = false;
    choices.forEach((c, i) => row.append(cardFor(c, (choice, card) => {
      this.commitCard(card, () => WS.Game.chooseBlessing(choice));
    }, i)));
    s.body.append(row);
    this.show(s.inner);
  };

  /* Banish is a MODE, not new content.
   *
   * Clicking it used to call openLevelUp again, which rebuilt the whole shell
   * and handed it to show(): the overlay animation replayed, all three cards
   * dealt themselves in again, the scroll port re-measured (a scrollbar
   * flashing in and out), and the footer resized as the hint appeared. The
   * player asked one question - "which of these do I want gone?" - and the
   * screen answered by reloading itself.
   *
   * So the overlay is built once and the mode is a class. The hint is always
   * in the DOM at its final width and only its opacity changes, because a
   * label that appears re-centres the button bar and nothing may move.
   */
  UI.setBanishMode = function (on) {
    this.banishMode = on;
    const ui = this._levelUI;
    if (!ui) return;
    ui.row.classList.toggle('banish-mode', on);
    ui.hint.classList.toggle('on', on);
    ui.banish.classList.toggle('armed', on);
    ui.banish.setAttribute('aria-pressed', on ? 'true' : 'false');
  };

  function levelSub() {
    return WS.Game.pendingLevelUps > 1
      ? `${WS.Game.pendingLevelUps} more after this one.` : 'Take what you need.';
  }

  UI.openLevelUp = function (choices) {
    const p = WS.Game.player;

    /* Two levels at once is the most ordinary thing that happens in this game
     * - one gem finishes a bar and starts the next - and it used to tear the
     * screen down and build it again between them: a new shell handed to
     * show(), the overlay animation replayed, the scroll port re-measured,
     * three fresh cards dealt into a frame that had just been thrown away.
     * Measured: the .overlay-inner element after the first pick was not the
     * one before it, and the new one was running sweep-in.
     *
     * That is the same fault the banish mode below was already fixed for. So
     * a level-up that opens while a level-up is already up keeps its frame and
     * changes what is written in it - the heading counts on, the subtitle says
     * how many are left, and only the cards are re-dealt. */
    const ui = this._levelUI;
    if (ui && !this.overlay.classList.contains('hidden')
      && !this.overlay.classList.contains('leaving') && document.contains(ui.row)) {
      ui.title.textContent = 'Level ' + p.level;
      ui.sub.textContent = levelSub();
      this.setBanishMode(false);
      this.fillLevelChoices(choices);
      return;
    }

    // Copy carries as much of the tone as the art does. The game wants to be
    // playable at a stroll and sweatable if you lean in, so the prompts invite
    // rather than instruct - "take what you need", not "choose a boon".
    const s = shell('Level ' + p.level, levelSub());
    const row = el('div', 'card-row');

    const bar = el('div', 'choice-bar');
    const reroll = el('button', 'btn small', `Reroll (${p.rerolls})`);
    reroll.disabled = p.rerolls <= 0;
    reroll.addEventListener('click', () => { this.banishMode = false; WS.Game.rerollLevelUp(); });
    const banish = el('button', 'btn small', `Banish (${p.banishes})`);
    banish.disabled = p.banishes <= 0;
    banish.type = 'button';
    banish.addEventListener('click', () => {
      WS.Audio.play('ui');
      this.setBanishMode(!this.banishMode);
    });
    /* Offered only on a draft the auto-take would act on: one with a
       Breaking Point and no evolution or union beside it (the rule is
       Game.autoBreakingPoint). */
    const auto = el('button', 'btn small', 'Auto-pick');
    auto.type = 'button';
    auto.addEventListener('click', () => {
      WS.Audio.play('ui');
      WS.Save.settings.autoBreakingPoint = true;
      WS.Save.save();
      const bp = (WS.Game.levelChoices || []).find((c) => c.type === 'breaking_point');
      if (bp) WS.Game.chooseLevelUp(bp);
    });

    // Always present, so arming banish cannot shift the bar under the cursor.
    const hint = el('span', 'choice-hint', 'Pick a card to banish it from this run');
    bar.append(reroll, banish, auto, hint);

    s.body.append(row);
    s.foot.append(el('div', 'spacer'), bar, el('div', 'spacer'));
    this._levelUI = {
      row, bar, banish, reroll, auto, hint,
      title: s.head.querySelector('h1'), sub: s.head.querySelector('.sub'),
    };
    this.fillLevelChoices(choices);
    this.show(s.inner);
    this.setBanishMode(false);
  };

  /** Swap the three cards without touching the shell around them, so a reroll
   *  or a banish deals new cards into the same frame instead of reloading the
   *  screen underneath them. */
  /* Long enough to read as an answer, short enough that nobody waits for it.
     Spent while the world is frozen, so it is not time taken off the player. */
  const COMMIT_MS = 155;

  /** Hold the frame on the card that was picked, then act on it. `run` is the
   *  thing that actually happens - applying the boon, or taking the blessing -
   *  and it happens after the beat, never during it. A second click inside the
   *  window is ignored: the choice is already made. */
  UI.commitCard = function (card, run) {
    if (this._committing) return;
    this._committing = true;
    const row = card.parentElement;
    card.classList.add('chosen');
    if (row) row.classList.add('committing');
    const go = () => {
      this._committing = false;
      /* The screen may not be the screen any more. A beat is 155ms of real
         time and anything can happen in it - the run ends, another screen is
         pushed, the player quits - and a queued pick that fires into a screen
         that has been replaced applies a boon nobody chose and tears down
         whatever is up now. Measured: a blessing picked 150ms before a
         level-up was forced open resolved INTO the level-up and closed it.
         If the card is no longer in the document, its screen is gone and so
         is its choice. */
      if (!document.contains(card)) return;
      run();
    };
    const ms = this.leaveMs() ? COMMIT_MS : 0;
    if (!ms) go(); else setTimeout(go, ms);
  };

  UI.fillLevelChoices = function (choices) {
    const ui = this._levelUI;
    if (!ui) return;
    if (ui.auto) {
      /* Offered on the same terms the auto-take uses, so the button never
         appears on a draft it would not act on. */
      const bp = choices.find((c) => c.type === 'breaking_point');
      const spent = !!bp && !choices.some((c) => c.type === 'evolve' || c.type === 'union');
      ui.auto.hidden = !spent;
      ui.auto.dataset.tip = 'Take Breaking Point now and every level after, '
        + 'without stopping. Turn it off with the switch under your portrait.';
    }
    this._committing = false;
    ui.row.classList.remove('committing');
    ui.row.replaceChildren();
    choices.forEach((c, i) => {
      ui.row.append(cardFor(c, (choice, card) => {
        if (this.banishMode) {
          this.setBanishMode(false);
          // banishLevelUp returns false when there are still cards to choose
          // from, i.e. the offer was refreshed rather than resolved.
          if (!WS.Game.banishLevelUp(choice)) this.fillLevelChoices(WS.Game.levelChoices);
          return;
        }
        this.commitCard(card, () => WS.Game.chooseLevelUp(choice));
      }, i));
    });
    const p = WS.Game.player;
    ui.reroll.textContent = `Reroll (${p.rerolls})`;
    ui.reroll.disabled = p.rerolls <= 0;
    ui.banish.textContent = `Banish (${p.banishes})`;
    ui.banish.disabled = p.banishes <= 0;
  };

  /* ------------------------------------------------------- field manual --
   * Nothing in the game said what the game was.
   *
   * A survivors-like has one genuinely counter-intuitive rule at its centre -
   * you never attack; your weapons do it for you - and a player who does not
   * know that spends their first run hammering keys, concludes the controls
   * are broken, and leaves. Everything else can be discovered by playing.
   * That one thing cannot, because the evidence for it looks like a bug.
   *
   * So this says it first, in the largest type on the page, and the rest of
   * the manual explains the loop rather than listing keys. It is reachable
   * three ways - from the menu, from the pause screen, and unprompted the
   * first time the game is ever opened - because the moment someone needs it
   * is exactly the moment they will not go hunting for it.
   */
  /* The manual's words live in WS.Lore.manual, not here - it is the longest
     run of player-facing prose in the game and it quotes numbers that the
     tuning bench can change, so it belongs in the data layer with the rest of
     the text. Everything below renders it through WS.template. */
  const manual = () => (WS.Lore && WS.Lore.manual) || {};

  UI.paneManual = function () {
    const wrap = el('div');
    wrap.style.marginTop = '16px';

    const lede = el('div', 'manual-lede');
    lede.append(el('div', 'manual-lede-title', manual().ledeTitle || 'You only move.'),
      el('div', 'manual-lede-body', manual().ledeBody
        || 'Your weapons attack on their own. Everything else is a consequence of where you choose to stand.'));
    wrap.append(lede);

    const m = manual();
    const head = el('div', 'codex-head');
    head.append(el('h3', 'panel-title', m.runTitle || 'The run'));
    wrap.append(head);
    const rows = el('div', 'rows');
    for (const entry of (m.loop || [])) {
      const row = el('div', 'row');
      const main = el('div', 'row-main');
      main.append(el('div', 'row-name', WS.template(entry.name, entry)));
      main.append(el('div', 'row-sub', WS.template(entry.text, entry)));
      row.append(main);
      rows.append(row);
    }
    wrap.append(rows);

    const chead = el('div', 'codex-head');
    chead.style.marginTop = '22px';
    chead.append(el('h3', 'panel-title', m.controlsTitle || 'Controls'));
    wrap.append(chead);
    const keys = el('div', 'key-grid');
    for (const entry of (m.controls || [])) {
      const row = el('div', 'key-row');
      row.append(el('kbd', null, WS.template(entry.key, entry)),
        el('span', null, WS.template(entry.text, entry)));
      keys.append(row);
    }
    wrap.append(keys);
    return wrap;
  };

  /** The manual as its own overlay, for the menu button and the first run. */
  UI.openManual = function (onClose) {
    const m = manual();
    const s = shell(m.title || 'How to play',
      m.subtitle || 'Ninety seconds, and you will not need it again.');
    s.body.append(this.paneManual());
    const done = el('button', 'btn primary', onClose ? 'Got it' : 'Back');
    done.addEventListener('click', () => {
      WS.Audio.play('select');
      if (onClose) onClose(); else UI.openMenu();
    });
    s.foot.append(el('div', 'spacer'), done);
    this.show(s.inner);
  };

  /* ---------------------------------------------------------- build sheet - */
  /** A panel with its inlay hairline in place.
   *
   *  Returns the SCROLLING INSIDE, not the frame; the frame is on `.frame`.
   *
   *  The panel used to be the scroll container itself, and a scroll container
   *  cannot also be a frame. Its scrollbar was painted at its own right edge,
   *  straight over the border and through the bottom-right bracket, so the
   *  moment a build got long enough to scroll the panel's edging came apart.
   *  Worse, an absolutely positioned child of a scroller scrolls with the
   *  content, so the bracket slid up out of the corner as you read - which is
   *  also why the inlay needed a `position: sticky` patch to stay put.
   *
   *  Splitting the two takes the whole class of problem away: the frame holds
   *  still and owns the border, the inlay and the corners, and a child inside
   *  it does the scrolling with its bar inset clear of all three. */
  function panel(cls) {
    const frame = el('div', 'panel bracketed' + (cls ? ' ' + cls : ''));
    frame.append(el('div', 'inlay'));
    const inside = el('div', 'panel-scroll');
    frame.append(inside);
    inside.frame = frame;
    return inside;
  }

  /** "Evolves Knifestorm", for a passive in the build sheet - the weapon it
   *  feeds that this survivor is carrying, if any. */
  function LevelUpFeeds(p, id) {
    const r = WS.LevelUp.passiveReactions ? WS.LevelUp.passiveReactions(p, id, false) : [];
    if (!r.length) return '';
    return 'evolves ' + r.map((x) => WS.Weapons[x.weapon].name).join(', ');
  }

  function buildSheet() {
    const p = WS.Game.player, run = WS.Game.run;
    const sheet = el('div', 'sheet');

    const left = panel();
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
      tipOn(row, tipWeapon(p, w), { prefer: ['right', 'below'], focus: false });
      left.append(row);
    }

    /* The passives, with what each is for. The sheet used to list the
       arsenal and nothing else, so the half of a build that decides which
       weapons evolve was invisible on the one screen made for reading it. */
    const learned = WS.UpgradeOrder.filter((id) => p.upgradeLevels[id]);
    if (learned.length) {
      left.append(el('h3', null, 'Passives'));
      const grid = el('div', 'sheet-passives');
      for (const id of learned) {
        const up = WS.Upgrades[id], r = p.upgradeLevels[id];
        const item = el('div', 'sheet-passive');
        const im = icon(up.art, qualityColour(up.quality), 32);
        im.width = im.height = 32;
        const t = el('div');
        t.append(el('div', 'sp-name', up.name), el('div', 'sp-rank', `rank ${r} of ${up.max}`));
        const feeds = LevelUpFeeds(p, id);
        if (feeds) t.append(el('div', 'sp-feeds', feeds));
        item.append(im, t);
        tipOn(item, tipPassive(p, id), { prefer: ['right', 'below'], focus: false });
        grid.append(item);
      }
      left.append(grid);
    }

    const right = panel();
    right.append(el('h3', null, 'Survivor'));
    const kv = (k, v) => {
      const line = el('div', 'kv');
      line.append(el('span', null, k), el('span', null, String(v)));
      right.append(line);
    };
    kv('Health', `${WS.floor(p.health)} / ${WS.floor(p.maxHealth)}`);
    kv('Armor', `${p.armor} (${WS.round(p.armor / (p.armor + WS.Config.armorConstant) * 100)}% reduction)`);
    kv('Damage', `×${p.damageMultiplier.toFixed(2)}`);
    kv('Cooldowns', `×${p.cooldownMultiplier.toFixed(2)}`);
    kv('Effect area', `×${p.areaMultiplier.toFixed(2)}`);
    kv('Move speed', WS.round(p.moveSpeed));
    kv('Crit', `${WS.round(p.critChance * 100)}% for ×${p.critDamage.toFixed(2)}`);
    kv('Projectiles', `+${p.projectileBonus}`);
    kv('Pickup radius', WS.round(p.pickupRadius));
    kv('Luck', `×${p.luck.toFixed(2)}`);
    kv('Experience', `×${p.xpMultiplier.toFixed(2)}`);
    kv('Gold', `×${p.goldMultiplier.toFixed(2)}`);
    if (p.healthRegen > 0) kv('Regeneration', p.healthRegen.toFixed(1) + '/s');
    if (p.dodgeChance > 0) kv('Evasion', WS.round(p.dodgeChance * 100) + '%');
    if (p.lifesteal > 0) kv('Lifesteal', (p.lifesteal * 100).toFixed(1) + '%');
    if (p.curdled > 0) kv('Curdled Light dealt', WS.formatNumber(p.curdleDealt));
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
    if (run.overhealDone > 0) kv('Overhealing', WS.formatNumber(run.overhealDone));
    if (run.deathsSlain > 0) {
      kv('Death itself slain', run.deathsSlain
        + (WS.Save.stats.deathsSlain ? `  (${WS.Save.stats.deathsSlain} all told)` : ''));
    } else if (WS.Save.stats.deathsSlain) {
      kv('Death itself slain', `0  (${WS.Save.stats.deathsSlain} all told)`);
    }
    kv('Gold this run', WS.formatNumber(run.gold));

    /* Two meters, built the same way: what you dealt, and what you mended.
       A healing build had nothing to read at the end of a run - every number
       it cared about was summed into one line called "Healing". */
    const meterFor = (title, table, tint) => {
      const entries = Object.entries(table).sort((a, b) => b[1] - a[1]);
      if (!entries.length) return null;
      const meter = el('div');
      meter.append(el('h3', null, title));
      const total = entries.reduce((sum, e) => sum + e[1], 0) || 1;
      const top = entries[0][1];
      for (const [key, value] of entries.slice(0, 10)) {
        const w = WS.Weapons[key];
        const label = w ? w.name : key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
        const line = el('div', 'kv meter-row');
        line.style.setProperty('--share', (value / top * 100) + '%');
        line.style.setProperty('--q', WS.hex(
          w ? (WS.CONST.COLORS[w.school] || WS.CONST.COLORS.arc) : tint));
        line.append(el('span', null, label),
          el('span', null, `${WS.formatNumber(value)}  (${WS.round(value / total * 100)}%)`));
        meter.append(line);
      }
      return meter;
    };
    const dmgMeter = meterFor('Damage meter', run.damageByWeapon, WS.CONST.COLORS.arc);
    if (dmgMeter) right.append(dmgMeter);
    const healMeter = meterFor('Healing meter', run.healingBySource, WS.CONST.COLORS.heal);
    if (healMeter) right.append(healMeter);
    const overMeter = meterFor('Overhealing', run.overhealBySource, WS.CONST.COLORS.shadow);
    if (overMeter) right.append(overMeter);

    sheet.append(left.frame, right.frame);
    return sheet;
  }

  UI.openPause = function () {
    const s = shell('Paused', `${WS.Game.run.map.name} waits.`);

    /* Two views behind the pause. The build sheet is what you paused to look
     * at, so it leads; settings are here because the alternative was
     * abandoning a run to turn the music down. Nothing else from the main
     * menu belongs mid-run - you cannot change survivor or battlefield
     * without ending what you are in. */
    const tabs = el('div', 'tabs');
    const pane = el('div');
    let view = 'build';
    const render = () => {
      for (const b of tabs.children) b.classList.toggle('active', b.dataset.view === view);
      // The sheet fills the space and scrolls inside its panels; the settings
      // list is an ordinary scrolling column.
      s.body.classList.toggle('fitted', view === 'build');
      pane.replaceChildren(view === 'build' ? buildSheet()
        : view === 'manual' ? this.paneManual()
          : this.paneSettings(render, true));
      this.wireScroll(s.inner);
    };
    for (const [id, label] of [['build', 'Build'], ['manual', 'How to play'], ['settings', 'Settings']]) {
      const b = el('button', 'tab', label);
      b.type = 'button';
      b.dataset.view = id;
      b.addEventListener('click', () => { view = id; WS.Audio.play('page'); render(); });
      tabs.append(b);
    }
    s.inner.insertBefore(tabs, s.body);
    s.body.append(pane);
    render();

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

  /** The verdict: one panel that states the outcome in the run's own numbers,
   *  before the ledger. */
  function verdict(kind, title, line, figures, log) {
    const wrap = el('div', 'verdict ' + kind + (log ? ' has-log' : ''));
    const main = el('div', 'verdict-main');
    const head = el('div', 'verdict-head');
    head.append(el('div', 'verdict-title', title));
    head.append(el('div', 'verdict-line', line));
    main.append(head);
    const grid = el('div', 'verdict-figures');
    for (const [k, v] of figures) {
      const f = el('div', 'vf');
      f.append(el('div', 'v', v), el('div', 'label', k));
      grid.append(f);
    }
    main.append(grid);
    wrap.append(main);
    if (log) wrap.append(log);
    return wrap;
  }

  /* THE WATCH'S LOG.
   *
   * The verdict says what happened in the run's numbers; the log says it the
   * way the Watch would write it down at the end of a night - who kept the
   * wall and where, how it ended, what fell, whose work it mostly was, what
   * came out of the fire. Built from the run's own facts and nothing random,
   * so the same night always reads the same way. */
  function logEntry(run, p, outcome) {
    if (!run || !p) return null;
    const who = p.character.name, where = run.map.name, t = WS.formatTime(run.time);
    const n = WS.Save.stats.totalRuns || 1;
    const lines = [];
    // Written out below a dozen, the way it would be in a book.
    const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
    const say = (v) => (v < WORDS.length ? WORDS[v] : WS.formatNumber(v));
    const Say = (v) => { const w = say(v); return w.charAt(0).toUpperCase() + w.slice(1); };
    if (outcome === 'defeated') lines.push(`${who} kept the watch in ${where} for ${t}, and then the dark got in.`);
    else if (outcome === 'abandoned') lines.push(`${who} left the wall in ${where} at ${t}. The Watch does not ask why.`);
    else if (outcome === 'arena_victory') lines.push(`${who} walked into the Eclipse Arena and came out of it with the sun.`);
    else lines.push(`${who} kept the watch in ${where} until dawn.`);

    const k = run.kills || 0;
    lines.push(k <= 0 ? 'Nothing fell.' : k === 1 ? 'One of them will not be coming back.'
      : `${Say(k)} of them will not be coming back.`);
    const b = run.bossesSlain || 0;
    if (b === 1) lines.push('One of the night\'s worst came, and stayed down.');
    else if (b > 1) lines.push(`${Say(b)} of the night's worst came, and stayed down.`);

    // Whose work it mostly was.
    let top = null, most = 0;
    for (const [id, v] of Object.entries(run.damageByWeapon || {})) if (v > most) { most = v; top = id; }
    let topEvolved = null;
    if (top && WS.Weapons[top]) {
      const w = WS.Player.getWeapon(p, top);
      const evolved = !!(w && w.evolved && WS.Weapons[top].evolveName);
      const name = evolved ? WS.Weapons[top].evolveName : WS.Weapons[top].name;
      if (evolved) topEvolved = top;
      lines.push(evolved ? `Most of that was ${name}'s work, and it came out of the fire tonight.`
        : `Most of that was ${name}'s work.`);
    }
    const forged = p.weapons.filter((w) => w.evolved && w.data.evolveName && w.id !== topEvolved)
      .map((w) => w.data.evolveName);
    if (forged.length === 1) lines.push(`${forged[0]} came out of the fire tonight.`);
    else if (forged.length > 1) lines.push(`${forged.slice(0, -1).join(', ')} and ${forged[forged.length - 1]} came out of the fire tonight.`);

    if (outcome === 'defeated') lines.push(run.time < 300 ? 'A short night. The fire is still lit for whoever is next.'
      : 'Somebody else will have to keep the fire tonight.');
    else if (outcome === 'arena_victory') lines.push('The sky is its own again.');
    else lines.push('The fire is still lit.');

    const box = el('div', 'watch-log');
    box.append(el('div', 'log-head', `From the Watch's log \u00b7 Night ${WS.formatNumber(n)}`));
    box.append(el('p', 'log-text', lines.join(' ')));
    return box;
  }

  function runFigures(run, player) {
    return [
      ['Survived', WS.formatTime(run.time)],
      ['Level', String(player.level)],
      ['Slain', WS.formatNumber(run.kills)],
      ['Bosses', String(run.bossesSlain)],
      ['Damage', WS.formatNumber(run.damageDone)],
      ['Gold', WS.formatNumber(run.gold)],
    ];
  }

  UI.openVictory = function () {
    const run = WS.Game.run;
    const s = shell(run.map.name,
      `${WS.Config.difficulties[WS.Save.settings.difficulty].label}`
      + `${run.hyper ? ' · Hyper' : ''} · ${WS.Characters[run.characterId].name}`);
    /* Three ways this panel can arrive: at 30:00 with a finale still to
       face, at 30:00 on a battlefield that has none, and after the finale
       has been beaten - where the story is over and only Death is left. */
    const def = WS.Finales && WS.Finales[run.mapId];
    const canFace = !!def && WS.Finale.available(run) && !run.finaleStarted;
    if (run.finaleCleared && def && def.epilogue) {
      s.body.append(verdict('win', def.epilogue[0],
        `${def.epilogue[1]} Death is still out there, if you want it.`,
        runFigures(run, WS.Game.player), logEntry(run, WS.Game.player, 'dawn')));
    } else if (canFace) {
      s.body.append(verdict('win', 'Dawn, and not the end',
        `You held ${run.map.name} for thirty minutes and the win is banked. `
        + `${def.title} is still out there - or wait for Death, who always comes.`,
        runFigures(run, WS.Game.player), logEntry(run, WS.Game.player, 'dawn')));
    } else {
      s.body.append(verdict('win', 'The night broke first',
        `You held ${run.map.name} for thirty minutes. Death is on the field now — it always is.`,
        runFigures(run, WS.Game.player), logEntry(run, WS.Game.player, 'dawn')));
    }
    s.body.classList.add('fitted');
    s.body.append(buildSheet());
    const claim = el('button', canFace ? 'btn' : 'btn primary', 'Claim the win');
    claim.addEventListener('click', () => WS.Game.endRun('victory'));
    const face = canFace ? el('button', 'btn primary', 'Face ' + def.title) : null;
    if (face) face.addEventListener('click', () => WS.Game.faceFinale());
    /* One way to stay. There used to be two - "Fight to the end" and "True
       Endless" - and reaching dawn already switches the overtime on, so they
       were the same game under two labels and a player had to guess what
       the difference was. */
    const stay = el('button', 'btn', 'Stay for Death');
    stay.dataset.tip = 'Keep playing past dawn: the horde keeps climbing, bosses return faster '
      + 'and faster, and Death walks on every minute. The win is already banked.';
    stay.addEventListener('click', () => WS.Game.continueEndless());
    s.foot.append(el('div', 'spacer'), stay, claim);
    if (face) s.foot.append(face);
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
    const s = shell(run.map.name,
      `${WS.Config.difficulties[WS.Save.settings.difficulty].label}`
      + `${run.hyper ? ' · Hyper' : ''} · ${WS.Characters[run.characterId].name}`);

    const lines = {
      defeated: `${run.killedBy ? run.killedBy.name : 'The horde'} got through at ${WS.formatTime(run.time)}. `
        + `${WS.formatNumber(run.kills)} did not.`,
      victory: 'Banked, and Hyper Mode is open on this battlefield.',
      abandoned: 'You walked off the field. The gold is still yours.',
      arena_victory: 'Aethelgard is undone. The eclipse holds nothing now.',
    };
    const kinds = { defeated: 'loss', victory: 'win', abandoned: 'neutral', arena_victory: 'win' };
    s.body.append(verdict(kinds[reason] || 'neutral', titles[reason] || 'The run ends',
      lines[reason] || sub, runFigures(run, WS.Game.player), logEntry(run, WS.Game.player, reason)));
    s.body.classList.add('fitted');
    s.body.append(buildSheet());
    const again = el('button', 'btn primary', 'Run again');
    again.addEventListener('click', () => WS.Game.startRun(run.mapId, run.characterId));
    const menu = el('button', 'btn', 'Main menu');
    menu.addEventListener('click', () => WS.Game.quitToMenu());
    const banked = el('div', 'bank');
    banked.append(el('span', 'label', 'Banked this run'),
      el('span', 'v', WS.formatNumber(run.gold) + ' gold'));
    s.foot.append(banked, el('div', 'spacer'), menu, again);
    this.show(s.inner);
  };


  /* ---------------------------------------------------- dropped accounts --
   *
   * The shortest path between two machines is a file you drag onto the window,
   * and it was the one path the game did not offer. Everything else - a code
   * to copy, a picker to click through - is a workaround for not having this.
   *
   * It is deliberately NOT a silent import. A dropped file replaces an account
   * that may be thirty hours old, so it goes through the same two steps the
   * settings screen uses: here is what is in it, here is what it would take
   * the place of, and only then a button that writes. */
  UI.wireDropImport = function (root) {
    let depth = 0;
    const lit = (on) => root.classList.toggle('dropping', on);
    const carriesFile = (e) => !!(e.dataTransfer
      && Array.from(e.dataTransfer.types || []).indexOf('Files') >= 0);

    root.addEventListener('dragenter', (e) => {
      if (!carriesFile(e)) return;
      e.preventDefault();
      // Counted rather than toggled: dragenter/dragleave fire again for every
      // child the pointer crosses, so a plain toggle flickers the whole way in.
      depth++; lit(true);
    });
    root.addEventListener('dragover', (e) => { if (carriesFile(e)) e.preventDefault(); });
    root.addEventListener('dragleave', (e) => {
      if (!carriesFile(e)) return;
      depth = WS.max(0, depth - 1);
      if (!depth) lit(false);
    });
    root.addEventListener('drop', async (e) => {
      if (!carriesFile(e)) return;
      e.preventDefault();
      depth = 0; lit(false);
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      /* Not mid-run. Swapping the account out from under a live run would
         leave the run's own bookkeeping pointing at a survivor and a set of
         unlocks that no longer exist. */
      if (WS.Game.player && WS.Game.state !== 'menu') {
        return WS.Game.toast('Not while a run is going',
          'Finish or abandon it first, then drop the file again.');
      }
      let text = '';
      try { text = await file.text(); } catch (err) {
        return WS.Game.toast('That file could not be read', file.name);
      }
      const r = WS.Save.parseImport(await WS.Save.unpack(text));
      if (!r.ok) return WS.Game.toast('That is not an account', r.error);
      this.openImportOffer(r, file.name);
    });
  };

  /** The one screen that stands between a dropped file and thirty hours. */
  UI.openImportOffer = function (r, name) {
    const s = shell('Load this account?', name || 'From a dropped file');
    const i = r.summary, o = r.replacing;
    const body = el('div', 'panel');
    const row = (label, a, b) => {
      const line = el('div', 'setting');
      const main = el('div');
      main.append(el('div', 's-name', label));
      main.append(el('div', 's-desc', `${b} on this machine now`));
      const value = el('div', 'import-value', String(a));
      line.append(main, value);
      body.append(line);
    };
    row('Gold', i.gold.toLocaleString(), o.gold.toLocaleString());
    row('Survivors', i.characters, o.characters);
    row('Battlefields', i.maps, o.maps);
    row('Runs', i.runs, o.runs);
    s.body.append(body);
    const warn = el('div', 's-desc');
    warn.style.marginTop = '10px';
    warn.textContent = (r.warn ? r.warn + ' ' : '')
      + 'Loading this replaces the account in this browser. It cannot be undone.';
    s.body.append(warn);

    const go = el('button', 'btn primary', 'Replace my progress');
    go.addEventListener('click', () => {
      WS.Save.adopt(r.db);
      WS.Save.save();
      WS.Audio.play('level');
      UI.tab = 'roster';
      UI.openMenu();
      WS.Game.toast('Account loaded', `${i.gold.toLocaleString()} gold, `
        + `${i.characters} survivors, ${i.runs} runs.`);
    });
    const cancel = el('button', 'btn', 'Keep what I have');
    cancel.addEventListener('click', () => UI.openMenu());
    s.foot.append(el('div', 'spacer'), cancel, go);
    this.show(s.inner);
  };

  /* ------------------------------------------------------------- wiring -- */
  UI.init = function (root, overlay, hud) {
    this.root = root; this.overlay = overlay; this.hud = hud;
    this.buildHUD();
    this.applyHudLayout();
    this.wireHover(overlay);
    this.wireHover(hud);
    this.wireNavMode();
    this.wireDropImport(root);

    WS.Input.onKey = (e) => {
      // Arrows move the focus while a menu is open; the survivor is not
      // walking anywhere with an overlay in front of them.
      if (!this.overlay.classList.contains('hidden')) {
        const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.code];
        if (d) { this.navigate(d[0], d[1]); return; }
      }
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
          this.setBanishMode(!this.banishMode);
        }
      }
    };
  };

  WS.UI = UI;

})(window.WS);
