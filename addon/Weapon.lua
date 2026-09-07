local _, WS = ...

-- Weapon behaviors. Each entry in `behaviors` turns a weapon's data + the
-- survivor's stats into projectiles/zones/etc. New weapons only need data in
-- Data\Weapons.lua plus (optionally) a new behavior registered here.
WS.Weapon = {}
local Weapon = WS.Weapon

-- Scratch table passed to Projectile:LaunchBolt; fields are copied out
-- immediately, so reusing one table generates zero garbage per shot.
local spec = {}

local RETRY_COOLDOWN = 0.25 -- when there is nothing to shoot at

------------------------------------------------------------------------------
-- Stat derivation
------------------------------------------------------------------------------

-- Each scaling knob can be overridden per weapon (data.<field>), else it falls
-- back to the shared Config global - so a single spell's rank curve or evolved
-- form can be tuned independently of the rest.
local function Damage(player, weapon)
    local cfg, data = WS.Config, weapon.data
    local step = data.rankDamageStep or cfg.rankDamageStep or 0.20
    local base = data.damage * (1 + step * (weapon.level - 1))
        * player.damageMultiplier * (weapon.mods.damageMult or 1)
    if weapon.evolved then base = base * (data.evolveDamageMult or cfg.evolveDamageMult or 1.5) end
    -- Metamorphosis: everything hits harder while the fel holds.
    if (player.metaTimer or 0) > 0 then base = base * (cfg.metaDamageMult or 1.6) end
    -- Global damage nerf (unless a weapon flags noNerf).
    if not data.noNerf then base = base * WS.Constants.PLAYER_DAMAGE_SCALE end
    return base
end

-- Projectile count: weapon base, +1 at the two rank thresholds, +Duplicity,
-- +evolved bonus.
local function Count(player, weapon)
    local cfg, data = WS.Config, weapon.data
    local count = (data.projectiles or 1)
    if weapon.level >= (data.projRankA or cfg.projRankA or 4) then count = count + 1 end
    if weapon.level >= (data.projRankB or cfg.projRankB or 7) then count = count + 1 end
    count = count + player.projectileBonus + (weapon.mods.extraProjectiles or 0)
    if weapon.evolved then count = count + (data.evolveProjectiles or cfg.evolveProjectiles or 2) end
    return count
end

local function Area(player, weapon, base)
    local cfg, data = WS.Config, weapon.data
    local step = data.rankAreaStep or cfg.rankAreaStep or 0.04
    local evo = weapon.evolved and (data.evolveAreaMult or cfg.evolveAreaMult or 1.25) or 1
    return base * player.areaMultiplier * (1 + step * (weapon.level - 1)) * evo * (weapon.mods.areaMult or 1)
end

local function Speed(player, weapon)
    local speed = (weapon.data.speed or 400) * player.projectileSpeed
    if not weapon.data.noNerf then speed = speed * WS.Constants.PLAYER_SPEED_SCALE end
    return speed
end

-- The effective time between a weapon's shots, including the global cast-time
-- nerf (Multi-Shot exempt). Shared by Player:Update and Weapon:Describe.
function Weapon:Cooldown(player, weapon)
    local data = weapon.data
    local base = data.cooldown * player.cooldownMultiplier
        * (weapon.evolved and (data.evolveCooldownMult or WS.Config.evolveCooldownMult or 0.85) or 1)
    if not data.noNerf then base = base * WS.Constants.PLAYER_COOLDOWN_SCALE end
    -- Metamorphosis: everything fires faster while the fel holds.
    if (player.metaTimer or 0) > 0 then base = base * (WS.Config.metaCooldownMult or 0.75) end
    -- Safety clamp: a bad tuning value or runaway multiplier must never push a
    -- cooldown so high (or to NaN) that the weapon silently stops firing forever.
    -- The longest legit cooldown is well under 10s, so cap generously at 20.
    if base ~= base or base > 20 then base = 20 end -- (x ~= x catches NaN)
    if base < 0.05 then base = 0.05 end
    return base
end

local function Icon(weapon)
    return weapon.evolved and weapon.data.evolveIcon or weapon.data.icon
end

