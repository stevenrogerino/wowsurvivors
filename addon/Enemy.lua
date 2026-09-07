local _, WS = ...

-- Enemy simulation: pooled frames, a spatial hash grid for projectile
-- collision, chase/ranged AI, slows, boss patterns, and death handling.
WS.Enemy = { grid = {}, cellSize = 80 }
local Enemy = WS.Enemy

function Enemy:Initialize()
    self.cols = math.ceil(WS.Constants.WORLD_WIDTH / self.cellSize)
    self.rows = math.ceil(WS.Constants.WORLD_HEIGHT / self.cellSize)
    for i = 1, self.cols * self.rows do self.grid[i] = { count = 0 } end
    self.spawnSerial = 0
    self.pool = WS.Pool:New(function()
        return { frame = WS.UI:CreateEnemyFrame(30) }
    end, function(enemy)
        local frame = enemy.frame
        frame:Hide()
        frame.name:Hide()
        frame.glow:Hide()
        frame.skull:Hide()
        frame.modelActive = false
        frame.icon:SetAlpha(1)
        if frame.model then
            frame.model:Hide()
            frame.model:ClearModel()
        end
    end, 100)
end

-- Looks up a template across regular, elite, and boss tables.
local function FindTemplate(enemyId)
    return WS.Enemies[enemyId] or WS.Elites[enemyId] or WS.Bosses[enemyId]
end

------------------------------------------------------------------------------
-- Spawning
------------------------------------------------------------------------------

-- `scale` inflates health/damage/xp for elapsed time and map difficulty.
-- When the enemy pool is full, releases the fodder enemy farthest from the
-- survivor (never a boss or elite) so a guaranteed spawn - a scheduled boss or
-- the 30:00 Death - always has room. Returns true if a slot was freed.
function Enemy:EvictFodder()
    local player = WS.Game.player
    local best, bestD2 = nil, -1
    for i = 1, self.pool.count do
        local e = self.pool.active[i]
        if e and not e.boss and not e.elite then
            local d2 = player and WS.DistanceSquared(e.x, e.y, player.x, player.y) or 0
            if d2 > bestD2 then best, bestD2 = e, d2 end
        end
    end
    if best then self.pool:Release(best); return true end
    return false
end

