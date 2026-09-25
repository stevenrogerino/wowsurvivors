/* The watchers, found on the field.
 *
 * Five of the survivors used to unlock from a number crossing a line - eight
 * minutes survived, level twenty, seven hundred and fifty kills - with a toast
 * in the corner to say so. Nobody met anyone. The other three were already
 * found in the world (a coffin, a blade, two glaives), and those were the
 * ones players talked about.
 *
 * So these five are met too. Each answers something you did in the run, in
 * the way that suits who they are:
 *
 *   Rav     the Kerchiefs have him tied up; put enough of them down and you
 *           find where, with his guards around him. Cut him loose.
 *   Maeca   a ranger treed by a wolf pack; put enough beasts down and you
 *           find her. Stand with her while the pack comes in.
 *   AAAAAAAAA  a hero's cairn starts screaming once you have slain enough of
 *           the night's worst. Dig him out while the dead rise around it.
 *   Nim     drawn out by a slaughter - enough kills inside a breath - and
 *           waits at its edge. He will not wait long.
 *   Vonnra  her storm finds whoever carries enough gold. She reads your
 *           fortune, if you reach her before the storm moves on.
 *
 * Bringing one in is standing beside them for a few seconds; stepping away
 * lets the progress drain back, not reset. The record of it is
 * `statistics.found[id]`, which is what the unlocking achievement reads, so a
 * save from before this change keeps every survivor it had.
 *
 * Everything here is tunable in Config.encounters, and every word is in
 * WS.Lore.watchers.
 */
