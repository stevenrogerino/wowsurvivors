local _, WS = ...

-- Achievement evaluation and rewards. Definitions live in
-- Data\Achievements.lua (WS.AchievementData); this module runs their tests
-- (once per second during a run, on boss kills, and when a run ends), grants
-- rewards, and raises the WoW-styled toast.
WS.Achievements = {}
local Achievements = WS.Achievements

function Achievements:Check()
    local db = WoWSurvivorsDB
    local run = WS.Game.running and WS.Game.run or nil
    local player = WS.Game.running and WS.Game.player or nil
    for i = 1, #WS.AchievementOrder do
        local id = WS.AchievementOrder[i]
        if not db.achievements[id] then
            local data = WS.AchievementData[id]
            if data and data.test(db, run, player) then
                self:Grant(id)
            end
        end
    end
end

function Achievements:Grant(id)
    local db = WoWSurvivorsDB
    if db.achievements[id] then return end
    local data = WS.AchievementData[id]
    db.achievements[id] = true

    WS.Audio:Play("toast")
    WS.UI:Toast(data.icon, "Achievement Earned!", data.name)

    local reward = data.reward
    if reward then
        if reward.type == "character" and not db.unlocks.characters[reward.id] then
            db.unlocks.characters[reward.id] = true
            local character = WS.Characters[reward.id]
            WS.UI:Toast(character.classIcon, "New Survivor Unlocked!", character.name)
        elseif reward.type == "map" and not db.unlocks.maps[reward.id] then
            db.unlocks.maps[reward.id] = true
            local map = WS.Maps[reward.id]
            WS.UI:Toast(map.icon, "New Battlefield Unlocked!", map.name)
        elseif reward.type == "gold" then
            db.gold = db.gold + reward.amount
            WS.UI:Toast("Interface\\Icons\\INV_Misc_Coin_01", "Bounty Collected!", reward.amount .. " gold")
        end
    end

    -- Keep any open menu views current.
    if WS.UI.menu and WS.UI.menu:IsShown() then
        WS.UI:RefreshMenu()
    end
end
