local _, WS = ...

-- Battlefields. Each map is a complete, data-driven 30-minute campaign:
--   phases  - the ambient spawn schedule (interval/count/roster change over time)
--   events  - scripted swarm moments (a ring of enemies closes in, with a warning)
--   bosses  - timed boss arrivals across the run (none is "final" - surviving to
--             30:00, when Death itself arrives, is the Victory)
--   props   - decorative scatter drawn dark on the ground for zone flavor
--   music   - a SOUNDKIT key played on run start (login-screen scores; skipped
--             if the key is missing on this client)
--   difficulty / goldMult - global scaling knobs for the whole map
--
-- Boss timing convention: 5:00, 10:30, 16:00, 22:00, 27:00 - then Death at 30:00.
WS.Maps = {
    elwynn = {
        name = "Elwynn Forest",
        subtitle = "The quiet woods beyond Goldshire",
        description = "Gentle hills, hungry kobolds, and a gnoll problem the Stormwind guard keeps ignoring.",
        icon = "Interface\\Icons\\INV_Misc_Flower_02",
        groundTexture = "Interface\\FrameGeneral\\UI-Background-Marble",
        groundTint = { 0.16, 0.30, 0.14 },
        music = { 53492, 53493, 53494 }, -- vanilla forest scores
        difficulty = 1.0, goldMult = 1.0,
        props = {
            { icon = "Interface\\Icons\\INV_Mushroom_11", tint = { 0.5, 0.45, 0.35 } },
            { icon = "Interface\\Icons\\INV_Misc_Flower_01", tint = { 0.45, 0.50, 0.30 } },
            { icon = "Interface\\Icons\\INV_Stone_02", tint = { 0.40, 0.42, 0.38 } },
        },
        phases = {
            { at = 0,    interval = 1.10, count = 2, roster = { { id = "kobold", weight = 45 }, { id = "boar", weight = 30 }, { id = "wolf", weight = 25 } } },
            { at = 75,   interval = 0.95, count = 2, roster = { { id = "kobold", weight = 25 }, { id = "murloc", weight = 35 }, { id = "wolf", weight = 20 }, { id = "boar", weight = 20 } } },
            { at = 180,  interval = 0.85, count = 3, roster = { { id = "murloc", weight = 30 }, { id = "gnoll", weight = 30 }, { id = "kobold", weight = 20 }, { id = "murloc_oracle", weight = 20 } }, elite = "riverpaw_bonesnapper", eliteChance = 0.05 },
            { at = 330,  interval = 0.72, count = 3, roster = { { id = "gnoll", weight = 35 }, { id = "defias", weight = 25 }, { id = "murloc_oracle", weight = 20 }, { id = "wolf", weight = 20 } }, elite = "riverpaw_bonesnapper", eliteChance = 0.06 },
            { at = 540,  interval = 0.62, count = 4, roster = { { id = "defias", weight = 35 }, { id = "gnoll", weight = 30 }, { id = "murloc_oracle", weight = 20 }, { id = "murloc", weight = 15 } }, elite = "defias_enforcer", eliteChance = 0.06 },
            { at = 780,  interval = 0.52, count = 5, roster = { { id = "defias", weight = 40 }, { id = "gnoll", weight = 25 }, { id = "wolf", weight = 15 }, { id = "murloc_oracle", weight = 20 } }, elite = "defias_enforcer", eliteChance = 0.08 },
            { at = 1020, interval = 0.45, count = 6, roster = { { id = "defias", weight = 40 }, { id = "gnoll", weight = 30 }, { id = "murloc_oracle", weight = 30 } }, elite = "defias_enforcer", eliteChance = 0.10 },
        },
        events = {
            { at = 240, text = "The Riverpaw pack closes in!", id = "gnoll", count = 18 },
            { at = 560, text = "A tide of murlocs floods the banks!", id = "murloc", count = 26 },
            { at = 860, text = "Wolves howl in the failing light!", id = "wolf", count = 24 },
            { at = 1060, text = "The Defias spring their ambush!", id = "defias", count = 22 },
        },
        bosses = {
            { at = 300, id = "grimtunnel" },
            { at = 630, id = "murkgill" },
            { at = 960, id = "gnarlfang" },
            { at = 1320, id = "redcowl" },
            { at = 1620, id = "fenroth" },
        },
    },
    westfall = {
        name = "Westfall",
        subtitle = "A wind-scoured, lawless frontier",
        description = "The harvest golems never stopped working. The Defias never stopped taking.",
        icon = "Interface\\Icons\\INV_Misc_Food_Wheat_01",
        groundTexture = "Interface\\FrameGeneral\\UI-Background-Marble",
        groundTint = { 0.36, 0.28, 0.12 },
        music = { 53680, 53681 }, -- vanilla plains scores
        difficulty = 1.25, goldMult = 1.25,
        unlockHint = "Survive for 10 minutes in Elwynn Forest.",
        props = {
            { icon = "Interface\\Icons\\INV_Misc_Food_Wheat_01", tint = { 0.55, 0.48, 0.25 } },
            { icon = "Interface\\Icons\\INV_Misc_Gear_02", tint = { 0.40, 0.38, 0.30 } },
            { icon = "Interface\\Icons\\INV_Stone_02", tint = { 0.45, 0.40, 0.32 } },
        },
        phases = {
            { at = 0,    interval = 1.00, count = 2, roster = { { id = "coyote", weight = 40 }, { id = "fleshripper", weight = 30 }, { id = "defias", weight = 30 } } },
            { at = 90,   interval = 0.85, count = 3, roster = { { id = "coyote", weight = 25 }, { id = "defias", weight = 30 }, { id = "defias_pillager", weight = 25 }, { id = "fleshripper", weight = 20 } } },
            { at = 210,  interval = 0.75, count = 3, roster = { { id = "harvest_golem", weight = 25 }, { id = "defias_pillager", weight = 25 }, { id = "knuckleduster", weight = 25 }, { id = "coyote", weight = 25 } }, elite = "defias_enforcer", eliteChance = 0.05 },
            { at = 390,  interval = 0.65, count = 4, roster = { { id = "knuckleduster", weight = 30 }, { id = "harvest_golem", weight = 25 }, { id = "defias_pillager", weight = 25 }, { id = "fleshripper", weight = 20 } }, elite = "defias_enforcer", eliteChance = 0.07 },
            { at = 600,  interval = 0.55, count = 5, roster = { { id = "knuckleduster", weight = 35 }, { id = "defias_pillager", weight = 30 }, { id = "harvest_golem", weight = 35 } }, elite = "defias_enforcer", eliteChance = 0.08 },
            { at = 840,  interval = 0.48, count = 6, roster = { { id = "knuckleduster", weight = 40 }, { id = "defias_pillager", weight = 30 }, { id = "harvest_golem", weight = 30 } }, elite = "defias_enforcer", eliteChance = 0.10 },
            { at = 1050, interval = 0.42, count = 7, roster = { { id = "knuckleduster", weight = 40 }, { id = "defias_pillager", weight = 35 }, { id = "harvest_golem", weight = 25 } }, elite = "defias_enforcer", eliteChance = 0.12 },
        },
        events = {
            { at = 260, text = "Vultures wheel and descend!", id = "fleshripper", count = 20 },
            { at = 580, text = "The fields walk! Harvest golems advance!", id = "harvest_golem", count = 14 },
            { at = 880, text = "A Defias war party surrounds you!", id = "knuckleduster", count = 20 },
        },
        bosses = {
            { at = 300, id = "murkgill" },
            { at = 630, id = "harvestking" },
            { at = 960, id = "gnarlfang" },
            { at = 1320, id = "redcowl" },
            { at = 1620, id = "masked_admiral" },
        },
    },
    duskwood = {
        name = "Duskwood",
        subtitle = "Where the sun is only a rumor",
        description = "The dead of Raven Hill do not rest, and something worse pads between the blackened trees.",
        icon = "Interface\\Icons\\INV_Misc_Bone_08",
        groundTexture = "Interface\\FrameGeneral\\UI-Background-Rock",
        groundTint = { 0.10, 0.12, 0.18 },
        music = { 53426, 53427, 53428, 53430 }, -- cursed-land scores
        difficulty = 1.5, goldMult = 1.5,
        unlockHint = "Survive for 10 minutes in Westfall.",
        props = {
            { icon = "Interface\\Icons\\INV_Misc_Bone_08", tint = { 0.40, 0.42, 0.40 } },
            { icon = "Interface\\Icons\\INV_Mushroom_11", tint = { 0.35, 0.30, 0.42 } },
            { icon = "Interface\\Icons\\INV_Misc_StoneTablet_05", tint = { 0.32, 0.34, 0.38 } },
        },
        phases = {
            { at = 0,    interval = 0.95, count = 2, roster = { { id = "skeleton", weight = 40 }, { id = "spider", weight = 35 }, { id = "ghoul", weight = 25 } } },
            { at = 90,   interval = 0.82, count = 3, roster = { { id = "skeleton", weight = 30 }, { id = "ghoul", weight = 30 }, { id = "spider", weight = 20 }, { id = "skeletal_mage", weight = 20 } } },
            { at = 240,  interval = 0.70, count = 3, roster = { { id = "ghoul", weight = 30 }, { id = "worgen", weight = 25 }, { id = "skeletal_mage", weight = 25 }, { id = "skeleton", weight = 20 } }, elite = "bone_sentinel", eliteChance = 0.05 },
            { at = 420,  interval = 0.60, count = 4, roster = { { id = "worgen", weight = 30 }, { id = "ghoul", weight = 30 }, { id = "skeletal_mage", weight = 25 }, { id = "spider", weight = 15 } }, elite = "bone_sentinel", eliteChance = 0.07 },
            { at = 630,  interval = 0.52, count = 5, roster = { { id = "worgen", weight = 35 }, { id = "ghoul", weight = 30 }, { id = "skeletal_mage", weight = 35 } }, elite = "bone_sentinel", eliteChance = 0.08 },
            { at = 870,  interval = 0.45, count = 6, roster = { { id = "worgen", weight = 40 }, { id = "ghoul", weight = 30 }, { id = "skeletal_mage", weight = 30 } }, elite = "bone_sentinel", eliteChance = 0.10 },
            { at = 1080, interval = 0.40, count = 7, roster = { { id = "worgen", weight = 40 }, { id = "skeletal_mage", weight = 35 }, { id = "ghoul", weight = 25 } }, elite = "bone_sentinel", eliteChance = 0.12 },
        },
        events = {
            { at = 300, text = "The graves of Raven Hill empty!", id = "skeleton", count = 22 },
            { at = 620, text = "Eyes gleam between the trees. The pack hunts!", id = "worgen", count = 16 },
            { at = 920, text = "The canopy rains spiders!", id = "spider", count = 26 },
        },
        bosses = {
            { at = 300, id = "barkfang" },
            { at = 630, id = "silkfang" },
            { at = 960, id = "mordecai" },
            { at = 1320, id = "harvestking" },
            { at = 1620, id = "duskwraith" },
        },
    },
    barrens = {
        name = "The Barrens",
        subtitle = "Red earth, white sun, no mercy",
        description = "Everything on this savannah is hungry, armed, or both. The Crossroads sends its regards.",
        icon = "Interface\\Icons\\INV_Misc_Flower_04",
        groundTexture = "Interface\\FrameGeneral\\UI-Background-Rock",
        groundTint = { 0.38, 0.20, 0.08 },
        music = { 53682, 53683, 53681 }, -- savannah night scores
        difficulty = 1.8, goldMult = 1.8,
        unlockHint = "Survive for 10 minutes in Duskwood.",
        props = {
            { icon = "Interface\\Icons\\INV_Misc_Flower_04", tint = { 0.42, 0.38, 0.22 } },
            { icon = "Interface\\Icons\\INV_Stone_02", tint = { 0.48, 0.35, 0.25 } },
            { icon = "Interface\\Icons\\INV_Misc_Bone_06", tint = { 0.55, 0.48, 0.40 } },
        },
        phases = {
            { at = 0,    interval = 0.90, count = 3, roster = { { id = "plainstrider", weight = 35 }, { id = "lion", weight = 30 }, { id = "raptor", weight = 35 } } },
            { at = 90,   interval = 0.78, count = 3, roster = { { id = "raptor", weight = 30 }, { id = "quilboar", weight = 30 }, { id = "lion", weight = 20 }, { id = "harpy", weight = 20 } } },
            { at = 240,  interval = 0.66, count = 4, roster = { { id = "quilboar", weight = 30 }, { id = "centaur", weight = 25 }, { id = "harpy", weight = 25 }, { id = "raptor", weight = 20 } }, elite = "kolkar_battlelord", eliteChance = 0.05 },
            { at = 420,  interval = 0.58, count = 5, roster = { { id = "centaur", weight = 30 }, { id = "quilboar", weight = 30 }, { id = "harpy", weight = 25 }, { id = "lion", weight = 15 } }, elite = "kolkar_battlelord", eliteChance = 0.07 },
            { at = 630,  interval = 0.50, count = 5, roster = { { id = "centaur", weight = 35 }, { id = "quilboar", weight = 30 }, { id = "harpy", weight = 35 } }, elite = "kolkar_battlelord", eliteChance = 0.08 },
            { at = 870,  interval = 0.44, count = 6, roster = { { id = "centaur", weight = 40 }, { id = "harpy", weight = 30 }, { id = "quilboar", weight = 30 } }, elite = "kolkar_battlelord", eliteChance = 0.10 },
            { at = 1080, interval = 0.38, count = 7, roster = { { id = "centaur", weight = 40 }, { id = "harpy", weight = 35 }, { id = "raptor", weight = 25 } }, elite = "kolkar_battlelord", eliteChance = 0.12 },
        },
        events = {
            { at = 300, text = "A raptor pack bursts from the tall grass!", id = "raptor", count = 20 },
            { at = 620, text = "The Witchwing descend shrieking!", id = "harpy", count = 18 },
            { at = 920, text = "Kolkar outriders circle for the kill!", id = "centaur", count = 18 },
        },
        bosses = {
            { at = 300, id = "thornmane" },
            { at = 630, id = "shriekfeather" },
            { at = 960, id = "kazrok" },
            { at = 1320, id = "silkfang" },
            { at = 1620, id = "stormhide" },
        },
    },
    icecrown = {
        name = "Icecrown",
        subtitle = "In the shadow of the Frozen Throne",
        description = "The Scourge does not sleep, does not tire, and does not care how many you have already slain.",
        icon = "Interface\\Icons\\INV_Ammo_Snowball",
        groundTexture = "Interface\\FrameGeneral\\UI-Background-Rock",
        groundTint = { 0.20, 0.28, 0.38 },
        music = { 229861, 229862, 229863, 229864 }, -- Icecrown Glacier scores
        difficulty = 2.2, goldMult = 2.2,
        unlockHint = "Survive for 10 minutes in the Barrens.",
        props = {
            { icon = "Interface\\Icons\\INV_Misc_Gem_Crystal_02", tint = { 0.40, 0.55, 0.70 } },
            { icon = "Interface\\Icons\\INV_Misc_Bone_08", tint = { 0.45, 0.52, 0.60 } },
            { icon = "Interface\\Icons\\INV_Ammo_Snowball", tint = { 0.50, 0.58, 0.68 } },
        },
        phases = {
            { at = 0,    interval = 0.85, count = 3, roster = { { id = "scourge_ghoul", weight = 45 }, { id = "geist", weight = 30 }, { id = "skeleton", weight = 25 } } },
            { at = 90,   interval = 0.72, count = 4, roster = { { id = "scourge_ghoul", weight = 30 }, { id = "geist", weight = 25 }, { id = "crypt_fiend", weight = 25 }, { id = "necromancer", weight = 20 } } },
            { at = 240,  interval = 0.62, count = 4, roster = { { id = "crypt_fiend", weight = 30 }, { id = "necromancer", weight = 25 }, { id = "scourge_ghoul", weight = 25 }, { id = "abomination", weight = 20 } }, elite = "deathbound_vanguard", eliteChance = 0.06 },
            { at = 420,  interval = 0.54, count = 5, roster = { { id = "crypt_fiend", weight = 30 }, { id = "abomination", weight = 25 }, { id = "necromancer", weight = 25 }, { id = "geist", weight = 20 } }, elite = "deathbound_vanguard", eliteChance = 0.08 },
            { at = 630,  interval = 0.46, count = 6, roster = { { id = "crypt_fiend", weight = 30 }, { id = "necromancer", weight = 30 }, { id = "abomination", weight = 25 }, { id = "geist", weight = 15 } }, elite = "deathbound_vanguard", eliteChance = 0.09 },
            { at = 870,  interval = 0.40, count = 7, roster = { { id = "crypt_fiend", weight = 35 }, { id = "necromancer", weight = 35 }, { id = "abomination", weight = 30 } }, elite = "deathbound_vanguard", eliteChance = 0.11 },
            { at = 1080, interval = 0.35, count = 8, roster = { { id = "crypt_fiend", weight = 35 }, { id = "necromancer", weight = 35 }, { id = "abomination", weight = 30 } }, elite = "deathbound_vanguard", eliteChance = 0.13 },
        },
        events = {
            { at = 300, text = "The frozen earth splits - ghouls claw free!", id = "scourge_ghoul", count = 24 },
            { at = 620, text = "Geists swarm from the spires!", id = "geist", count = 22 },
            { at = 920, text = "The cult chants as one. Necromancers converge!", id = "necromancer", count = 16 },
        },
        bosses = {
            { at = 300, id = "boneweaver" },
            { at = 630, id = "gorestitch" },
            { at = 960, id = "mordecai" },
            { at = 1320, id = "boneweaver" },
            { at = 1620, id = "marrowfrost" },
        },
    },

    -- Experimental Boss Arena: no horde, no 30-minute timer. Selecting it and
    -- pressing Begin drops you into a bounded duel with a scripted boss
    -- (Aethelgard) - see WS.BossArena. You arrive with a ready-made loadout.
    boss_arena = {
        name = "Eclipse Arena",
        subtitle = "Experimental - a duel with Aethelgard",
        description = "No horde, no timer. A bounded arena and one scripted boss: Aethelgard, the Eclipse Sovereign. You arrive with a ready-made kit - survive the telegraphs and break the eclipse.",
        icon = "Interface\\Icons\\Spell_Holy_SearingLight",
        groundTexture = "Interface\\FrameGeneral\\UI-Background-Marble",
        groundTint = { 0.10, 0.08, 0.18 },
        music = { 53521, 53522 },
        difficulty = 1.0, goldMult = 1.0,
        arena = true,
        props = {},
        phases = { { at = 0, interval = 99, count = 0, roster = { { id = "kobold", weight = 1 } } } },
        events = {},
        bosses = {},
    },
}

WS.MapOrder = { "elwynn", "westfall", "duskwood", "barrens", "icecrown", "boss_arena" }
