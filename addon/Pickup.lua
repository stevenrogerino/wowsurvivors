local _, WS = ...

-- Ground pickups: healing potions, coins, treasure chests, goblin sappers,
-- and lodestones. Everything is pooled and drifts to the survivor once inside
-- pickup range, exactly like XP gems.
WS.Pickup = {}
local Pickup = WS.Pickup

-- `raise` lifts a pickup's draw layer so the important ones never hide behind
-- the sea of coins and XP gems (which sit at the base entity level).
local KINDS = {
    potion = { icon = "Interface\\Icons\\INV_Potion_54", tint = { 1.0, 0.4, 0.4 }, size = 20, raise = 8 },
    coin   = { icon = "Interface\\Icons\\INV_Misc_Coin_02", tint = { 1.0, 0.9, 0.4 }, size = 16, raise = 4 },
    chest  = { icon = "Interface\\Icons\\INV_Box_01", tint = { 0.9, 0.7, 0.3 }, size = 26, raise = 8 },
    bomb   = { icon = "Interface\\Icons\\INV_Misc_Bomb_02", tint = { 1.0, 0.5, 0.3 }, size = 22, raise = 10 },
    stone  = { icon = "Interface\\Icons\\Spell_Nature_EarthBind", tint = { 0.5, 0.9, 1.0 }, size = 20, raise = 10 },
    -- Supply caches appear on the field over time (the WaveManager places
    -- them), holding a random prize - worth walking off the beaten path for.
    cache  = { icon = "Interface\\Icons\\INV_Crate_01", tint = { 1.0, 0.9, 0.6 }, size = 28, raise = 8 },
    -- Hourglass of the Bronze: freezes every enemy (but Death) for 8 seconds.
    hourglass = { icon = "Interface\\Icons\\INV_Misc_PocketWatch_01", tint = { 0.6, 0.85, 1.0 }, size = 24, raise = 10 },
    -- Destinations you walk to (they do not drift toward you).
    merchant = { icon = "Interface\\Icons\\INV_Misc_Bag_10", tint = { 1.0, 0.9, 0.5 }, size = 30, noMagnet = true, raise = 10 },
    coffin   = { icon = "Interface\\Icons\\INV_Misc_Urn_01", tint = { 0.85, 0.85, 0.95 }, size = 34, noMagnet = true, raise = 10 },
    runeblade = { icon = "Interface\\Icons\\INV_Sword_121", tint = { 0.60, 1.00, 0.55 }, size = 36, noMagnet = true, raise = 10 },
    warglaives = { icon = "Interface\\Icons\\INV_Weapon_Glave_01", tint = { 0.70, 0.35, 1.00 }, size = 36, noMagnet = true, raise = 10 },
}

function Pickup:Initialize()
    self.pool = WS.Pool:New(function()
        return { frame = WS.UI:CreateEntityFrame(20) }
    end, function(pickup) pickup.frame:Hide() end, 12)
end

-- Free a slot when the pickup field is full by dropping the farthest COIN - the
-- only expendable pickup. Everything else (potions, bombs, lodestones,
-- hourglasses, caches, chests) is preserved. Returns true if a slot is free.
function Pickup:MakeRoom()
    if self.pool.count < WS.Constants.MAX_PICKUPS then return true end
    local player = WS.Game.player
    local best, bestD
    for i = 1, self.pool.count do
        local p = self.pool.active[i]
        if p.kind == "coin" then
            local d = player and WS.DistanceSquared(p.x, p.y, player.x, player.y) or 0
            if not bestD or d > bestD then bestD, best = d, p end
        end
    end
    if best then self.pool:Release(best); return true end
    return false
end

-- Any spawn that would fail on a full field first bumps the farthest coin to make
-- room; it's only dropped if there isn't even a coin to sacrifice.
function Pickup:Spawn(kind, x, y, value)
    if self.pool.count >= WS.Constants.MAX_PICKUPS and not self:MakeRoom() then return end
    local style = KINDS[kind]
    local pickup = self.pool:Acquire()
    pickup.kind, pickup.value = kind, value or 0
    pickup.x = WS.Clamp(x, 20, WS.Constants.WORLD_WIDTH - 20)
    pickup.y = WS.Clamp(y, 20, WS.Constants.WORLD_HEIGHT - 20)
    pickup.radius = style.noMagnet and 18 or 10
    pickup.size = style.size
    pickup.noMagnet = style.noMagnet
    pickup.frame.icon:SetTexture(style.icon)
    pickup.frame.icon:SetVertexColor(style.tint[1], style.tint[2], style.tint[3])
    pickup.frame:SetFrameLevel(WS.UI.world:GetFrameLevel() + (style.raise or 4))
    pickup.frame:Show()
    WS.UI:Place(pickup.frame, pickup.x, pickup.y, style.size)
    return pickup -- nil when the pool was full, so callers can skip the announce