-- The icon a weapon's flying projectiles use (may differ from the ability
-- icon - e.g. Fan of Knives throws individual daggers, not a fan).
local function ProjIcon(weapon)
    local data = weapon.data
    if weapon.evolved and data.evolvedProjIcon then return data.evolvedProjIcon end
    return data.projIcon or Icon(weapon)
end

-- A weapon may override its school's palette (e.g. Chain Lightning is
-- blue-white storm light, not druidic green).
local function SchoolColor(data)
    return data.color or WS.Constants.COLORS[data.school]
end

-- Fills the shared spec with everything common to this weapon's bolts.
local function FillSpec(player, weapon)
    local data = weapon.data
    local cfg = WS.Config
    spec.damage = Damage(player, weapon)
    spec.life = data.life or 2.0
    -- Bolts visibly grow with rank; evolutions grow further still.
    spec.radius = (data.radius or 8) * (1 + (cfg.rankRadiusStep or 0.05) * (weapon.level - 1))
        * (weapon.evolved and (cfg.evolveRadiusMult or 1.3) or 1)
    spec.pierce = (data.pierce or 0) + (weapon.evolved and (cfg.evolvePierce or 2) or 0)
    spec.icon = ProjIcon(weapon)
    spec.color = SchoolColor(data)
    spec.homingTarget = nil
    -- Discoveries (weapon.mods) can grant splash, slows, or homing to
    -- weapons that lack them natively.
    local splash = data.splash or weapon.mods.splash
    spec.splash = splash and Area(player, weapon, splash) or nil
    spec.slowFactor = data.slowFactor or weapon.mods.slowFactor
    spec.slowDuration = data.slowDuration or weapon.mods.slowDuration
    spec.bounces = nil
    spec.source = weapon.id  -- damage-meter attribution
    -- Magic glows; steel stays solid.
    spec.blend = data.school ~= "physical" and "ADD" or nil
    return spec
end

------------------------------------------------------------------------------
-- Behaviors
------------------------------------------------------------------------------

Weapon.behaviors = {}

-- One aimed shot at a specific target (shared by fans and bursts).
local function FireAimedShot(player, weapon, target)
    local data = weapon.data
    FillSpec(player, weapon)
    local speed = Speed(player, weapon)
    local dx, dy = WS.Normalize(target.x - player.x, target.y - player.y)
    spec.homingTarget = (data.homing or weapon.mods.homing) and target or nil
    WS.Projectile:LaunchBolt(player.x, player.y, dx * speed, dy * speed, spec)
end

-- A fan of bolts at the nearest enemy (Fireball, Frostbolt, ...). Weapons
-- with `burst = true` (Arcane Missiles) instead fire their bolts one after
-- another, each re-acquiring the nearest enemy - proper magic missiles.
Weapon.behaviors.aimed = function(player, weapon)
    local data = weapon.data
    local target = WS.Enemy:FindNearest(player.x, player.y, data.range or 560)
    if not target then
        weapon.cooldown = RETRY_COOLDOWN
        return
    end
    local count = Count(player, weapon)
    if data.burst then
        FireAimedShot(player, weapon, target)
        weapon.burstShots = count - 1
        weapon.burstTimer = 0.09
        return
    end
    FillSpec(player, weapon)
    local speed = Speed(player, weapon)
    local dx, dy = WS.Normalize(target.x - player.x, target.y - player.y)
    for n = 1, count do
        local angle = (n - (count + 1) / 2) * 0.12
        local vx, vy = WS.Rotate(dx, dy, angle)
        spec.homingTarget = (data.homing or weapon.mods.homing) and target or nil
        WS.Projectile:LaunchBolt(player.x, player.y, vx * speed, vy * speed, spec)
    end
end

-- Fires the next missile of an in-flight burst (driven by Player:Update).
function Weapon:FireBurstShot(player, weapon)
    local target = WS.Enemy:FindNearest(player.x, player.y, weapon.data.range or 560)
    if target then FireAimedShot(player, weapon, target) end
end

