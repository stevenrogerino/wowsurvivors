/* Ground pickups: coins, potions, chests, sapper charges, lodestones, bronze
 * hourglasses, supply caches, and the two story objects (the coffin and the
 * egg merchant). Everything drifts toward the survivor once inside pickup
 * range, except destination pickups you have to walk to. */
'use strict';
(function (WS) {

  const TYPES = {
    coin: { art: 'coin', tint: [1.0, 0.82, 0.20], size: 15 },
    potion: { art: 'potion', tint: [1.0, 0.40, 0.40], size: 17 },
    chest: { art: 'chest', tint: [0.9, 0.70, 0.30], size: 22 },
    bomb: { art: 'bomb', tint: [1.0, 0.50, 0.30], size: 19 },
    stone: { art: 'stone', tint: [0.5, 0.90, 1.0], size: 18 },
    cache: { art: 'cache', tint: [1.0, 0.90, 0.60], size: 24 },
    hourglass: { art: 'hourglass', tint: [0.6, 0.85, 1.0], size: 20 },
    coffin: { art: 'coffin', tint: [0.85, 0.85, 0.95], size: 30, noMagnet: true },
    graveblade: { art: 'graveblade', tint: [0.85, 0.20, 0.25], size: 30, noMagnet: true },
    twinglaive: { art: 'twinglaive', tint: [0.55, 1.0, 0.25], size: 30, noMagnet: true },
    merchant: { art: 'merchant', tint: [0.95, 0.85, 0.45], size: 30, noMagnet: true },
  };

  const Pickup = { pool: null, TYPES };

  Pickup.init = function () {
    this.pool = new WS.Pool(() => ({}), null, WS.CONST.MAX_PICKUPS);
  };

  Pickup.clear = function () { if (this.pool) this.pool.releaseAll(); };

  /** Coins are the only expendable pickup; everything else is preserved when
   *  the field fills up. Returns the pickup, or null if there was no room. */
  Pickup.spawn = function (kind, x, y, value) {
    if (this.pool.count >= WS.CONST.MAX_PICKUPS) {
      let coin = -1;
      for (let i = 0; i < this.pool.count; i++) {
        if (this.pool.active[i].kind === 'coin') { coin = i; break; }
      }
      if (coin < 0) return null;
      this.pool.releaseAt(coin);
    }
    const p = this.pool.acquire();
    if (!p) return null;
    p.kind = kind;
    p.type = TYPES[kind];
    p.x = x; p.y = y;
    p.value = value || 0;
    p.radius = p.type.size * 0.5;
    p.bob = WS.random() * WS.TAU;
    p.life = 0;
    p.snooze = 0;
    return p;
  };

  /** Death-roll, called for every kill. Elites and bosses always leave a chest. */
  Pickup.onKill = function (enemy) {
    const player = WS.Game.player;
    const cfg = WS.Config;
    const luck = player.luck;

    if (enemy.elite) {
      this.spawn('chest', enemy.x, enemy.y, WS.floor((18 + WS.randInt(0, 26)) * WS.Game.run.goldMult));
      return;
    }
    if (enemy.boss) return;   // bosses pay out directly in Enemy.kill

    if (WS.random() < cfg.dropChanceGold * luck) {
      this.spawn('coin', enemy.x, enemy.y, WS.floor((3 + WS.randInt(0, 4)) * WS.Game.run.goldMult));
    } else if (WS.random() < cfg.dropChancePotion * luck) {
      this.spawn('potion', enemy.x, enemy.y);
    } else if (WS.random() < cfg.dropChanceBomb * luck) {
      this.spawn('bomb', enemy.x, enemy.y);
    } else if (WS.random() < cfg.dropChanceStone * luck) {
      this.spawn('stone', enemy.x, enemy.y);
    } else if (WS.random() < cfg.dropChanceHourglass * luck) {
      this.spawn('hourglass', enemy.x, enemy.y);
    }
  };

  /** Goblin sapper charge: clears the screen. Never one-shots a boss. */
  Pickup.detonate = function (x, y) {
    WS.Audio.play('explode');
    WS.FX.shake(9, 0.5);
    WS.FX.flash(x, y, 520, [1.0, 0.65, 0.25], 0.55);
    WS.FX.screen('rgba(255,180,80,.22)', 0.35);
    const enemies = WS.Enemy.pool.active;
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.boss) WS.Enemy.hit(e, e.maxHealth * 0.08, 'bomb');
      else WS.Enemy.damage(e, e.health + 1, false, 'bomb');
    }
  };

  function collect(p, pickup) {
    const kind = pickup.kind;
    const run = WS.Game.run;

    if (kind === 'potion') {
      WS.Player.heal(p, WS.floor(p.maxHealth * WS.Config.potionHealPct), 'potion');
      WS.Audio.play('potion');

    } else if (kind === 'coin') {
      WS.Game.addGold(WS.floor(pickup.value * p.goldMultiplier), pickup.x, pickup.y);
      WS.Audio.play('coin');

    } else if (kind === 'chest') {
      // Chests roll for a jackpot: one, three, or five payouts.
      const roll = WS.random();
      const rolls = roll < 0.03 ? 5 : roll < 0.15 ? 3 : 1;
      const total = WS.floor(pickup.value * p.goldMultiplier * (rolls === 1 ? 1 : rolls * 0.8));
      WS.Game.addGold(total, pickup.x, pickup.y);
      WS.Audio.play('chest');
      if (rolls > 1) {
        WS.Game.toast(rolls === 5 ? 'JACKPOT!' : 'Treasure!', `The chest pays out ${rolls}x.`);
        WS.FX.flash(pickup.x, pickup.y, 90, WS.CONST.COLORS.gold, 0.5);
      }

    } else if (kind === 'bomb') {
      Pickup.detonate(pickup.x, pickup.y);

    } else if (kind === 'stone') {
      WS.XP.vacuumAll();
      WS.FX.notice(p.x, p.y, 'Lodestone!', '#8fe0ff');
      WS.Audio.play('gem');

    } else if (kind === 'hourglass') {
      WS.Enemy.freezeAll(WS.Config.hourglassFreeze);
      WS.FX.notice(p.x, p.y, 'Time stops!', '#bfe6ff');

    } else if (kind === 'cache') {
      // A supply crate always holds something useful - never gold, never a dud.
      WS.Audio.play('chest');
      const roll = WS.randInt(1, 4);
      if (roll === 1) Pickup.detonate(pickup.x, pickup.y);
      else if (roll === 2) { WS.XP.vacuumAll(); WS.FX.notice(p.x, p.y, 'Lodestone!', '#8fe0ff'); }
      else if (roll === 3) { WS.Enemy.freezeAll(WS.Config.hourglassFreeze); WS.FX.notice(p.x, p.y, 'Time stops!', '#bfe6ff'); }
      else {
        WS.Player.heal(p, WS.floor(p.maxHealth * WS.Config.potionHealPct * 2), 'potion');
        WS.FX.notice(p.x, p.y, 'Two potions!', '#7fe89a');
        WS.Audio.play('potion');
      }

    } else if (kind === 'coffin') {
      WS.Save.stats.coffinsOpened = (WS.Save.stats.coffinsOpened || 0) + 1;
      WS.Save.save();
      WS.Game.announce('Bartholomew the Adequate rises!',
        'He files a complaint, then hands you the shield.', 3.5);
      WS.Game.addGold(WS.floor(80 * run.goldMult), p.x, p.y);
      WS.Achievements.check();
      WS.Audio.play('evolve');

    } else if (kind === 'graveblade') {
      WS.Save.stats.gravebladesClaimed = (WS.Save.stats.gravebladesClaimed || 0) + 1;
      WS.Save.save();
      WS.Game.announce('The graveblade answers.', 'Something colder takes the hilt.', 3.5,
        { kind: 'glory' });
      WS.Game.addGold(WS.floor(120 * run.goldMult), p.x, p.y);
      WS.Player.addWeapon(p, 'reaving_arc');
      WS.Achievements.check();
      WS.Audio.play('evolve');

    } else if (kind === 'twinglaive') {
      WS.Save.stats.glaivesClaimed = (WS.Save.stats.glaivesClaimed || 0) + 1;
      WS.Save.save();
      WS.Game.announce('The twin glaives find you.', 'You were never going to refuse.', 3.5,
        { kind: 'glory' });
      WS.Game.addGold(WS.floor(120 * run.goldMult), p.x, p.y);
      WS.Player.addWeapon(p, 'verdant_lance');
      WS.Achievements.check();
      WS.Audio.play('evolve');

    } else if (kind === 'merchant') {
      // The Egg Merchant sells run-only eggs; "Buy All" spends every coin.
      const cost = WS.Config.eggVendorCost;
      const affordable = WS.floor(run.gold / cost);
      if (affordable <= 0) {
        WS.Game.toast('Egg Merchant', `You cannot afford an egg (${cost}g each).`);
        return false;   // leave the merchant standing
      }
      run.gold -= affordable * cost;
      WS.Player.grantRunEggs(p, affordable);
      WS.Game.toast('Egg Merchant', `Bought ${affordable} curious egg${affordable === 1 ? '' : 's'}.`);
      WS.Audio.play('chest');
    }
    return true;
  }

  Pickup.update = function (dt) {
    const player = WS.Game.player;
    let i = 0;
    while (i < this.pool.count) {
      const pickup = this.pool.active[i];
      pickup.bob += dt * 3;
      pickup.life += dt;
      const [dx, dy, distance] = WS.normalize(player.x - pickup.x, player.y - pickup.y);

      if (!pickup.type.noMagnet && distance < player.pickupRadius) {
        const pull = WS.max(150, 380 * (1 - distance / player.pickupRadius));
        pickup.x += dx * pull * dt;
        pickup.y += dy * pull * dt;
      }

      if (pickup.snooze > 0) pickup.snooze -= dt;
      if (pickup.snooze <= 0 && distance < player.radius + pickup.radius + 4) {
        const consumed = collect(player, pickup);
        if (consumed) {
          this.pool.releaseAt(i);
          if (!WS.Game.running) return;
          continue;
        }
        // Not consumed (the merchant, with no coin to spend): wait a few
        // seconds before offering again instead of toasting every frame.
        pickup.snooze = 4;
      }
      i++;
    }
  };

  WS.Pickup = Pickup;

})(window.WS);
