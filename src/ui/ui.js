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
    svg.setAttribute('viewBox', '0 0 112 112');
    const rHP = 52, rXP = 43;
    // A dashed track behind the health arc reads as graduations, so a glance
    // gives a rough fraction without reading the number.
    const tHP = svgArc(rHP, 6, 'track');
    const gHP = svgArc(rHP, 6, 'ticks');
    // 32 graduations that divide the circumference exactly, so the last tick
    // meets the first instead of leaving a ragged seam at twelve o'clock.
    gHP.style.strokeDasharray = `1.5 ${(2 * Math.PI * rHP) / 32 - 1.5}`;
    const aHP = svgArc(rHP, 6, 'arc-hp');
    const tXP = svgArc(rXP, 3, 'track');
    const aXP = svgArc(rXP, 3, 'arc-xp');
    svg.append(tHP, gHP, aHP, tXP, aXP);
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
    const railHead = el('div', 'head');
    rail.append(railFill, railHead);
    for (const at of WS.Config.bossTimes) {
      const tick = el('i', 'tick');
      tick.style.left = (at / WS.Config.deathTime * 100) + '%';
      tick.dataset.at = at;
      rail.append(tick);
    }
    const deathTick = el('i', 'tick death');
    deathTick.style.left = '100%';
    rail.append(deathTick);
    const mode = el('div', 'label mode', '');
    timer.append(timeText, rail, mode);

    /* -- boss arc --------------------------------------------------------- */
    const boss = el('div', 'hidden'); boss.id = 'hud-boss';
    const bossName = el('div', 'boss-name', '');
    const bossSvg = document.createElementNS(ns, 'svg');
    bossSvg.setAttribute('viewBox', '0 0 760 30');
    bossSvg.setAttribute('preserveAspectRatio', 'none');
    const CURVE = 'M5,25 Q380,-4 755,25';
    const bTrack = document.createElementNS(ns, 'path');
    bTrack.setAttribute('class', 'b-track');
    bTrack.setAttribute('d', CURVE);
    const bFill = document.createElementNS(ns, 'path');
    bFill.setAttribute('class', 'b-fill');
    bFill.setAttribute('d', CURVE);
    bossSvg.append(bTrack, bFill);
    const bossPct = el('div', 'b-pct', '');
    boss.append(bossName, bossSvg, bossPct);

    /* -- tallies ---------------------------------------------------------- */
    const stats = el('div'); stats.id = 'hud-stats';
    const tally = (cls, label) => {
      const line = el('div', 'stat-line ' + cls);
      const v = el('span', 'v', '0');
      line.append(el('span', 'label', label), v);
      stats.append(line);
      return v;
    };
    const goldV = tally('gold', 'Gold');
    const killV = tally('kills', 'Slain');
    const dpsV = tally('dps', 'DPS');
    const hpsV = tally('hps', 'HPS');

    const weapons = el('div'); weapons.id = 'hud-weapons';
    const passives = el('div'); passives.id = 'hud-passives';
    const toasts = el('div'); toasts.id = 'hud-toasts';

    hud.append(portraitWrap, timer, boss, stats, weapons, passives, toasts);

    this.els = {
      gauge, aHP, aXP, portrait, lvl, name, hpText, meters,
      timeText, railFill, railHead, rail, mode,
      boss, bossName, bFill, bossPct,
      goldV, killV, dpsV, hpsV, weapons, passives, toasts,
      hpCirc: 2 * Math.PI * rHP, xpCirc: 2 * Math.PI * rXP,
      bossLen: 0,
      weaponSlots: new Map(), passiveSlots: new Map(),
    };
    aHP.style.strokeDasharray = this.els.hpCirc;
    aXP.style.strokeDasharray = this.els.xpCirc;
    this.els.bossLen = (bFill.getTotalLength && bFill.getTotalLength()) || 762;
    bFill.style.strokeDasharray = this.els.bossLen;
  };

  /** Puts the chosen HUD layout on the root, so the whole thing is one class
   *  swap rather than two elements being repositioned by script. */
  UI.applyHudLayout = function () {
    const rail = WS.Save.settings.hudLayout === 'rail';
    document.body.classList.toggle('hud-rail', rail);
  };

  UI.enterGame = function () {
    this.closeOverlay();
    this.hud.classList.remove('hidden');
    const p = WS.Game.player;
    // The portrait shows the survivor's actual silhouette, not a glyph.
    this.els.portrait.innerHTML = '';
    const img = new Image();
    img.src = WS.Sprites.hero(p.characterId, p.character.color, 76).toDataURL();
    img.width = img.height = 76;
    this.els.portrait.append(img);
    this.els.name.textContent = p.character.name;
    this._passiveSig = null;
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
      const img = icon(w.data.art, WS.Weapon.colour(w), 54);
      img.width = img.height = 54;
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('viewBox', '0 0 64 64');
      const track = svgArc(29, 3, 'cd-track');
      const arc = svgArc(29, 3, 'cd-arc');
      const circ = 2 * Math.PI * 29;
      arc.style.strokeDasharray = circ;
      svg.append(track, arc);
      const rank = el('div', 'rank', w.evolved ? 'MAX' : String(w.level));
      const flash = el('div', 'flash');
      slot.append(img, svg, rank, flash);
      slot.title = `${w.evolved ? w.data.evolveName : w.data.name}\n${w.data.description}`;
      wrap.append(slot);
      this.els.weaponSlots.set(w.id, { arc, circ, rank, slot, lastCd: 0 });
    }
    // Empty scabbards keep the strip a fixed six, so a filling build reads.
    for (let i = WS.Game.player.weapons.length; i < WS.MAX_WEAPONS; i++) {
      const slot = el('div', 'wslot empty');
      slot.append(el('div', 'scabbard'));
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
    e.aHP.style.stroke = hpPct < 0.3 ? '#ff5a4a' : 'var(--blood)';
    e.gauge.classList.toggle('critical', hpPct < 0.3);
    const xpPct = WS.clamp(p.xp / p.xpToNext, 0, 1);
    e.aXP.style.strokeDashoffset = -e.xpCirc * (1 - xpPct);
    e.lvl.textContent = 'LV ' + p.level;
    e.hpText.innerHTML = `${WS.max(0, WS.floor(p.health))}<small> / ${WS.floor(p.maxHealth)}</small>`;

    e.timeText.textContent = WS.formatTime(run.time);
    const clockPct = WS.min(100, run.time / WS.Config.deathTime * 100);
    e.railFill.style.width = clockPct + '%';
    e.railHead.style.left = clockPct + '%';
    for (const tick of e.rail.children) {
      if (tick.dataset && tick.dataset.at) {
        tick.classList.toggle('passed', run.time >= +tick.dataset.at);
      }
    }
    const modeBits = [];
    if (run.hyper) modeBits.push('Hyper');
    if (run.mode === 'endless') modeBits.push('True Endless');
    else if (run.victorious) modeBits.push('Overtime');
    if (run.map.arena) modeBits.push('Eclipse Arena · Phase ' + WS.Arena.phase);
    e.mode.textContent = modeBits.join(' · ');

    e.goldV.textContent = WS.formatNumber(run.gold);
    e.killV.textContent = WS.formatNumber(run.kills);
    e.dpsV.textContent = WS.formatNumber(run.dps);
    e.hpsV.textContent = WS.formatNumber(run.hps);

    // Whichever boss has the most health left is the one the arc tracks - and
    // the same one the score reacts to, because both ask Enemy for it.
    const boss = WS.Enemy.leadBoss();
    if (boss) {
      e.boss.classList.remove('hidden');
      if (e.bossName.textContent !== boss.template.name) e.bossName.textContent = boss.template.name;
      const pct = WS.clamp(boss.health / boss.maxHealth, 0, 1);
      e.bFill.style.strokeDashoffset = e.bossLen * (1 - pct);
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
      slot.arc.style.strokeDashoffset = slot.circ * (1 - k);
      // The cooldown jumping back up means the weapon just went off.
      if (w.cooldown > slot.lastCd + 0.01) {
        slot.slot.classList.remove('fired');
        void slot.slot.offsetWidth;          // restart the animation
        slot.slot.classList.add('fired');
      }
      slot.lastCd = w.cooldown;
      const label = w.evolved ? 'MAX' : String(w.level);
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
    card.append(el('div', 'card-body', choice.description || ''));
    if (choice.detail && WS.Save.settings.levelUpTooltips) {
      card.append(el('div', 'card-detail', choice.detail));
    }
    if (index !== undefined) card.append(el('div', 'card-key', String(index + 1)));
    card.addEventListener('click', () => onPick(choice, card));
    return card;
  }

  /* ---------------------------------------------------------- main menu -- */
  UI.openMenu = function () {
    this.hud.classList.add('hidden');
    const s = shell('The Ember Watch', 'Arclight');

    const title = el('div'); title.id = 'title-wrap';
    const h = el('h1', 'game-title');
    /* Three parts, because the logotype treats them differently: a small cool
     * article, the EMBER struck in gilt, and the WATCH in cold grey. The lit
     * word is the ember because the ember is the thing that is lit - one warm
     * point held inside something grey and steady, which is the whole title
     * said in type before a word of it is read. */
    h.append(el('span', 'art', 'The'), el('span', 'nm', 'Ember'),
      el('span', 'wm', 'Watch'));
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
      bankValue.textContent = WS.formatNumber(WS.Save.db.gold) + 'g';
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
      b.addEventListener('click', () => { UI.tab = id; WS.Audio.play('ui'); render(); });
      tabs.append(b);
    }
    s.body.append(tabs, panes);
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
        hyper.title = map.name + ' runs its own fight, so Hyper has nothing to scale.';
        hyper.disabled = true;
        return;
      }
      const has = !!(WS.Save.db.unlocks.hyper && WS.Save.db.unlocks.hyper[id]);
      hyper.disabled = !has;
      hyper.textContent = has
        ? 'Hyper: ' + (WS.Save.db.hyperArmed ? 'ON' : 'off')
        : 'Hyper: win here first';
      hyper.title = has
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

  function fillSurvivorCartouche(node, id) {
    const c = WS.Characters[id];
    node.innerHTML = '';
    const art = el('div', 'art');
    const img = new Image();
    img.src = WS.Sprites.portrait(id, c.color, 184).toDataURL();
    img.width = img.height = 184;
    art.append(img, el('i', 'frame'));
    art.style.setProperty('--q', WS.hex(c.color));

    const body = el('div');
    body.append(el('h3', null, c.name));
    body.append(el('div', 'label role', `${c.className} · ${c.title}`));
    body.append(el('p', 'flavour', c.description));

    const stats = el('div', 'stat-line');
    const stat = (k, v) => {
      const box = el('div', 's');
      box.append(el('span', 'label', k), el('b', null, String(v)));
      stats.append(box);
    };
    stat('Health', c.maxHealth);
    stat('Speed', c.moveSpeed);
    stat('Armor', c.armor || '—');
    stat('Pickup', c.pickupRadius);
    if (c.healthRegen) stat('Regen', c.healthRegen.toFixed(1) + '/s');
    stat('Opens with', WS.Weapons[c.weapon].name);
    body.append(stats);
    body.append(el('div', 'perk', WS.template(c.perk, c)));

    node.append(art, body);
  }

  function fillMapCartouche(node, id) {
    const m = WS.Maps[id];
    node.innerHTML = '';
    const art = el('div', 'art');
    const key = { forest: 'leaf', plains: 'wheat', haunted: 'deadtree', savannah: 'sun', glacier: 'crystal', arena: 'sovereign' }[m.art] || 'rune';
    const img = new Image();
    img.src = WS.Sprites.zoneCard(m, key, 184).toDataURL();
    img.width = img.height = 184;
    art.append(img, el('i', 'frame'));
    art.style.setProperty('--q', WS.hex(m.groundAlt));

    const body = el('div');
    body.append(el('h3', null, m.name));
    body.append(el('div', 'label role', m.subtitle));
    body.append(el('p', 'flavour', m.description));

    const stats = el('div', 'stat-line');
    const stat = (k, v) => {
      const box = el('div', 's');
      box.append(el('span', 'label', k), el('b', null, String(v)));
      stats.append(box);
    };
    stat('Difficulty', '×' + m.difficulty);
    stat('Gold', '×' + m.goldMult);
    if (!m.arena) {
      stat('Bosses', m.bosses.length);
      stat('Swarms', m.events.length);
      const best = WS.Save.stats.bestTime[id] || 0;
      stat('Your best', best ? WS.formatTime(best) : '—');
    }
    if (WS.Save.db.unlocks.hyper[id]) stat('Hyper', 'unlocked');
    body.append(stats);

    // The roster this battlefield actually fields, so the pick is informed.
    if (!m.arena) {
      const seen = [];
      for (const phase of m.phases) {
        for (const r of phase.roster) if (!seen.includes(r.id)) seen.push(r.id);
      }
      const names = seen.slice(0, 6).map((eid) => WS.Enemies[eid].name).join(', ');
      body.append(el('div', 'perk', 'Fields: ' + names + (seen.length > 6 ? ', and worse.' : '.')));
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
      const node = el('button', 'pick' + (unlocked ? '' : ' locked')
        + (WS.Game.selection.map === id ? ' selected' : ''));
      node.type = 'button';
      node.style.setProperty('--q', WS.hex(unlocked ? m.groundAlt : [0.3, 0.32, 0.4]));
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
    const intro = el('div', 'card-body',
      'Permanent training, bought with banked gold and applied to every future run.');
    intro.style.marginBottom = '12px';
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
      main.append(el('div', 'row-name', m.name));
      main.append(el('div', 'row-sub', m.description));
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
        row.append(el('div', 'row-value maxed-tag', 'MAXED'));
      } else {
        const buy = el('button', 'btn buy', '');
        buy.append(el('b', null, WS.formatNumber(cost)), el('span', 'g', 'g'));
        buy.disabled = WS.Save.db.gold < cost;
        buy.title = buy.disabled
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
      main.append(el('div', 'row-sub', a.description));
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

    wrap.append(achHead, achRows, comboHead, comboRows);
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
  UI.paneBestiary = function () {
    const wrap = el('div');
    wrap.style.marginTop = '16px';

    const all = [];
    for (const id of Object.keys(WS.Enemies)) all.push([id, WS.Enemies[id], 'Creature']);
    for (const id of Object.keys(WS.Elites)) all.push([id, WS.Elites[id], 'Elite']);
    for (const id of Object.keys(WS.Bosses)) all.push([id, WS.Bosses[id], 'Boss']);

    const found = all.filter(([id]) =>
      (WS.Save.stats.bestiary[id] || WS.Save.stats.bosses[id] || 0) > 0).length;
    const head = el('div', 'codex-head');
    head.append(el('div', 'card-body', 'Everything that has come for you, and everything that has not yet.'));
    head.append(el('div', 'codex-count', `${found} / ${all.length}`));
    wrap.append(head);

    const grid = el('div', 'beast-grid');
    for (const [id, t, kind] of all) {
      const kills = WS.Save.stats.bestiary[id] || WS.Save.stats.bosses[id] || 0;
      const known = kills > 0;
      const cell = el('div', 'beast' + (known ? '' : ' unknown') + ' ' + kind.toLowerCase());
      cell.style.setProperty('--q', WS.hex(known ? t.tint : [0.3, 0.32, 0.4]));

      const plate = el('div', 'beast-plate');
      if (known) {
        const img = new Image();
        img.src = WS.Sprites.creature(t.art, t.tint, 52).toDataURL();
        img.width = img.height = 52;
        plate.append(img);
      } else {
        // The silhouette is still the real creature, just unlit: the shape is
        // a hint, which is what a compendium entry you have not earned is for.
        const img = new Image();
        img.src = WS.Sprites.creature(t.art, [0.16, 0.17, 0.21], 52).toDataURL();
        img.width = img.height = 52;
        plate.append(img, el('span', 'q', '?'));
      }
      cell.append(plate);
      cell.append(el('div', 'beast-name', known ? t.name : '???'));
      cell.append(el('div', 'beast-sub', known ? `${WS.formatNumber(kills)} slain` : kind));
      if (known) {
        cell.title = `${t.name}\n${kind} · ${t.family} · ${t.health} health · ${t.damage} damage`
          + `\n${WS.formatNumber(kills)} slain`;
      }
      grid.append(cell);
    }
    wrap.append(grid);
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
    /* Personal bests, one card per battlefield. These were full-width rows
       carrying three data points each, which is a hundred pixels of chrome
       per number; as cards they fit on one line and each one is unmistakably
       its own place, because it wears the same landscape the picker shows. */
    const head = el('div', 'codex-head');
    head.style.marginTop = '20px';
    head.append(el('div', 'card-body', 'Longest you have lasted on each battlefield.'));
    const best = el('div', 'record-grid');
    for (const id of WS.MapOrder) {
      if (!WS.Save.isMapUnlocked(id)) continue;
      const m = WS.Maps[id];
      const time = s.bestTime[id] || 0;
      const card = el('div', 'record' + (time ? '' : ' unset'));
      card.style.setProperty('--q', WS.hex(m.groundAlt));
      const img = new Image();
      img.src = WS.Sprites.zoneCard(m, 'rune', 92).toDataURL();
      img.width = img.height = 92;
      const art = el('span', 'record-art');
      art.append(img, el('i', 'frame'));
      card.append(art);
      const body = el('div');
      body.append(el('div', 'record-name', m.name));
      body.append(el('div', 'record-time', time ? WS.formatTime(time) : '—'));
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
      const out = WS.Save.export();
      if (!out.code) return say('This browser would not encode the save.', true);
      try {
        await navigator.clipboard.writeText(out.code);
        say('Copied. Paste it somewhere you will still have next year.');
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
    const loadBtn = el('button', 'btn small', 'Load from code or file');
    const box = el('textarea');
    box.className = 'import-box hidden';
    box.rows = 3;
    box.placeholder = 'Paste a code beginning EMBERWATCH1: - or choose a file';
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
    const offer = (text) => {
      const r = WS.Save.parseImport(text);
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
  UI.openBlessing = function (choices) {
    const s = shell('Choose a Blessing', 'One boon, and it stays with you.');
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
    // Always present, so arming banish cannot shift the bar under the cursor.
    const hint = el('span', 'choice-hint', 'Pick a card to banish it from this run');
    bar.append(reroll, banish, hint);

    s.body.append(row);
    s.foot.append(el('div', 'spacer'), bar, el('div', 'spacer'));
    this._levelUI = {
      row, bar, banish, reroll, hint,
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
  const CONTROLS = [
    ['WASD  /  arrow keys', 'Move. On a pad, the left stick or the d-pad.'],
    ['Touch, or hold the mouse', 'Drag anywhere on the field to steer. Mouse steering is off until you turn it on in Settings.'],
    ['1  2  3', 'Take the matching card when you level up.'],
    ['R  /  B', 'Reroll or banish the cards on offer, if you have any left.'],
    ['Esc', 'Pause. Your build, the damage meter and the settings are in there.'],
    ['Arrow keys  /  pad', 'Move around any menu. Enter or A picks.'],
  ];

  const LOOP = [
    ['Your weapons fire themselves',
      'You never press an attack button. Everything you carry swings, casts and reloads on its own timer, at whatever is nearest. Your whole job is where you stand.'],
    ['Walk over the gems',
      'Everything you kill drops experience. Gather enough and you level, and a level is a choice of three: a new weapon, a rank on one you carry, or a passive.'],
    ['Six weapons, and no more',
      'Take a seventh and you cannot. Ranking a weapon to 8 and learning its paired passive evolves it into something far stronger - the card tells you which passive it wants.'],
    ['Two evolved weapons can become one',
      'Some pairs merge into a single greater weapon and give you the slot back. The Codex remembers every pairing you find.'],
    ['Thirty minutes is the win',
      'Bosses arrive on a schedule and the horde never stops thickening. Survive to 30:00 and the battlefield is yours - though Death itself turns up at exactly that moment, so leaving is also a decision.'],
    ['Gold outlives the run',
      'You keep every coin whether you win, die or walk away. Spend it with the Trainer on permanent lessons that apply to every run after.'],
  ];

  UI.paneManual = function () {
    const wrap = el('div');
    wrap.style.marginTop = '16px';

    const lede = el('div', 'manual-lede');
    lede.append(el('div', 'manual-lede-title', 'You only move.'),
      el('div', 'manual-lede-body',
        'Your weapons attack on their own. Everything else is a consequence of where you choose to stand.'));
    wrap.append(lede);

    const head = el('div', 'codex-head');
    head.append(el('h3', 'panel-title', 'The run'));
    wrap.append(head);
    const rows = el('div', 'rows');
    for (const [title, body] of LOOP) {
      const row = el('div', 'row');
      const main = el('div', 'row-main');
      main.append(el('div', 'row-name', title));
      main.append(el('div', 'row-sub', body));
      row.append(main);
      rows.append(row);
    }
    wrap.append(rows);

    const chead = el('div', 'codex-head');
    chead.style.marginTop = '22px';
    chead.append(el('h3', 'panel-title', 'Controls'));
    wrap.append(chead);
    const keys = el('div', 'key-grid');
    for (const [k, what] of CONTROLS) {
      const row = el('div', 'key-row');
      row.append(el('kbd', null, k), el('span', null, what));
      keys.append(row);
    }
    wrap.append(keys);
    return wrap;
  };

  /** The manual as its own overlay, for the menu button and the first run. */
  UI.openManual = function (onClose) {
    const s = shell('How to play', 'Ninety seconds, and you will not need it again.');
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
      left.append(row);
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
    kv('Gold this run', WS.formatNumber(run.gold));

    // The damage meter, largest first.
    const meter = el('div');
    meter.append(el('h3', null, 'Damage meter'));
    const entries = Object.entries(run.damageByWeapon).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((sum, e) => sum + e[1], 0) || 1;
    const top = entries.length ? entries[0][1] : 1;
    for (const [key, value] of entries.slice(0, 10)) {
      const w = WS.Weapons[key];
      const label = w ? w.name : key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
      const line = el('div', 'kv meter-row');
      line.style.setProperty('--share', (value / top * 100) + '%');
      if (w) line.style.setProperty('--q', WS.hex(WS.CONST.COLORS[w.school] || WS.CONST.COLORS.arc));
      line.append(el('span', null, label),
        el('span', null, `${WS.formatNumber(value)}  (${WS.round(value / total * 100)}%)`));
      meter.append(line);
    }
    right.append(meter);

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
      b.addEventListener('click', () => { view = id; WS.Audio.play('ui'); render(); });
      tabs.append(b);
    }
    s.body.append(tabs, pane);
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
  function verdict(kind, title, line, figures) {
    const wrap = el('div', 'verdict ' + kind);
    const head = el('div', 'verdict-head');
    head.append(el('div', 'verdict-title', title));
    head.append(el('div', 'verdict-line', line));
    wrap.append(head);
    const grid = el('div', 'verdict-figures');
    for (const [k, v] of figures) {
      const f = el('div', 'vf');
      f.append(el('div', 'v', v), el('div', 'label', k));
      grid.append(f);
    }
    wrap.append(grid);
    return wrap;
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
    s.body.append(verdict('win', 'The night broke first',
      `You held ${run.map.name} for thirty minutes. Death is on the field now — it always is.`,
      runFigures(run, WS.Game.player)));
    s.body.classList.add('fitted');
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
      lines[reason] || sub, runFigures(run, WS.Game.player)));
    s.body.classList.add('fitted');
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
    this.applyHudLayout();
    this.wireHover(overlay);
    this.wireHover(hud);
    this.wireNavMode();

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
