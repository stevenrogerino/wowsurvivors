/* Ground that will hurt you.
 *
 * The horde used to be one verb - walk at the survivor - and the only thing
 * on the field that mattered was where the bodies were. Hazards are the other
 * half: ground the player has to read and route around, left behind by things
 * that die badly or leak as they walk.
 *
 * Every hazard has two lives. It FUSES first, drawn as a ring nobody has been
 * hurt by yet, because a hazard that hurts you on the frame it appears is not
 * a mechanic, it is a tax. Then it is ARMED for a while, and ticks damage into
 * whoever is standing in it. Nothing here reaches the player except through
 * Player.takeDamage, so armour, dodge, blocks and Thorns all behave exactly as
 * they do against a claw.
 */
'use strict';
(function (WS) {

  const Hazard = WS.Hazard = { pool: null };

  Hazard.init = function () {
    this.pool = new WS.Pool(() => ({}), null, WS.CONST.MAX_HAZARDS);
  };

  Hazard.clear = function () { if (this.pool) this.pool.releaseAll(); };

  /** @param spec {radius, fuse, life, damage, interval, tint, name} */
  Hazard.spawn = function (x, y, spec) {
    if (!this.pool || this.pool.count >= WS.CONST.MAX_HAZARDS) return null;
    const h = this.pool.acquire();
    if (!h) return null;
    h.x = x; h.y = y;
    h.radius = spec.radius;
    h.fuse = spec.fuse || 0;
    h.maxFuse = h.fuse;
    h.life = spec.life;
    h.maxLife = spec.life;
    h.damage = spec.damage;
    h.interval = spec.interval || 0.5;
    h.timer = 0;                       // hits the moment it arms, then on interval
    h.tint = spec.tint || [1.0, 0.45, 0.30];
    h.name = spec.name || 'the ground';
    h.seed = WS.random() * WS.TAU;     // so a field of them does not pulse in lockstep
    return h;
  };

  Hazard.update = function (dt) {
    const player = WS.Game.player;
    let i = 0;
    while (i < this.pool.count) {
      const h = this.pool.active[i];
      if (h.fuse > 0) {
        h.fuse -= dt;
        if (h.fuse <= 0) {
          h.fuse = 0;
          WS.FX.flash(h.x, h.y, h.radius, WS.hex(h.tint), 0.35);
          WS.Audio.play('enemyHit', h.x);
        }
        i++;
        continue;
      }
      h.life -= dt;
      h.timer -= dt;
      if (h.timer <= 0 && player) {
        const dx = player.x - h.x, dy = player.y - h.y;
        if (dx * dx + dy * dy < (h.radius + player.radius) * (h.radius + player.radius)) {
          h.timer = h.interval;
          WS.Player.takeDamage(player, h.damage, h.name);
          if (!WS.Game.running) return;
        }
      }
      if (h.life <= 0) this.pool.releaseAt(i);
      else i++;
    }
  };

})(window.WS);
