local _, WS = ...

-- Run orchestration: the fixed-timestep loop, input routing, level-up flow,
-- gold, announcements, and run start/end. Loaded last; every other system is
-- available by the time anything here executes.
WS.Game = {
    running = false,
    paused = false,
    leveling = false,
    merchanting = false, -- the in-run Egg Merchant panel is open
    accumulator = 0,
    keys = {},
    pendingLevelUps = 0,
}
local Game = WS.Game

function Game:Initialize()
    self.selectedCharacter = WoWSurvivorsDB.lastCharacter or WS.Config.startCharacter
    self.selectedMap = WoWSurvivorsDB.lastMap or WS.Config.startMap
    if not WoWSurvivorsDB.unlocks.characters[self.selectedCharacter] then
        self.selectedCharacter = WS.Config.startCharacter
    end
    if not WoWSurvivorsDB.unlocks.maps[self.selectedMap] then
        self.selectedMap = WS.Config.startMap
    end

    WS.Enemy:Initialize()
    WS.Projectile:Initialize()
    WS.XP:Initialize()
    WS.Pickup:Initialize()
    WS.Familiar:Initialize()

    -- Any achievements satisfied by legacy statistics fire on login.
    WS.Achievements:Check()

    self.driver = CreateFrame("Frame")
    self.driver:SetScript("OnUpdate", function(_, elapsed) self:Update(elapsed) end)
end

------------------------------------------------------------------------------
-- Run lifecycle
------------------------------------------------------------------------------