end

-- Death-roll: called for every kill. Elites and bosses always leave a chest;
-- everything else rolls small chances scaled by the survivor's luck.
function Pickup:OnKill(enemy)
    local player = WS.Game.player
    local map = WS.Game.map
    if enemy.boss or enemy.elite then
        self:Spawn("chest", enemy.x, enemy.y, WS.floor((18 + WS.random(0, 26)) * WS.Game.run.goldMult))
        return
    end
    local luck = player.luck
    local roll = WS.random()
    local config = WS.Config
    if roll < config.dropChanceGold * luck then
        self:Spawn("coin", enemy.x, enemy.y, WS.floor((3 + WS.random(0, 4)) * WS.Game.run.goldMult))
    elseif roll < (config.dropChanceGold + config.dropChancePotion) * luck then
        self:Spawn("potion", enemy.x, enemy.y)
    elseif roll < (config.dropChanceGold + config.dropChancePotion + config.dropChanceBomb) * luck then
        self:Spawn("bomb", enemy.x, enemy.y)
    elseif roll < (config.dropChanceGold + config.dropChancePotion + config.dropChanceBomb + config.dropChanceStone) * luck then
        self:Spawn("stone", enemy.x, enemy.y)
    elseif roll < (config.dropChanceGold + config.dropChancePotion + config.dropChanceBomb + config.dropChanceStone + config.dropChanceHourglass) * luck then
        self:Spawn("hourglass", enemy.x, enemy.y)
    end
end

------------------------------------------------------------------------------
-- Effects on pickup
------------------------------------------------------------------------------

-- A goblin sapper charge: everything short of a boss dies screaming.
-- (Also triggered by lucky supply caches.)
function Pickup.ApplyBomb(player)
    WS.Audio:Play("bomb")
    WS.UI:Shake(10, 0.5)
    WS.FloatingText:Notice(player.x, player.y, "KABOOM!", 1, 0.5, 0.2)
    local enemies = WS.Enemy.pool
    local i = 1
    while i <= enemies.count do
        local enemy = enemies.active[i]
        if not enemy.boss then
            WS.Enemy:Damage(enemy, enemy.health + 1, false, "bomb")
            if enemy.poolIndex then i = i + 1 end
        else
            i = i + 1
        end
    end
end

