local _, WS = ...

-- Bosses. Each announces itself with a yell, fights through a cycled list of
-- attack patterns, and always drops a treasure chest plus a burst of gems.
--
-- Pattern types (executed by Enemy:BossAttack):
--   summon - calls `count` adds of `id` around the boss
--   volley - a fan of `bolts` projectiles aimed at the survivor
--   ring   - `bolts` projectiles in a full circle
--   charge - a roaring burst of speed toward the survivor
-- `interval` is the seconds between pattern uses (default 3.6).
--
-- Base stats are pre-scaling; the WaveManager multiplies health and damage by
-- elapsed time and map difficulty when the boss actually spawns.
WS.Bosses = {
    ------------------------------------------------------------------ Elwynn
    grimtunnel = {
        name = "Foreman Grimtunnel", family = "kobold", displayId = 2299, voice = 553311,
        icon = "Interface\\Icons\\INV_Misc_Candle_02", tint = { 1.00, 0.90, 0.55 },
        health = 1900, speed = 55, damage = 30, xp = 160, radius = 40, gold = 35,
        interval = 4.0,
        patterns = { { type = "summon", id = "kobold", count = 7 }, { type = "charge" } },
        yell = "You no take candle!",
    },
    murkgill = {
        name = "Murk-Gill the Ancient", family = "murloc", displayId = 5243, voice = 555997,
        icon = "Interface\\Icons\\INV_Misc_Head_Murloc_01", tint = { 0.30, 0.95, 0.85 },
        health = 2900, speed = 58, damage = 34, xp = 220, radius = 44, gold = 40,
        interval = 3.6, school = "frost",
        patterns = { { type = "volley", bolts = 5 }, { type = "summon", id = "murloc", count = 8 } },
        yell = "Mrglglrlglgl! RwlRwlRwl!",
    },
    gnarlfang = {
        name = "Gnarlfang the Ravager", family = "gnoll", displayId = 384, voice = 550351,
        icon = "Interface\\Icons\\Ability_Hunter_Pet_Hyena", tint = { 0.95, 0.55, 0.20 },
        health = 4200, speed = 60, damage = 40, xp = 300, radius = 48, gold = 50,
        interval = 3.4,
        patterns = { { type = "summon", id = "gnoll", count = 6 }, { type = "charge" } },
        yell = "This forest belongs to the Riverpaw!",
    },
    redcowl = {
        name = "Captain Redcowl", family = "defias", displayId = 2316,
        icon = "Interface\\Icons\\INV_Misc_Bandana_03", tint = { 0.95, 0.25, 0.20 },
        health = 5600, speed = 70, damage = 44, xp = 360, radius = 46, gold = 55,
        interval = 3.2, school = "physical",
        patterns = { { type = "volley", bolts = 7 }, { type = "charge" } },
        yell = "The Brotherhood sends its regards!",
    },
    fenroth = {
        name = "Fenroth, Terror of the Vale", family = "beast", displayId = 11412, voice = 564215,
        icon = "Interface\\Icons\\Ability_Hunter_Pet_Wolf", tint = { 0.85, 0.20, 0.20 },
        health = 9000, speed = 66, damage = 52, xp = 700, radius = 54, gold = 100,
        interval = 3.0,
        patterns = { { type = "summon", id = "wolf", count = 8 }, { type = "charge" }, { type = "ring", bolts = 10 } },
        yell = "The vale runs red tonight!",
        school = "shadow",
    },
    ---------------------------------------------------------------- Westfall
    harvestking = {
        name = "The Harvest King", family = "mechanical", displayId = 548, voice = 551618,
        icon = "Interface\\Icons\\INV_Misc_Gear_02", tint = { 1.00, 0.80, 0.30 },
        health = 4800, speed = 48, damage = 42, xp = 320, radius = 50, gold = 50,
        interval = 3.8, school = "fire",
        patterns = { { type = "ring", bolts = 9 }, { type = "charge" } },
        yell = "CROPS. REQUIRE. BLOOD.",
    },
    masked_admiral = {
        name = "The Masked Admiral", family = "defias", displayId = 2029, voice = 547946,
        icon = "Interface\\Icons\\Ability_Rogue_KidneyShot", tint = { 0.90, 0.20, 0.25 },
        health = 11000, speed = 72, damage = 55, xp = 800, radius = 52, gold = 110,
        interval = 2.9, school = "physical",
        patterns = { { type = "volley", bolts = 9 }, { type = "summon", id = "defias", count = 8 }, { type = "charge" } },
        yell = "You'll never take me alive, lapdog!",
    },
    ---------------------------------------------------------------- Duskwood
    barkfang = {
        name = "Old Barkfang", family = "worgen", displayId = 11179, voice = 564281,
        icon = "Interface\\Icons\\INV_Misc_MonsterHead_04", tint = { 0.70, 0.62, 0.80 },
        health = 5200, speed = 74, damage = 42, xp = 330, radius = 46, gold = 50,
        interval = 3.4,
        patterns = { { type = "charge" }, { type = "summon", id = "worgen", count = 5 } },
        yell = "The hunt is joined!",
    },
    silkfang = {
        name = "Matriarch Silkfang", family = "beast", displayId = 2541, voice = 561415,
        icon = "Interface\\Icons\\Ability_Hunter_Pet_Spider", tint = { 0.70, 0.40, 0.90 },
        health = 6400, speed = 60, damage = 46, xp = 380, radius = 48, gold = 55,
        interval = 3.5, school = "nature",
        patterns = { { type = "summon", id = "spider", count = 9 }, { type = "ring", bolts = 8 } },
        yell = "*a chittering shriek echoes from the dark*",
    },
    mordecai = {
        name = "Mordecai the Unburied", family = "undead", displayId = 4272, voice = 560647,
        icon = "Interface\\Icons\\INV_Misc_Bone_HumanSkull_01", tint = { 0.75, 0.90, 0.80 },
        health = 7800, speed = 56, damage = 48, xp = 420, radius = 50, gold = 60,
        interval = 3.3, school = "shadow",
        patterns = { { type = "summon", id = "skeleton", count = 7 }, { type = "volley", bolts = 7 } },
        yell = "Death is a door. I walked back through it.",
    },
    duskwraith = {
        name = "The Pale Wraith", family = "undead", displayId = 1562, voice = 544832,
        icon = "Interface\\Icons\\Spell_Shadow_DeathCoil", tint = { 0.80, 0.85, 1.00 },
        health = 13500, speed = 62, damage = 58, xp = 900, radius = 52, gold = 120,
        interval = 2.8, school = "shadow",
        patterns = { { type = "volley", bolts = 9 }, { type = "summon", id = "ghoul", count = 8 }, { type = "ring", bolts = 12 } },
        yell = "The candles gutter. The dark remains.",
    },
    ----------------------------------------------------------------- Barrens
    thornmane = {
        name = "Warlord Bristlegore", family = "quilboar", displayId = 6115, voice = 558710,
        icon = "Interface\\Icons\\INV_Misc_Head_Quillboar_01", tint = { 0.95, 0.45, 0.25 },
        health = 6800, speed = 62, damage = 48, xp = 400, radius = 48, gold = 55,
        interval = 3.4,
        patterns = { { type = "summon", id = "quilboar", count = 6 }, { type = "charge" } },
        yell = "Razormane! Take back the land!",
    },
    shriekfeather = {
        name = "Windmatron Shriekfeather", family = "harpy", displayId = 2295, voice = 551598,
        icon = "Interface\\Icons\\INV_Feather_12", tint = { 0.60, 0.85, 1.00 },
        health = 7600, speed = 68, damage = 50, xp = 440, radius = 46, gold = 60,
        interval = 3.2, school = "nature",
        patterns = { { type = "volley", bolts = 8 }, { type = "summon", id = "harpy", count = 6 } },
        yell = "The wind will strip your bones!",
    },
    kazrok = {
        name = "Warlord Kazrok of the Kolkar", family = "centaur", displayId = 4874, voice = 546050,
        icon = "Interface\\Icons\\INV_Misc_Head_Centaur_01", tint = { 1.00, 0.55, 0.15 },
        health = 9200, speed = 76, damage = 54, xp = 500, radius = 52, gold = 70,
        interval = 3.0,
        patterns = { { type = "charge" }, { type = "volley", bolts = 7 }, { type = "summon", id = "centaur", count = 5 } },
        yell = "Kolkar own these plains! Die, two-legs!",
    },
    stormhide = {
        name = "Stormhide the Colossus", family = "beast", displayId = 2764, voice = 544940,
        icon = "Interface\\Icons\\Spell_Nature_Lightning", tint = { 0.40, 0.70, 1.00 },
        health = 16000, speed = 52, damage = 62, xp = 1000, radius = 58, gold = 130,
        interval = 3.0, school = "nature",
        patterns = { { type = "ring", bolts = 12 }, { type = "charge" }, { type = "volley", bolts = 9 } },
        yell = "*thunder rolls across the savannah*",
    },
    ---------------------------------------------------------------- Icecrown
    boneweaver = {
        name = "Kel'goth the Boneweaver", family = "undead", displayId = 7919, voice = 560647,
        icon = "Interface\\Icons\\Spell_Shadow_DarkRitual", tint = { 0.80, 0.55, 1.00 },
        health = 8800, speed = 58, damage = 52, xp = 480, radius = 50, gold = 65,
        interval = 3.2, school = "shadow",
        patterns = { { type = "summon", id = "scourge_ghoul", count = 8 }, { type = "volley", bolts = 8 } },
        yell = "Your bones will serve the Scourge!",
    },
    gorestitch = {
        name = "Gorestitch the Amalgam", family = "undead", displayId = 1693, voice = 549168,
        icon = "Interface\\Icons\\Spell_Shadow_AbominationExplosion", tint = { 0.75, 0.95, 0.55 },
        health = 12000, speed = 44, damage = 60, xp = 560, radius = 58, gold = 75,
        interval = 3.6,
        patterns = { { type = "ring", bolts = 10 }, { type = "charge" } },
        yell = "Fresh meat for the pile!",
        school = "shadow",
    },
    marrowfrost = {
        name = "Lich-Lord Marrowfrost", family = "undead", displayId = 15945, voice = 553978,
        icon = "Interface\\Icons\\Spell_DeathKnight_FrostPresence", tint = { 0.55, 0.85, 1.00 },
        health = 22000, speed = 56, damage = 70, xp = 1400, radius = 60, gold = 200,
        interval = 2.7, school = "frost",
        patterns = {
            { type = "volley", bolts = 9 },
            { type = "ring", bolts = 14 },
            { type = "summon", id = "crypt_fiend", count = 6 },
        },
        yell = "Your warmth offends me, little one.",
    },

    -- Not part of any schedule: at 30:00 Death itself (a Spirit Healer the
    -- size of a house) arrives to end the run, and again every minute after.
    -- Technically killable, in the proud Vampire Survivors tradition.
    death_itself = {
        name = "Death Itself", family = "death", displayId = 5233,
        icon = "Interface\\Icons\\Spell_Shadow_SoulGem", tint = { 0.80, 0.90, 1.00 },
        health = 5000000, speed = 265, damage = 600, xp = 5000, radius = 46, gold = 999,
        interval = 60,
        patterns = { { type = "charge" } },
        yell = "Rest now. You have fought enough.",
    },

    -- Experimental Boss Arena boss. `arena` = driven by WS.BossArena (its own
    -- scripted telegraphs), not the pattern loop; `stationary` = hovers in place.
    aethelgard = {
        -- No displayId: renders as this icon (a real model id is a blind gamble - the
        -- last one was a random villager; the Yogg-Saron achievement icon reads as an
        -- eldritch horror and always loads). Swap in a verified displayId anytime.
        name = "Aethelgard, the Eclipse Sovereign", family = "celestial",
        icon = "Interface\\Icons\\Achievement_Boss_Yoggsaron_01", tint = { 0.95, 0.90, 1.00 },
        health = 300000, speed = 0, damage = 34, xp = 0, radius = 62, gold = 0,
        interval = 99, arena = true, stationary = true, school = "holy",
        patterns = { { type = "charge" } },
        yell = "Witness the eclipse of all things.",
    },
}