function Game:StartRun()
    if self.running then self:EndRun("abandoned", true) end
    local characterId, mapId = self.selectedCharacter, self.selectedMap
    if not WoWSurvivorsDB.unlocks.characters[characterId] or not WoWSurvivorsDB.unlocks.maps[mapId] then
        return
    end

    -- Announce to the world, once per session, that you're playing (toggle in
    -- Settings). Not repeated on every retry, so it never spams chat.
    -- NB: this MUST go through C_ChatInfo.SendChatMessage. The bare global is now
    -- Blizzard's deprecated shim, and routing through it raised
    -- ADDON_ACTION_BLOCKED on every run start. Reaching StartRun from the Begin
    -- Survival click gives us the hardware event chat requires; pcall keeps a
    -- future API change from ever breaking the run itself.
    if WoWSurvivorsDB.settings.autoEmote and not self.emotedThisSession then
        self.emotedThisSession = true
        local send = C_ChatInfo and C_ChatInfo.SendChatMessage
        if send then pcall(send, "is playing WoW Survivors", "EMOTE") end
    end

    self:ClearEntities()
    self.keys = {}
    self.accumulator, self.pendingLevelUps = 0, 0
    self.paused, self.leveling, self.merchanting = false, false, false
    self.autoLimitBreak = false -- per-run convenience; never carries across games
    self.achieveTimer = 1.0
    self.arenaBounds = nil -- only the Boss Arena bounds the survivor

    self.map = WS.Maps[mapId]
    local hyper = (self.hyperSelected and WoWSurvivorsDB.unlocks.hyper[mapId]) and true or false

    -- Global difficulty preset (Beginner / Veteran / Professional).
    local preset = WS.Config.difficulties[WoWSurvivorsDB.settings.difficulty] or WS.Config.difficulties.veteran
    -- Optional run modifiers.
    local hurry = self.hurrySelected and true or false
    local inverse = self.inverseSelected and true or false
    -- Endless from the start: skips the 30:00 Death finale, escalates bosses
    -- forever, and puts Limit Break on the level-up table immediately.
    local endless = self.endlessSelected and true or false

    self.run = {
        characterId = characterId, mapId = mapId,
        time = 0, kills = 0, damageDone = 0, damageByWeapon = {}, gemsCollected = 0,
        healingDone = 0, healingBySource = {}, hps = 0,
        damageTaken = 0, damagePrevented = 0, -- mitigation tally (armor + dodge + block)
        metamorphoses = 0,  -- Metamorphosis triggers this run (summons the warglaives)
        bossesSlain = 0, deathsSlain = 0, level = 1, gold = 0, noHitStreak = 0, dps = 0,
        mode = endless and "endless" or "normal", -- "endless" skips Death at 30:00 and escalates bosses
        startedEndless = endless, -- chose Endless at the start (vs auto-flip after the 30:00 win)
        hyper = hyper, hurry = hurry, inverse = inverse,
        difficulty = WoWSurvivorsDB.settings.difficulty,
        diffScale = preset.scale * (inverse and 1.4 or 1),
        diffInterval = preset.interval,
        goldMult = self.map.goldMult * preset.gold * (hyper and 1.5 or 1) * (inverse and 1.25 or 1),
        merchantTimer = WS.Config.eggVendorInterval or 420,
        runEggs = 0,
    }
    -- Rolling 10-second DPS window, sampled once per second.
    self.dpsSamples = {}
    self.dpsIndex = 0
    self.dpsTimer = 1.0
    self.dpsLastTotal = 0
    -- Rolling 10-second HPS window (healing per second), sampled the same way.
    self.hpsSamples = {}
    self.hpsIndex = 0
    self.hpsTimer = 1.0
    self.hpsLastTotal = 0
    self.player = WS.Player:Create(characterId)
    WS.WaveManager:Reset(self.map)

    self.running = true
    WS.UI.root:Show()
    WS.UI:ShowGameplay(self.map)
    WS.UI:RefreshWeaponStrip(self.player)
    WS.UI:UpdateHUD(self.player, self.run)
    local tags = ""
    if hyper then tags = tags .. "  (HYPER)" end
    if hurry then tags = tags .. "  (HURRY)" end
    if inverse then tags = tags .. "  (INVERSE)" end
    if endless then tags = tags .. "  (ENDLESS)" end
    self:Announce(self.map.name .. tags, self.map.subtitle, 3.5)

    if self.map.arena then
        -- Boss Arena: no blessings, no level-ups - the survivor arrives fully
        -- kitted and the scripted fight begins immediately.
        WS.Player:GrantArenaLoadout(self.player)
        WS.UI:UpdateHUD(self.player, self.run)
        WS.BossArena:Start()
    else
        -- A blessing is chosen before the first wave, then any Veteran's
        -- Instincts (Trainer) free boons.
        self.blessingPending = true
        self.pendingLevelUps = self.pendingLevelUps + (self.player.startLevelUps or 0)
        self:OpenLevelUp()
    end

    WS.Audio:Play("start")
    WS.Audio.context = mapId
    WS.Audio:PlayMusicFiles(self.map.music)
end

function Game:ClearEntities()
    WS.Enemy:Clear()
    WS.Projectile:Clear()
    WS.XP:Clear()
    WS.Pickup:Clear()
    WS.Familiar:Clear()
    WS.FloatingText:Clear()
    if self.player then WS.Player:Destroy(self.player) end
    self.player = nil
end

-- Surviving to the thirty-minute bell IS the Victory (VS-style): banked with no
-- prompt or pause, then Death arrives and the run plays on as an endless final
-- stand. This is the sole win path; the Game:Victory panel flow below is kept
-- for a possible future "final boss" map but is currently unused (no boss sets
-- `final = true`).
function Game:SurviveVictory()
    if self.run.victorious then return end
    self.run.victorious = true
    self.run.mode = "endless" -- unlock Limit Break + accelerate the endless cadence
    WoWSurvivorsDB.statistics.totalVictories = WoWSurvivorsDB.statistics.totalVictories + 1
    if not WoWSurvivorsDB.unlocks.hyper[self.run.mapId] then
        WoWSurvivorsDB.unlocks.hyper[self.run.mapId] = true
        WS.UI:Toast(self.map.icon, "Hyper Mode Unlocked!", self.map.name)
    end
    WS.Achievements:Check()
    WS.Audio:Play("victory")
    self:Announce("YOU SURVIVED!", "The stage is yours. Now Death comes to claim its due.", 4.5)
    WS.UI:Shake(8, 0.6)
