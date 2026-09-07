local _, WS = ...

-- Achievements. `test(db, run, player)` is evaluated once per second during a
-- run and again when a run ends; `run`/`player` are nil outside a run.
-- Rewards: { type = "character"|"map", id = ... } or { type = "gold", amount = n }.
-- Everything here is checked by Achievements.lua and persisted per account.
WS.AchievementData = {
    first_blood = {
        name = "First Blood",
        description = "Slay your first enemy.",
        icon = "Interface\\Icons\\Ability_Rogue_Eviscerate",
        test = function(db) return db.records.totalKills >= 1 end,
    },
    take_his_candle = {
        name = "You Take Candle",
        description = "Defeat Foreman Grimtunnel.",
        icon = "Interface\\Icons\\INV_Misc_Bone_01",
        reward = { type = "gold", amount = 50 },
        test = function(db) return db.statistics.bossSlain.grimtunnel end,
    },
    gnollbane = {
        name = "Bane of the Riverpaw",
        description = "Defeat Gnarlfang the Ravager.",
        icon = "Interface\\Icons\\Ability_Hunter_Pet_Hyena",
        reward = { type = "gold", amount = 100 },
        test = function(db) return db.statistics.bossSlain.gnarlfang end,
    },
    unmasked = {
        name = "Unmasked",
        description = "Defeat the Masked Admiral.",
        icon = "Interface\\Icons\\Ability_Rogue_KidneyShot",
        reward = { type = "gold", amount = 250 },
        test = function(db) return db.statistics.bossSlain.masked_admiral end,
    },
    the_long_dark_ends = {
        name = "The Long Dark Ends",
        description = "Defeat Lich-Lord Marrowfrost.",
        icon = "Interface\\Icons\\Spell_Frost_FrostNova",
        reward = { type = "gold", amount = 1000 },
        test = function(db) return db.statistics.bossSlain.marrowfrost end,
    },

    -- Battlefield gates: surviving 10 minutes opens the next zone.
    beyond_the_forest = {
        name = "Beyond the Forest",
        description = "Survive for 10 minutes in Elwynn Forest.",
        icon = "Interface\\Icons\\INV_Misc_Flower_02",
        reward = { type = "map", id = "westfall" },
        rewardText = "Unlocks Westfall.",
        test = function(db, run) return run and run.mapId == "elwynn" and run.time >= 600 end,
    },
    into_the_dark = {
        name = "Into the Dark",
        description = "Survive for 10 minutes in Westfall.",
        icon = "Interface\\Icons\\INV_Misc_Food_Wheat_01",
        reward = { type = "map", id = "duskwood" },
        rewardText = "Unlocks Duskwood.",
        test = function(db, run) return run and run.mapId == "westfall" and run.time >= 600 end,
    },
    across_the_sea = {
        name = "Across the Great Sea",
        description = "Survive for 10 minutes in Duskwood.",
        icon = "Interface\\Icons\\INV_Misc_Bone_08",
        reward = { type = "map", id = "barrens" },
        rewardText = "Unlocks The Barrens.",
        test = function(db, run) return run and run.mapId == "duskwood" and run.time >= 600 end,
    },
    the_frozen_north = {
        name = "The Frozen North",
        description = "Survive for 10 minutes in The Barrens.",
        icon = "Interface\\Icons\\INV_Ammo_Snowball",
        reward = { type = "map", id = "icecrown" },
        rewardText = "Unlocks Icecrown.",
        test = function(db, run) return run and run.mapId == "barrens" and run.time >= 600 end,
    },

    -- Survivor unlocks.
    nightfall_survivor = {
        name = "Nightfall Survivor",
        description = "Survive for 8 minutes in a single run.",
        icon = "Interface\\Icons\\Ability_Rogue_FanofKnives",
        reward = { type = "character", id = "rogue" },
        rewardText = "Unlocks Dr. Rav McBreathless, the Rogue.",
        test = function(db, run) return run and run.time >= 480 end,
    },
    giant_slayer = {
        name = "Giant Slayer",
        description = "Slay 2 bosses in a single run.",
        icon = "Interface\\Icons\\Ability_Whirlwind",
        reward = { type = "character", id = "warrior" },
        rewardText = "Unlocks AAAAAAAAA, the Fallen Hero.",
        test = function(db, run) return run and run.bossesSlain >= 2 end,
    },
    seasoned_veteran = {
        name = "Seasoned Veteran",
        description = "Reach level 20 in a single run.",
        icon = "Interface\\Icons\\Ability_UpgradeMoonGlaive",
        reward = { type = "character", id = "hunter" },
        rewardText = "Unlocks Maeca Barefoot, the Hunter.",
        test = function(db, run, player) return player and player.level >= 20 end,
    },
    scourge_of_the_masses = {
        name = "Scourge of the Masses",
        description = "Slay 750 enemies across all runs.",
        icon = "Interface\\Icons\\Spell_Shadow_ShadowBolt",
        reward = { type = "character", id = "warlock" },
        rewardText = "Unlocks Nim B'ladin, the Warlock.",
        test = function(db) return db.records.totalKills >= 750 end,
    },
    fortune_seeker = {
        name = "Fortune Seeker",
        description = "Bank 500 gold across all runs.",
        icon = "Interface\\Icons\\INV_Misc_Coin_02",
        reward = { type = "character", id = "shaman" },
        rewardText = "Unlocks Vonnra Hydrocheck, the Shaman.",
        test = function(db) return db.statistics.goldEarned >= 500 end,
    },

    -- Feats.
    forbidden_knowledge = {
        name = "Forbidden Knowledge",
        description = "Evolve a weapon to its ultimate form.",
        icon = "Interface\\Icons\\Spell_Shadow_DarkRitual",
        reward = { type = "gold", amount = 150 },
        test = function(db) return db.statistics.evolutions >= 1 end,
    },
    lights_favor = {
        name = "Light's Favor",
        description = "Survive for 3 minutes straight without taking damage.",
        icon = "Interface\\Icons\\Spell_Holy_Devotion",
        reward = { type = "gold", amount = 150 },
        test = function(db, run) return run and run.noHitStreak >= 180 end,
    },
    walking_armory = {
        name = "Walking Armory",
        description = "Wield 6 weapons at once.",
        icon = "Interface\\Icons\\INV_Misc_EngGizmos_17",
        reward = { type = "gold", amount = 150 },
        test = function(db, run, player) return player and #player.weapons >= 6 end,
    },
    mrglglgl = {
        name = "Mrglglglgl!",
        description = "Slay 500 murlocs across all runs.",
        icon = "Interface\\Icons\\INV_Misc_Fish_13",
        reward = { type = "gold", amount = 200 },
        test = function(db) return (db.statistics.killsByFamily.murloc or 0) >= 500 end,
    },
    master_craftsman = {
        name = "Master Craftsman",
        description = "Forge a weapon union.",
        icon = "Interface\\Icons\\Ability_Warrior_PunishingBlow",
        reward = { type = "gold", amount = 250 },
        test = function(db) return db.statistics.unions and db.statistics.unions > 0 end,
    },
    grave_robber = {
        name = "Grave Robber",
        description = "Open a weathered coffin found on the battlefield.",
        icon = "Interface\\Icons\\INV_Misc_Urn_01",
        reward = { type = "gold", amount = 200 },
        test = function(db) return db.statistics.coffinsOpened and db.statistics.coffinsOpened > 0 end,
    },
    the_light_curdles = {
        name = "The Light Curdles",
        description = "Claim a runeblade drawn out by your own desecration.",
        icon = "Interface\\Icons\\Spell_DeathKnight_BloodPresence",
        reward = { type = "gold", amount = 400 },
        test = function(db) return (db.statistics.runebladesClaimed or 0) > 0 end,
    },
    you_are_prepared = {
        name = "You Are Prepared",
        description = "Claim the warglaives after giving yourself to the fel.",
        icon = "Interface\\Icons\\Spell_Shadow_Metamorphosis",
        reward = { type = "gold", amount = 400 },
        test = function(db) return (db.statistics.warglaivesClaimed or 0) > 0 end,
    },
    survivor_of_the_long_dark = {
        name = "Survivor of the Long Dark",
        description = "Achieve Victory on any battlefield.",
        icon = "Interface\\Icons\\Spell_Holy_AuraOfLight",
        reward = { type = "gold", amount = 500 },
        test = function(db) return db.statistics.totalVictories >= 1 end,
    },
}

WS.AchievementOrder = {
    "first_blood", "take_his_candle", "gnollbane", "unmasked", "the_long_dark_ends",
    "beyond_the_forest", "into_the_dark", "across_the_sea", "the_frozen_north",
    "nightfall_survivor", "giant_slayer", "seasoned_veteran", "scourge_of_the_masses",
    "fortune_seeker", "forbidden_knowledge", "lights_favor", "walking_armory",
    "mrglglgl", "master_craftsman", "grave_robber", "survivor_of_the_long_dark",
}
