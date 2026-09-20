/* The training ground's scenarios and its runner, in one file, because two
 * copies of a scenario are two scenarios. tools/sim.js injects this into a
 * headless page; the tuning bench loads it straight and points it at the game
 * running in its own frame. Whatever one of them measures, the other measures
 * the same way.
 *
 * Works in node (for the spawn scripts) and in a browser (for the runner).
 */
'use strict';
(function (root) {

  /* ------------------------------------------------------------- dice -- */
  /** The same generator the game uses, so a script is reproducible from its
   *  seed alone and never has to be checked in. */
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  const SECONDS = { dummy: 45, gauntlet: 90, siege: 90, crucible: 120 };

  /** Who arrives, when, and where - written once, replayed for every build.
   *  The mix walks from fodder to elites the way a real run's does, on a clock
   *  that does not care how fast anything dies. */
  function gauntletScript() {
    const r = rng(0x5EED17);
    const out = [];
    const early = ['lampling', 'boar', 'gilkin'];
    const mid = ['ghoul', 'skeleton', 'bristlekin'];
    for (let t = 2; t < SECONDS.gauntlet; t += 1.5) {
      const wave = t < 30 ? early : t < 60 ? early.concat(mid) : mid;
      const n = 2 + Math.floor(t / 14);
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2;
        const d = 430 + r() * 90;
        out.push({ t, id: wave[Math.floor(r() * wave.length) % wave.length],
          x: 640 + Math.cos(a) * d, y: 360 + Math.sin(a) * d });
      }
    }
    return out;
  }

  /** The gauntlet saturates at six weapons - everything that size clears 259
   *  to 271 of its 282 - so the siege applies the pressure a late run does. */
  function siegeScript() {
    const r = rng(0xBADCAFE);
    const out = [];
    const late = ['ghoul', 'skeleton', 'bristlekin', 'abomination', 'crypt_fiend', 'raptor'];
    for (let t = 2; t < SECONDS.siege; t += 0.8) {
      const n = 4 + Math.floor(t / 8);
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2;
        const d = 430 + r() * 90;
        out.push({ t, id: late[Math.floor(r() * late.length) % late.length],
          x: 640 + Math.cos(a) * d, y: 360 + Math.sin(a) * d });
      }
    }
    return out;
  }

  /** And the siege saturates too. Evolved six-weapon builds cleared 1400 to
   *  1430 of its 1456 arrivals - at 96 to 98% the number is the size of the
   *  script, not the build, and I ranked eight builds with one before noticing.
   *  The crucible sends elites among the fodder, twice as often, for twice as
   *  long, and is the one scenario where the survivor can die. */
  function crucibleScript() {
    const r = rng(0xC0FFEE);
    const out = [];
    const fodder = ['ghoul', 'skeleton', 'bristlekin', 'abomination', 'crypt_fiend',
      'raptor', 'pale_ghoul', 'geist'];
    const elites = ['snarlpack_bonesnapper', 'kerchief_enforcer', 'bone_sentinel',
      'karrash_battlelord', 'deathbound_vanguard', 'shadow_weaver'];
    for (let t = 2; t < SECONDS.crucible; t += 0.4) {
      const n = 5 + Math.floor(t / 6);
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2;
        const d = 430 + r() * 90;
        // one in seven is an elite, and that share does not change - the rate does
        const pool = r() < 0.14 ? elites : fodder;
        out.push({ t, id: pool[Math.floor(r() * pool.length) % pool.length],
          x: 640 + Math.cos(a) * d, y: 360 + Math.sin(a) * d });
      }
    }
    return out;
  }

  const scriptFor = (scenario) => (
    scenario === 'gauntlet' ? gauntletScript()
      : scenario === 'siege' ? siegeScript()
        : scenario === 'crucible' ? crucibleScript() : []);

  /* --------------------------------------------------------- the run -- */
  /** Run one build against one scenario. `WS` is the game; in the harness it
   *  is the headless page's, in the bench it is the frame's. */
  function runBuild(WS, build, scenario, script, seconds) {
{
  const STEP = 1 / 60;

  WS.setSeed(1234567);
  WS.Game.startRun('thornhollow', 'mage');
  if (WS.Game.blessingChoices) WS.Game.chooseBlessing(0);
  const p = WS.Game.player;

  /* Nothing arrives except what the script says, and nothing the player
     does changes who arrives. */
  WS.WaveManager.update = function () {};

  /* The build under test is the build declared, at the ranks declared, for
     the whole run - so the offer of a level-up is never made. Draining the
     choice after the fact is not enough: presenting one sets the state to
     'levelup', and Game.update returns early in any state but 'playing',
     so the first gem picked up stops the simulation dead. That is what the
     first version of this did, for every build, which is why every build
     scored exactly the same nothing. */
  WS.Game.openLevelUp = function () { this.pendingLevelUps = 0; };
  WS.Game.presentLevelUp = function () { this.pendingLevelUps = 0; };
  WS.Enemy.pool.releaseAll();
  WS.Pickup.clear(); WS.XP.clear(); WS.Projectile.clear(); WS.FX.clear();

  // the declared build, and only it
  p.weapons.length = 0; p.weaponLevels = {}; p.combosActive = {};
  for (const [id, rank] of build.weapons) {
    WS.Player.addWeapon(p, id);
    const w = WS.Player.getWeapon(p, id);
    if (w) {
      w.level = rank; p.weaponLevels[id] = rank;
      /* A build can declare itself already evolved, so the cost of getting
         the pairings can be measured against the cost of only getting the
         ranks. */
      if (build.evolved) w.evolved = true;
    }
  }
  WS.ComboSystem.check(p);

  p.x = 640; p.y = 360;
  /* Immortal everywhere but the crucible.
   
     In the lighter scenarios a death would end the comparison early and the
     rows would stop being about the build. The crucible is the one tier
     meant to kill you, and it needs an UNCAPPED metric: its kill counts sit
     at 95% of everything it sends, so ranking builds by what they cleared
     is ranking them by the size of the script. How long a build lasts has
     no ceiling, which is the whole reason to have a tier this hard. */
  if (scenario !== 'crucible') { p.maxHealth = 1e9; p.health = 1e9; }

  /* The four keys, set by the clock instead of by fingers. A slow circuit
     around the middle of the field: enough movement that a weapon which
     only works standing still is found out, not so much that the survivor
     outruns the script. */
  WS.Input.poll = function () {};
  const drive = (t) => {
    const leg = Math.floor(t / 4) % 4;
    const k = WS.Input.keys;
    k.up = leg === 0; k.right = leg === 1; k.down = leg === 2; k.left = leg === 3;
  };

  /* The dummies: a standing crowd at three ranges, none of which can die
     or move.
     
     This began as ONE dummy at 160px, and that measured range rather than
     throughput. Dawnpulse's nova reaches 150 and scored 2 damage a second
     while killing 118 things in the gauntlet; the orbiters, the melee arcs
     and the ground zones all read zero for the same reason, and arcweb,
     which chains between targets, had nothing to chain to. A weapon cannot
     be asked how hard it hits at a distance it was never built to hit at.
     
     Three rings, because the shape of a build's reach is part of what it
     is: what works point-blank is not what works across the field. */
  const dummies = [];
  if (scenario === 'dummy') {
    /* Rings every 60px out to 480, because three rings still left gaps and
       a gap is a lie. Hallowed Ring measured 60 damage a second at rank 1
       and 31 at rank 8 - a weapon getting worse as it levels - and the
       reason was that its orbiters grow their radius with rank and at rank
       8 were sweeping the empty band between one ring of dummies and the
       next. The weapon was fine; the instrument had holes in it. */
    const rings = [[6, 60], [6, 120], [8, 180], [8, 240],
      [10, 300], [10, 360], [12, 420], [12, 480]];
    for (const [n, dist] of rings) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * WS.TAU;
        const d = WS.Enemy.spawn('lampling',
          640 + WS.cos(a) * dist, 360 + WS.sin(a) * dist, 1, true);
        if (d) { d.speed = 0; d.maxHealth = 1e12; d.health = 1e12; dummies.push(d); }
      }
    }
  }

  let next = 0, t = 0;
  const seen = { leaked: 0 };
  while (t < seconds) {
    if (scenario !== 'dummy') {
      while (next < script.length && script[next].t <= t) {
        const s = script[next++];
        WS.Enemy.spawn(s.id, s.x, s.y, 1, true);
      }
    }
    /* The circuit is for the gauntlet, where where-you-stand is half of
       what a build does. The dummy test is throughput, so the survivor
       stands still and the ranges stay the ranges. */
    if (scenario !== 'dummy') drive(t);
    WS.Game.update(STEP);
    if (!WS.Game.running) break;        // the crucible got them

    for (const d of dummies) { d.health = 1e12; d.x = d._hx || (d._hx = d.x); d.y = d._hy || (d._hy = d.y); }
    t += STEP;
  }

  const survived = t;
  const run = WS.Game.run;
  /* Anything still standing when the clock stops is something this build
     could not get to - the gauntlet's real verdict. */
  seen.leaked = WS.Enemy.pool.count;
  const byWeapon = {};
  for (const k in run.damageByWeapon) byWeapon[k] = run.damageByWeapon[k];
  return {
    damage: run.damageDone,
    taken: run.damageTaken,
    kills: run.kills || 0,
    leaked: seen.leaked,
    /* How long it lasted, and whether the clock or the horde stopped it.
       This is the crucible's real answer - kills there are capped by the
       size of the script, and time is not. */
    survived: Math.round(survived * 10) / 10,
    died: !WS.Game.running,
    byWeapon,
  };
}
  }

  const API = { rng, SECONDS, gauntletScript, siegeScript, crucibleScript, scriptFor, runBuild };
  if (typeof module === 'object' && module.exports) module.exports = API;
  root.WSSim = API;

})(typeof globalThis !== 'undefined' ? globalThis : this);