end

-- The final boss is down. Victory is banked immediately (stats, unlocks,
-- achievements), then the survivor chooses: claim it, or fight on into the
-- endless dark where bosses keep escalating forever. (Currently unused - see
-- SurviveVictory; retained for future final-boss maps.)
function Game:Victory()
    if self.run.victorious then return end
    self.run.victorious = true
    WoWSurvivorsDB.statistics.totalVictories = WoWSurvivorsDB.statistics.totalVictories + 1
    if not WoWSurvivorsDB.unlocks.hyper[self.run.mapId] then
        WoWSurvivorsDB.unlocks.hyper[self.run.mapId] = true
        WS.UI:Toast(self.map.icon, "Hyper Mode Unlocked!", self.map.name)
    end
    WS.Achievements:Check()
    WS.Audio:Play("victory")
    self.paused = true
    self.keys = {}
    self.accumulator = 0
    WS.UI:ShowVictoryChoice(self.run)
end

function Game:ClaimVictory()
    WS.UI.victoryPanel:Hide()
    self:EndRun("victory")
end

-- mode "normal": the timeline continues and Death arrives at 30:00.
-- mode "endless": no Death, ever-accelerating boss spawns, no end.
function Game:FightOn(mode)
    WS.UI.victoryPanel:Hide()
    self.run.mode = mode or "normal"
    self.paused = false
    if self.run.mode == "endless" then
        self:Announce("No end. No mercy.", "The horde will never stop coming.", 3.5)
    else
        self:Announce("The fight goes on...", "Death itself arrives at 30:00.", 3.5)
    end
end

function Game:EndRun(reason, silent)
    if not self.running then return end
    local run = self.run
    run.level = self.player and self.player.level or run.level

    -- Final achievement sweep while run/player still exist.
    WS.Achievements:Check()

    self.running, self.paused, self.leveling, self.merchanting = false, false, false, false
    self.pendingLevelUps = 0
    self.blessingPending = false
    self.keys = {}

    WS.SaveData:RecordRun(run, reason)
    WS.Achievements:Check() -- lifetime totals may have just crossed a threshold
    if self.map and self.map.arena then WS.BossArena:Stop() end
    self:ClearEntities()
    WS.UI:HideBossBar()

    if not silent then
        WS.UI.root:Show()
        WS.UI:ShowEnd(run, reason)
        if reason == "defeated" then WS.Audio:Play("death") end
    end
end

------------------------------------------------------------------------------
-- The loop: fixed 30 Hz simulation with a catch-up cap
------------------------------------------------------------------------------

function Game:Update(elapsed)
    WS.Audio:Update(elapsed)
    WS.UI:UpdateShake(elapsed)
    WS.UI:UpdateAnnouncement(elapsed)
    if not self.running or self.paused or self.leveling or self.merchanting then return end

    -- Hurry modifier runs the whole simulation at 1.5x speed.
    self.accumulator = self.accumulator + WS.min(elapsed, 0.25) * (self.run.hurry and 1.5 or 1)
    local ticks = 0
    while self.accumulator >= WS.Constants.TICK_RATE and ticks < WS.Constants.MAX_TICKS_PER_FRAME do
        self.accumulator = self.accumulator - WS.Constants.TICK_RATE
        -- A thrown sim error would otherwise abort the frame every tick and FREEZE
        -- the run (weapons stop firing, nothing moves). Trap it: report the message
        -- + stack ONCE (so it can be copied and sent in), drop the backlog, and keep
        -- the run alive - a transient bad state then clears on the next tick.
        local ok, err = xpcall(function() self:Tick(WS.Constants.TICK_RATE) end,
            function(e) return tostring(e) .. "\n" .. debugstack(2, 8, 0) end)
        if not ok then
            if self._loggedTickError ~= err then
                self._loggedTickError = err
                print("|cffff3030[WoW Survivors] hit a bug - please copy this whole message and send it:|r")
                print(err)
            end
            self.accumulator = 0
            return
        end
        ticks = ticks + 1
        if not self.running or self.paused or self.leveling or self.merchanting then return end
    end
    if ticks == WS.Constants.MAX_TICKS_PER_FRAME then
        self.accumulator = 0 -- drop time rather than spiral on a long hitch
    end