-- `force` (bosses / Death) evicts fodder rather than failing when the field is
-- full, so the finale never gets stuck waiting for a free pool slot (that was the
-- "Death shows up two minutes late" bug - the field was packed at 30:00).
function Enemy:Spawn(enemyId, x, y, scale, force)
    if self.pool.count >= WS.Constants.MAX_ENEMIES then
        if not (force and self:EvictFodder()) then return nil end
    end
    local template = FindTemplate(enemyId)
    if not template then return nil end
    scale = scale or 1

    local enemy = self.pool:Acquire()
    self.spawnSerial = self.spawnSerial + 1
    enemy.spawnId = self.spawnSerial
    enemy.id, enemy.template = enemyId, template
    enemy.x, enemy.y = x, y
    enemy.radius = template.radius
    -- Global enemy buff (+8% health / speed / damage).
    local eScale = WS.Constants.ENEMY_SCALE
    enemy.maxHealth = template.health * scale * eScale
    enemy.health = enemy.maxHealth
    enemy.speed = template.speed * (0.94 + WS.random() * 0.12) * eScale
        * (WS.Game.run.hyper and 1.15 or 1)
        * (1 + 0.08 * (WS.Game.player and WS.Game.player.curse or 0)) -- Dark Bargain
    enemy.damage = template.damage * (0.8 + scale * 0.2) * eScale
    enemy.xp = WS.floor(template.xp * (0.75 + scale * 0.25))
    enemy.elite = template.elite or false
    enemy.boss = WS.Bosses[enemyId] ~= nil
    enemy.finalBoss = false

    enemy.contactCooldown = 0
    enemy.flash = 0
    enemy.slowTimer, enemy.slowFactor = 0, 1
    enemy.chilled = false
    enemy.chargeTimer = 0

    -- Ranged creatures start mid-swing so a fresh pack doesn't alpha-strike.
    if template.ranged then
        enemy.rangedTimer = template.ranged.cooldown * (0.5 + WS.random() * 0.7)
    else
        enemy.rangedTimer = nil
    end
    if enemy.boss then
        enemy.patternIndex = 1
        enemy.attackTimer = (template.interval or 3.6) * 0.8
    else
        enemy.patternIndex, enemy.attackTimer = nil, nil
    end

    -- Presentation. Regular creatures render as live portraits of their real
    -- 3D model (round, unit-frame style); if the API or display ID is
    -- unavailable, the tinted trophy icon is used instead.
    local frame = enemy.frame
    enemy.usesPortrait = false
    if template.displayId and not enemy.boss and not template.elite
        and SetPortraitTextureFromCreatureDisplayID then
        SetPortraitTextureFromCreatureDisplayID(frame.icon, template.displayId)
        frame.icon:SetTexCoord(0, 1, 0, 1)
        frame.icon:SetVertexColor(1, 1, 1)
        enemy.usesPortrait = true
    else
        frame.icon:SetTexture(template.icon)
        frame.icon:SetTexCoord(0.08, 0.92, 0.08, 0.92)
        frame.icon:SetVertexColor(template.tint[1], template.tint[2], template.tint[3])
    end
    frame.icon:SetAlpha(1)
    frame.health:SetValue(1)
    -- Trash-mob health bars can be hidden for performance; elites and bosses
    -- always keep theirs (you need to read those fights).
    frame.health:SetShown(not (WoWSurvivorsDB.settings.hideFodderBars and not enemy.boss and not enemy.elite))
    -- Elites and bosses are shown as real 3D creatures.
    if template.displayId and (enemy.boss or template.elite) then
        local model = WS.UI:AttachEnemyModel(frame)
        frame.modelActive = true
        model:ClearModel()
        model:SetDisplayInfo(template.displayId)
        model:SetAlpha(1)
        model:Show()
        enemy.modelFacing = 0
    end
    if enemy.boss or enemy.elite then
        frame.glow:SetSize(enemy.radius * 3.6, enemy.radius * 3.6)
        if enemy.boss then
            frame.glow:SetVertexColor(0.9, 0.3, 1.0, 0.9)
            frame.skull:Show()
        else
            frame.glow:SetVertexColor(1.0, 0.75, 0.1, 0.9)
        end
        frame.glow:Show()
        frame.name:SetText(template.name)
        frame.name:Show()
    end
    frame:Show()
    WS.UI:Place(frame, x, y, enemy.radius * 2)
    return enemy
end

-- Spawns just outside the player's view at a random bearing.
function Enemy:SpawnRing(enemyId, distance, scale, force)
    local player = WS.Game.player
    local angle = WS.random() * WS.tau
    return self:Spawn(enemyId, player.x + WS.cos(angle) * distance, player.y + WS.sin(angle) * distance, scale, force)
end

-- Scripted swarm event: an evenly spaced circle that closes in from all sides.
function Enemy:SpawnCircle(enemyId, count, distance, scale)
    local player = WS.Game.player
    for i = 1, count do
        local angle = (i / count) * WS.tau
        self:Spawn(enemyId, player.x + WS.cos(angle) * distance, player.y + WS.sin(angle) * distance, scale)
    end
end

------------------------------------------------------------------------------
-- Spatial grid (rebuilt once per tick; queried by projectiles)
------------------------------------------------------------------------------

function Enemy:BuildGrid()
    for i = 1, #self.grid do self.grid[i].count = 0 end
    for i = 1, self.pool.count do
        local enemy = self.pool.active[i]
        local col = WS.Clamp(WS.floor(enemy.x / self.cellSize) + 1, 1, self.cols)
        local row = WS.Clamp(WS.floor(enemy.y / self.cellSize) + 1, 1, self.rows)
        local cell = self.grid[(row - 1) * self.cols + col]
        cell.count = cell.count + 1
        cell[cell.count] = enemy
    end
end

