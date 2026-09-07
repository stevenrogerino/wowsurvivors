local _, WS = ...

-- The survivor: stats, movement, weapon cadence, XP, and damage intake.
-- Rendered with the player's actual 3D character model (PlayerModel widget)
-- standing on a soft shadow - see UI:CreatePlayerFrame.
WS.Player = {}
local Player = WS.Player

-- Experience required to go from `level` to `level + 1`. The curve steepens
-- sharply past a threshold (as in Vampire Survivors), so a completed build is
-- a late-run milestone rather than something you coast into. All five knobs
-- live in WS.Config so the Tuning page can shape the curve.
function Player.XPForLevel(level)
    local c = WS.Config
    local n = level - 1
    local base = c.xpBase + c.xpLinear * n + n * n * c.xpQuad
    if level > c.xpSteepFrom then
        local d = level - c.xpSteepFrom
        base = base + d * d * c.xpSteepMag
    end
    return WS.floor(base)
end

function Player:Create(characterId)
    local character = WS.Characters[characterId]
    local player = {
        characterId = characterId,
        x = WS.Constants.WORLD_WIDTH * 0.5,
        y = WS.Constants.WORLD_HEIGHT * 0.5,
        radius = WS.Constants.PLAYER_RADIUS,

        maxHealth = character.maxHealth,
        health = character.maxHealth,
        healthRegen = character.healthRegen or 0,
        moveSpeed = character.moveSpeed,
        armor = character.armor,
        pickupRadius = character.pickupRadius,

        damageMultiplier = 1,
        cooldownMultiplier = 1,
        areaMultiplier = 1,
        projectileBonus = 0,
        projectileSpeed = 1,
        critChance = WS.Config.baseCritChance or 0.05,
        critDamage = WS.Config.baseCritDamage or 1.5,
        luck = 1,
        goldMultiplier = 1,
        xpMultiplier = 1,
        healingMult = 1,

        level = 1,
        xp = 0,
        xpToNext = Player.XPForLevel(1),

        rerolls = WS.Config.baseRerolls,
        banishes = WS.Config.baseBanishes,

        weapons = {},
        weaponLevels = {},
        upgradeLevels = {},
        banished = {},
        combosActive = {},
        blessingsTaken = {}, -- blessings already chosen (no re-offers)
        blessingNames = {},  -- ordered list of chosen blessing names (for the pause sheet)
        -- Desecration (healing -> shadow damage). `desecration` counts the sources
        -- granting it; > 0 means overheal stops being wasted and starts hurting.
        desecration = 0, desecrationOverheal = 0, desecrationShare = 0,
        desecrationPool = 0, desecrationTimer = 0,
        -- Fel / Metamorphosis (Demon Hunter). `felAttuned` > 0 means overkill is
        -- being harvested instead of discarded.
        felAttuned = 0, fel = 0, felBonus = 0, soulRending = 0, metaTimer = 0,
        -- Unholy Command drives every summon (wolves and ghouls alike).
        summonDamage = 0, summonHaste = 0,
        unionsForged = {},   -- unions already forged (never again)
        lifesteal = 0,       -- Fel Pact: fraction of projectile damage healed

        invulnerable = 0,
        regenCarry = 0,
        moving = false,
        facing = 0,
        spinTimer = 0, -- >0 while Bladestorm whirls the model around

        -- Defensive/curse passives (set by their upgrades on apply).
        blockRank = 0, blockTimer = 0, blockReady = false,
        chillRank = 0, curse = 0,
        limitBreaks = 0, -- +8% damage each, from post-completion level-ups
    }

    -- Permanent Trainer lessons first, then the survivor's own perk, so the
    -- perk's percentages stack on top of trained bases.
    for id, rank in pairs(WoWSurvivorsDB.meta) do
        local meta = WS.MetaUpgrades[id]
        if meta and rank > 0 then meta.apply(player, rank, meta) end
    end
    if character.apply then character.apply(player, character) end

    -- Attach the shared player frame and refresh the 3D model for this login.
    local frame = WS.UI:CreatePlayerFrame()
    frame.fallback:SetTexture(character.icon)
    frame.fallback:Show()
    -- The player frame is shared between runs, so reset the model too: a run that
    -- ended mid-Metamorphosis must not start the next one still wearing the demon.
    frame.model:SetUnit("player")
    frame.model:SetCamDistanceScale(1)
    frame.model:SetAlpha(1)
    frame.model:SetFacing(0)
    frame.model:SetAnimation(0)
    frame.chillAura:Hide() -- reset the (shared) frame's auras for a fresh run
    frame.retAura:Hide()
    frame.felAura:Hide()
    frame:Show()
    player.frame = frame
    WS.UI:Place(frame, player.x, player.y)
    WS.UI:SetPortrait(character)

    self:AddWeapon(player, character.weapon)
    return player