-- A widening cone of arrows toward the nearest enemy (Multi-Shot / Volley).
-- Each arrow flies point-first; the evolution glows and looses a wider salvo.
Weapon.behaviors.spray = function(player, weapon)
    local data = weapon.data
    local target = WS.Enemy:FindNearest(player.x, player.y, data.range or 620)
    if not target then
        weapon.cooldown = RETRY_COOLDOWN
        return
    end
    FillSpec(player, weapon)
    local speed = Speed(player, weapon)
    local dx, dy = WS.Normalize(target.x - player.x, target.y - player.y)
    local count = Count(player, weapon)
    local spread = (data.spread or 0.16) * (weapon.evolved and 1.3 or 1)
    local length = spec.radius * 3.0
    for n = 1, count do
        local angle = (n - (count + 1) / 2) * spread
        local vx, vy = WS.Rotate(dx, dy, angle)
        spec.homingTarget = weapon.mods.homing and target or nil
        local arrow = WS.Projectile:LaunchBolt(player.x, player.y, vx * speed, vy * speed, spec)
        -- Arrows render as a clean, glowing tracer-dart aligned with flight -
        -- a slim streak rather than a stretched (and squished) quiver icon.
        if arrow then
            arrow.noResize = true
            arrow.frame:SetSize(length, length)
            local ic = arrow.frame.icon
            ic:ClearAllPoints()
            ic:SetPoint("CENTER")
            ic:SetTexture(WS.Media.softCircle)
            ic:SetTexCoord(0, 1, 0, 1)
            ic:SetSize(length, spec.radius * 0.85)
            ic:SetVertexColor(weapon.evolved and 0.75 or 0.96, 0.95, weapon.evolved and 0.55 or 0.72)
            ic:SetBlendMode("ADD")
            ic:SetAlpha(0.95)
            -- LaunchBolt already rotated the icon to the flight direction.
        end
    end
    if weapon.evolved then
        -- Volley: a bowstring flash at the survivor as the salvo looses.
        WS.Projectile:SpawnFlash(player.x, player.y, 46, { 0.7, 0.95, 0.6 })
    end
end

-- A full circle of thrown blades (Fan of Knives / Blade Flurry). Each blade
-- flies outward spinning; the evolution adds a shimmering steel ring on cast.
Weapon.behaviors.ring = function(player, weapon)
    FillSpec(player, weapon)
    local speed = Speed(player, weapon)
    local count = WS.max(4, Count(player, weapon))
    local offset = WS.random() * WS.tau
    for n = 1, count do
        local angle = offset + (n / count) * WS.tau
        local bolt = WS.Projectile:LaunchBolt(player.x, player.y, WS.cos(angle) * speed, WS.sin(angle) * speed, spec)
        if bolt then
            -- Blades spin as they fly (visual only), and Blade Flurry glows.
            bolt.spin = weapon.evolved and 22 or 14
            if weapon.evolved then bolt.frame.icon:SetBlendMode("ADD") end
        end
    end
    if weapon.evolved then
        WS.Projectile:SpawnFlash(player.x, player.y, 60, { 0.85, 0.9, 1.0 })
    end
end

-- An expanding shockwave centered on the survivor (Holy Nova).
Weapon.behaviors.nova = function(player, weapon)
    local data = weapon.data
    local radius = Area(player, weapon, data.radius)
    local damage = Damage(player, weapon)
    WS.Projectile:SpawnNova(player.x, player.y, radius, damage,
        data.expandTime or 0.35, Icon(weapon), SchoolColor(data), data.knockback, weapon.id)
    -- A brief flash at the caster so the cast reads clearly even with nothing in
    -- reach - the translucent expanding ring alone is easy to miss.
    WS.Projectile:SpawnFlash(player.x, player.y, radius * 0.4, SchoolColor(data))
    if weapon.evolved then
        -- Circle of Dawn: a second, larger radiant ring blooms outward in a
        -- brighter gold, and the ground flashes with Light.
        WS.Projectile:SpawnNova(player.x, player.y, radius * 1.6, damage * 0.5,
            (data.expandTime or 0.35) * 1.5, data.evolveIcon, { 1.0, 0.95, 0.6 }, data.knockback, weapon.id)
        WS.Projectile:SpawnFlash(player.x, player.y, radius * 0.7, { 1.0, 0.92, 0.5 })
    end
