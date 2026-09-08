/* Experience gems: tiered by value, pooled, and merged into an existing gem
 * when the field saturates so a late swarm never loses experience to the cap. */
'use strict';
(function (WS) {

  const XP = { pool: null, vacuumTimer: 0 };

  XP.init = function () {
    this.pool = new WS.Pool(() => ({}), null, WS.CONST.MAX_GEMS);
    this.vacuumTimer = 0;
  };

  XP.clear = function () {
    this.vacuumTimer = 0;
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
    const gx = x + WS.randRange(-6, 6), gy = y + WS.randRange(-6, 6);

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

    // The field is full and nothing was close enough: fold into a random gem
    // rather than dropping the experience on the floor.
    if (this.pool.count >= WS.CONST.MAX_GEMS) {
      const gem = this.pool.active[WS.randInt(0, this.pool.count - 1)];
      gem.value += value;
      style(gem);
      gem.pop = 0.18;
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
        if (vacuum) WS.Audio.play('gem');
        const value = gem.value;
        this.pool.releaseAt(i);
        WS.Player.gainXP(player, value);
        if (WS.Game.leveling || !WS.Game.running) return;
      } else i++;
    }
  };

  WS.XP = XP;

})(window.WS);
