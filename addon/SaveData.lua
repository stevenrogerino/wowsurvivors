local _, WS = ...

-- Account-wide persistence (SavedVariables: WoWSurvivorsDB).
-- Schema v3 adds save profiles. The ACTIVE profile's data lives at the top
-- level of WoWSurvivorsDB (so all game code keeps referencing WoWSurvivorsDB
-- directly), while the other two profiles are archived under _savedProfiles.
-- v2 -> v3 migrates cleanly (existing data becomes profile 1); v1 is wiped.
WS.SaveData = {}

local DB_VERSION = 3
WS.NUM_PROFILES = 3

-- Which top-level keys belong to a profile (swapped on profile switch).
-- `settings`, `activeProfile`, and `version` are account-wide and never swap.
local PROFILE_KEYS = {
    "gold", "unlocks", "meta", "achievements", "records", "statistics",
    "lastCharacter", "lastMap",
}

local defaults = {
    version = DB_VERSION,
    settings = {},          -- filled from WS.Config.defaultSettings below
    activeProfile = 1,
    _savedProfiles = {},    -- [index] = archived profile-key snapshot
    gold = 0,               -- banked gold, spent at the Trainer
    unlocks = {
        characters = { mage = true, priest = true },
        maps = { elwynn = true, boss_arena = true }, -- arena is experimental, always open
        hyper = {},         -- [mapId] = true once that map has been won
    },
    meta = {},              -- [metaUpgradeId] = purchased rank
    achievements = {},      -- [achievementId] = true
    records = {
        bestTime = 0, highestLevel = 0, totalKills = 0, totalRuns = 0,
        mostKillsRun = 0, bestGoldRun = 0,
        bestTimeByMap = {}, -- [mapId] = seconds
    },
    statistics = {
        damageDone = 0, gemsCollected = 0, bossesSlain = 0, goldEarned = 0,
        totalVictories = 0, evolutions = 0, unions = 0, secondsSurvived = 0,
        bossSlain = {},     -- [bossId] = true, for boss achievements
        killsByFamily = {}, -- [family] = count
        discoveries = {},   -- [comboId] = true, the permanent codex
        killsByEnemy = {},  -- [enemyId] = count, for the Bestiary
        coffinsOpened = 0,  -- weathered coffins looted (Grave Robber)
        runebladesClaimed = 0, -- runeblades claimed (frees the Death Knight)
        warglaivesClaimed = 0, -- warglaives claimed (frees the Demon Hunter)
    },
    lastCharacter = nil,
    lastMap = nil,
}

local function DeepCopy(value)
    if type(value) ~= "table" then return value end
    local result = {}
    for key, child in pairs(value) do result[key] = DeepCopy(child) end
    return result
end

-- Fills in any missing defaults without touching existing values, so schema
-- additions in future versions merge cleanly into old databases.
local function Merge(target, source)
    for key, value in pairs(source) do
        if target[key] == nil then
            target[key] = DeepCopy(value)
        elseif type(value) == "table" and type(target[key]) == "table" then
            Merge(target[key], value)
        end
    end
end

function WS.SaveData:Initialize()
    defaults.settings = WS.Config.defaultSettings
    WoWSurvivorsDB = WoWSurvivorsDB or {}
    -- Only the ancient v1 prototype is wiped; v2 data survives into v3 as the
    -- first profile.
    if (WoWSurvivorsDB.version or 0) < 2 then
        wipe(WoWSurvivorsDB)
    end
    Merge(WoWSurvivorsDB, defaults)
    WoWSurvivorsDB.version = DB_VERSION
end

