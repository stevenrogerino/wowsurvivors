/* EDENNIL'S SUPPLY DROPS.
 *
 * A supply cache used to appear on the ground. Now it is brought. When the
 * wave director calls a drop, a spot is chosen somewhere on the field and
 * marked at once - a ring, a countdown and a flare smoking in the middle of
 * it - and Edennil, the Watch's great owl, comes in from a random direction,
 * crosses over the mark, lets the crate go, and carries on out the far side.
 * The crate falls a moment, the canopy snaps open, and it drifts down onto
 * the mark. Only when it lands is it a pickup; what is in it is unchanged.
 *
 * The owl flies a straight line at a fixed height above its own shadow; the
 * whole flight is one number, `s`, the signed distance along the heading from
 * the mark (negative coming in, zero overhead, positive going away), so the
 * renderer can put the bird, its shadow and the crate anywhere from that.
 *
 * Every number is in Config under airdrop*. */
'use strict';
(function (WS) {

  const A = { list: [], calls: 0 };
  const C = () => WS.Config;

  A.clear = function () { this.list.length = 0; this.calls = 0; };

  /** How far from (x, y) along (dx, dy) until the edge of the field. */
  function toEdge(x, y, dx, dy) {
    const W = WS.CONST.WORLD_WIDTH, H = WS.CONST.WORLD_HEIGHT;
    let t = Infinity;
    if (dx > 1e-6) t = WS.min(t, (W - x) / dx);
    if (dx < -1e-6) t = WS.min(t, -x / dx);
    if (dy > 1e-6) t = WS.min(t, (H - y) / dy);
    if (dy < -1e-6) t = WS.min(t, -y / dy);
    return t === Infinity ? 0 : t;
  }

  /** Call Edennil: choose the spot, mark it, send the owl. */
  A.call = function (player) {
    const cfg = C();
    const W = WS.CONST.WORLD_WIDTH, H = WS.CONST.WORLD_HEIGHT;
    // A random spot, not on top of the survivor and not so far it is a chore,
    // and low enough on the field that the owl flying over it is on screen.
    let x = W / 2, y = H / 2;
    for (let i = 0; i < 16; i++) {
      const a = WS.random() * WS.TAU, d = WS.randRange(cfg.airdropNear, cfg.airdropFar);
      x = WS.clamp(player.x + WS.cos(a) * d, 90, W - 90);
      y = WS.clamp(player.y + WS.sin(a) * d, cfg.airdropAltitude + 40, H - 70);
      if (WS.dist(x, y, player.x, player.y) >= cfg.airdropNear * 0.8) break;
    }
    const heading = WS.random() * WS.TAU;
    const dx = WS.cos(heading), dy = WS.sin(heading);
    const reach = toEdge(x, y, -dx, -dy) + cfg.airdropMargin;
    const exit = toEdge(x, y, dx, dy) + cfg.airdropMargin;
    const d = {
      x, y, dx, dy, heading, s: -reach, reach, exit, t: 0,
      lead: reach / cfg.airdropSpeed + cfg.airdropFall,     // mark to landing
      released: false, chuted: false, landed: false, crateT: 0, whooshed: false,
      flap: WS.random(),
    };
    this.list.push(d);
    WS.Audio.play('owlHoot', x);
    if (this.calls === 0) {
      WS.Game.toast('Edennil is coming', 'Supplies for the Watch. Look for the flare.',
        { kind: 'plain', art: 'cache', tint: [1.0, 0.85, 0.5] });
    }
    this.calls++;
    return d;
  };

  /** The crate's height above the ground, `t` seconds after release: a
   *  short drop, then the canopy catches and it drifts the rest of the way. */
  A.crateHeight = function (t) {
    const cfg = C(), alt = cfg.airdropAltitude, tf = cfg.airdropFreefall;
    const dropped = alt * 0.16;                       // fallen before the canopy opens
    if (t < tf) return alt - dropped * (t / tf) * (t / tf);
    const k = WS.clamp((t - tf) / (cfg.airdropFall - tf), 0, 1);
    return (alt - dropped) * (1 - k);
  };

  A.update = function (dt) {
    const cfg = C();
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      d.t += dt;
      d.s += cfg.airdropSpeed * dt;
      d.flap += dt * cfg.airdropFlap;
      if (!d.whooshed && d.s > -cfg.airdropSpeed * 0.6) {
        d.whooshed = true;
        WS.Audio.play('wingBeat', d.x);
      }
      if (!d.released && d.s >= 0) d.released = true;
      if (d.released && !d.landed) {
        d.crateT += dt;
        if (!d.chuted && d.crateT >= cfg.airdropFreefall) {
          d.chuted = true;
          WS.Audio.play('chuteOpen', d.x);
        }
        if (d.crateT >= cfg.airdropFall) {
          d.landed = true;
          WS.Pickup.spawn('cache', d.x, d.y);
          WS.Audio.play('crateLand', d.x);
          WS.FX.burst(d.x, d.y + 6, 12, '#c8a878', 120, 0.5, 3);
          WS.FX.shake(2, 0.15);
        }
      }
      if (d.landed && d.s > d.exit) this.list.splice(i, 1);
    }
  };

  /** For the HUD's timers: the soonest landing, if a drop is under way. */
  A.nextLanding = function () {
    let best = null;
    for (const d of this.list) {
      if (d.landed) continue;
      const left = d.lead - d.t;
      if (!best || left < best.left) best = { left, total: d.lead };
    }
    return best;
  };

  WS.Airdrop = A;

})(window.WS);
