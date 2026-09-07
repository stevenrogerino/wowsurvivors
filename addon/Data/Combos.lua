local _, WS = ...

-- Secret weapon-weapon synergies ("Discoveries"). The moment a survivor
-- carries both weapons, the discovery activates for that run with a toast,
-- and is permanently recorded in the codex (Achievements panel), where
-- undiscovered entries show only a cryptic hint.
--
-- Bonuses are deliberately modest: evolutions (weapon + passive) remain the
-- big power spikes; discoveries are flavor, texture, and a reason to try
-- weapon pairs you otherwise would not.
--
-- `apply(w1, w2, c)` mutates the two weapon instances' `mods` tables, which
-- Weapon.lua consults when deriving stats. Each discovery's magnitudes live as
-- named fields on the combo table (`c`), so the Tuning bench can retune them
-- via WS.Tuning.combos (see Tuning.lua).
WS.Combos = {
    frostfire = {
        name = "Frostfire Bolt",
        weapons = { "frostbolt", "fireball" },
        description = "Fireballs chill whatever survives them, and both bolts hit 10% harder.",
        hint = "When frost meets flame, something ancient stirs...",
        dmgMult = 1.10, slowFactor = 0.60, slowDuration = 1.5,
        apply = function(w1, w2, c)
            w1.mods.damageMult = (w1.mods.damageMult or 1) * c.dmgMult
            w2.mods.damageMult = (w2.mods.damageMult or 1) * c.dmgMult
            w2.mods.slowFactor, w2.mods.slowDuration = c.slowFactor, c.slowDuration
        end,
    },
    shadowflame = {
        name = "Shadowflame",
        weapons = { "shadow_bolt", "fireball" },
        description = "Shadow Bolts detonate on impact, scorching everything nearby.",
        hint = "Shadow and flame were ever entwined.",
        splash = 55,
        apply = function(w1, w2, c)
            w1.mods.splash = c.splash
        end,
    },
    deadly_brew = {
        name = "Deadly Brew",
        weapons = { "fan_of_knives", "frostbolt" },
        description = "Every thrown knife is coated in a numbing venom that slows its victim.",
        hint = "A rogue with access to the alchemist's icebox is a dangerous thing.",
        slowFactor = 0.65, slowDuration = 1.2,
        apply = function(w1, w2, c)
            w1.mods.slowFactor, w1.mods.slowDuration = c.slowFactor, c.slowDuration
        end,
    },
    windseeker = {
        name = "Windseeker's Legacy",
        weapons = { "whirlwind", "chain_lightning" },
        description = "Whirlwind blades sometimes call the storm, loosing chain lightning on those they strike.",
        hint = "Blessed blades may yet seek the wind...",
        procChain = 0.15,
        apply = function(w1, w2, c)
            w1.mods.procChain = c.procChain
        end,
    },
    divine_storm = {
        name = "Divine Storm",
        weapons = { "whirlwind", "holy_nova" },
        description = "Every whirlwind begins with a pulse of holy Light.",
        hint = "Steel spun in faith becomes something more.",
        apply = function(w1, w2, c)
            w1.mods.novaOnCast = true
        end,
    },
    windrunner = {
        name = "Windrunner's Guile",
        weapons = { "multishot", "arcane_missiles" },
        description = "Enchanted arrows curve in flight to seek their prey.",
        hint = "The finest rangers fletch their arrows with a whisper of magic.",
        apply = function(w1, w2, c)
            w1.mods.homing = true
        end,
    },
    celestial = {
        name = "Celestial Alignment",
        weapons = { "moonfire", "holy_nova" },
        description = "Sun and moon align: an extra moonbeam, and wider rings of Light.",
        hint = "What happens when the moon rises on the light of dawn?",
        extraProjectiles = 1, areaMult = 1.12,
        apply = function(w1, w2, c)
            w1.mods.extraProjectiles = (w1.mods.extraProjectiles or 0) + c.extraProjectiles
            w2.mods.areaMult = (w2.mods.areaMult or 1) * c.areaMult
        end,
    },
    seal_command = {
        name = "Seal of Command",
        weapons = { "avengers_shield", "consecration" },
        description = "The shield judges from hallowed ground: +1 ricochet and 10% more damage.",
        hint = "A shield thrown from sacred ground carries a verdict.",
        extraBounces = 1, dmgMult = 1.10,
        apply = function(w1, w2, c)
            w1.mods.extraBounces = (w1.mods.extraBounces or 0) + c.extraBounces
            w1.mods.damageMult = (w1.mods.damageMult or 1) * c.dmgMult
        end,
    },
    defile = {
        name = "Defile",
        weapons = { "holy_nova", "consecration" },
        description = "Both hallowed rites mend you for {healBonus} more - even unevolved. What your wounds cannot drink, rots.",
        hint = "Two holy rites in one vessel. The Light has to go somewhere...",
        healBonus = 2,
        apply = function(w1, w2, c)
            w1.mods.healBonus = (w1.mods.healBonus or 0) + c.healBonus
            w2.mods.healBonus = (w2.mods.healBonus or 0) + c.healBonus
        end,
    },
}

WS.ComboOrder = {
    "frostfire", "shadowflame", "deadly_brew", "windseeker",
    "divine_storm", "windrunner", "celestial", "seal_command", "defile",
}