end -- (healing is applied centrally in Weapon:Fire, for every behavior)

-- A lance of fel that burns everything standing in a line (Fel Beam). Needs a
-- target to aim at, and drinks the Metamorphosis: while transformed it widens.
Weapon.behaviors.beam = function(player, weapon)
    local data = weapon.data
    local range = data.range or 620
    local target = WS.Enemy:FindNearest(player.x, player.y, range)
    if not target then return end
    local dx, dy = WS.Normalize(target.x - player.x, target.y - player.y)
    local half = Area(player, weapon, data.beamWidth or 26) * 0.5
    if (player.metaTimer or 0) > 0 then half = half * (data.metaWidthMult or 1.8) end
    local x2, y2 = player.x + dx * range, player.y + dy * range

    WS.Enemy:DamageLine(player.x, player.y, x2, y2, half, Damage(player, weapon), weapon.id)

    -- Rendered as a wide dim lance with a hot narrow core down its middle.
    local color = SchoolColor(data)
    WS.Projectile:SpawnBeam(player.x, player.y, x2, y2, color, half * 2, 0.18)
    WS.Projectile:SpawnBeam(player.x, player.y, x2, y2, { 0.90, 1.00, 0.70 },
        WS.max(3, half * 0.55), 0.14)
    WS.Projectile:SpawnFlash(player.x, player.y, half * 1.7, color)
end

-- A lingering field under the survivor (Consecration).
Weapon.behaviors.zone = function(player, weapon)
    local data = weapon.data
    local duration = (data.duration or 4) * (1 + (WS.Config.rankDurationStep or 0.06) * (weapon.level - 1))
    local radius = Area(player, weapon, data.radius)
    -- As with novas, base + discovery-granted healing applies even unevolved.
    local heal = (data.heal or 0) + (weapon.evolved and data.evolvedHeal or 0)
        + (weapon.mods.healBonus or 0)
    WS.Projectile:SpawnZone(player.x, player.y, radius, Damage(player, weapon),
        duration, data.tickRate, Icon(weapon), SchoolColor(data),
        heal > 0 and heal or nil, weapon.id)
    -- Fissures: a field that splits the ground (Death and Decay) claws glowing
    -- cracks outward from the centre, so it reads as broken earth instead of a
    -- plain disc. Evolving widens the break. Purely visual - the zone deals the
    -- damage - so a fissure never needs a source tag.
    local cracks = data.fissures or 0
    if cracks > 0 then
        if weapon.evolved then cracks = cracks + 3 end
        local color = data.fissureColor or { 0.62, 0.95, 0.25 }
        local spin = WS.random() * WS.tau -- a fresh crack pattern every cast
        for i = 1, cracks do
            -- Spread roughly evenly, then jitter, so they never look combed.
            local a = spin + (i / cracks) * WS.tau + (WS.random() - 0.5) * 0.7
            -- Each crack is a SHORT segment starting partway out, never at the
            -- caster's feet. Radiating full-length spokes from one point read as
            -- light beams; scattered chords read as broken ground.
            local inner = radius * (0.18 + WS.random() * 0.34)
            local outer = WS.min(radius * 0.94, inner + radius * (0.18 + WS.random() * 0.26))
            WS.Projectile:SpawnBeam(
                player.x + WS.cos(a) * inner, player.y + WS.sin(a) * inner,
                player.x + WS.cos(a) * outer, player.y + WS.sin(a) * outer,
                color, weapon.evolved and 4 or 3, duration * 0.55)
        end
    end

    if weapon.evolved then
        -- Each renewal blooms in the weapon's OWN colour - sanctifying gold for
        -- Hallowed Ground, sickly green for Blighted Earth (a hardcoded holy gold
        -- here made the death-magic field flash like the Light).
        WS.Projectile:SpawnFlash(player.x, player.y, radius, SchoolColor(data))
    end
end

