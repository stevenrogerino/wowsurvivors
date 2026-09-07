local _, WS = ...

-- Weapon definitions. `behavior` selects a handler registered in Weapon.lua:
--   aimed  - projectiles fired at the nearest enemy (homing/splash/slow flags)
--   spray  - a cone of projectiles at the nearest enemy
--   ring   - projectiles in a full circle around the survivor
--   nova   - an expanding shockwave centered on the survivor
--   zone   - a lingering damage field
--   chain  - instant hops between nearby enemies
--   orbit  - blades that circle the survivor for a duration
--   storm  - strikes that fall on random nearby enemies
--   bounce - a projectile that ricochets between enemies
--
-- Weapons rank up to level 8. A rank-8 weapon whose paired passive
-- (`evolvePairing`) has been learned may evolve into its named evolution:
-- +50% damage, extra projectiles, and any `evolved*` field overrides below.
WS.Weapons = {
    arcane_missiles = {
        name = "Arcane Missiles", school = "arcane", behavior = "aimed",
        icon = "Interface\\Icons\\Spell_Nature_StarFall",
        -- Magic-missile style: three small seeking bolts in quick succession,
        -- each re-acquiring the nearest target (3 x 6 = the old 16, +12%).
        cooldown = 0.85, damage = 6, speed = 370, projectiles = 3, pierce = 2, range = 560,
        homing = true, life = 2.2, radius = 6, burst = true,
        description = "A rapid volley of small seeking missiles that curve through the crowd.",
        evolveName = "Arcane Barrage", evolveIcon = "Interface\\Icons\\Ability_Mage_ArcaneBarrage",
        evolvePairing = "quantity",
        evolveDescription = "The missiles multiply beyond counting.",
    },
    fireball = {
        name = "Fireball", school = "fire", behavior = "aimed",
        icon = "Interface\\Icons\\Spell_Fire_FlameBolt",
        cooldown = 1.60, damage = 34, speed = 380, projectiles = 1, pierce = 0, range = 600,
        splash = 70, life = 2.4, radius = 10,
        description = "A slow, heavy cinder that bursts on impact.",
        evolveName = "Pyroblast", evolveIcon = "Interface\\Icons\\Spell_Fire_Fireball02",
        evolvePairing = "area",
        evolveDescription = "The cinder becomes a falling star.",
    },
    frostbolt = {
        name = "Frostbolt", school = "frost", behavior = "aimed",
        icon = "Interface\\Icons\\Spell_Frost_FrostBolt02",
        cooldown = 1.10, damage = 20, speed = 400, projectiles = 1, pierce = 1, range = 580,
        slowFactor = 0.55, slowDuration = 2.0, life = 2.2, radius = 9,
        description = "Bitter cold that slows whatever it strikes.",
        evolveName = "Icebound Fury", evolveIcon = "Interface\\Icons\\Spell_Frost_FrostNova",
        evolvePairing = "haste",
        evolveDescription = "Winter itself takes the field.",
    },
    chain_lightning = {
        name = "Chain Lightning", school = "nature", behavior = "chain",
        color = { 0.55, 0.80, 1.00 }, -- storm-blue, not druid green
        icon = "Interface\\Icons\\Spell_Nature_ChainLightning",
        cooldown = 1.50, damage = 30, chains = 4, range = 250,
        description = "Lightning that leaps from foe to foe.",
        evolveName = "Stormcaller's Wrath", evolveIcon = "Interface\\Icons\\Spell_Nature_Lightning",
        evolvePairing = "precision",
        evolveDescription = "The sky answers every call.",
    },
    holy_nova = {
        name = "Holy Nova", school = "holy", behavior = "nova",
        icon = "Interface\\Icons\\Spell_Holy_HolyNova",
        cooldown = 2.40, damage = 30, radius = 150, expandTime = 0.35, knockback = 26,
        description = "A ring of Light erupts outward from the survivor.",
        evolveName = "Circle of Dawn", evolveIcon = "Interface\\Icons\\Spell_Holy_AuraOfLight",
        evolvePairing = "vitality",
        evolveDescription = "Each dawn mends the faithful.", evolvedHeal = 3,
    },
    fel_beam = {
        name = "Fel Beam", school = "nature", behavior = "beam",
        icon = "Interface\\Icons\\Spell_Fel_ElementalDevastation",
        cooldown = 1.30, damage = 22, range = 620, beamWidth = 26,
        metaWidthMult = 1.8, color = { 0.55, 1.00, 0.20 },
        description = "A lance of fel that burns everything standing in its path.",
        evolveName = "Eye Beam", evolveIcon = "Interface\\Icons\\Spell_Shadow_Metamorphosis",
        evolvePairing = "dodge",
        evolveDescription = "The gaze widens until the world is a line of green fire.",
    },
    death_coil = {
        name = "Death Coil", school = "shadow", behavior = "aimed",
        icon = "Interface\\Icons\\Spell_Shadow_DeathCoil",
        cooldown = 1.45, damage = 28, speed = 420, projectiles = 1, pierce = 1,
        range = 600, life = 2.4, radius = 10, heal = 4,
        color = { 0.55, 0.20, 0.75 },
        description = "A coil of dark magic that wounds the living and knits your own flesh back together.",
        evolveName = "Coil of Anguish", evolveIcon = "Interface\\Icons\\Spell_Shadow_CallofBone",
        evolvePairing = "wisdom",
        evolveDescription = "The coil takes more, and gives more back.", evolvedHeal = 5,
    },
    death_and_decay = {
        name = "Death and Decay", school = "shadow", behavior = "zone",
        icon = "Interface\\Icons\\Spell_Shadow_DeathAndDecay",
        cooldown = 3.90, damage = 13, radius = 130, duration = 4.5, tickRate = 0.45,
        color = { 0.45, 0.85, 0.35 },
        -- Fissures are OFF: as straight tangent lines they read as stray beams, not
        -- broken ground. The defined rim carries the shape instead. The code path
        -- survives, so raising this above 0 in the bench brings them back.
        fissures = 0, fissureColor = { 0.34, 0.60, 0.14 },
        description = "Corrupts the ground underfoot; anything standing in it rots.",
        -- NB: not "Defile" - that name already belongs to the Holy Nova +
        -- Consecration discovery, and two of them would be confusing.
        evolveName = "Blighted Earth", evolveIcon = "Interface\\Icons\\Spell_Nature_Earthquake",
        evolvePairing = "chilling_presence",
        evolveDescription = "The blight spreads wider the longer it feeds.", evolvedHeal = 1,
    },
    death_strike = {
        name = "Death Strike", school = "shadow", behavior = "nova",
        icon = "Interface\\Icons\\Spell_Deathknight_DeathStrike",
        cooldown = 2.20, damage = 34, radius = 130, expandTime = 0.28, knockback = 20,
        heal = 6, color = { 0.85, 0.15, 0.20 }, -- blood-red, not generic shadow purple
        description = "A sweeping runeblade that carves health out of the wound it makes.",
        evolveName = "Marrowrend", evolveIcon = "Interface\\Icons\\Spell_Deathknight_BloodBoil",
        evolvePairing = "recovery",
        evolveDescription = "The blade drinks deeper than any wound can hold.", evolvedHeal = 6,
    },
    consecration = {
        name = "Consecration", school = "holy", behavior = "zone",
        icon = "Interface\\Icons\\Spell_Holy_InnerFire",
        cooldown = 3.60, damage = 11, radius = 120, duration = 4.0, tickRate = 0.5,
        description = "Hallows the ground beneath the survivor's feet.",
        evolveName = "Hallowed Ground", evolveIcon = "Interface\\Icons\\Spell_Holy_SealOfMight",
        evolvePairing = "armor",
        evolveDescription = "Sacred ground that shelters as it burns.", evolvedHeal = 1,
    },
    shadow_bolt = {
        name = "Shadow Bolt", school = "shadow", behavior = "aimed",
        icon = "Interface\\Icons\\Spell_Shadow_ShadowBolt",
        cooldown = 1.00, damage = 26, speed = 400, projectiles = 1, pierce = 2, range = 580,
        life = 2.4, radius = 9,
        description = "Bolts of shadow that tear straight through ranks.",
        evolveName = "Chaos Bolt", evolveIcon = "Interface\\Icons\\Ability_Warlock_ChaosBolt",
        evolvePairing = "might",
        evolveDescription = "Fel chaos that nothing can stop.",
    },
    fan_of_knives = {
        name = "Fan of Knives", school = "physical", behavior = "ring",
        icon = "Interface\\Icons\\Ability_Rogue_FanofKnives",
        projIcon = "Interface\\Icons\\INV_ThrowingKnife_02", -- thrown daggers
        cooldown = 1.30, damage = 18, speed = 380, projectiles = 6, pierce = 1,
        life = 0.9, radius = 8,
        description = "A whirling ring of thrown steel.",
        evolveName = "Blade Flurry", evolveIcon = "Interface\\Icons\\Ability_Warrior_PunishingBlow",
        evolvePairing = "fleetfoot",
        evolveDescription = "The steel never stops moving.",
    },
    whirlwind = {
        name = "Whirlwind", school = "physical", behavior = "orbit",
        icon = "Interface\\Icons\\Ability_Whirlwind",
        color = { 0.85, 0.88, 0.96 },        -- whirling steel streaks
        evolvedColor = { 1.00, 0.55, 0.25 }, -- Bladestorm burns ember-orange
        cooldown = 5.50, damage = 22, projectiles = 2, orbitRadius = 85, orbitSpeed = 4.2,
        duration = 3.2, radius = 20,
        description = "Axes circle the survivor, shredding all who close in.",
        evolveName = "Bladestorm", evolveIcon = "Interface\\Icons\\Ability_Warrior_Bladestorm",
        evolvePairing = "ferocity",
        evolveDescription = "Become the storm of blades.",
    },
    multishot = {
        name = "Multi-Shot", school = "physical", behavior = "spray",
        icon = "Interface\\Icons\\Ability_UpgradeMoonGlaive",
        projIcon = "Interface\\Icons\\INV_Ammo_Arrow_02", -- real flying arrows
        -- Balanced like every other weapon now (the global nerf applies). The
        -- per-weapon `noNerf` flag is still available from the Tuning bench.
        cooldown = 1.40, damage = 17, speed = 460, projectiles = 3, pierce = 1, range = 620,
        spread = 0.16, life = 1.7, radius = 8,
        description = "A widening spread of hunting arrows.",
        evolveName = "Volley", evolveIcon = "Interface\\Icons\\Ability_Marksmanship",
        evolvePairing = "velocity",
        evolveDescription = "The sky darkens with arrows.",
    },
    moonfire = {
        name = "Moonfire", school = "arcane", behavior = "aimed",
        icon = "Interface\\Icons\\Spell_Nature_MoonGlow",
        cooldown = 1.20, damage = 24, speed = 320, projectiles = 1, pierce = 0, range = 560,
        homing = true, life = 2.6, radius = 9,
        description = "Moonlit flame that tracks its prey.",
        evolveName = "Starfall", evolveIcon = "Interface\\Icons\\Spell_Arcane_StarFire",
        evolvePairing = "magnet",
        evolveDescription = "Stars fall wherever enemies gather.",
        -- Starfall is a true metamorphosis: the weapon changes behavior.
        evolvedBehavior = "storm", strikes = 5, stormRadius = 230, splash = 60,
    },
    avengers_shield = {
        name = "Avenger's Shield", school = "holy", behavior = "bounce",
        icon = "Interface\\Icons\\Spell_Holy_AvengersShield",
        cooldown = 2.60, damage = 30, speed = 430, projectiles = 1, bounces = 3, range = 600,
        life = 3.0, radius = 11,
        description = "A hurled shield that ricochets between enemies.",
        evolveName = "Reckoning", evolveIcon = "Interface\\Icons\\Spell_Holy_SealOfMight",
        evolvePairing = "luck",
        evolveDescription = "Judgment finds every last one of them.",
    },
}