end

function Game:Tick(dt)
    local run, player = self.run, self.player
    run.time = run.time + dt
    run.noHitStreak = run.noHitStreak + dt

    -- A second blessing is offered at 10:00 (once the player is free to pick).
    if not self.map.arena and not run.secondBlessingGiven and run.time >= 600 and not self.leveling then
        run.secondBlessingGiven = true
        self.blessingPending = true
        self:Announce("The Light stirs once more...", "A second blessing is offered.", 3.0)
        self:OpenLevelUp()
        return
    end

    -- The Egg Merchant wheels in on a fixed cadence (default every 7:00) to
    -- sell run-only eggs. Deferred until any level-up choice is resolved.
    if not self.map.arena and not self.leveling then
        run.merchantTimer = (run.merchantTimer or 420) - dt
        if run.merchantTimer <= 0 then
            run.merchantTimer = WS.Config.eggVendorInterval or 420
            self:OpenMerchant()
            return
        end
    end

    if self.map.arena then
        WS.BossArena:Update(dt)
    else
        WS.WaveManager:Update(dt, run)
    end
    if not self.running then return end
    WS.Player:Update(player, dt)
    WS.Enemy:Update(dt)
    if not self.running then return end
    WS.Familiar:Update(dt)
    WS.Projectile:Update(dt)
    if not self.running then return end
    WS.Pickup:Update(dt)
    if not self.running then return end
    WS.XP:Update(dt)
    if not self.running then return end
    WS.FloatingText:Update(dt)

    run.level = player.level

    self.achieveTimer = self.achieveTimer - dt
    if self.achieveTimer <= 0 then
        self.achieveTimer = 1.0
        WS.Achievements:Check()
    end

    -- DPS: push one damage sample per second into a 10-slot ring buffer.
    self.dpsTimer = self.dpsTimer - dt
    if self.dpsTimer <= 0 then
        self.dpsTimer = self.dpsTimer + 1.0
        self.dpsIndex = self.dpsIndex % 10 + 1
        self.dpsSamples[self.dpsIndex] = run.damageDone - self.dpsLastTotal
        self.dpsLastTotal = run.damageDone
        local total, count = 0, #self.dpsSamples
        for i = 1, count do total = total + self.dpsSamples[i] end
        run.dps = count > 0 and (total / count) or 0
    end

    -- HPS: same one-sample-per-second 10-slot ring, over healing done.
    self.hpsTimer = self.hpsTimer - dt
    if self.hpsTimer <= 0 then
        self.hpsTimer = self.hpsTimer + 1.0
        self.hpsIndex = self.hpsIndex % 10 + 1
        self.hpsSamples[self.hpsIndex] = (run.healingDone or 0) - self.hpsLastTotal
        self.hpsLastTotal = run.healingDone or 0
        local total, count = 0, #self.hpsSamples
        for i = 1, count do total = total + self.hpsSamples[i] end
        run.hps = count > 0 and (total / count) or 0
    end

    WS.UI:UpdateHUD(player, run)
    WS.UI:UpdateBossBar()
end

------------------------------------------------------------------------------
-- Input
------------------------------------------------------------------------------

