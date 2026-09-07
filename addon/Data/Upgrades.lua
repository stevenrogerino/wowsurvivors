local _, WS = ...

-- In-run passive boons offered on level-up. `apply(player, upgrade)` mutates
-- the run's player and reads its magnitude from the upgrade's own `v` field, so
-- the Tuning page can retune every passive by editing `v`.
WS.Upgrades = {
    might = {
        name = "Might", icon = "Interface\\Icons\\Ability_Warrior_InnerRage",
        description = "+10% weapon damage", max = 5, v = 0.10,
        detail = "Multiplies the damage of every weapon you carry.",
        apply = function(player, up) player.damageMultiplier = player.damageMultiplier + up.v end,
    },
    haste = {
        name = "Haste", icon = "Interface\\Icons\\Spell_Nature_Invisibilty",
        description = "-8% weapon cooldowns", max = 5, v = 0.92,
        detail = "Every weapon fires more often. Ranks stack multiplicatively. (v is the cooldown multiplier: 0.92 = -8%.)",
        apply = function(player, up) player.cooldownMultiplier = player.cooldownMultiplier * up.v end,
    },
    fleetfoot = {
        name = "Fleetfoot", icon = "Interface\\Icons\\Ability_Rogue_Sprint",
        description = "+12% movement speed", max = 5, v = 1.12,
        detail = "You move faster. (v is the speed multiplier: 1.12 = +12%.)",
        apply = function(player, up) player.moveSpeed = player.moveSpeed * up.v end,
    },
    magnet = {
        name = "Greed's Pull", icon = "Interface\\Icons\\Spell_Arcane_ArcanePotency",
        description = "+25 pickup radius", max = 5, v = 25,
        detail = "Gems, coins, and potions fly to you from farther away.",
        apply = function(player, up) player.pickupRadius = player.pickupRadius + up.v end,
    },
    vitality = {
        name = "Vitality", icon = "Interface\\Icons\\Spell_Holy_Devotion",
        description = "+25 maximum health (and heals it)", max = 5, v = 25,
        detail = "A bigger health pool, plus a free heal when taken.",
        apply = function(player, up)
            player.maxHealth = player.maxHealth + up.v
            -- Heal through Player:Heal so +healing-received applies and it counts
            -- on the healing meter (as "Vitality").
            WS.Player:Heal(player, up.v, "vitality")
        end,
    },
    armor = {
        name = "Ironhide", icon = "Interface\\Icons\\INV_Shield_06",
        description = "+2 armor (diminishing damage reduction)", max = 5, v = 2,
        detail = "Every hit is cut by a share based on your armor - each point helps a little less than the last, and it never blocks a hit completely.",
        apply = function(player, up) player.armor = player.armor + up.v end,
    },
    precision = {
        name = "Precision", icon = "Interface\\Icons\\Ability_Hunter_SniperShot",
        description = "+7% critical strike chance", max = 5, v = 0.07,
        detail = "Chance for any weapon hit to strike critically.",
        apply = function(player, up) player.critChance = player.critChance + up.v end,
    },
    ferocity = {
        name = "Ferocity", icon = "Interface\\Icons\\INV_Misc_MonsterClaw_04",
        description = "+25% critical strike damage", max = 4, v = 0.25,
        detail = "Your critical strikes hit even harder.",
        apply = function(player, up) player.critDamage = player.critDamage + up.v end,
    },
    area = {
        name = "Expanse", icon = "Interface\\Icons\\Spell_Nature_NatureBlessing",
        description = "+12% effect area", max = 5, v = 0.12,
        detail = "Bigger auras and splashes, wider orbits, longer chain leaps.",
        apply = function(player, up) player.areaMultiplier = player.areaMultiplier + up.v end,
    },
    quantity = {
        name = "Duplicity", icon = "Interface\\Icons\\Spell_Magic_ManaGain",
        description = "+1 projectile for volley weapons", max = 3, v = 1,
        detail = "Adds a projectile to bolts, knives, arrows, axes, shields, storm strikes, and chain leaps. Auras (Holy Nova, Consecration) are unaffected.",
        apply = function(player, up) player.projectileBonus = player.projectileBonus + up.v end,
    },
    luck = {
        name = "Fortune", icon = "Interface\\Icons\\INV_Misc_Coin_02",
        description = "+15% luck (better and more drops)", max = 4, v = 0.15,
        detail = "Better odds of coins, potions, sapper charges, and lodestones.",
        apply = function(player, up) player.luck = player.luck + up.v end,
    },
    wisdom = {
        name = "Wisdom", icon = "Interface\\Icons\\Spell_Holy_SealOfWisdom",
        description = "+10% experience gained", max = 4, v = 0.10,
        detail = "Every gem is worth more experience.",
        apply = function(player, up) player.xpMultiplier = player.xpMultiplier + up.v end,
    },
    recovery = {
        name = "Recovery", icon = "Interface\\Icons\\Spell_Nature_Rejuvenation",
        description = "+0.5 health regenerated per second", max = 4, v = 0.5,
        detail = "Steady healing, always ticking.",
        apply = function(player, up) player.healthRegen = player.healthRegen + up.v end,
    },
    velocity = {
        name = "Velocity", icon = "Interface\\Icons\\INV_Spear_07",
        description = "+15% projectile speed", max = 3, v = 0.15,
        detail = "Bolts, knives, arrows, and shields fly faster. No effect on chains, auras, whirlwinds, or storms.",
        apply = function(player, up) player.projectileSpeed = player.projectileSpeed + up.v end,
    },
    dark_bargain = {
        name = "Dark Bargain", icon = "Interface\\Icons\\Spell_Shadow_UnholyFrenzy",
        description = "The horde grows: +20% spawns, +8% enemy speed. You grow too: +15% XP and gold.", max = 3, v = 0.15,
        detail = "A curse you choose. More enemies means more gems, more gold, more danger. Stacks. (v is the XP/gold bonus.)",
        apply = function(player, up)
            player.curse = (player.curse or 0) + 1
            player.xpMultiplier = player.xpMultiplier + up.v
            player.goldMultiplier = player.goldMultiplier + up.v
        end,
    },
    divine_bulwark = {
        name = "Divine Bulwark", icon = "Interface\\Icons\\Spell_Holy_SealOfProtection",
        description = "A holy shield blocks one hit entirely. Recharges over time.", max = 3,
        detail = "Blocks one hit every 30 / 22 / 15 seconds by rank.",
        apply = function(player)
            local cfg = WS.Config
            local intervals = { cfg.blockInterval1 or 30, cfg.blockInterval2 or 22, cfg.blockInterval3 or 15 }
            player.blockRank = (player.blockRank or 0) + 1
            player.blockInterval = intervals[WS.min(player.blockRank, 3)]
            player.blockTimer = player.blockTimer or 0
        end,
    },
    chilling_presence = {
        name = "Chilling Presence", icon = "Interface\\Icons\\Spell_Frost_ChillingArmor",
        description = "Enemies near you are slowed by cold.", max = 3,
        detail = "Slows non-boss enemies within a widening frost aura (stronger and wider per rank). The aura grows with effect area.",
        apply = function(player) player.chillRank = (player.chillRank or 0) + 1 end,
    },
    spirit_companion = {
        name = "Spirit Companion", icon = "Interface\\Icons\\Spell_Nature_SpiritWolf",
        description = "Summon a spirit wolf that hunts the horde.", max = 3,
        detail = "Each rank calls another spirit wolf. They chase down the nearest enemies and maul them - bites deal area damage that scales with your damage and level.",
        apply = function(player) WS.Familiar:Add("wolf") end,
    },
    raise_dead = {
        name = "Raise Dead", icon = "Interface\\Icons\\Spell_Shadow_AnimateDead",
        description = "Raise a ghoul to shamble after the horde.", max = 3,
        detail = "Each rank raises another ghoul. Slower than a spirit wolf and slower to swing, but it hits far harder and its claws sweep a wider arc.",
        apply = function(player) WS.Familiar:Add("ghoul") end,
    },
    unholy_command = {
        name = "Unholy Command", icon = "Interface\\Icons\\Spell_Shadow_DeathPact",
        description = "+30% summon damage and +10% summon attack speed", max = 5,
        detail = "Drives everything you have summoned - spirit wolves and ghouls alike - to strike harder and more often. Worthless without something to command.",
        offer = function(player)
            return (player.upgradeLevels.spirit_companion or 0) > 0
                or (player.upgradeLevels.raise_dead or 0) > 0
        end,
        v = 0.30, haste = 0.10,
        apply = function(player, up)
            player.summonDamage = (player.summonDamage or 0) + up.v
            player.summonHaste = (player.summonHaste or 0) + (up.haste or 0.10)
        end,
    },

    -- Tank / defensive line.
    thorns = {
        name = "Thorns", icon = "Interface\\Icons\\Spell_Nature_Thorns",
        description = "Attackers take damage back - melee and ranged.", max = 5,
        detail = "Any enemy that hits you - a melee swing OR a ranged bolt - takes 10 + 40% of that damage back per rank (even if you dodge or block). Ranged bolts reflect to the caster that fired them.",
        apply = function(player) player.thornsRank = (player.thornsRank or 0) + 1 end,
    },
    -- Only offered once healing already means something (Desecration is running,
    -- or you have regen / lifesteal / a healing weapon to feed it). Otherwise it
    -- would be a dead pick, so `offer` keeps it out of the level-up pool.
    desecration = {
        name = "Desecration", icon = "Interface\\Icons\\Spell_Shadow_DeathAndDecay",
        description = "+15% of your healing lashes out as shadow damage", max = 5, v = 0.15,
        detail = "Healing you cannot use rots instead of going to waste: overheal erupts around you, and a growing share of the healing that does land strikes with it. Feeds on regeneration, lifesteal, and healing weapons.",
        offer = function(player)
            return (player.desecration or 0) > 0
                or (player.healthRegen or 0) > 0
                or (player.lifesteal or 0) > 0
        end,
        apply = function(player, up)
            player.desecration = (player.desecration or 0) + 1
            player.desecrationOverheal = WS.max(player.desecrationOverheal or 0,
                WS.Config.desecrationOverheal or 1)
            player.desecrationShare = (player.desecrationShare or 0) + up.v
        end,
    },
    -- Like Desecration, only offered once it would actually do something: you
    -- need to be fel-attuned for overkill to be worth anything.
    soul_rending = {
        name = "Soul Rending", icon = "Interface\\Icons\\Spell_Shadow_SoulLeech_3",
        description = "+25% fel from overkill, and +1s of Metamorphosis", max = 5, v = 0.25,
        detail = "Every scrap of overkill feeds the fel faster, and the transformation holds a second longer per rank.",
        offer = function(player) return (player.felAttuned or 0) > 0 end,
        apply = function(player, up) player.soulRending = (player.soulRending or 0) + 1 end,
    },
    retribution = {
        name = "Retribution Aura", icon = "Interface\\Icons\\Spell_Holy_RetributionAura",
        description = "A holy aura sears nearby enemies.", max = 4,
        detail = "Burns enemies around you twice per second (damage and radius grow with rank, damage%, and effect area). Lets tanks deal damage while standing firm.",
        apply = function(player) player.retRank = (player.retRank or 0) + 1 end,
    },
    dodge = {
        name = "Evasion", icon = "Interface\\Icons\\Ability_Rogue_Feint",
        description = "+8% chance to avoid a hit entirely.", max = 4, v = 0.08,
        detail = "Each rank adds a chance to completely dodge an incoming hit. Stacks with armor and blocks.",
        apply = function(player, up) player.dodgeChance = (player.dodgeChance or 0) + up.v end,
    },
}

WS.UpgradeOrder = {
    "might", "haste", "fleetfoot", "magnet", "vitality", "armor", "precision",
    "ferocity", "area", "quantity", "luck", "wisdom", "recovery", "velocity",
    "dark_bargain", "divine_bulwark", "chilling_presence", "spirit_companion",
    "thorns", "retribution", "dodge", "desecration", "soul_rending",
    "raise_dead", "unholy_command",
}
