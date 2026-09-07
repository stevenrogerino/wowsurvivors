local _, WS = ...

-- Pooled projectiles and transient effects. One pool serves several kinds:
--   bolt    - friendly projectile (homing/pierce/splash/slow/bounce)
--   hostile - enemy projectile aimed at the survivor
--   zone    - lingering damage field (Consecration)
--   nova    - expanding shockwave (Holy Nova)
--   orbit   - blade circling the survivor (Whirlwind)
--   storm   - a strike falling from above (Starfall)
--   effect  - pure visual (impacts, death after-images)
WS.Projectile = {}
local Projectile = WS.Projectile

-- Bolt art used by enemy casters, keyed by spell school.
local HOSTILE_ICONS = {
    fire = "Interface\\Icons\\Spell_Fire_FlameBolt",
    frost = "Interface\\Icons\\Spell_Frost_FrostBolt02",
    shadow = "Interface\\Icons\\Spell_Shadow_ShadowBolt",
    nature = "Interface\\Icons\\Spell_Nature_Lightning",
    holy = "Interface\\Icons\\Spell_Holy_HolyBolt",
    physical = "Interface\\Icons\\INV_ThrowingKnife_02",
}

-- Circular mask toggle: magical bolts render as round glowing orbs; physical
-- projectiles (knives, arrows, axes) keep their true shape.
local function SetOrbMask(frame, enabled)
    if enabled and frame.CreateMaskTexture then
        if not frame.orbMask then
            frame.orbMask = frame:CreateMaskTexture()
            frame.orbMask:SetTexture(WS.Media.softCircle, "CLAMPTOBLACKADDITIVE", "CLAMPTOBLACKADDITIVE")
            frame.orbMask:SetAllPoints(frame.icon)
        end
        if not frame.orbMasked then
            frame.icon:AddMaskTexture(frame.orbMask)
            frame.orbMasked = true
        end
    elseif frame.orbMasked then
        frame.icon:RemoveMaskTexture(frame.orbMask)
        frame.orbMasked = false
    end
end

function Projectile:Initialize()
    self.pool = WS.Pool:New(function()
        return { frame = WS.UI:CreateEntityFrame(16), hitBy = {} }
    end, function(projectile)
        projectile.frame:Hide()
        projectile.frame.icon:SetRotation(0)
        for key in pairs(projectile.hitBy) do projectile.hitBy[key] = nil end
    end, 110)
    self.chainVisited = {}
end

-- Base acquisition shared by all kinds.
function Projectile:Acquire(kind, x, y, damage, life, radius, icon, color)
    if self.pool.count >= WS.Constants.MAX_PROJECTILES then return nil end
    local projectile = self.pool:Acquire()
    projectile.kind = kind
    projectile.x, projectile.y = x, y
    projectile.vx, projectile.vy = 0, 0
    projectile.damage, projectile.life, projectile.radius = damage or 0, life or 1, radius or 8
    projectile.homingTarget, projectile.splash = nil, nil
    projectile.homing, projectile.speed0 = nil, nil
    projectile.slowFactor, projectile.slowDuration = nil, nil
    projectile.pierce, projectile.bounces = 0, nil
    projectile.tickRate, projectile.tickTimer, projectile.healPerTick = nil, 0, nil
    projectile.procChain, projectile.procDamage = nil, nil
    projectile.spin, projectile.pulse = nil, nil
    projectile.source = nil  -- weapon id for the damage meter
    projectile.srcName, projectile.srcDisplay = nil, nil  -- hostile attacker id
    projectile.srcEnemy, projectile.srcEnemySpawnId = nil, nil  -- for Thorns reflect

    projectile.noResize = nil

    local frame = projectile.frame
    frame.icon:ClearAllPoints()
    frame.icon:SetAllPoints()
    frame.icon:SetTexture(icon)
    frame.icon:SetTexCoord(0.08, 0.92, 0.08, 0.92)
    frame.icon:SetVertexColor(color[1], color[2], color[3])
    frame.icon:SetAlpha(1)
    frame.icon:SetRotation(0)
    frame.icon:SetBlendMode("BLEND")
    SetOrbMask(frame, false)
    frame.badge:Hide()
    WS.UI:HideRingBorder(frame) -- a reused frame must not keep a previous zone's rim
    frame:Show()
    WS.UI:Place(frame, x, y, projectile.radius * 2)
    return projectile
end

------------------------------------------------------------------------------
-- Spawners
------------------------------------------------------------------------------