function Game:SetKey(key, pressed)
    if key == "ESCAPE" then
        if pressed and not self.keys.ESCAPE then
            self:HandleEscape()
        end
        self.keys.ESCAPE = pressed
        return
    end
    if not self.running then return end
    -- Record key state even while paused/leveling/merchanting. The simulation is
    -- gated elsewhere (Tick doesn't run), so this never moves you mid-menu - but
    -- it means a key still held when play resumes keeps moving you, no re-press.
    self.keys[key] = pressed
end

function Game:HandleEscape()
    local ui = WS.UI
    if self.merchanting then
        self:CloseMerchant() -- Esc simply sends the merchant on her way
    elseif self.leveling then
        return -- a boon must be chosen (or skipped) with the mouse
    elseif ui.victoryPanel and ui.victoryPanel:IsShown() then
        self:FightOn() -- Esc is the non-destructive choice
    elseif ui.activePanel then
        ui:CloseActivePanel()
    elseif self.running then
        self:TogglePause()
    elseif ui.endPanel:IsShown() then
        ui:ShowMenu()
    else
        ui:HideGame()
    end
end

function Game:TogglePause()
    if not self.running or self.leveling then return end
    if WS.UI.victoryPanel and WS.UI.victoryPanel:IsShown() then return end
    self.paused = not self.paused
    self.accumulator = 0 -- keys are NOT cleared, so held movement resumes cleanly
    if self.paused then
        WS.UI:ShowPause(self.run)
    else
        WS.UI:CloseActivePanel()
        WS.UI.pausePanel:Hide()
    end
end

------------------------------------------------------------------------------
-- Level-up flow
------------------------------------------------------------------------------

-- Builds the current selection: the run-opening blessing if it is still
-- pending, otherwise a normal boon set.
function Game:PresentChoices()
    if self.blessingPending then
        self.currentChoices = WS.LevelUp:BuildBlessingChoices(self.player)
        WS.UI:ShowLevelChoices(self.currentChoices, self.player.rerolls, self.player.banishes, "Choose a Blessing")
    else
        self.currentChoices = WS.LevelUp:BuildChoices(self.player)
        WS.UI:ShowLevelChoices(self.currentChoices, self.player.rerolls, self.player.banishes)
    end
end

function Game:OpenLevelUp()
    if not self.running then return end

    -- Auto-resolve level-ups that need no manual pick (blessings are always by
    -- hand). Charm auto-takes the first boon every time; Limit Break auto-pick
    -- takes Limit Break whenever it's on offer (a complete build). We stop at the
    -- first level-up that still needs a real decision and show the panel for it.
    if not self.blessingPending then
        while self.pendingLevelUps > 0 do
            local choices = WS.LevelUp:BuildChoices(self.player)
            local auto
            if WoWSurvivorsDB.settings.charm then
                auto = choices[1]
            elseif self.autoLimitBreak then
                for i = 1, #choices do
                    if choices[i].type == "limit_break" then auto = choices[i]; break end
                end
            end
            if not auto then break end
            WS.LevelUp:Apply(self.player, auto)
            self.pendingLevelUps = self.pendingLevelUps - 1
        end
        if self.pendingLevelUps <= 0 then
            WS.UI:RefreshWeaponStrip(self.player)
            WS.Audio:Play("level")
            return
        end
    end

    self.leveling = true
    self.accumulator = 0 -- keys preserved so held movement resumes without a re-press
    self:PresentChoices()
    if self.blessingPending then
        WS.Audio:Play("toast")
        return
    end
    WS.FloatingText:Notice(self.player.x, self.player.y, "LEVEL UP!", 1, 0.82, 0.1)
    -- A rising pillar of golden light with smaller rays fanning out around
    -- it: unmistakably a ding, not a Holy Nova.
    local px, py = self.player.x, self.player.y
    WS.Projectile:SpawnBeam(px, py, px, py + 170, WS.Constants.COLORS.gold, 18, 0.6)
    WS.Projectile:SpawnBeam(px, py + 4, px - 34, py + 120, WS.Constants.COLORS.gold, 7, 0.5)
    WS.Projectile:SpawnBeam(px, py + 4, px + 34, py + 120, WS.Constants.COLORS.gold, 7, 0.5)
    WS.Projectile:SpawnBeam(px, py + 2, px - 62, py + 74, WS.Constants.COLORS.gold, 5, 0.4)
    WS.Projectile:SpawnBeam(px, py + 2, px + 62, py + 74, WS.Constants.COLORS.gold, 5, 0.4)
    WS.Projectile:SpawnFlash(px, py, 42, WS.Constants.COLORS.gold)
    WS.Audio:Play("level")
end

function Game:ChooseUpgrade(index)
    if not self.leveling or not self.currentChoices then return end
    local choice = self.currentChoices[index]
    if not choice then return end
    WS.LevelUp:Apply(self.player, choice)
    if choice.type == "blessing" then
        self.blessingPending = false
        self:FinishLevelUp(true) -- the blessing is a bonus pick, not a level
    else
        self:FinishLevelUp()
    end
end

function Game:SkipUpgrade()
    if not self.leveling then return end
    if self.blessingPending then
        self.blessingPending = false
        self:FinishLevelUp(true)
    else
        self:FinishLevelUp()
    end
end

function Game:RerollChoices()
    if not self.leveling or self.player.rerolls <= 0 then return end
    self.player.rerolls = self.player.rerolls - 1
    self:PresentChoices()
end

function Game:BanishChoice(index)
    if not self.leveling or not self.currentChoices or self.player.banishes <= 0 then return end
    local choice = self.currentChoices[index]
    if not choice or not WS.LevelUp:Banish(self.player, choice) then return end
    self.player.banishes = self.player.banishes - 1
    WS.Audio:Play("banish")
    self:PresentChoices()
end

function Game:FinishLevelUp(noDecrement)
    if not noDecrement then
        self.pendingLevelUps = WS.max(0, self.pendingLevelUps - 1)
    end
    if self.pendingLevelUps > 0 then
        self:PresentChoices()
        WS.Audio:Play("level")
    else
        self.currentChoices = nil
        self.leveling = false
        WS.UI.levelUpPanel:Hide()
        WS.UI.banishMode = false
    end
    WS.UI:RefreshWeaponStrip(self.player)
end

------------------------------------------------------------------------------
-- Helpers
------------------------------------------------------------------------------

-- Adds gold with a floating "+Ng". Silent by default (small coin piles are
-- frequent); chests/caches play their own richer sound where they're opened.
function Game:AddGold(amount, x, y)
    if amount <= 0 then return end
    self.run.gold = self.run.gold + amount
    WS.FloatingText:Gold(x or self.player.x, y or self.player.y, amount)
end

-- A free boon selection outside the normal level curve (Wandering Merchant).
function Game:GrantFreeBoon()
    if not self.running then return end
    self.pendingLevelUps = self.pendingLevelUps + 1
    if not self.leveling then self:OpenLevelUp() end
end

------------------------------------------------------------------------------
-- Egg Merchant (in-run vendor)
------------------------------------------------------------------------------

-- Opens the timed merchant panel and freezes the sim while shopping.
function Game:OpenMerchant()
    if not self.running or self.leveling or self.merchanting then return end
    self.merchanting = true
    self.accumulator = 0 -- keys preserved so held movement resumes on close
    WS.Audio:Play("toast")
    self:Announce("The Egg Merchant!", "Spend your coin - these eggs hatch only this run.", 2.5)
    WS.UI:ShowMerchant(self.run, self.player)
end

function Game:CloseMerchant()
    if not self.merchanting then return end
    self.merchanting = false
    self.accumulator = 0 -- keys preserved so held movement resumes cleanly
    WS.UI:HideMerchant()
end

-- Buys up to `count` run-eggs, limited by the gold on hand. Returns how many
-- were actually bought (0 if unaffordable). math.huge = "Buy All".
function Game:BuyEggs(count)
    if not self.running then return 0 end
    local cost = WS.Config.eggVendorCost or 100
    local affordable = WS.floor(self.run.gold / cost)
    count = WS.min(count or 0, affordable)
    if count <= 0 then return 0 end
    self.run.gold = self.run.gold - count * cost
    self.run.runEggs = (self.run.runEggs or 0) + count
    WS.Player:GrantRunEggs(self.player, count)
    WS.Audio:Play("chest")
    WS.FloatingText:Notice(self.player.x, self.player.y,
        count == 1 and "An egg!" or (count .. " eggs!"), 1, 0.9, 0.5)
    return count
end

function Game:Announce(title, subtitle, holdTime)
    WS.UI:Announce(title, subtitle, holdTime)
end