function Enemy:FindCollision(x, y, radius, hitBy)
    local col = WS.Clamp(WS.floor(x / self.cellSize) + 1, 1, self.cols)
    local row = WS.Clamp(WS.floor(y / self.cellSize) + 1, 1, self.rows)
    for r = WS.max(1, row - 1), WS.min(self.rows, row + 1) do
        for c = WS.max(1, col - 1), WS.min(self.cols, col + 1) do
            local cell = self.grid[(r - 1) * self.cols + c]
            for i = 1, cell.count do
                local enemy = cell[i]
                if enemy.poolIndex and (not hitBy or hitBy[enemy] ~= enemy.spawnId)
                    and WS.DistanceSquared(x, y, enemy.x, enemy.y) <= (radius + enemy.radius) ^ 2 then
                    return enemy
                end
            end
        end
    end
end

-- Linear scan; used by aimed weapons a handful of times per shot.
function Enemy:FindNearest(x, y, range, excluded, visited)
    local closest, closestDistance = nil, range * range
    for i = 1, self.pool.count do
        local enemy = self.pool.active[i]
        if enemy ~= excluded and (not visited or not visited[enemy]) then
            local distance = WS.DistanceSquared(x, y, enemy.x, enemy.y)
            if distance < closestDistance then closest, closestDistance = enemy, distance end
        end
    end
    return closest
end

function Enemy:Count()
    return self.pool and self.pool.count or 0
end

------------------------------------------------------------------------------
-- Per-tick update
------------------------------------------------------------------------------

-- NOTE: enemies can die *during* this loop (the Ankh revive's retaliation
-- blast, for one), which swap-removes entries from the active list - so this
-- must be a while-loop that re-checks the count and only advances past
-- entries that survived their own update.
-- The Hourglass pickup: every enemy (except Death itself) stands frozen.
function Enemy:FreezeAll(duration)
    self.freezeTimer = WS.max(self.freezeTimer or 0, duration)
end