-- Friendly bolt. `spec` is a reused scratch table from Weapon.lua; its fields
-- are copied here so the caller may immediately reuse it.
function Projectile:LaunchBolt(x, y, vx, vy, spec)
    local projectile = self:Acquire("bolt", x, y, spec.damage, spec.life, spec.radius, spec.icon, spec.color)
    if not projectile then return end
    projectile.vx, projectile.vy = vx, vy
    projectile.source = spec.source
    projectile.pierce = spec.pierce or 0
    projectile.homingTarget = spec.homingTarget
    projectile.homing = spec.homingTarget ~= nil -- keep seeking new targets
    projectile.speed0 = WS.sqrt(vx * vx + vy * vy) -- launch speed, held while homing
    projectile.splash = spec.splash
    projectile.slowFactor, projectile.slowDuration = spec.slowFactor, spec.slowDuration
    projectile.bounces = spec.bounces
    projectile.schoolColor = spec.color
    projectile.frame.icon:SetRotation(math.atan2(vy, vx))
    -- Magical bolts render additively as round glowing orbs; steel keeps its
    -- shape and solidity.
    if spec.blend then
        projectile.frame.icon:SetBlendMode(spec.blend)
        SetOrbMask(projectile.frame, true)
    end
    return projectile
end

function Projectile:SpawnHostile(x, y, vx, vy, damage, school, srcName, srcDisplay, srcEnemy)
    local icon = HOSTILE_ICONS[school] or HOSTILE_ICONS.shadow
    local color = WS.Constants.COLORS[school] or WS.Constants.COLORS.shadow
    local projectile = self:Acquire("hostile", x, y, damage, 3.5, 11, icon, color)
    if not projectile then return end
    projectile.vx, projectile.vy = vx, vy
    projectile.srcName, projectile.srcDisplay = srcName, srcDisplay
    -- Remember which enemy fired this, so Thorns can reflect back to it.
    projectile.srcEnemy = srcEnemy
    projectile.srcEnemySpawnId = srcEnemy and srcEnemy.spawnId or nil
    projectile.frame.icon:SetRotation(math.atan2(vy, vx))
    -- Round orbs read clearly as "dodge me" against the dark ground.
    SetOrbMask(projectile.frame, true)
    return projectile
end

-- Ground fields are a soft tinted disc with a crisp rim marking exactly where the
-- damage stops. (`icon` is accepted for call-site symmetry with the other spawners
-- but deliberately unused - the field is defined by its edge, not by spell art.)
function Projectile:SpawnZone(x, y, radius, damage, duration, tickRate, icon, color, healPerTick, source)
    local projectile = self:Acquire("zone", x, y, damage, duration, radius, WS.Media.softCircle, color)
    if not projectile then return end
    projectile.tickRate, projectile.tickTimer = tickRate or 0.5, 0
    projectile.healPerTick = healPerTick
    projectile.source = source
    projectile.frame.icon:SetTexCoord(0, 1, 0, 1)
    projectile.frame.icon:SetAlpha(0.20)
    projectile.frame.icon:SetBlendMode("ADD")
    -- No centre badge: the spell art blown up in the middle of a ground field read
    -- as a random object sitting on the floor. A crisp rim defines the area far
    -- better than a picture does.
    WS.UI:SetRingBorder(projectile.frame, radius, color, 3)
    return projectile
end

-- Novas are an expanding soft ring of light, not a scaled-up spell icon.
function Projectile:SpawnNova(x, y, maxRadius, damage, expandTime, icon, color, knockback, source)
    local projectile = self:Acquire("nova", x, y, damage, expandTime, 10, WS.Media.softCircle, color)
    if not projectile then return end
    projectile.maxRadius = maxRadius
    projectile.expandTime = expandTime
    projectile.knockback = knockback
    projectile.source = source
    projectile.frame.icon:SetTexCoord(0, 1, 0, 1)
    projectile.frame.icon:SetAlpha(0.40)
    projectile.frame.icon:SetBlendMode("ADD")
    return projectile
end

-- `pulse` (0..1) makes the whole ring slowly breathe in and out; all blades
-- share the same phase (run.time) so the ring stays circular as it pulses.
function Projectile:SpawnOrbiter(angle, orbitRadius, orbitSpeed, damage, duration, radius, icon, color, pulse, source)
    local player = WS.Game.player
    local projectile = self:Acquire("orbit", player.x, player.y, damage, duration, radius, WS.Media.softCircle, color)
    if not projectile then return end
    projectile.angle = angle
    projectile.orbitRadius = orbitRadius
    projectile.orbitSpeed = orbitSpeed
    projectile.pulse = pulse
    projectile.source = source
    projectile.clearTimer = 0.4
    -- Blades draw as soft elongated glows tangent to the spin (a stretched
    -- soft circle, additive): motion blur, not hard white slabs.
    projectile.noResize = true
    local frame = projectile.frame
    frame:SetSize(radius * 2, radius * 2)
    frame.icon:ClearAllPoints()
    frame.icon:SetPoint("CENTER")
    frame.icon:SetTexCoord(0, 1, 0, 1)
    frame.icon:SetSize(radius * 3.2, radius * 0.9)
    frame.icon:SetBlendMode("ADD")
    frame.icon:SetAlpha(0.65)
    return projectile