end

function Player:Destroy(player)
    if not player then return end
    player.frame:Hide()
end

------------------------------------------------------------------------------
-- Weapons
------------------------------------------------------------------------------

function Player:AddWeapon(player, weaponId)
    if player.weaponLevels[weaponId] then
        return self:LevelWeapon(player, weaponId)
    end
    local weapon = { id = weaponId, data = WS.Weapons[weaponId], level = 1, cooldown = 0.35, mods = {} }
    player.weapons[#player.weapons + 1] = weapon
    player.weaponLevels[weaponId] = 1
    WS.UI:RefreshWeaponStrip(player)
    WS.ComboSystem:Check(player)
    return weapon
end

function Player:LevelWeapon(player, weaponId)
    local level = player.weaponLevels[weaponId] or 0
    if level >= WS.WEAPON_MAX_LEVEL then return false end
    player.weaponLevels[weaponId] = level + 1
    local weapon = self:GetWeapon(player, weaponId)
    if weapon then
        weapon.level = level + 1
        WS.UI:RefreshWeaponStrip(player)
        return true
    end
    return false
end

function Player:GetWeapon(player, weaponId)
    for i = 1, #player.weapons do
        if player.weapons[i].id == weaponId then return player.weapons[i] end
    end
end

-- Removes a weapon entirely (used when two weapons merge into a union).
function Player:RemoveWeapon(player, weaponId)
    player.weaponLevels[weaponId] = nil
    for i = #player.weapons, 1, -1 do
        if player.weapons[i].id == weaponId then
            table.remove(player.weapons, i)
        end
    end
    WS.UI:RefreshWeaponStrip(player)
end

-- Boss Arena: hand the survivor a strong, ready-made kit so the fight is a pure
-- test of the boss's mechanics, not a 30-minute build-up. A spread of evolved
-- weapons plus damage / survivability / mobility passives.
function Player:GrantArenaLoadout(player)
    -- The preset kit is data (WS.BossArena.loadout), so the Tuning bench can swap
    -- weapons/levels and passive ranks without touching code.
    local lo = WS.BossArena and WS.BossArena.loadout or {}
    local weapons = lo.weapons or {}
    for i = 1, #weapons do
        local slot = weapons[i]
        local id = slot.id
        if id and WS.Weapons[id] then
            self:AddWeapon(player, id)
            local lvl = slot.level or WS.WEAPON_MAX_LEVEL
            player.weaponLevels[id] = lvl
            local w = self:GetWeapon(player, id)
            if w then w.level = lvl; if slot.evolved then w.evolved = true end end
        end
    end
    for id, ranks in pairs(lo.passives or {}) do
        local up = WS.Upgrades[id]
        if up and ranks and ranks > 0 then
            for _ = 1, ranks do up.apply(player, up) end
            player.upgradeLevels[id] = ranks
        end
    end
    WS.UI:RefreshWeaponStrip(player)
    WS.UI:RefreshPassiveStrip(player)
    WS.ComboSystem:Check(player)
end

------------------------------------------------------------------------------
-- Per-tick update
------------------------------------------------------------------------------

function Player:Update(player, dt)
    local keys = WS.Game.keys
    local dx = ((keys.D or keys.RIGHT) and 1 or 0) - ((keys.A or keys.LEFT) and 1 or 0)
    local dy = ((keys.W or keys.UP) and 1 or 0) - ((keys.S or keys.DOWN) and 1 or 0)

    local moving = dx ~= 0 or dy ~= 0
    if moving then
        dx, dy = WS.Normalize(dx, dy)
        -- The Boss Arena bounds the survivor to a centered square; otherwise the
        -- whole world is fair game.
        local ab = WS.Game.arenaBounds
        local minX = (ab and ab.minX or 0) + player.radius
        local maxX = (ab and ab.maxX or WS.Constants.WORLD_WIDTH) - player.radius
        local minY = (ab and ab.minY or 0) + player.radius
        local maxY = (ab and ab.maxY or WS.Constants.WORLD_HEIGHT) - player.radius
        player.x = WS.Clamp(player.x + dx * player.moveSpeed * dt, minX, maxX)
        player.y = WS.Clamp(player.y + dy * player.moveSpeed * dt, minY, maxY)
    end

    -- Drive the 3D model: run animation while moving, stand while idle, and
    -- turn the model to actually face the direction of travel. Facing 0 looks
    -- at the camera (screen-down); the +pi/2 maps world direction onto model
    -- yaw. (If a client ever renders this mirrored, negate the offset.)
    local model = player.frame.model
    -- A transform flourish (the fel leap) owns the model for a moment; don't let
    -- the run/stand logic stomp it mid-pose.
    if (player.metaAnimHold or 0) > 0 then
        player.metaAnimHold = player.metaAnimHold - dt
        if player.metaAnimHold <= 0 then
            player.metaAnimHold = 0
            player.moving = nil -- resume normal animation on the next frame
        end
    elseif moving ~= player.moving then
        player.moving = moving
        model:SetAnimation(moving and 5 or 0) -- 5 = run, 0 = stand
    end
    if player.spinTimer > 0 then
        -- Bladestorm: the survivor whirls with their blades.
        player.spinTimer = player.spinTimer - dt
        player.facing = player.facing + 24 * dt
        model:SetFacing(player.facing)
        if player.spinTimer <= 0 then
            player.facing = 0
            model:SetFacing(0)
        end
    else
        local facing = moving and (math.atan2(dy, dx) + WS.pi * 0.5) or 0
        if facing ~= player.facing then
            player.facing = facing
            model:SetFacing(facing)
        end
    end

    -- Divine Bulwark: recharge the block over time and glow the model faintly
    -- when it is ready to absorb a hit.
    if player.blockRank > 0 and not player.blockReady then
        player.blockTimer = player.blockTimer - dt
        if player.blockTimer <= 0 then
            player.blockReady = true
            WS.Projectile:SpawnFlash(player.x, player.y, 44, WS.Constants.COLORS.holy)
        end
    end

    -- Passive regeneration (accumulated so whole points appear as heals). With
    -- Desecration active it keeps ticking at full health, because that overflow
    -- is the fuel: regen you cannot use becomes damage instead of being discarded.
    if player.healthRegen > 0
        and (player.health < player.maxHealth or (player.desecration or 0) > 0) then
        -- +healing-received (healingMult) boosts passive regen too, so it stays
        -- consistent with every other heal source.
        player.regenCarry = player.regenCarry + player.healthRegen * (player.healingMult or 1) * dt
        if player.regenCarry >= 1 then
            local whole = WS.floor(player.regenCarry)
            player.regenCarry = player.regenCarry - whole
            self:ApplyHeal(player, whole, "regen")
        end
    end

    -- Metamorphosis: burn down the timer and wear the fel corona while it lasts.
    if (player.metaTimer or 0) > 0 then
        player.metaTimer = player.metaTimer - dt
        local aura = player.frame.felAura
        if player.metaTimer > 0 then
            -- Once the demon fades this corona is the ONLY sign you're still
            -- empowered, so it breathes brighter and wider than a passive aura.
            local pulse = 126 + 14 * WS.sin(WS.Game.run.time * 9)
            aura:SetSize(pulse, pulse)
            aura:SetVertexColor(0.55, 1.0, 0.20, 0.34 + 0.14 * WS.sin(WS.Game.run.time * 12))
            aura:Show()
        else
            player.metaTimer = 0
            -- If the bar refilled during the form (only a maxed fel build manages
            -- it), roll straight into another one instead of flickering back to
            -- mortal shape for a frame - that's what "perma" should look like.
            if (player.fel or 0) >= (WS.Config.felToMeta or 3500) then
                player.fel = 0
                self:Metamorphose(player)
            else
                aura:Hide()
                -- The flourish has usually long since faded; only restore if a very
                -- short Metamorphosis ended while the demon was still on screen.
                if player.demonForm then self:SetDemonForm(player, false) end
                WS.Projectile:SpawnFlash(player.x, player.y, 110, { 0.45, 0.85, 0.30 })
                WS.FloatingText:Notice(player.x, player.y, "The fel recedes", 0.6, 0.9, 0.4)
            end
        end
    end

    -- Release pooled desecration as a single shadow pulse around the survivor.
    if (player.desecrationPool or 0) > 0 then
        player.desecrationTimer = (player.desecrationTimer or 0) - dt
        if player.desecrationTimer <= 0 then
            player.desecrationTimer = WS.Config.desecrationInterval or 0.5
            local coeff = WS.Config.desecrationCoefficient or 1
            local dmg = WS.floor(player.desecrationPool * coeff)
            if dmg >= 1 then
                -- Spend only what was actually dealt and KEEP THE REMAINDER. Zeroing
                -- the pool unconditionally meant a modest healing build - whose pool
                -- never reached a whole point in one interval - was silently floored
                -- to nothing every tick and never dealt damage at all.
                player.desecrationPool = player.desecrationPool - dmg / coeff
                local radius = (WS.Config.desecrationRadius or 110) * player.areaMultiplier
                WS.Enemy:DamageArea(player.x, player.y, radius, dmg, nil, nil, "desecration")
                -- A bordered pulse: a violet rim ringing a sickly green core, both
                -- swelling with the size of the burst so a big surge really lands.
                local punch = WS.min(1, dmg / 60)
                WS.Projectile:SpawnFlash(player.x, player.y, radius * (0.86 + 0.24 * punch),
                    { 0.42, 0.12, 0.55 })                        -- outer rim (violet)
                WS.Projectile:SpawnFlash(player.x, player.y, radius * (0.60 + 0.18 * punch),
                    { 0.30, 0.80 + 0.20 * punch, 0.22 })         -- core (fel green)
                if punch >= 0.6 then
                    WS.Projectile:SpawnFlash(player.x, player.y, radius * 0.26,
                        { 0.85, 1.00, 0.70 })                    -- hot centre on big hits
                end
                if punch >= 0.85 then WS.UI:Shake(3, 0.16) end
            end
        end
    end
    -- Flush the batched trickle (regen + lifesteal + ground ticks) as one summed
    -- "+N" per second, so continuous healing never spams tiny numbers. Gated by the
    -- "Floating healing numbers" setting inside FloatingText:Heal.
    player.healBatchTimer = (player.healBatchTimer or 0) - dt
    if player.healBatchTimer <= 0 then
        player.healBatchTimer = 1.0
        if (player.healBatch or 0) > 0 then
            WS.FloatingText:Heal(player.x, player.y, player.healBatch)
            player.healBatch = 0
        end
    end

    -- Post-hit grace: the model flickers while invulnerable.
    if player.invulnerable > 0 then
        player.invulnerable = player.invulnerable - dt
        if player.invulnerable <= 0 then
            model:SetAlpha(1)
        else
            model:SetAlpha((WS.floor(player.invulnerable * 12) % 2 == 0) and 0.45 or 0.9)
        end
    end

    -- The demon form is a flourish, not a costume: it erupts, holds a beat, fades
    -- out, and hands the body back. Metamorphosis itself keeps running - the fel
    -- corona is what says you're still empowered. Placed after the i-frame flicker
    -- so the fade owns the model's alpha while it's playing.
    if (player.demonFormTimer or 0) > 0 then
        player.demonFormTimer = player.demonFormTimer - dt
        local fade = WS.Config.metaFormFade or 0.45
        if player.demonFormTimer <= 0 then
            player.demonFormTimer = 0
            self:SetDemonForm(player, false)
            WS.Projectile:SpawnFlash(player.x, player.y, 70, { 0.60, 1.0, 0.30 })
        elseif player.demonFormTimer < fade then
            model:SetAlpha(WS.max(0, player.demonFormTimer / fade))
        end
    end

    -- Chilling Presence: the faint ground ring tracks the slow aura's reach,
    -- which grows with effect area (matches chillRange in Enemy:Update).
    if player.chillRank > 0 then
        local diameter = (70 + 18 * player.chillRank) * player.areaMultiplier * 2
        player.frame.chillAura:SetSize(diameter, diameter)
        player.frame.chillAura:Show()
    end

    -- Retribution Aura: a golden ring that sears nearby foes twice per second.
    if (player.retRank or 0) > 0 then
        local cfg = WS.Config
        local range = ((cfg.retributionRange or 60) + (cfg.retributionRangePerRank or 20) * player.retRank) * player.areaMultiplier
        player.frame.retAura:SetSize(range * 2, range * 2)
        player.frame.retAura:Show()
        player.retTimer = (player.retTimer or 0) - dt
        if player.retTimer <= 0 then
            player.retTimer = cfg.retributionTick or 0.5
            local dmg = ((cfg.retributionBase or 5) + (cfg.retributionPerRank or 4) * player.retRank)
                * player.damageMultiplier * WS.Constants.PLAYER_DAMAGE_SCALE
            WS.Enemy:DamageArea(player.x, player.y, range, dmg, nil, nil, "retribution")
        end
    end

    -- Automatic attacks. Momentum blessing hastens firing while moving.
    local haste = (player.momentum and moving) and (1 + (player.momentumHaste or 0.25)) or 1
    for i = 1, #player.weapons do
        local weapon = player.weapons[i]
        -- Burst weapons (Arcane Missiles) release their remaining bolts one
        -- by one after the initial shot.
        if weapon.burstShots and weapon.burstShots > 0 then
            weapon.burstTimer = weapon.burstTimer - dt
            if weapon.burstTimer <= 0 then
                weapon.burstTimer = 0.09
                weapon.burstShots = weapon.burstShots - 1
                WS.Weapon:FireBurstShot(player, weapon)
            end
        end
        weapon.cooldown = weapon.cooldown - dt * haste
        if weapon.cooldown <= 0 then
            WS.Weapon:Fire(player, weapon)
            weapon.cooldown = WS.Weapon:Cooldown(player, weapon)
        end
    end

    WS.UI:Place(player.frame, player.x, player.y)
end

------------------------------------------------------------------------------
-- Experience, healing, damage
------------------------------------------------------------------------------

function Player:GainXP(player, amount)
    -- Arcane Overflow blessing: a gathered gem may discharge every weapon.
    if player.overflow and WS.random() < player.overflow then
        for i = 1, #player.weapons do
            WS.Weapon:Fire(player, player.weapons[i])
        end
        WS.Projectile:SpawnFlash(player.x, player.y, 60, WS.Constants.COLORS.arcane)
    end

    player.xp = player.xp + amount * player.xpMultiplier
    while player.xp >= player.xpToNext do
        player.xp = player.xp - player.xpToNext
        player.level = player.level + 1
        player.xpToNext = Player.XPForLevel(player.level)
        WS.Game.pendingLevelUps = WS.Game.pendingLevelUps + 1
        -- Small automatic growth every level, so leveling is always a reward
        -- even before the boon choice (like a survivor's own leveling curve).
        player.maxHealth = player.maxHealth + 2
        player.health = WS.min(player.maxHealth, player.health + 2)
    end
    if WS.Game.pendingLevelUps > 0 and not WS.Game.leveling then
        WS.Game:OpenLevelUp()
    end
end

-- Records healing into the run's HPS accounting: a running total (sampled once
-- per second into run.hps) plus a per-source breakdown (the healing meter, the
-- exact mirror of the damage meter). `source` is a bucket key resolved to a
-- friendly name in HealSourceInfo (regen / potion / food / lifesteal /
-- bloodthirst / holy). Overhealing is not counted - only points actually gained.
function Player:RecordHeal(amount, source)
    if amount <= 0 then return end
    local run = WS.Game.run
    if not run then return end
    run.healingDone = (run.healingDone or 0) + amount
    run.healingBySource = run.healingBySource or {}
    source = source or "other"
    run.healingBySource[source] = (run.healingBySource[source] or 0) + amount
end

-- Big, discrete heals flash their own floating number immediately (satisfying);
-- everything else - the continuous trickle of regen, lifesteal, and ground ticks -
-- is batched into one green "+N" per second (see the flush in Player:Update).
local IMMEDIATE_HEAL = { potion = true, food = true, vitality = true, bloodthirst = true }

-- Desecration: healing curdles into shadow damage. Pools the converted amount and
-- lets Player:Update release it as one pulse, so the per-tick trickle of regen
-- never floods the damage system with 1-point hits.
function Player:Desecrate(player, amount)
    if amount <= 0 or (player.desecration or 0) <= 0 then return end
    player.desecrationPool = (player.desecrationPool or 0) + amount
end

-- Fel is the Demon Hunter's mirror of Desecration: where the Death Knight drinks
-- wasted OVERHEAL, the Illidari drink wasted OVERKILL - damage dealt past what the
-- kill actually needed. Filling the meter triggers Metamorphosis.
function Player:GainFel(player, amount)
    if amount <= 0 or (player.felAttuned or 0) <= 0 then return end
    local cfg = WS.Config
    local rate = (cfg.felPerOverkill or 1)
        + (cfg.felPerRank or 0.25) * (player.soulRending or 0)
        + (player.felBonus or 0)
    -- Charging DURING the form is throttled. Without this the bar simply sat at
    -- full for the whole transformation and re-procced the instant it dropped,
    -- which made 100% uptime trivial for any build. Now sustaining it is a
    -- genuine feat: only a maxed fel build out-earns this penalty.
    if (player.metaTimer or 0) > 0 then rate = rate * (cfg.metaFelRate or 0.35) end
    local need = cfg.felToMeta or 3500
    player.fel = WS.min(need, (player.fel or 0) + amount * rate)
    if player.fel >= need and (player.metaTimer or 0) <= 0 then
        player.fel = 0 -- the whole bar is spent, not just the threshold
        self:Metamorphose(player)
    end
end

-- Swap the survivor's 3D model to the demon form (and back). `SetUnit("player")`
-- restores the real character. Animation/facing are re-applied because changing
-- the model resets them, and player.moving is cleared so Player:Update re-asserts
-- the run/stand animation on the next frame.
function Player:SetDemonForm(player, on)
    local model = player.frame and player.frame.model
    if not model then return end
    local id = WS.Config.metaDisplayId or 0
    if on and id <= 0 then return end -- model swap disabled; aura-only Metamorphosis
    if on then
        model:SetDisplayInfo(id)
        -- The model widget is normally SetAllPoints to the 64x64 player frame, so
        -- zooming the camera alone only crops it. To actually LOOM, grow the render
        -- area itself; overflowing the parent frame is fine (nothing clips it).
        -- Model widgets CLIP to their rect, and a widget's aspect sets the field of
        -- view - so a square box slices the wings off the moment you turn sideways.
        -- `metaModelWidth` buys horizontal room WITHOUT making the demon any taller:
        -- a wider frame simply shows more of the scene, it does not stretch the model.
        local scale = WS.Config.metaModelScale or 1.5
        local wide = WS.Config.metaModelWidth or 1.5
        local w, h = player.frame:GetSize()
        model:ClearAllPoints()
        model:SetPoint("CENTER", player.frame, "CENTER", 0, h * (scale - 1) * 0.15)
        model:SetSize(w * scale * wide, h * scale)
        model:SetCamDistanceScale(1)
        -- Hold a flourish pose briefly; Player:Update leaves the animation alone
        -- while metaAnimHold is running, then resumes run/stand.
        model:SetAnimation(WS.Config.metaAnimation or 37)
        player.metaAnimHold = WS.Config.metaAnimTime or 0.9
    else
        model:SetUnit("player")
        model:ClearAllPoints()
        model:SetAllPoints(player.frame)
        model:SetCamDistanceScale(1)
        model:SetAlpha(1) -- undo any fade-out left over from the flourish
        player.metaAnimHold = 0
        player.demonFormTimer = 0
        model:SetAnimation(player.moving and 5 or 0)
    end
    player.demonForm = on and true or false
    model:SetFacing(player.facing or 0)
    player.moving = nil -- force Update to re-apply the animation next tick
end

function Player:Metamorphose(player)
    local cfg = WS.Config
    player.metaTimer = (cfg.metaDuration or 8)
        + (cfg.metaDurationPerRank or 1) * (player.soulRending or 0)
    local run = WS.Game.run
    if run then run.metamorphoses = (run.metamorphoses or 0) + 1 end
    self:SetDemonForm(player, true)
    player.demonFormTimer = WS.Config.metaFormTime or 1.2
    -- Only herald the FIRST transformation of a run. A high-uptime build procs
    -- this constantly, and the banner + horn every few seconds is pure noise -
    -- the leap, the eruption and the shake carry it after that.
    if (run and run.metamorphoses or 1) <= 1 then
        WS.Game:Announce("Metamorphosis!", "The fel takes hold.", 2.0)
        WS.Audio:Play("evolve")
    end
    WS.UI:Shake(10, 0.5)
    -- A fel eruption at the moment of change: core burst, outer shockwave, and a
    -- ring of embers thrown outward so the transformation reads as violent.
    WS.Projectile:SpawnFlash(player.x, player.y, 90, { 0.85, 1.0, 0.55 })
    WS.Projectile:SpawnFlash(player.x, player.y, 190, { 0.55, 1.0, 0.20 })
    for i = 1, 10 do
        local a = (i / 10) * WS.tau
        WS.Projectile:SpawnFlash(player.x + WS.cos(a) * 60, player.y + WS.sin(a) * 60,
            34, { 0.60, 1.0, 0.25 })
    end
end

-- Splits a heal into the part that LANDS and the part that would be WASTED, and
-- feeds both into desecration at their own rates. Returns the health gained.
function Player:ApplyHeal(player, scaled, source)
    local room = WS.max(0, player.maxHealth - player.health)
    local gained = WS.min(scaled, room)
    if (player.desecration or 0) > 0 then
        self:Desecrate(player, (scaled - gained) * (player.desecrationOverheal or 0)
            + gained * (player.desecrationShare or 0))
    end
    if gained <= 0 then return 0 end
    player.health = player.health + gained
    self:RecordHeal(gained, source)
    if IMMEDIATE_HEAL[source] then
        WS.FloatingText:Heal(player.x, player.y, gained)
    else
        player.healBatch = (player.healBatch or 0) + gained
    end
    return gained
end

function Player:Heal(player, amount, source)
    -- NB: no early-out at full health any more - overheal is a resource that
    -- Desecration feeds on, so the heal still has to be measured.
    local scaled = WS.floor(amount * (player.healingMult or 1))
    if scaled <= 0 then return 0 end
    return self:ApplyHeal(player, scaled, source)
end

-- Lifesteal (Fel Pact): heal for a fraction of weapon damage dealt. Fractions
-- accumulate so even 2% of small hits eventually heals a whole point.
function Player:Lifesteal(player, amount)
    if amount <= 0 then return end
    -- At full health lifesteal is normally discarded; with Desecration active it
    -- still accrues, because the overheal is exactly what becomes damage.
    if player.health >= player.maxHealth and (player.desecration or 0) <= 0 then return end
    player.lifestealCarry = (player.lifestealCarry or 0) + amount
    local whole = WS.floor(player.lifestealCarry)
    if whole >= 1 then
        player.lifestealCarry = player.lifestealCarry - whole
        self:Heal(player, whole, "lifesteal")
    end
end

-- Grants `n` Egg-Merchant eggs, which live only for the current run: each adds
-- a sliver of weapon damage and max health (also topping up current health).
function Player:GrantRunEggs(player, n)
    if n <= 0 then return end
    player.runEggs = (player.runEggs or 0) + n
    local dmg = WS.Config.eggRunDamage or 0.001
    local hp = WS.Config.eggRunHealth or 1
    player.damageMultiplier = player.damageMultiplier + dmg * n
    player.maxHealth = player.maxHealth + hp * n
    player.health = player.health + hp * n
end

-- Returns true if the hit connected (false while invulnerable). A dodge still
-- counts as connected (the attacker's swing is "used up") but deals no damage.
-- `srcName`/`srcDisplay` identify the attacker, recorded as the killing blow if
-- this hit is fatal (shown on the death screen).
function Player:TakeDamage(player, amount, srcName, srcDisplay)
    if player.invulnerable > 0 then return false end
    local run = WS.Game.run

    -- Evasion: a chance to avoid the hit entirely (the whole hit is prevented).
    if player.dodgeChance and WS.random() < player.dodgeChance then
        player.invulnerable = WS.Config.dodgeInvulnerable or 0.2
        run.damagePrevented = (run.damagePrevented or 0) + amount
        WS.FloatingText:Notice(player.x, player.y, "Dodge", 0.75, 0.9, 1.0)
        return true
    end

    -- Divine Bulwark: fully absorb the hit and start recharging.
    if player.blockReady then
        player.blockReady = false
        player.blockTimer = player.blockInterval
        player.invulnerable = WS.Config.hitInvulnerable or 0.45
        run.damagePrevented = (run.damagePrevented or 0) + amount
        WS.FloatingText:Notice(player.x, player.y, "BLOCK", 1, 0.9, 0.3)
        WS.Projectile:SpawnFlash(player.x, player.y, 60, WS.Constants.COLORS.holy)
        return true
    end

    -- Armor: a diminishing % reduction (multiplicative, never 100%), not a flat
    -- subtraction - so it matters against big hits and can't trivialize small ones.
    local armor = player.armor or 0
    local reduction = armor > 0 and armor / (armor + (WS.Config.armorConstant or 30)) or 0
    local taken = WS.max(1, WS.floor(amount * (1 - reduction)))
    run.damagePrevented = (run.damagePrevented or 0) + (amount - taken)
    run.damageTaken = (run.damageTaken or 0) + taken
    amount = taken
    player.health = player.health - amount
    player.invulnerable = WS.Config.hitInvulnerable or 0.45
    run.noHitStreak = 0
    WS.FloatingText:PlayerHurt(player.x, player.y, amount)
    WS.UI:Shake(5, 0.22)
    if player.health <= 0 then
        -- The Ankh of Reincarnation (Trainer): cheat death once per run.
        if (player.revives or 0) > 0 then
            player.revives = player.revives - 1
            player.health = WS.floor(player.maxHealth * 0.5)
            player.invulnerable = 2.5
            WS.Projectile:SpawnFlash(player.x, player.y, 130, WS.Constants.COLORS.nature)
            WS.Enemy:DamageArea(player.x, player.y, 170, 200, nil, 90, "reincarnation")
            WS.Game:Announce("Reincarnation!", "The ancestors are not done with you.", 2.5)
            WS.Audio:Play("level")
            return true
        end
        -- Record the killing blow for the death screen.
        WS.Game.run.killedBy = { name = srcName or "the endless horde", damage = amount, displayId = srcDisplay }
        WS.Game:EndRun("defeated")
    end
    return true
end