'use strict';
(function (WS) {

  const ORDER = ['rogue', 'hunter', 'warrior', 'warlock', 'shaman'];

  /** What the run has to have done for each to come out. */
  const TRIGGER = {
    rogue: (E, run, c) => E.kills.kerchief >= c.kerchiefs,
    hunter: (E, run, c) => E.kills.beast >= c.beasts,
    warrior: (E, run, c) => run.bossesSlain >= c.bosses,
    warlock: (E) => E.slaughtered,
    shaman: (E, run, c) => run.gold >= c.gold,
  };

  /** Who comes with them: Config.encounters.guards. */
  const GUARDS = () => WS.Config.encounters.guards;

  /** The ones not in danger wait for you, and then they do not. */
  const WAITS = { warlock: 1, shaman: 1 };

  const Encounters = { run: null, active: null };

  Encounters.reset = function (run) {
    this.run = run;
    this.active = null;
    this.done = {};
    this.kills = { kerchief: 0, beast: 0 };
    this.recent = [];
    this.slaughtered = false;
    this.cooldown = WS.Config.encounters.firstCheck;
  };

  function wanted(id) {
    return !WS.Save.isCharacterUnlocked(id) && !(WS.Save.stats.found && WS.Save.stats.found[id]);
  }

  Encounters.onKill = function (t) {
    const run = this.run;
    if (!run || run !== WS.Game.run) return;
    if (t && t.family && this.kills[t.family] !== undefined) this.kills[t.family]++;
    // A slaughter is many kills inside one breath. Only counted while Nim is
    // still out there to be drawn by it.
    if (!this.slaughtered && wanted('warlock')) {
      const c = WS.Config.encounters, now = run.time;
      this.recent.push(now);
      while (this.recent.length && this.recent[0] < now - c.slaughterWindow) this.recent.shift();
      if (this.recent.length >= c.slaughter) this.slaughtered = true;
    }
  };

  Encounters.update = function (dt, run) {
    if (!this.run || run !== this.run) return;
    if (this.active) { this.tend(dt); return; }
    // Nothing new walks onto a field that is busy being something else.
    if (run.map.arena || (WS.Finale && WS.Finale.running())) return;
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    const c = WS.Config.encounters;
    for (const id of ORDER) {
      if (this.done[id] || !wanted(id)) continue;
      if (TRIGGER[id](this, run, c)) { this.begin(id); return; }
    }
  };

  Encounters.begin = function (id) {
    const c = WS.Config.encounters, p = WS.Game.player, W = WS.CONST.WORLD_WIDTH, H = WS.CONST.WORLD_HEIGHT;
    const a = WS.random() * WS.TAU;
    // Clear of the edges, and further clear of the top, where the HUD sits
    // over the field and would cover their name.
    const x = WS.clamp(p.x + WS.cos(a) * c.distance, 140, W - 140);
    const y = WS.clamp(p.y + WS.sin(a) * c.distance, 190, H - 150);
    const pk = WS.Pickup.spawn('watcher', x, y);
    if (!pk) { this.cooldown = 5; return; }      // the field is full; ask again shortly
    const ch = WS.Characters[id];
    pk.who = id;
    pk.type = Object.assign({}, WS.Pickup.TYPES.watcher, { tint: ch.color });
    pk.hold = 0;
    pk.stay = WAITS[id] ? c.stay : 0;
    this.active = { id, pk, hold: 0 };
    this.done[id] = true;

    const lore = WS.Lore.watchers && WS.Lore.watchers[id];
    const f = lore && lore.found;
    if (f) WS.Game.announce(f.arrive[0], f.arrive[1], 4.0);
    WS.Audio.play(GUARDS()[id] ? 'boss' : 'level');
    WS.FX.flash(x, y, 120, ch.color, 0.45);

    const scale = WS.WaveManager.enemyScale ? WS.WaveManager.enemyScale(this.run.time) * WS.Config.encounters.guardScale : 1;
    const guards = GUARDS()[id] || [];
    let n = 0;
    const total = guards.reduce((s, g) => s + g[1], 0);
    for (const [kind, count] of guards) {
      for (let i = 0; i < count; i++, n++) {
        const g = (n / total) * WS.TAU;
        WS.Enemy.spawn(kind, x + WS.cos(g) * 80, y + WS.sin(g) * 80, scale);
      }
    }
  };

  /** Standing with them, or not. */
  Encounters.tend = function (dt) {
    const A = this.active, pk = A.pk, c = WS.Config.encounters;
    // The pool reuses its slots: make sure this is still them.
    if (pk.kind !== 'watcher' || pk.who !== A.id) { this.active = null; return; }
    const p = WS.Game.player;
    const near = WS.dist(p.x, p.y, pk.x, pk.y) < c.holdRadius;
    A.hold = near ? A.hold + dt : WS.max(0, A.hold - dt * c.drain);
    pk.hold = WS.clamp(A.hold / c.hold, 0, 1);
    pk.near = near;
    if (A.hold >= c.hold) { this.bringIn(); return; }
    if (pk.stay && pk.life >= pk.stay && !near) this.lose();
    // Vonnra's storm: now and then it strikes the ground around her.
    if (A.id === 'shaman' && WS.random() < dt * 1.3) {
      const g = WS.random() * WS.TAU, r = 60 + WS.random() * 90;
      WS.FX.flash(pk.x + WS.cos(g) * r, pk.y + WS.sin(g) * r, 50, [0.6, 0.85, 1.0], 0.5);
    }
  };

  function release(pk) {
    const pool = WS.Pickup.pool;
    const i = pool.active.indexOf(pk);
    if (i >= 0) pool.releaseAt(i);
  }

  Encounters.bringIn = function () {
    const A = this.active, id = A.id, pk = A.pk, run = this.run;
    this.active = null;
    this.cooldown = WS.Config.encounters.gap;
    WS.FX.burst(pk.x, pk.y, 26, WS.hex(WS.Characters[id].color), 220, 0.8, 4);
    WS.FX.flash(pk.x, pk.y, 160, WS.Characters[id].color, 0.6);
    release(pk);
    WS.Save.stats.found = WS.Save.stats.found || {};
    WS.Save.stats.found[id] = true;
    WS.Game.addGold(WS.floor(WS.Config.encounters.reward * run.goldMult), pk.x, pk.y);
    WS.Achievements.check();
    WS.Save.save();
    const f = WS.Lore.watchers[id].found;
    WS.Game.announce(f.joined[0], f.joined[1], 4.0, { kind: 'glory' });
    WS.Audio.play('evolve');
  };

  Encounters.lose = function () {
    const A = this.active, pk = A.pk;
    this.active = null;
    WS.FX.burst(pk.x, pk.y, 12, '#9aa0b8', 120, 0.6, 3);
    release(pk);
    const f = WS.Lore.watchers[A.id].found;
    if (f && f.left) WS.Game.toast(f.left[0], f.left[1],
      { kind: 'watcher', tint: WS.Characters[A.id].color });
    // The trigger fired once; a second one this run can bring them back.
    this.done[A.id] = false;
    if (A.id === 'warlock') { this.slaughtered = false; this.recent.length = 0; }
    this.cooldown = WS.Config.encounters.gap / 2;
  };

  /** The words for what you are doing while you stand there. */
  Encounters.holdText = function (id) {
    const l = WS.Lore.watchers && WS.Lore.watchers[id];
    return (l && l.found && l.found.hold) || '';
  };

  WS.Encounters = Encounters;

})(window.WS);