function Enemy:Update(dt)
    local player = WS.Game.player

    if self.freezeTimer and self.freezeTimer > 0 then
        self.freezeTimer = self.freezeTimer - dt
    end
    local timeFrozen = self.freezeTimer and self.freezeTimer > 0

    -- Chilling Presence: a frost aura that slows nearby non-bosses. Its reach
    -- scales with effect area, since it is something the survivor "casts".
    local chillRank = player.chillRank or 0
    local chillRange = ((WS.Config.chillRangeBase or 70) + (WS.Config.chillRangePerRank or 18) * chillRank) * player.areaMultiplier
    local chillFactor = 1 - (WS.Config.chillSlowPerRank or 0.10) * chillRank

    local i = 1
    while i <= self.pool.count do
        local enemy = self.pool.active[i]
        local template = enemy.template
        local dx, dy, distance = WS.Normalize(player.x - enemy.x, player.y - enemy.y)

        -- Time freeze halts everything except Death itself.
        local frozen = timeFrozen and template.family ~= "death"

        -- Status effects.
        local speed = enemy.speed
        if frozen then speed = 0 end
        -- Chilling Presence aura: slow nearby non-bosses AND tint them frost-blue
        -- (same look as Frostbolt) so it reads clearly. Recolor only on the
        -- enter/leave transition, never per-frame.
        local inChill = chillRank > 0 and not enemy.boss and distance < chillRange
        if inChill then speed = speed * chillFactor end
        if inChill ~= enemy.chilled then
            enemy.chilled = inChill
            if enemy.flash <= 0 and enemy.slowTimer <= 0 then self:RestColor(enemy) end
        end
        if enemy.slowTimer > 0 then
            enemy.slowTimer = enemy.slowTimer - dt
            speed = speed * enemy.slowFactor
            if enemy.slowTimer <= 0 and enemy.flash <= 0 then self:RestColor(enemy) end
        end
        if enemy.chargeTimer > 0 then
            enemy.chargeTimer = enemy.chargeTimer - dt
            speed = speed * 3.2
        end

        -- Movement: chase, unless a ranged creature is already in position (or
        -- the enemy is a stationary arena boss that hovers in place).
        local advance = not template.stationary
        if template.ranged and distance <= template.ranged.range then
            advance = false
        end
        if advance then
            enemy.x = enemy.x + dx * speed * dt
            enemy.y = enemy.y + dy * speed * dt
        end

        -- Contact: when an enemy is in melee and its swing is ready, it
        -- attacks - that swing always triggers Thorns (`struck`), even if the
        -- survivor dodges, blocks, or is mid-invulnerability. TakeDamage then
        -- resolves whether the survivor actually loses health.
        local struck = false
        enemy.contactCooldown = enemy.contactCooldown - dt
        if not frozen and enemy.contactCooldown <= 0 and distance < enemy.radius + player.radius then
            enemy.contactCooldown = enemy.boss and (WS.Config.contactCooldownBoss or 0.5)
                or (WS.Config.contactCooldownNormal or 0.8)
            struck = true
            WS.Player:TakeDamage(player, enemy.damage, template.name, template.displayId)
            if not WS.Game.running then return end
        end

        -- Ranged volleys.
        if enemy.rangedTimer and not frozen then
            enemy.rangedTimer = enemy.rangedTimer - dt
            if enemy.rangedTimer <= 0 and distance <= template.ranged.range * 1.15 then
                enemy.rangedTimer = template.ranged.cooldown
                local ranged = template.ranged
                WS.Projectile:SpawnHostile(enemy.x, enemy.y,
                    dx * ranged.speed, dy * ranged.speed,
                    enemy.damage * 0.75, ranged.school, template.name, template.displayId, enemy)
            end
        end

        -- Boss attack patterns (arena bosses are driven by WS.BossArena instead).
        if enemy.boss and not template.arena and not frozen then
            enemy.attackTimer = enemy.attackTimer - dt
            if enemy.attackTimer <= 0 then
                self:BossAttack(enemy, dx, dy)
                enemy.attackTimer = template.interval or 3.6
            end
        end

        -- Hit-flash recovery.
        if enemy.flash > 0 then
            enemy.flash = enemy.flash - dt
            if enemy.flash <= 0 then
                self:RestColor(enemy)
                if enemy.frame.modelActive then enemy.frame.model:SetAlpha(1) end
            end
        end

        -- Keep 3D creatures loosely facing their prey.
        if enemy.frame.modelActive then
            local facing = dx < 0 and 0.9 or -0.9
            if facing ~= enemy.modelFacing then
                enemy.modelFacing = facing
                enemy.frame.model:SetFacing(facing)
            end
        end

        -- Thorns: reflect damage to an attacker (applied last so it may safely
        -- kill the enemy without corrupting the rest of its own update).
        if struck and (player.thornsRank or 0) > 0 then
            local flat = WS.Config.thornsFlat or 10
            local pct = WS.Config.thornsDamagePct or 0.4
            self:Hit(enemy, (flat + enemy.damage * pct) * player.thornsRank, "thorns")
        end

        if enemy.poolIndex then
            WS.UI:Place(enemy.frame, enemy.x, enemy.y, enemy.radius * 2)
            enemy.frame.health:SetValue(enemy.health / enemy.maxHealth)
            i = i + 1
        end
    end
    self:BuildGrid()
end

------------------------------------------------------------------------------
-- Boss patterns
------------------------------------------------------------------------------

function Enemy:BossAttack(enemy, dx, dy)
    local template = enemy.template
    local pattern = template.patterns[enemy.patternIndex]
    enemy.patternIndex = enemy.patternIndex % #template.patterns + 1
    local school = template.school or "shadow"

    if pattern.type == "summon" then
        local scale = 1 + (WS.Game.run.time / 600)
        for _ = 1, pattern.count or 6 do
            local angle = WS.random() * WS.tau
            local range = 60 + WS.random() * 70
            self:Spawn(pattern.id, enemy.x + WS.cos(angle) * range, enemy.y + WS.sin(angle) * range, scale)
        end
    elseif pattern.type == "volley" then
        local bolts = pattern.bolts or 7
        for step = 1, bolts do
            local spread = (step - (bolts + 1) / 2) * 0.16
            local vx, vy = WS.Rotate(dx, dy, spread)
            WS.Projectile:SpawnHostile(enemy.x, enemy.y, vx * 260, vy * 260, enemy.damage * 0.7, school, template.name, template.displayId, enemy)
        end
    elseif pattern.type == "ring" then
        local bolts = pattern.bolts or 10
        for step = 1, bolts do
            local angle = (step / bolts) * WS.tau
            WS.Projectile:SpawnHostile(enemy.x, enemy.y,
                WS.cos(angle) * 220, WS.sin(angle) * 220, enemy.damage * 0.6, school, template.name, template.displayId, enemy)
        end
    elseif pattern.type == "charge" then
        enemy.chargeTimer = 1.1
        WS.UI:Shake(4, 0.3)
    end
