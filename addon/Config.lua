local _, WS = ...

-- Static configuration. Anything the player can change at runtime belongs in
-- defaultSettings (persisted per account); anything structural stays here.
WS.Config = {
    startCharacter = "mage",
    startMap = "elwynn",

    -- Base run resources before Trainer (meta) upgrades are applied.
    baseRerolls = 1,
    baseBanishes = 1,

    -- XP-to-next-level curve (see Player.XPForLevel):
    --   base + linear*(L-1) + quad*(L-1)^2, plus a steep tail past `steepFrom`.
    xpBase = 14, xpLinear = 9, xpQuad = 1.35, xpSteepFrom = 40, xpSteepMag = 8,

    -- Drop tuning (chances are further multiplied by player luck). Kept low
    -- on purpose so Fortune/luck bonuses feel meaningful. Overridable live
    -- from the Tuning page (see Tuning.lua).
    dropChanceGold   = 0.010,
    dropChancePotion = 0.0035,
    dropChanceBomb   = 0.0018,
    dropChanceStone  = 0.0018,
    dropChanceHourglass = 0.0012, -- freezes time for 8 seconds

    -- Pickup magnitudes.
    potionHealPct   = 0.30,  -- health potion / cache heal (fraction of max HP)
    hourglassFreeze = 8,     -- seconds the Bronze Hourglass halts the horde
    bombKillsBosses = false, -- bombs never one-shot bosses

    -- Enemy melee attack cadence: seconds between contact hits (also how often a
    -- swing can trigger Thorns). Lower = the horde swings faster.
    contactCooldownBoss   = 0.5,
    contactCooldownNormal = 0.8,

    -- Player base combat before any class/passive bonuses.
    baseCritChance = 0.05,
    baseCritDamage = 1.5,

    -- Invulnerability windows (i-frames), in seconds. `hitInvulnerable` is the
    -- classic post-hit mercy window (as in Vampire Survivors); `dodgeInvulnerable`
    -- follows an Evasion dodge. Bigger = harder to get chain-hit.
    hitInvulnerable   = 0.45,
    dodgeInvulnerable = 0.2,

    -- Divine Bulwark: seconds to recharge the block, by rank (1/2/3).
    blockInterval1 = 30,
    blockInterval2 = 22,
    blockInterval3 = 15,

    -- How far a homing projectile will look to re-acquire a new target after
    -- piercing (Arcane Missiles loop through the crowd).
    homingReacquireRange = 520,

    -- Wave difficulty pacing. Ambient enemies inflate by (1 + time/enemyScaleTime)
    -- and bosses by (1 + time/bossScaleTime) over the run; hyper mode multiplies
    -- both. Bigger scale-time = a gentler ramp.
    enemyScaleTime = 210,
    bossScaleTime  = 500,
    hyperScale     = 1.4,

    -- Endless (post-30:00 / true-endless) escalation. Respawned bosses come from
    -- the tougher half of the roster and are boosted by endlessBossMult (so the
    -- first is harder than the last scheduled boss), then climb via endlessRampTime.
    -- Their cadence starts at endlessBossInterval and accelerates toward
    -- endlessBossMinInterval. Ambient enemies also ramp faster (endlessEnemyRampTime).
    endlessBossInterval    = 75,   -- seconds between respawns at the start of endless
    endlessBossMinInterval = 30,   -- floor the cadence accelerates toward
    endlessBossAccel       = 18,   -- larger = the cadence tightens more slowly
    endlessBossMult        = 1.25, -- flat strength boost on every endless respawn
    endlessRampTime        = 240,  -- respawn strength doubles roughly every this many seconds of overtime
    endlessEventInterval   = 90,   -- seconds between endless swarm events
    endlessEnemyRampTime   = 300,  -- ambient-enemy strength doubles per this many seconds of overtime

    -- Spawn schedule. Boss arrival times (shared by every map; the map only
    -- picks WHICH boss). Ambient-spawn multipliers scale how dense/often the
    -- horde pours in, on top of each map's phases and the difficulty interval.
    -- Death arrives at deathTime and returns every deathInterval seconds.
    bossTimes         = { 300, 630, 960, 1320, 1620 },
    spawnIntervalMult = 1.0,  -- <1 = more frequent ambient spawns
    spawnCountMult    = 1.0,  -- >1 = more enemies per spawn
    eventTimeMult     = 1.0,  -- scales scripted swarm-event arrival times
    deathTime         = 1800, -- 30:00: Victory banked + Death arrives
    deathInterval     = 60,   -- seconds between Death waves after that

    -- Defensive-passive aura magnitudes (per rank). These are the numbers the
    -- rank-scaling auras add on top of their base; exposed here so they can be
    -- retuned live from the Tuning bench.
    thornsFlat        = 10,    -- flat reflect damage per Thorns rank
    thornsDamagePct   = 0.40,  -- + this fraction of the attacker's damage, per rank
    retributionBase   = 5,     -- Retribution Aura base tick damage
    retributionPerRank= 4,     -- + per rank
    retributionRange  = 60,    -- base reach (yards)
    retributionRangePerRank = 20,
    retributionTick   = 0.5,   -- seconds between sears
    chillRangeBase    = 70,    -- Chilling Presence base reach
    chillRangePerRank = 18,
    chillSlowPerRank  = 0.10,  -- movement slow fraction per rank

    -- Armor is a DIMINISHING damage reduction (never reaches 100%): each hit is
    -- multiplied by 1 - armor/(armor + armorConstant). Lower K = each armor point
    -- is worth more. At K=30: +5 armor cuts ~14%, +10 ~25%, +20 ~40%.
    armorConstant     = 30,

    -- DESECRATION: healing that curdles into shadow damage (Blood Rite blessing,
    -- the Desecration passive, and the Death Knight innately). Two layers:
    -- overheal that WOULD be thrown away converts at `desecrationOverheal`, and a
    -- smaller share of healing that actually landed converts at `desecrationShare`.
    -- Damage is pooled and released as one pulse every `desecrationInterval`, so a
    -- per-tick regen trickle never spams the damage system.
    desecrationOverheal    = 1.00, -- fraction of WASTED overheal turned into damage
    desecrationShare       = 0.25, -- fraction of healing that LANDED that also lashes out
    desecrationPerRank     = 0.15, -- + share per rank of the Desecration passive
    desecrationCoefficient = 1.00, -- healing point -> damage point (global dial)
    desecrationRadius      = 110,  -- pulse reach in yards (scales with effect area)
    desecrationInterval    = 0.50, -- seconds between desecration pulses
    runebladeThreshold     = 4000, -- desecration damage in ONE run to summon the runeblade

    -- FEL / METAMORPHOSIS: the Demon Hunter's mirror of Desecration. Damage dealt
    -- PAST what was needed to kill (overkill) is normally discarded; here it feeds
    -- a fel meter, and filling it triggers a short, explosive Metamorphosis.
    -- Uptime is deliberately hard to sustain: the bar is expensive, spends in full,
    -- and charges at metaFelRate while you're already transformed. A maxed fel
    -- build (Soul Rending 5 + Illidari Pact = 2.55x gain) can chain it forever;
    -- anything less gets it as a periodic burst. In exchange the form hits HARD.
    felPerOverkill    = 1.00, -- fel gained per point of wasted overkill damage
    felPerRank        = 0.25, -- +fel gain per rank of the Soul Rending passive
    felToMeta         = 3500, -- fel needed to trigger Metamorphosis (spent in full)
    metaFelRate       = 0.35, -- fel gain x WHILE transformed (the uptime brake)
    metaDuration      = 8.0,  -- seconds a Metamorphosis lasts
    metaDamageMult    = 2.20, -- weapon damage x while transformed
    metaCooldownMult  = 0.60, -- weapon cooldown x while transformed (lower = faster)
    metaDurationPerRank = 1.0, -- +seconds of Metamorphosis per Soul Rending rank
    metaAnimation     = 37,   -- flourish pose on transform (tune if it looks wrong)
    metaAnimTime      = 0.9,  -- seconds the flourish holds before run/stand resumes
    warglaiveMetas    = 3,    -- Metamorphoses in ONE run to summon the warglaives
    -- The demon you actually become. The survivor's PlayerModel is swapped to this
    -- creature display for the duration, then restored. Display IDs are notoriously
    -- easy to get wrong - preview any candidate live with "/survivors demon <id>",
    -- and set this to 0 to skip the model swap and keep the aura-only effect.
    metaDisplayId     = 21135, -- Illidan-style demon form
    metaModelScale    = 1.50,  -- how much LARGER the demon looks (1.5 = half again)
    metaModelWidth    = 1.50,  -- extra WIDTH only, so sideways wings aren't clipped
    -- The demon is a FLOURISH, not a costume: it erupts, holds a beat, fades out,
    -- and gives the body back. The empowerment itself runs for the full metaDuration
    -- without it - the fel corona is what tells you you're still buffed.
    metaFormTime      = 1.20,  -- seconds the demon model is visible
    metaFormFade      = 0.45,  -- of that, seconds spent fading away

    -- Limit Break (endless-only maxed-build boon): permanent weapon damage.
    -- Its tooltip is editable; a "%d" in the description is filled with the
    -- current +% (limitBreakDamage x100) so the number stays in sync.
    limitBreakDamage = 0.08,
    limitBreakName = "Limit Break",
    limitBreakDesc = "Break past your limits: +%d%% weapon damage, forever.",

    -- In-run Egg Merchant: a vendor arrives on a fixed cadence to sell eggs
    -- that last only for the current run (the permanent Trainer egg caps at
    -- 100). "Buy All" spends every coin the survivor is carrying.
    eggVendorInterval = 420,   -- seconds between merchant visits (7 minutes)
    eggVendorCost     = 100,   -- run gold per egg
    eggRunDamage      = 0.001, -- +0.1% weapon damage per run-egg
    eggRunHealth      = 1,     -- +1 max health per run-egg

    -- Weapon rank & evolution scaling. Every carried weapon grows with rank,
    -- and once evolved gets a further boost; these are the shared curves used by
    -- Weapon.lua for ALL weapons (incl. unions), so tuning one number here
    -- reshapes every weapon's rank/evolution power at once.
    rankDamageStep     = 0.20,  -- +this fraction of base damage per rank
    rankAreaStep       = 0.04,  -- +effect area per rank
    rankRadiusStep     = 0.05,  -- +projectile radius per rank
    rankDurationStep   = 0.06,  -- +zone/orbit duration per rank
    projRankA          = 4,     -- weapon gains +1 projectile at this rank
    projRankB          = 7,     -- ...and another at this rank
    evolveDamageMult   = 1.5,   -- evolved weapons deal this x their damage
    evolveProjectiles  = 2,     -- evolved weapons fire this many extra
    evolveCooldownMult = 0.85,  -- evolved weapons fire this x as often (faster)
    evolveAreaMult     = 1.25,  -- evolved weapons hit this x the area
    evolveRadiusMult   = 1.3,   -- evolved projectiles are this x bigger
    evolvePierce       = 2,     -- evolved bolts pierce this many more foes
    evolveOrbitBlades  = 4,     -- Whirlwind->Bladestorm packs this many more blades
    evolveOrbitSpeed   = 1.25,  -- ...and spins this x faster

    -- Global difficulty presets (cycled on the main menu, persisted).
    difficulties = {
        beginner     = { label = "Beginner", scale = 0.75, gold = 0.85, interval = 1.1 },
        veteran      = { label = "Veteran", scale = 1.0, gold = 1.0, interval = 1.0 },
        professional = { label = "Professional", scale = 1.3, gold = 1.25, interval = 0.85 },
    },
    difficultyOrder = { "beginner", "veteran", "professional" },

    defaultSettings = {
        sound = true,
        soundPickups = true,  -- gem/coin/chest/potion ticks
        soundAlerts = true,   -- raid-warning horns (bosses, sappers, events)
        effectsVolume = 1.0,  -- 0..1, drives the borrowed Dialog channel
        music = true,
        musicVolume = 0.7,    -- 0..1, drives the borrowed Ambience channel
        screenShake = true,
        damageNumbers = true,
        healNumbers = true,     -- floating +heal numbers over the survivor
        hideFodderBars = false, -- hide health bars on trash mobs (perf; elites/bosses keep theirs)
        combatPause = true,     -- hide + pause the game if real combat starts
        pauseReadyCheck = false,-- also step away when a ready check starts
        pauseWhisper = false,   -- also step away when you receive a whisper
        levelUpTooltips = true, -- rich hover details on level-up cards
        charm = false,          -- auto-pick the first offered boon (Charm)
        autoLimitBreak = false, -- once the build is complete, auto-take Limit Break
        autoEmote = true,       -- once per session, /me is playing WoW Survivors
        minimapButton = true,
        minimapAngle = 225,
        difficulty = "veteran",
        debug = false,
    },
}