end

-- A strike that falls from above and bursts on landing (Starfall).
function Projectile:SpawnStormStrike(x, y, splash, damage, icon, color, source)
    local projectile = self:Acquire("storm", x, y + 240, damage, 0.32, 12, icon, color)
    if not projectile then return end
    projectile.targetY = y
    projectile.splash = splash
    projectile.fallTime = 0.32
    projectile.schoolColor = color
    projectile.source = source
    projectile.frame.icon:SetRotation(-WS.pi / 2)
    projectile.frame.icon:SetBlendMode("ADD")
    return projectile
end

-- Small icon flash (death after-images, chain hops). If `displayId` is given
-- and the portrait API exists, the flash shows the creature's round portrait
-- fading out - a much cleaner death "poof" than a square trophy icon.
function Projectile:SpawnImpact(x, y, radius, icon, color, displayId)
    local projectile = self:Acquire("effect", x, y, 0, 0.18, radius, icon, color)
    if not projectile then return end
    projectile.baseAlpha, projectile.effectDuration = 0.75, 0.18
    projectile.frame.icon:SetAlpha(0.75)
    if displayId and SetPortraitTextureFromCreatureDisplayID then
        SetPortraitTextureFromCreatureDisplayID(projectile.frame.icon, displayId)
        projectile.frame.icon:SetTexCoord(0, 1, 0, 1)
        projectile.frame.icon:SetVertexColor(1, 1, 1)
        SetOrbMask(projectile.frame, true)
    end
    return projectile
end

-- Area burst: a fading circle of school-colored light (splash hits, storms).
function Projectile:SpawnFlash(x, y, radius, color)
    local projectile = self:Acquire("effect", x, y, 0, 0.28, radius, WS.Media.softCircle, color)
    if not projectile then return end
    projectile.baseAlpha, projectile.effectDuration = 0.42, 0.28
    projectile.frame.icon:SetTexCoord(0, 1, 0, 1)
    projectile.frame.icon:SetAlpha(0.42)
    projectile.frame.icon:SetBlendMode("ADD")
    return projectile
end

-- A glowing line between two points (chain lightning arcs). The texture is
-- stretched and rotated inside a small anchor frame.
function Projectile:SpawnBeam(x1, y1, x2, y2, color, width, duration)
    local mx, my = (x1 + x2) * 0.5, (y1 + y2) * 0.5
    duration = duration or 0.16
    local projectile = self:Acquire("effect", mx, my, 0, duration, 5, WS.Media.white, color)
    if not projectile then return end
    projectile.baseAlpha, projectile.effectDuration = 0.7, duration
    projectile.noResize = true
    local dx, dy = x2 - x1, y2 - y1
    local icon = projectile.frame.icon
    icon:ClearAllPoints()
    icon:SetPoint("CENTER")
    icon:SetTexCoord(0, 1, 0, 1)
    icon:SetSize(WS.sqrt(dx * dx + dy * dy), width or 3.5)
    icon:SetRotation(math.atan2(dy, dx))
    icon:SetBlendMode("ADD")
    icon:SetAlpha(0.7)
    return projectile
end

-- Instant chain lightning: hops between nearby enemies, drawing a glowing
-- arc for each jump plus an impact flash on every victim.
function Projectile:Chain(x, y, damage, chains, range, icon, color, beamWidth, impactSize, source)
    local visited = self.chainVisited
    local prevX, prevY = x, y
    local current = WS.Enemy:FindNearest(x, y, range)
    for _ = 1, chains do
        if not current then break end
        visited[current] = true
        self:SpawnBeam(prevX, prevY, current.x, current.y, color, beamWidth)
        WS.Enemy:Hit(current, damage, source)
        self:SpawnImpact(current.x, current.y, impactSize or 20, icon, color)
        prevX, prevY = current.x, current.y
        current = WS.Enemy:FindNearest(current.x, current.y, range, nil, visited)
    end
    for enemy in pairs(visited) do visited[enemy] = nil end
end

------------------------------------------------------------------------------
-- Per-tick update
------------------------------------------------------------------------------