-- Switches the active save profile (1..NUM_PROFILES). The current profile's
-- data is archived and the target profile's data (or fresh defaults) is
-- restored to the top level. Never allowed mid-run.
function WS.SaveData:SwitchProfile(index)
    local db = WoWSurvivorsDB
    if WS.Game and WS.Game.running then return false end
    if index == db.activeProfile or index < 1 or index > WS.NUM_PROFILES then return false end

    -- Archive the current profile.
    local snapshot = {}
    for i = 1, #PROFILE_KEYS do
        local key = PROFILE_KEYS[i]
        snapshot[key] = db[key]
        db[key] = nil
    end
    db._savedProfiles[db.activeProfile] = snapshot

    -- Restore the target profile (or leave nil for Merge to fill with fresh
    -- defaults for a never-used profile).
    local target = db._savedProfiles[index]
    db._savedProfiles[index] = nil
    if target then
        for i = 1, #PROFILE_KEYS do
            db[PROFILE_KEYS[i]] = target[PROFILE_KEYS[i]]
        end
    end
    db.activeProfile = index
    Merge(db, defaults) -- fills any missing profile fields for a fresh slot
    return true
end

-- A short summary of a profile for the switcher UI, without disturbing state.
function WS.SaveData:ProfileSummary(index)
    local db = WoWSurvivorsDB
    local data = (index == db.activeProfile) and db or db._savedProfiles[index]
    if not data or not data.records then return "Empty" end
    local victories = data.statistics and data.statistics.totalVictories or 0
    return ("%s gold  •  %d wins"):format(WS.FormatNumber(data.gold or 0), victories)
end

-- Banks a finished (or abandoned) run into records and statistics.
function WS.SaveData:RecordRun(run, reason)
    local db = WoWSurvivorsDB
    local records, stats = db.records, db.statistics

    records.totalRuns = records.totalRuns + 1
    records.totalKills = records.totalKills + run.kills
    records.bestTime = WS.max(records.bestTime, run.time)
    records.highestLevel = WS.max(records.highestLevel, run.level)
    records.mostKillsRun = WS.max(records.mostKillsRun, run.kills)
    records.bestGoldRun = WS.max(records.bestGoldRun, run.gold)
    records.bestTimeByMap[run.mapId] = WS.max(records.bestTimeByMap[run.mapId] or 0, run.time)

    -- (gemsCollected is tallied live by XP.lua as gems are picked up.)
    stats.damageDone = stats.damageDone + run.damageDone
    stats.bossesSlain = stats.bossesSlain + run.bossesSlain
    -- (totalVictories is banked the moment the survivor reaches 30:00, in
    -- Game:SurviveVictory, so later deaths to Death still count the win.)
    stats.secondsSurvived = stats.secondsSurvived + run.time

    -- Bank the run's gold.
    db.gold = db.gold + run.gold
    stats.goldEarned = stats.goldEarned + run.gold

    db.lastCharacter, db.lastMap = run.characterId, run.mapId
end

function WS.SaveData:RecordFamilyKill(family)
    if not family then return end
    local byFamily = WoWSurvivorsDB.statistics.killsByFamily
    byFamily[family] = (byFamily[family] or 0) + 1
end

function WS.SaveData:GetMetaRank(id)
    return WoWSurvivorsDB.meta[id] or 0
end

function WS.SaveData:MetaCost(id)
    local meta = WS.MetaUpgrades[id]
    return meta.cost * (self:GetMetaRank(id) + 1)
end

-- Attempts to buy the next rank of a Trainer upgrade. Returns true on success.
function WS.SaveData:BuyMeta(id)
    local db = WoWSurvivorsDB
    local meta = WS.MetaUpgrades[id]
    local rank = self:GetMetaRank(id)
    local cost = self:MetaCost(id)
    if not meta or rank >= meta.max or db.gold < cost then return false end
    db.gold = db.gold - cost
    db.meta[id] = rank + 1
    return true
end

function WS.SaveData:UnlockEverything()
    local db = WoWSurvivorsDB
    for id in pairs(WS.Characters) do db.unlocks.characters[id] = true end
    for id in pairs(WS.Maps) do db.unlocks.maps[id] = true end
end

function WS.SaveData:ResetSettings()
    WoWSurvivorsDB.settings = DeepCopy(WS.Config.defaultSettings)
end

-- Wipes the ACTIVE profile only. Other profiles and account settings survive.
function WS.SaveData:ResetAll()
    local db = WoWSurvivorsDB
    for i = 1, #PROFILE_KEYS do db[PROFILE_KEYS[i]] = nil end
    Merge(db, defaults)
end
