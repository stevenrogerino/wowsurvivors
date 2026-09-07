local _, WS = ...

-- Playable survivors. Each carries a starting weapon, base stats, and a small
-- passive perk applied on run start (`apply` mutates the freshly-built player).
-- `unlockHint` is shown on locked menu entries; the actual unlock is granted
-- by an achievement reward (Data\Achievements.lua).
WS.Characters = {
    mage = {
        name = "Baron Zul",
        title = "Apprentice of Northshire",
        class = "Mage",
        classIcon = "Interface\\Icons\\ClassIcon_Mage",
        icon = "Interface\\Icons\\Spell_Nature_StarFall",
        color = { 0.41, 0.80, 0.94 },
        weapon = "arcane_missiles",
        description = "A gifted novice whose missiles hunt his foes on their own.",
        perk = "Perk: weapon cooldowns reduced by {perkCooldownMult~%}%.",
        maxHealth = 110, moveSpeed = 225, armor = 0, pickupRadius = 60, healthRegen = 0,
        perkCooldownMult = 0.92,
        apply = function(player, c) player.cooldownMultiplier = player.cooldownMultiplier * c.perkCooldownMult end,
    },
    priest = {
        name = "Chid",
        title = "The Fool",
        class = "Priest",
        classIcon = "Interface\\Icons\\ClassIcon_Priest",
        icon = "Interface\\Icons\\Spell_Holy_HolyNova",
        color = { 1.00, 1.00, 1.00 },
        weapon = "holy_nova",
        description = "A stalwart healer wreathed in rings of searing Light.",
        perk = "Perk: regenerates {perkRegen} health per second.",
        maxHealth = 135, moveSpeed = 205, armor = 1, pickupRadius = 64, healthRegen = 0,
        perkRegen = 1.0,
        apply = function(player, c) player.healthRegen = player.healthRegen + c.perkRegen end,
    },
    rogue = {
        name = "Dr. Rav McBreathless",
        title = "Defias Defector",
        class = "Rogue",
        classIcon = "Interface\\Icons\\ClassIcon_Rogue",
        icon = "Interface\\Icons\\Ability_Rogue_FanofKnives",
        color = { 1.00, 0.96, 0.41 },
        weapon = "fan_of_knives",
        description = "A quick-fingered cutpurse who fills the field with steel.",
        perk = "Perk: +{perkSpeedMult*%}% movement speed and +{perkCrit%}% critical strike chance.",
        maxHealth = 100, moveSpeed = 250, armor = 0, pickupRadius = 56, healthRegen = 0,
        perkSpeedMult = 1.10, perkCrit = 0.05,
        apply = function(player, c)
            player.moveSpeed = player.moveSpeed * c.perkSpeedMult
            player.critChance = player.critChance + c.perkCrit
        end,
        unlockHint = "Survive for 8 minutes in a single run.",
    },
    hunter = {
        name = "Maeca Barefoot",
        title = "Ranger of the Westbrook Garrison",
        class = "Hunter",
        classIcon = "Interface\\Icons\\ClassIcon_Hunter",
        icon = "Interface\\Icons\\Ability_UpgradeMoonGlaive",
        color = { 0.67, 0.83, 0.45 },
        weapon = "multishot",
        description = "A keen-eyed ranger who never wastes an arrow.",
        perk = "Perk: +{perkPickup} pickup radius and +{perkSpeedMult*%}% movement speed.",
        maxHealth = 115, moveSpeed = 230, armor = 0, pickupRadius = 60, healthRegen = 0,
        perkPickup = 30, perkSpeedMult = 1.05,
        apply = function(player, c)
            player.pickupRadius = player.pickupRadius + c.perkPickup
            player.moveSpeed = player.moveSpeed * c.perkSpeedMult
        end,
        unlockHint = "Reach level 20 in a single run.",
    },
    warrior = {
        name = "AAAAAAAAA",
        title = "The Fallen Hero",
        class = "Warrior",
        classIcon = "Interface\\Icons\\ClassIcon_Warrior",
        icon = "Interface\\Icons\\Ability_Whirlwind",
        color = { 0.78, 0.61, 0.43 },
        weapon = "whirlwind",
        description = "An old soldier who solves most problems with spinning axes.",
        perk = "Perk: +{perkArmor} armor and +{perkHealth} maximum health.",
        maxHealth = 160, moveSpeed = 210, armor = 3, pickupRadius = 54, healthRegen = 0,
        perkArmor = 2, perkHealth = 25,
        apply = function(player, c)
            player.armor = player.armor + c.perkArmor
            player.maxHealth = player.maxHealth + c.perkHealth
            player.health = player.health + c.perkHealth
        end,
        unlockHint = "Slay 2 bosses in a single run.",
    },
    warlock = {
        name = "Nim B'ladin",
        title = "Exile of the Twilight Grove",
        class = "Warlock",
        classIcon = "Interface\\Icons\\ClassIcon_Warlock",
        icon = "Interface\\Icons\\Spell_Shadow_ShadowBolt",
        color = { 0.58, 0.51, 0.79 },
        weapon = "shadow_bolt",
        description = "A banished scholar whose bolts drink the life of many at once.",
        perk = "Perk: +{perkDamage%}% weapon damage.",
        maxHealth = 115, moveSpeed = 215, armor = 0, pickupRadius = 58, healthRegen = 0,
        perkDamage = 0.10,
        apply = function(player, c) player.damageMultiplier = player.damageMultiplier + c.perkDamage end,
        unlockHint = "Slay 750 enemies across all runs.",
    },
    shaman = {
        name = "Vonnra Hydrocheck",
        title = "Far Seer of the Crossroads",
        class = "Shaman",
        classIcon = "Interface\\Icons\\ClassIcon_Shaman",
        icon = "Interface\\Icons\\Spell_Nature_ChainLightning",
        color = { 0.00, 0.44, 0.87 },
        weapon = "chain_lightning",
        description = "A far seer who calls the storm down on whole warbands.",
        perk = "Perk: +{perkLuck%}% luck and +{perkArea%}% effect area.",
        maxHealth = 125, moveSpeed = 215, armor = 1, pickupRadius = 58, healthRegen = 0,
        perkLuck = 0.15, perkArea = 0.08,
        apply = function(player, c)
            player.luck = player.luck + c.perkLuck
            player.areaMultiplier = player.areaMultiplier + c.perkArea
        end,
        unlockHint = "Bank 500 gold across all runs.",
    },
    paladin = {
        name = "Professor Keegan",
        title = "Knight of the Silver Hand (Probationary)",
        class = "Paladin",
        classIcon = "Interface\\Icons\\ClassIcon_Paladin",
        icon = "Interface\\Icons\\Spell_Holy_AvengersShield",
        color = { 0.96, 0.55, 0.73 },
        weapon = "avengers_shield",
        description = "Buried by mistake. Dug himself out. Filed a complaint. Kept the shield.",
        perk = "Perk: +{perkArmor} armor and +{perkHealing%}% healing received.",
        maxHealth = 145, moveSpeed = 210, armor = 2, pickupRadius = 56, healthRegen = 0,
        perkArmor = 1, perkHealing = 0.20,
        apply = function(player, c)
            player.armor = player.armor + c.perkArmor
            player.healingMult = (player.healingMult or 1) + c.perkHealing
        end,
        unlockHint = "Somewhere in Elwynn Forest, an adequate knight lies buried...",
    },
    death_knight = {
        name = "DZ",
        title = "Who Could Not Stay Buried",
        class = "Death Knight",
        classIcon = "Interface\\Icons\\ClassIcon_DeathKnight",
        icon = "Interface\\Icons\\Spell_Deathknight_DeathStrike",
        color = { 0.77, 0.12, 0.23 },
        weapon = "death_strike",
        description = "He healed until the Light curdled, and something colder answered. It has not let go since.",
        perk = "Perk: Desecration is innate - overheal erupts as shadow, and {perkShare%}% of healing that lands lashes out with it.",
        maxHealth = 155, moveSpeed = 200, armor = 2, pickupRadius = 58, healthRegen = 2.0,
        perkShare = 0.20,
        apply = function(player, c)
            -- Born desecrated: no blessing or passive needed to start converting.
            player.desecration = (player.desecration or 0) + 1
            player.desecrationOverheal = WS.max(player.desecrationOverheal or 0,
                WS.Config.desecrationOverheal or 1)
            player.desecrationShare = (player.desecrationShare or 0) + c.perkShare
        end,
        unlockHint = "Let healing curdle. When enough Light has rotted in one run, a blade will answer.",
    },
    demon_hunter = {
        name = "Nerosus",
        title = "The Spineless One",
        class = "Demon Hunter",
        classIcon = "Interface\\Icons\\ClassIcon_DemonHunter",
        icon = "Interface\\Icons\\Spell_Fel_ElementalDevastation",
        color = { 0.64, 0.19, 0.79 },
        weapon = "fel_beam",
        description = "Burned out both eyes to see the fel clearly. Says it was worth it. Has not blinked since.",
        perk = "Perk: fel-attuned from the first swing - overkill damage always feeds Metamorphosis.",
        maxHealth = 120, moveSpeed = 235, armor = 0, pickupRadius = 60, healthRegen = 0,
        perkDodge = 0.05,
        apply = function(player, c)
            -- Born attuned: overkill is never wasted, no blessing required.
            player.felAttuned = (player.felAttuned or 0) + 1
            player.dodgeChance = (player.dodgeChance or 0) + c.perkDodge
        end,
        unlockHint = "Waste enough killing. Metamorphose again and again, and the glaives will find you.",
    },
}

WS.CharacterOrder = {
    "mage", "priest", "rogue", "hunter", "warrior", "warlock", "shaman", "paladin",
    "death_knight", "demon_hunter",
}
