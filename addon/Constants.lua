local _, WS = ...

-- Fixed simulation and rendering constants. Gameplay data lives in Data\*,
-- user preferences in Config.lua / SavedVariables.
WS.Constants = {
    -- Simulation runs on a fixed 30 Hz tick with a catch-up cap so a frame
    -- hitch never turns into a death spiral of simulation ticks.
    TICK_RATE = 1 / 30,
    MAX_TICKS_PER_FRAME = 5,

    -- Global balance knobs. The survivor's weapons are scaled down ~9%
    -- (damage + projectile speed down, cast time up) while every enemy is
    -- ~8% stronger. Weapons flagged `noNerf` (Multi-Shot) are exempt.
    PLAYER_DAMAGE_SCALE = 0.91,
    PLAYER_SPEED_SCALE = 0.91,
    PLAYER_COOLDOWN_SCALE = 1.099, -- ~1/0.91: casts take 9% longer
    ENEMY_SCALE = 1.08,

    -- The playfield is a fixed-size world; UI.lua scales it to fit the screen
    -- with letterboxing so gameplay is identical at every resolution.
    WORLD_WIDTH = 1280,
    WORLD_HEIGHT = 720,

    -- Hard entity caps. Pools warm up to a fraction of these and never exceed
    -- them, which bounds both memory and per-tick work.
    MAX_ENEMIES = 300,
    MAX_PROJECTILES = 420,
    MAX_GEMS = 240,
    MAX_PICKUPS = 40,
    MAX_FLOATING_TEXT = 48,
    MAX_PROPS = 20,

    PLAYER_RADIUS = 18,

    -- Spell-school palette, loosely matched to Blizzard's own school colors.
    COLORS = {
        physical = { 0.90, 0.80, 0.60 },
        arcane   = { 0.55, 0.45, 1.00 },
        fire     = { 1.00, 0.45, 0.10 },
        frost    = { 0.35, 0.75, 1.00 },
        nature   = { 0.35, 0.85, 0.35 },
        holy     = { 1.00, 0.88, 0.35 },
        shadow   = { 0.70, 0.30, 0.95 },

        enemy    = { 1.00, 0.30, 0.25 },
        elite    = { 1.00, 0.70, 0.10 },
        boss     = { 0.90, 0.20, 0.90 },
        gold     = { 1.00, 0.82, 0.10 },
        heal     = { 0.25, 0.90, 0.30 },

        -- XP gem tiers, colored like item qualities.
        gemLow   = { 0.30, 0.95, 0.40 },
        gemMid   = { 0.25, 0.55, 1.00 },
        gemHigh  = { 0.75, 0.35, 1.00 },
    },

    -- Warcraft-styled text colors used across the UI.
    TEXT_GOLD   = { 1.00, 0.82, 0.10 },
    TEXT_WHITE  = { 0.95, 0.95, 0.95 },
    TEXT_GREY   = { 0.76, 0.76, 0.80 },
    TEXT_GREEN  = { 0.10, 1.00, 0.10 },
    TEXT_RED    = { 0.90, 0.15, 0.15 },
    TEXT_PARCH  = { 0.92, 0.86, 0.70 },
}
