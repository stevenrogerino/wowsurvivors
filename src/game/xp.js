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
    if (gem.value >= 25) { gem.size = 9; gem.colour = C.gemHigh; gem.tier = 2; }
    else if (gem.value >= 8) { gem.size = 7.5; gem.colour = C.gemMid; gem.tier = 1; }
    else { gem.size = 6; gem.colour = C.gemLow; gem.tier = 0; }
  }

  XP.spawnGem = function (x, y, value) {
    if (value <= 0) return;
    if (this.pool.count >= WS.CONST.MAX_GEMS) {
      const gem = this.pool.active[WS.randInt(0, this.pool.count - 1)];
      gem.value += value;
      style(gem);
      return;
    }
    const gem = this.pool.acquire();
    if (!gem) return;
    gem.x = x + WS.randRange(-6, 6);
    gem.y = y + WS.randRange(-6, 6);
    gem.value = value;
    gem.radius = 8;
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
      gem.spin += dt * 2;
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
