local _, WS = ...

-- All audio comes from Blizzard sound kits, so nothing external is required.
-- Every entry is defensive: a missing SOUNDKIT constant falls back to a
-- well-known classic kit ID, or to silence, never to an error.
WS.Audio = {}
local Audio = WS.Audio

local soundKit = SOUNDKIT or {}

local sounds = {
    -- UI
    click   = soundKit.IG_MAINMENU_OPTION_CHECKBOX_ON or 856,
    open    = soundKit.IG_MAINMENU_OPEN or 850,
    close   = soundKit.IG_MAINMENU_CLOSE or 851,
    banish  = soundKit.IG_MAINMENU_OPTION_CHECKBOX_OFF or 857,

    -- Run flow
    start   = soundKit.READY_CHECK or 8960,
    level   = 888, -- the classic "ding" level-up fanfare
    death   = soundKit.IG_QUEST_FAILED or 846,
    victory = soundKit.UI_LEGENDARY_LOOT_TOAST or 888,

    -- Pickups
    gem     = soundKit.IG_MAINMENU_OPTION_CHECKBOX_ON or 856,
    coin    = soundKit.LOOT_WINDOW_COIN_SOUND or 120,
    chest   = soundKit.LOOT_WINDOW_COIN_SOUND or 120,

    -- Combat drama
    boss    = soundKit.RAID_WARNING or 8959,
    bossdie = soundKit.UI_RAID_LOOT_TOAST_LESSER_ITEM_WON or 888,
    freeze  = soundKit.RAID_WARNING or 8959, -- the old bomb alert, for time-stop
    evolve  = soundKit.UI_LEGENDARY_LOOT_TOAST or 12891,
    toast   = soundKit.UI_70_ARTIFACT_FORGE_TRAIT_RANK_UP or 12891,
}

-- Sounds played from a specific file (FileDataID) rather than a SOUNDKIT id.
-- These are short, punchy Blizzard effect files - a quick brew sip and a
-- fiery explosion - chosen to be less obnoxious than the UI kits.
local soundFiles = {
    potion = 612294, -- sound/spells/spell_mk_brew_drink01.ogg (a solid gulp)
    bomb   = 568717, -- sound/spells/halion_fiery_explosion.ogg
}

-- Minimum seconds between repeats of spammy sounds (gem pickups mostly).
local throttle = { gem = 0.15, coin = 0.10, potion = 0.2 }
local lastPlayed = {}

-- Optional categories with their own Settings toggles, so the frequent
-- little noises can be silenced without muting the whole game.
local categories = {
    gem = "soundPickups", coin = "soundPickups", chest = "soundPickups", potion = "soundPickups",
    boss = "soundAlerts", bomb = "soundAlerts", freeze = "soundAlerts",
}

------------------------------------------------------------------------------
-- Volume: WoW gives addons no per-sound volume API, so while the game window
-- is open we borrow two rarely-used sound channels - Dialog for our effects
-- and Ambience for our music - and drive their volume CVars from the sliders
-- in Settings. The player's original channel volumes are saved on open and
-- restored on close, so nothing leaks into the rest of the game.
------------------------------------------------------------------------------

local BORROWED_CVARS = {
    "Sound_EnableDialog", "Sound_DialogVolume",
    "Sound_EnableAmbience", "Sound_AmbienceVolume",
}

function Audio:ApplyVolumes()
    if not (GetCVar and SetCVar) then return end
    if not self.savedCVars then
        self.savedCVars = {}
        for _, cvar in ipairs(BORROWED_CVARS) do
            self.savedCVars[cvar] = GetCVar(cvar)
        end
    end
    local settings = WoWSurvivorsDB.settings
    SetCVar("Sound_EnableDialog", "1")
    SetCVar("Sound_DialogVolume", tostring(settings.effectsVolume or 1))
    SetCVar("Sound_EnableAmbience", "1")
    SetCVar("Sound_AmbienceVolume", tostring(settings.musicVolume or 0.7))
end

function Audio:RestoreVolumes()
    if not (self.savedCVars and SetCVar) then return end
    for cvar, value in pairs(self.savedCVars) do
        SetCVar(cvar, value)
    end
    self.savedCVars = nil
end

local function EffectsAudible(settings)
    return settings.sound and (settings.effectsVolume or 1) > 0.01
end

function Audio:Play(name)
    local settings = WoWSurvivorsDB and WoWSurvivorsDB.settings
    if not settings or not EffectsAudible(settings) then return end
    local category = categories[name]
    if category and settings[category] == false then return end
    local gap = throttle[name]
    if gap then
        local now = GetTime()
        if lastPlayed[name] and now - lastPlayed[name] < gap then return end
        lastPlayed[name] = now
    end
    -- Dialog channel while the game is open (slider-controlled), SFX otherwise.
    local channel = self.savedCVars and "Dialog" or "SFX"
    local file = soundFiles[name]
    if file then
        PlaySoundFile(file, channel)
        return
    end
    local kit = sounds[name]
    if kit then PlaySound(kit, channel) end
end

-- Plays a specific sound file (FileDataID) - used for creature voice lines
-- like boss aggro barks. Gated behind the alert-sound setting.
function Audio:PlayVoice(fileId)
    local settings = WoWSurvivorsDB and WoWSurvivorsDB.settings
    if not settings or not EffectsAudible(settings) or settings.soundAlerts == false then return end
    if fileId then PlaySoundFile(fileId, self.savedCVars and "Dialog" or "SFX") end
end

------------------------------------------------------------------------------
-- Music: actual zone scores by FileDataID (see Data\Maps.lua). Tracks are a
-- few minutes long, so Update() rotates to another random track from the
-- current playlist on a timer. Hiding the game pauses; showing resumes.
------------------------------------------------------------------------------

local TRACK_ROTATION = 150 -- seconds between (re)triggers

function Audio:PlayMusicFiles(files)
    self:StopMusic()
    self.playlist = files
    self:PlayNextTrack()
end

function Audio:PlayNextTrack()
    local settings = WoWSurvivorsDB and WoWSurvivorsDB.settings
    if not (settings and settings.music and (settings.musicVolume or 0.7) > 0.01) then return end
    local files = self.playlist
    if not files or #files == 0 then return end
    if self.musicHandle then StopSound(self.musicHandle) end
    -- Ambience channel: slider-controlled while the game is open.
    local willPlay, handle = PlaySoundFile(files[WS.random(1, #files)], self.savedCVars and "Ambience" or "Master")
    if willPlay then self.musicHandle = handle end
    self.musicTimer = TRACK_ROTATION
end

-- Driven every frame from Game:Update; only ticks while the game is visible.
function Audio:Update(elapsed)
    if not self.musicTimer or not WS.UI.root:IsShown() then return end
    self.musicTimer = self.musicTimer - elapsed
    if self.musicTimer <= 0 then
        self:PlayNextTrack()
    end
end

-- Silence when the window hides, but remember the playlist for resume.
function Audio:PauseMusic()
    if self.musicHandle then
        StopSound(self.musicHandle)
        self.musicHandle = nil
    end
end

function Audio:ResumeMusic()
    if self.playlist and not self.musicHandle then
        self:PlayNextTrack()
    end
end

function Audio:StopMusic()
    self:PauseMusic()
    self.playlist = nil
    self.musicTimer = nil
end