end

------------------------------------------------------------------------------
-- Damage intake
------------------------------------------------------------------------------

-- Central strike entry: rolls the survivor's crit, prints damage numbers, and
-- attributes the hit to `source` (a weapon id or a special key) for the meter.
function Enemy:Hit(enemy, amount, source)
    if not enemy or not enemy.poolIndex then return end
    local player = WS.Game.player
    local isCrit = WS.random() < player.critChance
    if isCrit then amount = amount * player.critDamage end
    WS.FloatingText:Damage(enemy.x, enemy.y, amount, isCrit)
    self:Damage(enemy, amount, isCrit, source)
end

function Enemy:Damage(enemy, amount, isCrit, source)
    if not enemy or not enemy.poolIndex then return end
    if enemy.invuln and enemy.invuln > 0 then return end -- e.g. a boss mid-transition
    -- Overkill (damage past what the kill needed) is normally discarded. The
    -- Demon Hunter's fel meter drinks exactly that surplus.
    local player = WS.Game.player
    if player and (player.felAttuned or 0) > 0 and amount > enemy.health then
        WS.Player:GainFel(player, amount - WS.max(0, enemy.health))
    end
    enemy.health = enemy.health - amount
    enemy.flash = 0.08
    enemy.frame.icon:SetVertexColor(1, isCrit and 0.85 or 0.35, 0.35)
    if enemy.frame.modelActive then enemy.frame.model:SetAlpha(0.55) end
    local run = WS.Game.run
    run.damageDone = run.damageDone + amount
    -- A hit with no source is a bug, not a category: name it so the meter can
    -- point at it instead of quietly folding it in with everything else.
    local key = source or "untagged"
    run.damageByWeapon[key] = (run.damageByWeapon[key] or 0) + amount
    if enemy.health <= 0 then self:Kill(enemy) end
end

-- Area damage around a point; `hitBy` (optional) prevents double hits from
-- the same effect; `knockback` shoves survivors of the blast outward.
function Enemy:DamageArea(x, y, radius, amount, hitBy, knockback, source)
    local i = 1
    while i <= self.pool.count do
        local enemy = self.pool.active[i]
        if (not hitBy or hitBy[enemy] ~= enemy.spawnId)
            and WS.DistanceSquared(x, y, enemy.x, enemy.y) <= (radius + enemy.radius) ^ 2 then
            if hitBy then hitBy[enemy] = enemy.spawnId end
            if knockback and not enemy.boss then
                local dx, dy = WS.Normalize(enemy.x - x, enemy.y - y)
                enemy.x = enemy.x + dx * knockback
                enemy.y = enemy.y + dy * knockback
            end
            self:Hit(enemy, amount, source)
            if enemy.poolIndex then i = i + 1 end
        else
            i = i + 1
        end
    end
end

-- Damage every enemy within `halfWidth` of the segment (x1,y1)-(x2,y2). Beam
-- weapons sweep a line rather than an area; each enemy is projected onto the
-- segment (clamped to its ends) and tested against that closest point.
function Enemy:DamageLine(x1, y1, x2, y2, halfWidth, amount, source)
    local dx, dy = x2 - x1, y2 - y1
    local lenSq = dx * dx + dy * dy
    if lenSq <= 0 then return end
    local i = 1
    while i <= self.pool.count do
        local enemy = self.pool.active[i]
        local t = ((enemy.x - x1) * dx + (enemy.y - y1) * dy) / lenSq
        if t < 0 then t = 0 elseif t > 1 then t = 1 end
        local px, py = x1 + dx * t, y1 + dy * t
        local reach = halfWidth + enemy.radius
        if WS.DistanceSquared(enemy.x, enemy.y, px, py) <= reach * reach then
            self:Hit(enemy, amount, source)
            if enemy.poolIndex then i = i + 1 end -- Hit may have killed + released it
        else
            i = i + 1
        end
    end