-- Instant hops between enemies (Chain Lightning).
Weapon.behaviors.chain = function(player, weapon)
    local data = weapon.data
    local range = Area(player, weapon, data.range)
    local firstTarget = WS.Enemy:FindNearest(player.x, player.y, range)
    if not firstTarget then
        weapon.cooldown = RETRY_COOLDOWN
        return
    end
    local chains = data.chains + WS.floor(weapon.level / 2) + player.projectileBonus
        + (weapon.evolved and 3 or 0)
    -- Stormcaller's Wrath: fatter, brighter arcs with heavier impacts.
    local color = weapon.evolved and { 0.75, 0.9, 1.0 } or SchoolColor(data)
    WS.Projectile:Chain(player.x, player.y, Damage(player, weapon), chains, range,
        Icon(weapon), color, weapon.evolved and 7 or nil, weapon.evolved and 30 or nil, weapon.id)
    if weapon.evolved then
        WS.Projectile:SpawnFlash(player.x, player.y, 40, { 0.7, 0.9, 1.0 })
    end
end

-- Blades that circle the survivor for a few seconds (Whirlwind). Evolved
-- (Bladestorm) is a SINGLE dense ring that slowly breathes in and out and
-- spins slightly faster, rather than two counter-rotating rings.
Weapon.behaviors.orbit = function(player, weapon)
    local data = weapon.data
    local cfg = WS.Config
    local damage = Damage(player, weapon)
    local duration = (data.duration or 3) * (1 + (cfg.rankDurationStep or 0.06) * (weapon.level - 1))
    local orbitRadius = Area(player, weapon, data.orbitRadius)
    local color = (weapon.evolved and data.evolvedColor) or SchoolColor(data)
    -- Chain-on-hit can come from a discovery (Windseeker's Legacy) or be baked
    -- into the weapon itself (Thunderfury, which IS that discovery made permanent).
    local procChain = weapon.mods.procChain or data.procChain

    -- One ring. Evolved keeps its damage by packing more blades into that ring
    -- (instead of adding a second ring), spins a touch faster, and pulses.
    local count = Count(player, weapon) + (weapon.evolved and (cfg.evolveOrbitBlades or 4) or 0)
    local orbitSpeed = (data.orbitSpeed or 4.2) * (weapon.evolved and (cfg.evolveOrbitSpeed or 1.25) or 1)
    local bladeSize = (data.radius or 20) * (1 + 0.05 * (weapon.level - 1)) * (weapon.evolved and 1.35 or 1)
    local pulse = weapon.evolved and 0.28 or nil

    for n = 1, count do
        local orb = WS.Projectile:SpawnOrbiter((n / count) * WS.tau, orbitRadius,
            orbitSpeed, damage, duration, bladeSize, Icon(weapon), color, pulse, weapon.id)
        if orb then
            if weapon.evolved then orb.frame.icon:SetBlendMode("ADD") end
            if procChain then orb.procChain, orb.procDamage = procChain, damage * 0.5 end
        end
    end

    if weapon.evolved then
        WS.Projectile:SpawnFlash(player.x, player.y, orbitRadius, color)
        WS.UI:Shake(3, 0.25)
        player.spinTimer = duration
    end
    -- Divine Storm (discovery): every whirlwind opens with a pulse of Light.
    if weapon.mods.novaOnCast then
        WS.Projectile:SpawnNova(player.x, player.y, Area(player, weapon, 110), damage * 0.4, 0.3,
            "Interface\\Icons\\Spell_Holy_HolyNova", WS.Constants.COLORS.holy, 15, weapon.id)
    end
end

-- Strikes falling on random nearby enemies (evolved Moonfire: Starfall).
Weapon.behaviors.storm = function(player, weapon)
    local data = weapon.data
    if WS.Enemy:Count() == 0 then
        weapon.cooldown = RETRY_COOLDOWN
        return
    end
    local strikes = (data.strikes or 4) + WS.floor(weapon.level / 2) + player.projectileBonus
    local damage = Damage(player, weapon)
    local splash = Area(player, weapon, data.splash or 60)
    local reach = data.stormRadius or 230
    local icon, color = Icon(weapon), SchoolColor(data)
    for _ = 1, strikes do
        -- Prefer a real enemy near the survivor; fall back to a random spot.
        local angle = WS.random() * WS.tau
        local x = player.x + WS.cos(angle) * WS.random() * reach
        local y = player.y + WS.sin(angle) * WS.random() * reach
        local enemy = WS.Enemy:FindNearest(x, y, 160)
        if enemy then x, y = enemy.x, enemy.y end
        WS.Projectile:SpawnStormStrike(x, y, splash, damage, icon, color, weapon.id)
    end
end

-- A ricocheting projectile (Avenger's Shield).
Weapon.behaviors.bounce = function(player, weapon)
    local data = weapon.data
    local target = WS.Enemy:FindNearest(player.x, player.y, data.range or 600)
    if not target then
        weapon.cooldown = RETRY_COOLDOWN
        return
    end
    FillSpec(player, weapon)
    spec.bounces = (data.bounces or 3) + WS.floor(weapon.level / 3) + (weapon.evolved and 3 or 0)
        + (weapon.mods.extraBounces or 0)
    local speed = Speed(player, weapon)
    local dx, dy = WS.Normalize(target.x - player.x, target.y - player.y)
    local count = Count(player, weapon)
    for n = 1, count do
        local angle = (n - (count + 1) / 2) * 0.25
        local vx, vy = WS.Rotate(dx, dy, angle)
        WS.Projectile:LaunchBolt(player.x, player.y, vx * speed, vy * speed, spec)
    end
end

------------------------------------------------------------------------------

function Weapon:Fire(player, weapon)
    local data = weapon.data
    local behavior = (weapon.evolved and data.evolvedBehavior) or data.behavior
    local handler = self.behaviors[behavior]
    if handler then handler(player, weapon) end

    -- Weapon healing is universal, not a quirk of auras: a weapon's own `heal`
    -- (Death Strike, Death Coil), its evolved form's `evolvedHeal`, and anything a
    -- discovery granted (Defile) all mend on cast whatever the behavior. Shadow
    -- weapons bank under "runeblade" in the healing meter, everything else "holy".
    -- Zones are the exception: their healing is delivered per tick to whoever
    -- stands in the field (see SpawnZone), so they must not also heal on cast.
    if behavior ~= "zone" then
        local heal = (data.heal or 0) + (weapon.evolved and data.evolvedHeal or 0)
            + (weapon.mods.healBonus or 0)
        if heal > 0 then
            WS.Player:Heal(player, heal, data.school == "shadow" and "runeblade" or "holy")
        end
    end
end

-- One-line live stat summary for the pause screen and level-up tooltips,
-- e.g. "3 bolts x 41 dmg, fires every 0.9s".
function Weapon:Describe(player, weapon)
    local data = weapon.data
    local behavior = (weapon.evolved and data.evolvedBehavior) or data.behavior
    local damage = WS.floor(Damage(player, weapon))
    local cooldown = self:Cooldown(player, weapon)

    if behavior == "chain" then
        local chains = data.chains + WS.floor(weapon.level / 2) + player.projectileBonus
            + (weapon.evolved and 3 or 0)
        return string.format("%d dmg, leaps to %d enemies, every %.1fs", damage, chains, cooldown)
    elseif behavior == "zone" then
        local duration = (data.duration or 4) * (1 + (WS.Config.rankDurationStep or 0.06) * (weapon.level - 1))
        return string.format("%d dmg per tick, %.0f yd field for %.1fs, every %.1fs",
            damage, Area(player, weapon, data.radius), duration, cooldown)
    elseif behavior == "nova" then
        return string.format("%d dmg wave, %.0f yd reach, every %.1fs",
            damage, Area(player, weapon, data.radius), cooldown)
    elseif behavior == "beam" then
        return string.format("%d dmg beam, %.0f yd long x %.0f wide, every %.1fs",
            damage, data.range or 620, Area(player, weapon, data.beamWidth or 26), cooldown)
    elseif behavior == "orbit" then
        local duration = (data.duration or 3) * (1 + (WS.Config.rankDurationStep or 0.06) * (weapon.level - 1))
        return string.format("%d blades x %d dmg, spins %.1fs, every %.1fs",
            Count(player, weapon), damage, duration, cooldown)
    elseif behavior == "storm" then
        local strikes = (data.strikes or 4) + WS.floor(weapon.level / 2) + player.projectileBonus
        return string.format("%d strikes x %d dmg, every %.1fs", strikes, damage, cooldown)
    else -- aimed / spray / ring / bounce
        local extra = ""
        if data.slowFactor then extra = ", slows" end
        if (weapon.evolved and 2 or 0) + (data.pierce or 0) > 0 then extra = extra .. ", pierces" end
        if data.bounces then extra = extra .. ", ricochets" end
        return string.format("%d bolts x %d dmg%s, every %.1fs",
            Count(player, weapon), damage, extra, cooldown)
    end
end

-- The "Each rank" growth line for the level-up tooltip, tailored to the weapon's
-- behavior so a zone is never told it gains projectiles it can't fire.
function Weapon:RankNote(weapon)
    local data = weapon.data
    local behavior = (weapon.evolved and data.evolvedBehavior) or data.behavior
    local cfg = WS.Config
    local dmg = WS.floor((data.rankDamageStep or cfg.rankDamageStep or 0.2) * 100 + 0.5)
    local a = data.projRankA or cfg.projRankA or 4
    local b = data.projRankB or cfg.projRankB or 7
    if behavior == "beam" then
        return ("Each rank: +%d%% damage and a wider lance."):format(dmg)
    elseif behavior == "zone" or behavior == "nova" then
        return ("Each rank: +%d%% damage and a larger, longer field."):format(dmg)
    elseif behavior == "chain" then
        return ("Each rank: +%d%% damage; leaps to one more enemy every 2 ranks."):format(dmg)
    elseif behavior == "storm" then
        return ("Each rank: +%d%% damage; one more falling strike every 2 ranks."):format(dmg)
    elseif behavior == "orbit" then
        return ("Each rank: +%d%% damage and bigger blades; +1 blade at ranks %d and %d."):format(dmg, a, b)
    else
        return ("Each rank: +%d%% damage and larger effects; +1 projectile at ranks %d and %d."):format(dmg, a, b)
    end
end

-- The evolution line, likewise tailored: no "+2 projectiles" for auras/zones.
function Weapon:EvolveNote(data)
    local cfg = WS.Config
    local dmg = WS.floor(((data.evolveDamageMult or cfg.evolveDamageMult or 1.5) - 1) * 100 + 0.5)
    local faster = WS.floor((1 - (data.evolveCooldownMult or cfg.evolveCooldownMult or 0.85)) * 100 + 0.5)
    local proj = data.evolveProjectiles or cfg.evolveProjectiles or 2
    local behavior = data.evolvedBehavior or data.behavior
    if behavior == "beam" then
        return ("+%d%% damage, %d%% faster, and a far wider lance. Permanent for this run."):format(dmg, faster)
    elseif behavior == "zone" or behavior == "nova" then
        return ("+%d%% damage, %d%% faster, and a far larger field. Permanent for this run."):format(dmg, faster)
    elseif behavior == "chain" then
        return ("+%d%% damage, leaps to more enemies, %d%% faster. Permanent for this run."):format(dmg, faster)
    elseif behavior == "storm" then
        return ("+%d%% damage, more strikes, %d%% faster. Permanent for this run."):format(dmg, faster)
    elseif behavior == "orbit" then
        return ("+%d%% damage, +%d blades, %d%% faster, bigger blades. Permanent for this run."):format(dmg, proj, faster)
    else
        return ("+%d%% damage, +%d projectiles, %d%% faster, larger effects. Permanent for this run."):format(dmg, proj, faster)
    end
end

-- A short "what kind of weapon is this" label for new-weapon tooltips, so its
-- category (and thus what synergizes with it) is obvious at a glance.
local KIND_LABEL = {
    aimed = "Aimed projectiles", spray = "Spread of projectiles", ring = "Ring of projectiles",
    bounce = "Ricocheting projectile", nova = "Expanding nova (aura)", zone = "Ground field (aura)",
    orbit = "Orbiting blades", chain = "Chaining lightning", storm = "Falling storm",
    beam = "Sustained beam (line)",
}
function Weapon:KindLabel(data)
    return KIND_LABEL[data.behavior] or "Weapon"
end
