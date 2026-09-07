local _, WS = ...

-- Blessings: a run-defining boon chosen before the first wave (our Arcana).
-- Three random blessings are offered at the start of every run; the choice
-- is permanent for that run. `apply` mutates the freshly-created player.
WS.Blessings = {
    kings = {
        name = "Blessing of Kings",
        icon = "Interface\\Icons\\Spell_Magic_MageArmor",
        description = "+{dmg%}% damage and +{hp} maximum health.",
        dmg = 0.08, hp = 40,
        apply = function(player, b)
            player.damageMultiplier = player.damageMultiplier + b.dmg
            player.maxHealth = player.maxHealth + b.hp
            player.health = player.health + b.hp
        end,
    },
    wisdom = {
        name = "Blessing of Wisdom",
        icon = "Interface\\Icons\\Spell_Holy_SealOfWisdom",
        description = "+{xp%}% experience from every gem.",
        xp = 0.15,
        apply = function(player, b) player.xpMultiplier = player.xpMultiplier + b.xp end,
    },
    elune = {
        name = "Grace of Elune",
        icon = "Interface\\Icons\\Spell_Holy_ElunesGrace",
        description = "+{area%}% effect area on everything you cast.",
        area = 0.15,
        apply = function(player, b) player.areaMultiplier = player.areaMultiplier + b.area end,
    },
    fortune = {
        name = "Gift of the Bronze Dragonflight",
        icon = "Interface\\Icons\\INV_Misc_Coin_01",
        description = "+{gold%}% gold found and +{luck%}% luck.",
        gold = 0.20, luck = 0.15,
        apply = function(player, b)
            player.goldMultiplier = player.goldMultiplier + b.gold
            player.luck = player.luck + b.luck
        end,
    },
    wild = {
        name = "Mark of the Wild",
        icon = "Interface\\Icons\\Spell_Nature_Regeneration",
        description = "+{armor} armor, +{regen} health per second, +{speedMult*%}% movement speed.",
        armor = 1, regen = 0.5, speedMult = 1.08,
        apply = function(player, b)
            player.armor = player.armor + b.armor
            player.healthRegen = player.healthRegen + b.regen
            player.moveSpeed = player.moveSpeed * b.speedMult
        end,
    },
    air = {
        name = "Wrath of Air",
        icon = "Interface\\Icons\\Spell_Nature_Cyclone",
        description = "-{cooldownMult~%}% weapon cooldowns.",
        cooldownMult = 0.90,
        apply = function(player, b) player.cooldownMultiplier = player.cooldownMultiplier * b.cooldownMult end,
    },
    fel = {
        name = "Fel Pact",
        icon = "Interface\\Icons\\Spell_Shadow_LifeDrain",
        description = "Your projectiles drain life: heal for {lifesteal%}% of the damage they deal.",
        lifesteal = 0.02,
        apply = function(player, b) player.lifesteal = (player.lifesteal or 0) + b.lifesteal end,
    },
    ancestors = {
        name = "Ancestral Guidance",
        icon = "Interface\\Icons\\Spell_Holy_Devotion",
        description = "+{healing%}% healing received.",
        healing = 0.30,
        apply = function(player, b) player.healingMult = (player.healingMult or 1) + b.healing end,
    },

    -- Rule-changing blessings (Arcana-style): these bend how the run plays,
    -- not just a stat. Their hooks live in Player/Enemy/Game.
    glass_cannon = {
        name = "Glass Cannon",
        icon = "Interface\\Icons\\Spell_Fire_Immolation",
        description = "+{dmg%}% weapon damage, but -{hpMult~%}% maximum health. Live fast.",
        dmg = 0.45, hpMult = 0.65,
        apply = function(player, b)
            player.damageMultiplier = player.damageMultiplier + b.dmg
            player.maxHealth = WS.floor(player.maxHealth * b.hpMult)
            player.health = WS.min(player.health, player.maxHealth)
        end,
    },
    bloodthirst = {
        name = "Bloodthirst",
        icon = "Interface\\Icons\\Spell_Shadow_LifeDrain02",
        description = "Every {killInterval} kills restore {healPct%}% +{healFlat} health. The horde is your medicine.",
        killInterval = 25, healPct = 0.06, healFlat = 3,
        apply = function(player, b)
            player.bloodthirst = true
            player.bloodthirstInterval = b.killInterval
            player.bloodthirstHealPct = b.healPct
            player.bloodthirstHealFlat = b.healFlat
        end,
    },
    momentum = {
        name = "Momentum",
        icon = "Interface\\Icons\\Ability_Rogue_Sprint",
        description = "While moving, your weapons fire {moveHaste%}% faster. Never stand still.",
        moveHaste = 0.25,
        apply = function(player, b) player.momentum = true; player.momentumHaste = b.moveHaste end,
    },
    arcane_overflow = {
        name = "Arcane Overflow",
        icon = "Interface\\Icons\\Spell_Arcane_Arcane01",
        description = "Every experience gem may unleash all your weapons at once ({overflow%}% chance).",
        overflow = 0.08,
        apply = function(player, b) player.overflow = b.overflow end,
    },
    blood_rite = {
        name = "Blood Rite",
        icon = "Interface\\Icons\\Spell_DeathKnight_BloodPresence",
        description = "Healing curdles. Every point of overheal erupts as shadow, and {share%}% of the healing that does land lashes out too.",
        overheal = 1.0, share = 0.25,
        apply = function(player, b)
            player.desecration = (player.desecration or 0) + 1
            player.desecrationOverheal = WS.max(player.desecrationOverheal or 0, b.overheal)
            player.desecrationShare = (player.desecrationShare or 0) + b.share
        end,
    },
    illidari_pact = {
        name = "Illidari Pact",
        icon = "Interface\\Icons\\Spell_Shadow_Metamorphosis",
        description = "Overkill is no longer wasted: damage past the killing blow feeds the fel, and it feeds {felGain%}% faster. Fill the meter and you become the monster.",
        felGain = 0.30,
        apply = function(player, b)
            -- Grants attunement to anyone who lacks it AND deepens the pact, so a
            -- Demon Hunter (already attuned) still gets real value from taking it.
            player.felAttuned = (player.felAttuned or 0) + 1
            player.felBonus = (player.felBonus or 0) + b.felGain
        end,
    },
    unyielding = {
        name = "Unyielding Faith",
        icon = "Interface\\Icons\\Spell_Holy_UnyieldingFaith",
        description = "+{armor} armor, +{hpMult*%}% max health, +{healing%}% healing received, and enemies that strike you are burned. But -{speedMult~%}% speed.",
        armor = 3, hpMult = 1.6, healing = 0.40, speedMult = 0.88, thorns = 2,
        apply = function(player, b)
            player.armor = player.armor + b.armor
            player.maxHealth = WS.floor(player.maxHealth * b.hpMult)
            player.health = player.maxHealth
            player.healingMult = (player.healingMult or 1) + b.healing
            player.moveSpeed = player.moveSpeed * b.speedMult
            player.thornsRank = (player.thornsRank or 0) + b.thorns -- a starter set of thorns
        end,
    },
}

WS.BlessingOrder = {
    "kings", "wisdom", "elune", "fortune", "wild", "air", "fel", "ancestors",
    "glass_cannon", "bloodthirst", "momentum", "arcane_overflow", "blood_rite",
    "illidari_pact", "unyielding",
}