local function BoltHit(self, projectile, enemy)
    projectile.hitBy[enemy] = enemy.spawnId
    WS.Enemy:Hit(enemy, projectile.damage, projectile.source)
    -- Fel Pact: projectiles drain a sliver of the damage they deal back as health.
    local p = WS.Game.player
    if p.lifesteal and p.lifesteal > 0 then WS.Player:Lifesteal(p, projectile.damage * p.lifesteal) end
    if projectile.slowFactor then
        WS.Enemy:ApplySlow(enemy, projectile.slowFactor, projectile.slowDuration)
    end
    if projectile.splash then
        self:SpawnFlash(projectile.x, projectile.y, projectile.splash, projectile.schoolColor or WS.Constants.COLORS.fire)
        WS.Enemy:DamageArea(projectile.x, projectile.y, projectile.splash, projectile.damage * 0.65, projectile.hitBy, nil, projectile.source)
    end
    -- Ricochet takes priority over pierce, then the bolt expires.
    if projectile.bounces and projectile.bounces > 0 then
        local nextTarget = WS.Enemy:FindNearest(projectile.x, projectile.y, 320, enemy, projectile.hitBy)
        if nextTarget then
            projectile.bounces = projectile.bounces - 1
            local speed = WS.sqrt(projectile.vx * projectile.vx + projectile.vy * projectile.vy)
            local dx, dy = WS.Normalize(nextTarget.x - projectile.x, nextTarget.y - projectile.y)
            projectile.vx, projectile.vy = dx * speed, dy * speed
            projectile.frame.icon:SetRotation(math.atan2(dy, dx))
            return true
        end
        return false
    end
    if projectile.pierce > 0 then
        projectile.pierce = projectile.pierce - 1
        return true
    end
    return false
end

