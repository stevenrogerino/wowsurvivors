/* Experience gems: tiered by value, pooled, and merged into an existing gem
 * when the field saturates so a late swarm never loses experience to the cap. */
'use strict';
(function (WS) {

  const XP = { pool: null, vacuumTimer: 0 };
  const CHAIN_GAP = 0.7, NOTE_GAP = 0.05;          // see chime() below
  const chain = { step: 0, lastGem: -99, lastNote: -99 };

  XP.init = function () {
    this.pool = new WS.Pool(() => ({}), null, WS.CONST.MAX_GEMS);
    this.vacuumTimer = 0;
  };

  XP.clear = function () {
    this.vacuumTimer = 0;
    chain.step = 0; chain.lastGem = -99; chain.lastNote = -99;
    if (this.pool) this.pool.releaseAll();
  };

  function style(gem) {
    const C = WS.CONST.COLORS;
    // Purely how big it looks. What it takes to collect one is gem.radius,
    // which is a flat 8 for every tier and is deliberately not tied to this -
    // a gem must not become easier to pick up by being worth more.
    if (gem.value >= 25) { gem.size = 9.45; gem.colour = C.gemHigh; gem.tier = 2; }
    else if (gem.value >= 8) { gem.size = 7.88; gem.colour = C.gemMid; gem.tier = 1; }
    else { gem.size = 6.3; gem.colour = C.gemLow; gem.tier = 0; }
  }

  /* Gems merge on contact rather than piling up.
   *
   * A four-minute run used to leave 200-odd gems lying on the field, and two
   * hundred 6px marks scattered over the ground do not read as loot - they
   * read as static. Merging on spawn keeps the field in the tens: fewer, and
   * each one worth more, which is also a better thing to walk toward. No
   * experience is lost either way, since the merge target keeps the value.
   *
   * MERGE is deliberately smaller than the pickup radius, so gems only fuse
   * when they were going to overlap anyway. */
  const MERGE = 26, MERGE2 = MERGE * MERGE;

  XP.spawnGem = function (x, y, value) {
    if (value <= 0) return;
    /* Inside the field. Enemies arrive from up to 120px beyond the edge and
       a long-range build kills plenty of them out there; their gems used to
       drop where they fell, past where the survivor can walk, and by two
       minutes most of the experience on the field was out of reach. */
    const W = WS.CONST.WORLD_WIDTH, H = WS.CONST.WORLD_HEIGHT;
    const gx = WS.clamp(x + WS.randRange(-6, 6), 14, W - 14);
    const gy = WS.clamp(y + WS.randRange(-6, 6), 14, H - 14);

    // Fold into a neighbour if there is one. The scan is linear, but it ends
    // on the first hit and the field is densest exactly when hits are likely.
    for (let i = 0; i < this.pool.count; i++) {
      const g = this.pool.active[i];
      const dx = g.x - gx, dy = g.y - gy;
      if (dx * dx + dy * dy < MERGE2) {
        g.value += value;
        style(g);
        g.pop = 0.18;                       // a small swell, so a merge reads
        return;
      }
    }

    /* The field is full and nothing was close enough.
     *
     * This used to fold the value into a RANDOM gem on the field, which
     * conserved the experience and looked exactly like a bug: standing still
     * in a late run fills the 260 slots in about a minute, and from then on
     * every single kill fed a gem somewhere off-screen while nothing dropped
     * where the enemy actually died. Measured over three minutes of standing
     * in the middle: 260 gems ever appeared and 13,518 kills folded into one
     * of them. The player's report was "things that die aren't dropping gems
     * anymore", and they were right.
     *
     * So recycle the FURTHEST gem from the survivor instead. It carries its
     * value to the new drop, which conserves the experience exactly as before
     * while keeping the field where the fighting is - and a gem appears at
     * the kill every time, which is the part that has to be true. */
    if (this.pool.count >= WS.CONST.MAX_GEMS) {
      const player = WS.Game.player;
      let worst = 0, worstD = -1;
      for (let i = 0; i < this.pool.count; i++) {
        const g = this.pool.active[i];
        const dx = g.x - player.x, dy = g.y - player.y;
        const d = dx * dx + dy * dy;
        if (d > worstD) { worstD = d; worst = i; }
      }
      const gem = this.pool.active[worst];
      gem.value += value;
      gem.x = gx; gem.y = gy;
      gem.spin = WS.random() * WS.TAU;
      gem.pop = 0.18;
      style(gem);
      return;
    }
    const gem = this.pool.acquire();
    if (!gem) return;
    gem.x = gx;
    gem.y = gy;
    gem.value = value;
    gem.radius = 8;
    gem.pop = 0.18;
    // A fixed orientation, set once. Gems used to rotate at 2 rad/s, which on
    // a 6px diamond is not rotation - it is the shape changing width every
    // frame, and across a field of them it reads as flicker.
    gem.spin = WS.random() * WS.TAU;
    style(gem);
  };

  /** Lodestone: a brief one-shot sweep of everything currently on the field.
   *  Timed, so it does not keep magnetising gems that drop afterwards. */
  XP.vacuumAll = function () { this.vacuumTimer = 1.5; };

  /* THE CHAIN. Gathering used to be silent unless a lodestone was sweeping,
     and the one loop a survivors game is built on - walk through the drops,
     feel them come in - had no voice. Now each gem that lands within
     CHAIN_GAP of the last is the next note up (Audio kit gemChain), paced so
     a burst reads as a run rather than a chord, with a small spark where it
     lands. The pacing lives here, on run time, because the audio throttle is
     per-note and would let a clump through as one chord. */
  function chime(player, gem) {
    const t = WS.Game.run.time;
    if (t - chain.lastGem > CHAIN_GAP) chain.step = 0;
    chain.lastGem = t;
    if (t - chain.lastNote < NOTE_GAP) return;
    chain.lastNote = t;
    WS.Audio.play('gemChain', player.x, String(WS.min(chain.step, 10)));
    chain.step++;
    WS.FX.burst(player.x, player.y - 8, 2, WS.hex(gem.colour || [0.7, 0.85, 1]), 80, 0.3, 2, true);
  }

  XP.update = function (dt) {
    const player = WS.Game.player;
    if (this.vacuumTimer > 0) this.vacuumTimer -= dt;
    const vacuum = this.vacuumTimer > 0;

    let i = 0;
    while (i < this.pool.count) {
      const gem = this.pool.active[i];
      const [dx, dy, distance] = WS.normalize(player.x - gem.x, player.y - gem.y);
      if (gem.pop > 0) gem.pop -= dt;
      if (vacuum) {
        gem.x += dx * 900 * dt;
        gem.y += dy * 900 * dt;
      } else if (distance < player.pickupRadius) {
        const pull = WS.max(160, 420 * (1 - distance / player.pickupRadius));
        gem.x += dx * pull * dt;
        gem.y += dy * pull * dt;
      }
      if (distance < player.radius + gem.radius + 5) {
        WS.Game.run.gemsCollected++;
        WS.Save.stats.gemsCollected++;
        chime(player, gem);
        const value = gem.value;
        this.pool.releaseAt(i);
        WS.Player.gainXP(player, value);
        if (WS.Game.leveling || !WS.Game.running) return;
      } else i++;
    }
  };

  WS.XP = XP;

})(window.WS);