-- Order shown when new weapons are offered on level-up.
-- The shared level-up pool. EVERY class's starting weapon lives here, including
-- the unlock characters' - DZ and Vex simply begin with theirs, exactly like the
-- Mage begins with Arcane Missiles. Anyone can find Death Strike or Fel Beam, so
-- the healing->damage and overkill->fel builds are open to the whole roster.
WS.WeaponOrder = {
    "arcane_missiles", "fireball", "frostbolt", "chain_lightning", "holy_nova",
    "consecration", "shadow_bolt", "fan_of_knives", "whirlwind", "multishot",
    "moonfire", "avengers_shield", "death_strike", "fel_beam",
    "death_coil", "death_and_decay",
}

-- Union super-weapons. These live in WS.Weapons (so a carried weapon can point
-- at their data) but NOT in WeaponOrder (so they are never offered as ordinary
-- new weapons). A union is granted only by merging its two source weapons once
-- both are at max rank (see WS.Unions + LevelUp). `isUnion` marks them.
WS.Weapons.union_astral = {
    name = "Astral Communion", school = "arcane", behavior = "storm", isUnion = true,
    icon = "Interface\\Icons\\Spell_Arcane_StarFire",
    cooldown = 1.05, damage = 20, strikes = 7, stormRadius = 270, splash = 72, radius = 12,
    description = "Sun and moon rain from the heavens without end.",
}
WS.Weapons.union_fel = {
    name = "Fel Annihilation", school = "shadow", behavior = "aimed", isUnion = true,
    icon = "Interface\\Icons\\Ability_Warlock_ChaosBolt",
    cooldown = 0.9, damage = 28, speed = 470, projectiles = 2, pierce = 4, range = 620,
    splash = 82, homing = true, life = 2.6, radius = 12,
    description = "Fel chaos that devours everything in its path.",
}
WS.Weapons.union_steel = {
    name = "Storm of Steel", school = "physical", behavior = "ring", isUnion = true,
    icon = "Interface\\Icons\\Ability_Warrior_PunishingBlow",
    projIcon = "Interface\\Icons\\INV_ThrowingKnife_02",
    cooldown = 0.85, damage = 18, speed = 440, projectiles = 12, pierce = 3, life = 1.1, radius = 9,
    description = "An unending cyclone of thrown steel.",
}
WS.Weapons.union_sanctuary = {
    name = "Sanctuary", school = "holy", behavior = "nova", isUnion = true,
    icon = "Interface\\Icons\\Spell_Holy_AuraOfLight",
    cooldown = 1.8, damage = 26, radius = 205, expandTime = 0.4, knockback = 34,
    description = "The Light claims this ground as its own.",
}

WS.Weapons.union_thunderfury = {
    name = "Thunderfury", school = "nature", behavior = "orbit", isUnion = true,
    icon = "Interface\\Icons\\INV_Sword_39",
    cooldown = 4.60, damage = 26, projectiles = 6, orbitRadius = 95, orbitSpeed = 5.0,
    duration = 4.0, radius = 22, procChain = 0.35, color = { 0.45, 0.85, 1.00 },
    description = "Blessed blade of the Windseeker: a cyclone of steel that answers every cut with lightning.",
}

-- Union recipes: both source weapons at max rank merge into `result`, freeing
-- a weapon slot (two removed, one added).
WS.Unions = {
    { result = "union_astral",     from = { "arcane_missiles", "moonfire" } },
    { result = "union_fel",        from = { "fireball", "shadow_bolt" } },
    { result = "union_steel",      from = { "fan_of_knives", "multishot" } },
    { result = "union_sanctuary",  from = { "holy_nova", "consecration" } },
    -- The Windseeker's Legacy discovery, made permanent: blades that call the storm.
    { result = "union_thunderfury", from = { "whirlwind", "chain_lightning" } },
}

WS.WEAPON_MAX_LEVEL = 8
WS.MAX_WEAPONS = 6