function Projectile:Update(dt)
    local player = WS.Game.player
    local i = 1
    while i <= self.pool.count do
        local projectile = self.pool.active[i]
        local kind = projectile.kind
        projectile.life = projectile.life - dt

        if projectile.life <= 0 then
            -- Storms burst when their fall completes rather than fizzling.
            if kind == "storm" then
                self:SpawnFlash(projectile.x, projectile.targetY, projectile.splash, projectile.schoolColor or WS.Constants.COLORS.arcane)
                WS.Enemy:DamageArea(projectile.x, projectile.targetY, projectile.splash, projectile.damage, nil, nil, projectile.source)
                WS.UI:Shake(2, 0.1)
            end
            self.pool:Release(projectile)
        else
            if kind == "bolt" then
                -- Homing missiles keep seeking: once their target is gone or
                -- already struck, they re-acquire the nearest un-hit foe - so a
                -- piercing missile curves around into the next one, looping
                -- through the crowd instead of flying off straight.
                if projectile.homing then
                    local t = projectile.homingTarget
                    if not (t and t.poolIndex and projectile.hitBy[t] ~= t.spawnId) then
                        projectile.homingTarget = WS.Enemy:FindNearest(projectile.x, projectile.y,
                            WS.Config.homingReacquireRange or 520, nil, projectile.hitBy)
                    end
                end
                local target = projectile.homingTarget
                if target and target.poolIndex and projectile.hitBy[target] ~= target.spawnId then
                    local dx, dy = WS.Normalize(target.x - projectile.x, target.y - projectile.y)
                    -- Steer toward the target, then renormalize back to the launch
                    -- speed. Without this the blend bleeds off velocity when a close
                    -- target sits behind the missile, so it stalls and floats; now
                    -- it holds speed and carves clean loops through the crowd.
                    local s = projectile.speed0 or WS.sqrt(projectile.vx * projectile.vx + projectile.vy * projectile.vy)
                    local nvx = projectile.vx * 0.80 + dx * s * 0.20
                    local nvy = projectile.vy * 0.80 + dy * s * 0.20
                    local m = WS.sqrt(nvx * nvx + nvy * nvy)
                    if m > 0.0001 then
                        projectile.vx, projectile.vy = nvx / m * s, nvy / m * s
                    end
                    projectile.frame.icon:SetRotation(math.atan2(projectile.vy, projectile.vx))
                elseif projectile.homing then
                    projectile.homingTarget = nil
                end
                projectile.x = projectile.x + projectile.vx * dt
                projectile.y = projectile.y + projectile.vy * dt
                -- Thrown blades tumble as they fly.
                if projectile.spin then
                    projectile.frame.icon:SetRotation((projectile.frame.icon:GetRotation() or 0) + projectile.spin * dt)
                end
                local enemy = WS.Enemy:FindCollision(projectile.x, projectile.y, projectile.radius, projectile.hitBy)
                if enemy and not BoltHit(self, projectile, enemy) then
                    self.pool:Release(projectile)
                end

            elseif kind == "hostile" then
                projectile.x = projectile.x + projectile.vx * dt
                projectile.y = projectile.y + projectile.vy * dt
                if WS.DistanceSquared(projectile.x, projectile.y, player.x, player.y) < (projectile.radius + player.radius) ^ 2 then
                    WS.Player:TakeDamage(player, projectile.damage, projectile.srcName, projectile.srcDisplay)
                    if not WS.Game.running then return end
                    -- Thorns reflects ranged hits back to the CASTER that fired the
                    -- bolt (if it's still alive), matching the melee reflect.
                    if (player.thornsRank or 0) > 0 then
                        local src = projectile.srcEnemy
                        if src and src.poolIndex and src.spawnId == projectile.srcEnemySpawnId then
                            local flat = WS.Config.thornsFlat or 10
                            local pct = WS.Config.thornsDamagePct or 0.4
                            WS.Enemy:Hit(src, (flat + projectile.damage * pct) * player.thornsRank, "thorns")
                            if not WS.Game.running then return end
                        end
                    end
                    self.pool:Release(projectile)
                end

            elseif kind == "zone" then
                projectile.tickTimer = projectile.tickTimer - dt
                if projectile.tickTimer <= 0 then
                    projectile.tickTimer = projectile.tickRate
                    WS.Enemy:DamageArea(projectile.x, projectile.y, projectile.radius, projectile.damage, nil, nil, projectile.source)
                    if projectile.healPerTick
                        and WS.DistanceSquared(projectile.x, projectile.y, player.x, player.y) <= projectile.radius * projectile.radius then
                        WS.Player:Heal(player, projectile.healPerTick, "holy")
                    end
                end

            elseif kind == "nova" then
                local progress = 1 - (projectile.life / projectile.expandTime)
                local radius = 12 + (projectile.maxRadius - 12) * progress
                -- Damage the expanding rim once per enemy as it sweeps outward.
                WS.Enemy:DamageArea(projectile.x, projectile.y, radius, projectile.damage, projectile.hitBy, projectile.knockback, projectile.source)
                projectile.radius = radius
                projectile.frame.icon:SetAlpha(0.40 * (1 - progress * 0.7))

            elseif kind == "orbit" then
                projectile.angle = projectile.angle + projectile.orbitSpeed * dt
                -- The ring slowly breathes in and out when `pulse` is set.
                local orbit = projectile.orbitRadius
                if projectile.pulse then
                    orbit = orbit * (1 + projectile.pulse * WS.sin(WS.Game.run.time * 1.4))
                end
                projectile.x = player.x + WS.cos(projectile.angle) * orbit
                projectile.y = player.y + WS.sin(projectile.angle) * orbit
                -- Tangential: the blade's edge leads the spin.
                projectile.frame.icon:SetRotation(projectile.angle + WS.pi * 0.5)
                -- Re-arm against everything periodically so the blades keep
                -- grinding enemies that stay inside the ring.
                projectile.clearTimer = projectile.clearTimer - dt
                if projectile.clearTimer <= 0 then
                    projectile.clearTimer = 0.4
                    for key in pairs(projectile.hitBy) do projectile.hitBy[key] = nil end
                end
                local enemy = WS.Enemy:FindCollision(projectile.x, projectile.y, projectile.radius, projectile.hitBy)
                if enemy then
                    projectile.hitBy[enemy] = enemy.spawnId
                    WS.Enemy:Hit(enemy, projectile.damage, projectile.source)
                    -- Windseeker's Legacy: the blade calls the storm.
                    if projectile.procChain and WS.random() < projectile.procChain then
                        self:Chain(projectile.x, projectile.y, projectile.procDamage, 3, 200,
                            "Interface\\Icons\\Spell_Nature_ChainLightning", WS.Constants.COLORS.frost, nil, nil, projectile.source)
                    end
                end

            elseif kind == "storm" then
                local progress = 1 - (projectile.life / projectile.fallTime)
                projectile.y = (projectile.targetY + 240) - 240 * progress

            elseif kind == "effect" then
                projectile.frame.icon:SetAlpha(projectile.baseAlpha * (projectile.life / projectile.effectDuration))
            end

            if projectile.poolIndex then
                WS.UI:Place(projectile.frame, projectile.x, projectile.y,
                    not projectile.noResize and projectile.radius * 2 or nil)
                i = i + 1
            end
        end
    end
end

function Projectile:Clear()
    if self.pool then self.pool:ReleaseAll() end
end
