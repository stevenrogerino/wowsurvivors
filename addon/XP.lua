local _, WS = ...

-- Experience gems. Tiered like item qualities (green / blue / purple by
-- value), pooled, and merged into neighbors when the field is saturated so
-- late-game swarms never lose experience to the entity cap.
WS.XP = {}
local XP = WS.XP

local GEM_ICON = "Interface\\Icons\\INV_Misc_Gem_Emerald_02"
local GEM_ICON_MID = "Interface\\Icons\\INV_Misc_Gem_Sapphire_02"
local GEM_ICON_HIGH = "Interface\\Icons\\INV_Misc_Gem_Amethyst_02"

function XP:Initialize()
    self.pool = WS.Pool:New(function()
        local frame = WS.UI:CreateEntityFrame(14)
        WS.UI:ApplyRoundMask(frame) -- gems read as glittering round stones
        return { frame = frame }
    end, function(gem) gem.frame:Hide() end, 100)
    self.vacuumTimer = 0
end

local function Style(gem)
    local colors = WS.Constants.COLORS
    if gem.value >= 25 then
        gem.size = 18
        gem.frame.icon:SetTexture(GEM_ICON_HIGH)
        gem.frame.icon:SetVertexColor(colors.gemHigh[1], colors.gemHigh[2], colors.gemHigh[3])
    elseif gem.value >= 8 then
        gem.size = 15
        gem.frame.icon:SetTexture(GEM_ICON_MID)
        gem.frame.icon:SetVertexColor(colors.gemMid[1], colors.gemMid[2], colors.gemMid[3])
    else
        gem.size = 12
        gem.frame.icon:SetTexture(GEM_ICON)
        gem.frame.icon:SetVertexColor(colors.gemLow[1], colors.gemLow[2], colors.gemLow[3])
    end
end

function XP:SpawnGem(x, y, value)
    if value <= 0 then return end
    -- At the cap, fold the value into an existing gem instead of dropping it.
    if self.pool.count >= WS.Constants.MAX_GEMS then
        local gem = self.pool.active[WS.random(1, self.pool.count)]
        gem.value = gem.value + value
        Style(gem)
        return
    end
    local gem = self.pool:Acquire()
    gem.x, gem.y, gem.value, gem.radius = x, y, value, 8
    Style(gem)
    gem.frame:Show()
    WS.UI:Place(gem.frame, gem.x, gem.y, gem.size)
end

-- Lodestone effect: a brief, one-shot pull that sweeps every gem currently on
-- the field into the survivor. (Timed, so it does not keep magnetizing gems
-- that spawn afterward - that was the "picking up everything without moving"
-- bug.)
function XP:VacuumAll()
    self.vacuumTimer = 1.5
end

function XP:Update(dt)
    local player = WS.Game.player
    if self.vacuumTimer > 0 then self.vacuumTimer = self.vacuumTimer - dt end
    local vacuum = self.vacuumTimer > 0
    local i = 1
    while i <= self.pool.count do
        local gem = self.pool.active[i]
        local dx, dy, distance = WS.Normalize(player.x - gem.x, player.y - gem.y)
        if vacuum then
            gem.x = gem.x + dx * 900 * dt
            gem.y = gem.y + dy * 900 * dt
        elseif distance < player.pickupRadius then
            local pull = WS.max(160, 420 * (1 - distance / player.pickupRadius))
            gem.x = gem.x + dx * pull * dt
            gem.y = gem.y + dy * pull * dt
        end
        if distance < player.radius + gem.radius + 5 then
            WS.Game.run.gemsCollected = WS.Game.run.gemsCollected + 1
            WoWSurvivorsDB.statistics.gemsCollected = WoWSurvivorsDB.statistics.gemsCollected + 1
            -- Silent on ordinary pickup (there are hundreds); only the
            -- lodestone's sweep chimes as gems rush in.
            if vacuum then WS.Audio:Play("gem") end
            local value = gem.value
            self.pool:Release(gem)
            WS.Player:GainXP(player, value)
            if WS.Game.leveling or not WS.Game.running then return end
        else
            WS.UI:Place(gem.frame, gem.x, gem.y, gem.size)
            i = i + 1
        end
    end
end

function XP:Clear()
    self.vacuumTimer = 0
    if self.pool then self.pool:ReleaseAll() end
end