end

-- The enemy's resting icon color when it isn't mid hit-flash: frost-blue while
-- slowed (Frostbolt) OR chilled (Chilling Presence aura), otherwise its normal
-- tint (portrait creatures resting at white).
function Enemy:RestColor(enemy)
    if enemy.slowTimer > 0 or enemy.chilled then
        enemy.frame.icon:SetVertexColor(0.45, 0.65, 1.0)
    elseif enemy.usesPortrait then
        enemy.frame.icon:SetVertexColor(1, 1, 1)
    else
        local t = enemy.template.tint
        enemy.frame.icon:SetVertexColor(t[1], t[2], t[3])
    end
end

function Enemy:ApplySlow(enemy, factor, duration)
    if not enemy or not enemy.poolIndex or enemy.boss then return end
    enemy.slowFactor = factor
    enemy.slowTimer = WS.max(enemy.slowTimer, duration)
    if enemy.flash <= 0 then
        enemy.frame.icon:SetVertexColor(0.45, 0.65, 1.0)
    end
end

------------------------------------------------------------------------------
-- Death
------------------------------------------------------------------------------

-- How many Death Itself are currently stalking the field (for the HUD tally).
function Enemy:CountDeath()
    if not self.pool then return 0 end
    local n = 0
    for i = 1, self.pool.count do
        if self.pool.active[i].id == "death_itself" then n = n + 1 end
    end
    return n
end

function Enemy:Kill(enemy)
    local run = WS.Game.run
    local template = enemy.template

    -- A brief pooled after-image sells the death without keeping the frame:
    -- the creature's round portrait fading out (icon fallback otherwise).
    WS.Projectile:SpawnImpact(enemy.x, enemy.y, enemy.radius, template.icon, template.tint,
        enemy.usesPortrait and template.displayId or nil)
    WS.XP:SpawnGem(enemy.x, enemy.y, enemy.xp)
    WS.Pickup:OnKill(enemy)
    WS.SaveData:RecordFamilyKill(template.family)
    local byEnemy = WoWSurvivorsDB.statistics.killsByEnemy
    byEnemy[enemy.id] = (byEnemy[enemy.id] or 0) + 1
    run.kills = run.kills + 1

    -- Bloodthirst blessing: every Nth kill mends the survivor (tunable).
    local player = WS.Game.player
    if player.bloodthirst and run.kills % (player.bloodthirstInterval or 25) == 0 then
        WS.Player:Heal(player, WS.floor(player.maxHealth * (player.bloodthirstHealPct or 0.06))
            + (player.bloodthirstHealFlat or 3), "bloodthirst")
    end

    if enemy.boss then
        -- Arena boss: hand off to the arena controller (it banks the win and ends
        -- the run); skip the survivors gold/gem economy.
        if enemy.id == "aethelgard" then
            run.bossesSlain = run.bossesSlain + 1
            self.pool:Release(enemy)
            WS.BossArena:OnBossDead()
            return
        end
        run.bossesSlain = run.bossesSlain + 1
        if enemy.id == "death_itself" then run.deathsSlain = (run.deathsSlain or 0) + 1 end
        WoWSurvivorsDB.statistics.bossSlain[enemy.id] = true
        local gold = WS.floor((template.gold or 40) * WS.Game.run.goldMult * WS.Game.player.goldMultiplier)
        WS.Game:AddGold(gold, enemy.x, enemy.y)
        for _ = 1, 8 do
            WS.XP:SpawnGem(enemy.x + WS.random(-34, 34), enemy.y + WS.random(-34, 34), WS.floor(enemy.xp / 8))
        end
        WS.Audio:Play("bossdie")
        WS.UI:Shake(7, 0.4)
        WS.Game:Announce(template.name .. " has been slain!", nil, 2.5)
        WS.Achievements:Check()
        local wasFinal = enemy.finalBoss
        self.pool:Release(enemy)
        if wasFinal then WS.Game:Victory() end
        return
    end

    self.pool:Release(enemy)
end

function Enemy:Clear()
    self.freezeTimer = 0
    if self.pool then self.pool:ReleaseAll() end
end
