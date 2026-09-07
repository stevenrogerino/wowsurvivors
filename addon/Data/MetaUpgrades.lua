local _, WS = ...

-- Permanent training bought from the Trainer with banked gold. Ranks persist
-- in SavedVariables and are applied to every new survivor at run start.
-- Cost of the next rank = cost * (currentRank + 1), so deep ranks are a
-- serious long-term gold sink.
WS.MetaUpgrades = {
    meta_might = {
        name = "Lessons: Strength", icon = "Interface\\Icons\\Ability_Warrior_InnerRage",
        description = "+2% weapon damage per rank", max = 10, cost = 200, v = 0.02,
        apply = function(player, rank, m) player.damageMultiplier = player.damageMultiplier + m.v * rank end,
    },
    meta_toughness = {
        name = "Lessons: Toughness", icon = "Interface\\Icons\\Spell_Holy_Devotion",
        description = "+10 maximum health per rank", max = 10, cost = 180, v = 10,
        apply = function(player, rank, m)
            player.maxHealth = player.maxHealth + m.v * rank
            player.health = player.health + m.v * rank
        end,
    },
    meta_swiftness = {
        name = "Lessons: Swiftness", icon = "Interface\\Icons\\Ability_Rogue_Sprint",
        description = "+2% movement speed per rank", max = 8, cost = 180, v = 0.02,
        apply = function(player, rank, m) player.moveSpeed = player.moveSpeed * (1 + m.v * rank) end,
    },
    meta_armor = {
        name = "Lessons: Defense", icon = "Interface\\Icons\\INV_Shield_06",
        description = "+1 armor per rank", max = 5, cost = 250, v = 1,
        apply = function(player, rank, m) player.armor = player.armor + m.v * rank end,
    },
    meta_greed = {
        name = "Lessons: Greed", icon = "Interface\\Icons\\INV_Misc_Coin_01",
        description = "+10% gold found per rank", max = 8, cost = 150, v = 0.10,
        apply = function(player, rank, m) player.goldMultiplier = player.goldMultiplier + m.v * rank end,
    },
    meta_wisdom = {
        name = "Lessons: Wisdom", icon = "Interface\\Icons\\Spell_Holy_SealOfWisdom",
        description = "+4% experience per rank", max = 8, cost = 150, v = 0.04,
        apply = function(player, rank, m) player.xpMultiplier = player.xpMultiplier + m.v * rank end,
    },
    meta_recovery = {
        name = "Lessons: Recovery", icon = "Interface\\Icons\\Spell_Nature_Rejuvenation",
        description = "+0.2 health per second per rank", max = 6, cost = 250, v = 0.2,
        apply = function(player, rank, m) player.healthRegen = player.healthRegen + m.v * rank end,
    },
    meta_luck = {
        name = "Lessons: Fortune", icon = "Interface\\Icons\\INV_Misc_Coin_02",
        description = "+5% luck per rank", max = 6, cost = 220, v = 0.05,
        apply = function(player, rank, m) player.luck = player.luck + m.v * rank end,
    },
    meta_reroll = {
        name = "Tactical Retreat", icon = "Interface\\Icons\\Spell_Magic_ManaGain",
        description = "+1 level-up reroll per rank", max = 3, cost = 500, v = 1,
        apply = function(player, rank, m) player.rerolls = player.rerolls + m.v * rank end,
    },
    meta_banish = {
        name = "Forbidden Words", icon = "Interface\\Icons\\Spell_Shadow_DeathCoil",
        description = "+1 level-up banish per rank", max = 3, cost = 750, v = 1,
        apply = function(player, rank, m) player.banishes = player.banishes + m.v * rank end,
    },
    meta_headstart = {
        name = "Veteran's Instincts", icon = "Interface\\Icons\\Spell_Nature_TimeStop",
        description = "Begin each run with 1 free level-up per rank", max = 3, cost = 750, v = 1,
        apply = function(player, rank, m) player.startLevelUps = (player.startLevelUps or 0) + m.v * rank end,
    },
    meta_revive = {
        name = "Ankh of Reincarnation", icon = "Interface\\Icons\\Spell_Nature_Reincarnation",
        description = "Once per run, cheat death and return at half health", max = 1, cost = 2500, v = 1,
        apply = function(player, rank, m) player.revives = (player.revives or 0) + m.v * rank end,
    },
    -- A deep permanent gold sink: tiny gains at ever-rising prices, capped at
    -- 100 eggs (a nod to Vampire Survivors' golden eggs). In-run, the wandering
    -- Egg Merchant sells extra eggs that last only for that run.
    meta_egg = {
        name = "Curious Egg", icon = "Interface\\Icons\\INV_Egg_02",
        description = "+0.1% damage and +1 health per egg. Up to 100 eggs.", max = 100, cost = 100,
        eggDmg = 0.001, eggHp = 1,
        apply = function(player, rank, m)
            player.damageMultiplier = player.damageMultiplier + m.eggDmg * rank
            player.maxHealth = player.maxHealth + m.eggHp * rank
            player.health = player.health + m.eggHp * rank
        end,
    },
}

WS.MetaUpgradeOrder = {
    "meta_might", "meta_toughness", "meta_swiftness", "meta_armor", "meta_greed",
    "meta_wisdom", "meta_recovery", "meta_luck", "meta_reroll", "meta_banish",
    "meta_headstart", "meta_revive", "meta_egg",
}