local function Apply(pickup, player)
    local kind = pickup.kind
    if kind == "potion" then
        WS.Player:Heal(player, WS.floor(player.maxHealth * (WS.Config.potionHealPct or 0.30)), "potion")
        WS.Audio:Play("potion")

    elseif kind == "coin" then
        WS.Game:AddGold(WS.floor(pickup.value * player.goldMultiplier), pickup.x, pickup.y)

    elseif kind == "chest" then
        -- Jackpot ceremony: usually one bundle, sometimes three, rarely five.
        local roll = WS.random()
        local rolls = (roll < 0.05 and 5) or (roll < 0.30 and 3) or 1
        local total = WS.floor(pickup.value * player.goldMultiplier * (rolls == 1 and 1 or rolls * 0.8))
        WS.Game:AddGold(total, pickup.x, pickup.y)
        WS.UI:ChestCeremony(rolls, total)

    elseif kind == "bomb" then
        Pickup.ApplyBomb(player)

    elseif kind == "stone" then
        -- Lodestone: every gem on the field flies to the survivor.
        WS.XP:VacuumAll()
        WS.FloatingText:Notice(player.x, player.y, "Lodestone!", 0.5, 0.9, 1)
        WS.Audio:Play("gem")

    elseif kind == "cache" then
        -- A supply crate always holds one of four useful drops: a bomb, a
        -- lodestone, an hourglass, or two potions - never gold or a dud.
        WS.Audio:Play("chest")
        local roll = WS.random(1, 4)
        if roll == 1 then
            Pickup.ApplyBomb(player)
        elseif roll == 2 then
            WS.XP:VacuumAll()
            WS.FloatingText:Notice(player.x, player.y, "Lodestone!", 0.5, 0.9, 1)
            WS.Audio:Play("gem")
        elseif roll == 3 then
            WS.Enemy:FreezeAll(WS.Config.hourglassFreeze or 8)
            WS.FloatingText:Notice(player.x, player.y, "Time Stands Still!", 0.6, 0.85, 1)
            WS.Projectile:SpawnFlash(player.x, player.y, 200, WS.Constants.COLORS.frost)
            WS.Audio:Play("freeze")
        else
            WS.Player:Heal(player, WS.floor(player.maxHealth * (WS.Config.potionHealPct or 0.30) * 2), "potion")
            WS.FloatingText:Notice(player.x, player.y, "Two potions!", 0.5, 1, 0.4)
            WS.Audio:Play("potion")
        end

    elseif kind == "hourglass" then
        -- The Bronze Dragonflight stops time for the horde.
        WS.Enemy:FreezeAll(WS.Config.hourglassFreeze or 8)
        WS.FloatingText:Notice(player.x, player.y, "Time Stands Still!", 0.6, 0.85, 1)
        WS.Projectile:SpawnFlash(player.x, player.y, 200, WS.Constants.COLORS.frost)
        WS.Audio:Play("freeze")

    elseif kind == "merchant" then
        -- A wandering merchant hands you a free boon.
        WS.FloatingText:Notice(player.x, player.y, "A gift, friend!", 1, 0.9, 0.5)
        WS.Audio:Play("chest")
        WS.Game:GrantFreeBoon()

    elseif kind == "coffin" then
        -- The weathered coffin of an adequate knight.
        WoWSurvivorsDB.statistics.coffinsOpened = (WoWSurvivorsDB.statistics.coffinsOpened or 0) + 1
        WS.Audio:Play("evolve")
        WS.UI:Shake(5, 0.4)
        WS.Projectile:SpawnFlash(player.x, player.y, 120, WS.Constants.COLORS.holy)
        if not WoWSurvivorsDB.unlocks.characters.paladin then
            WoWSurvivorsDB.unlocks.characters.paladin = true
            WS.UI:Toast(WS.Characters.paladin.classIcon, "A Survivor Rises!", WS.Characters.paladin.name)
            WS.Game:Announce(WS.Characters.paladin.name .. " is freed!", "A new survivor joins the roster.", 4.0)
        else
            WS.Game:AddGold(WS.floor(80 * WS.Game.run.goldMult), player.x, player.y)
        end
        WS.Achievements:Check()

    elseif kind == "runeblade" then
        -- The blade that answered the rot. Claiming it frees the Death Knight.
        WoWSurvivorsDB.statistics.runebladesClaimed =
            (WoWSurvivorsDB.statistics.runebladesClaimed or 0) + 1
        WS.Audio:Play("evolve")
        WS.UI:Shake(7, 0.5)
        WS.Projectile:SpawnFlash(player.x, player.y, 140, { 0.45, 1.0, 0.40 })
        if not WoWSurvivorsDB.unlocks.characters.death_knight then
            WoWSurvivorsDB.unlocks.characters.death_knight = true
            WS.UI:Toast(WS.Characters.death_knight.classIcon, "The Blade Claims You",
                WS.Characters.death_knight.name)
            WS.Game:Announce(WS.Characters.death_knight.name .. " rises.",
                "What the Light could not hold, the blade keeps.", 4.0)
        else
            WS.Game:AddGold(WS.floor(120 * WS.Game.run.goldMult), player.x, player.y)
        end
        WS.Achievements:Check()

    elseif kind == "warglaives" then
        -- The Warglaives of Azzinoth's lesser cousins. Claiming them frees the DH.
        WoWSurvivorsDB.statistics.warglaivesClaimed =
            (WoWSurvivorsDB.statistics.warglaivesClaimed or 0) + 1
        WS.Audio:Play("evolve")
        WS.UI:Shake(7, 0.5)
        WS.Projectile:SpawnFlash(player.x, player.y, 150, { 0.60, 1.0, 0.25 })
        if not WoWSurvivorsDB.unlocks.characters.demon_hunter then
            WoWSurvivorsDB.unlocks.characters.demon_hunter = true
            WS.UI:Toast(WS.Characters.demon_hunter.classIcon, "You Are Prepared",
                WS.Characters.demon_hunter.name)
            WS.Game:Announce(WS.Characters.demon_hunter.name .. " takes up the glaives.",
                "The fel was always going to win.", 4.0)
        else
            WS.Game:AddGold(WS.floor(120 * WS.Game.run.goldMult), player.x, player.y)
        end
        WS.Achievements:Check()
    end
end

------------------------------------------------------------------------------

function Pickup:Update(dt)
    local player = WS.Game.player
    local i = 1
    while i <= self.pool.count do
        local pickup = self.pool.active[i]
        local dx, dy, distance = WS.Normalize(player.x - pickup.x, player.y - pickup.y)
        -- Destination pickups (coffin, merchant) never drift; you walk to them.
        if not pickup.noMagnet and distance < player.pickupRadius then
            local pull = WS.max(160, 420 * (1 - distance / player.pickupRadius))
            pickup.x = pickup.x + dx * pull * dt
            pickup.y = pickup.y + dy * pull * dt
        end
        if distance < player.radius + pickup.radius + 6 then
            Apply(pickup, player)
            self.pool:Release(pickup)
            if not WS.Game.running then return end
        else
            WS.UI:Place(pickup.frame, pickup.x, pickup.y, pickup.size)
            i = i + 1
        end
    end
end

function Pickup:Clear()
    if self.pool then self.pool:ReleaseAll() end
end
