local _, WS = ...

-- Drives each battlefield's data timeline (Data\Maps.lua): ambient spawn
-- phases, scripted swarm events, and timed boss arrivals. Difficulty scaling
-- is a function of elapsed time multiplied by the map's difficulty knob.
WS.WaveManager = {}
local Wave = WS.WaveManager

function Wave:Reset(map)
    self.map = map
    self.phaseIndex = 1
    self.eventIndex = 1
    self.bossIndex = 1
    self.spawnTimer = 0.75
    self.endlessBossTimer = 120
    self.endlessEventTimer = 100
    self.deathWarned = false
    self.deathTimer = 0
    self.cacheTimer = 60
    self.merchantTimer = 150
    self.coffinDone = false
    self.coffinTimer = 120 -- the coffin surfaces after two minutes
    self.runebladeDone = false -- the runeblade answers desecration, not a timer
    self.warglaiveDone = false -- the glaives answer Metamorphosis, likewise
end

-- Health/damage/xp inflation for ambient spawns. The chosen difficulty preset
-- (Beginner/Veteran/Professional) scales the whole curve.
function Wave:EnemyScale(time)
    local run = WS.Game.run
    local hyper = run.hyper and (WS.Config.hyperScale or 1.4) or 1
    local s = (1 + time / (WS.Config.enemyScaleTime or 210)) * self.map.difficulty * run.diffScale * hyper
    -- Endless: once the run is "won", the ambient horde ramps noticeably faster.
    if run.victorious or run.mode == "endless" then
        s = s * (1 + WS.max(0, time - 1620) / (WS.Config.endlessEnemyRampTime or 300))
    end
    return s
end

-- The pool endless respawns draw from: the tougher half of the map's roster
-- (rosters are ordered weak->strong by arrival time), so a returning boss is
-- never a step down from the last scheduled boss.
function Wave:EndlessBossPool()
    local bosses = self.map.bosses
    local n = #bosses
    local pool = {}
    for i = WS.floor(n / 2) + 1, n do pool[#pool + 1] = bosses[i] end
    if #pool == 0 then pool[1] = bosses[n] end
    return pool
end

-- Bosses have large bases already, so their curve is gentler.
function Wave:BossScale(time)
    local run = WS.Game.run
    local hyper = run.hyper and (WS.Config.hyperScale or 1.4) or 1
    return (1 + time / (WS.Config.bossScaleTime or 500)) * self.map.difficulty * run.diffScale * hyper
end

function Wave:Update(dt, run)
    local map = self.map
    local time = run.time

    -- Advance to the newest phase whose start time has passed.
    while map.phases[self.phaseIndex + 1] and map.phases[self.phaseIndex + 1].at <= time do
        self.phaseIndex = self.phaseIndex + 1
    end
    local phase = map.phases[self.phaseIndex]

    -- Ambient spawns (denser in hyper mode, faster on harder difficulties,
    -- and the survivor's Dark Bargain curse adds more of them still).
    local curse = WS.Game.player.curse or 0
    self.spawnTimer = self.spawnTimer - dt
    if self.spawnTimer <= 0 then
        self.spawnTimer = phase.interval * (WS.Config.spawnIntervalMult or 1)
            * run.diffInterval * (run.hyper and 0.75 or 1) / (1 + 0.20 * curse)
        local scale = self:EnemyScale(time)
        local count = WS.max(1, WS.floor(phase.count * (WS.Config.spawnCountMult or 1) * (1 + 0.20 * curse) + 0.5))
        for _ = 1, count do
            local pick = WS.WeightedPick(phase.roster)
            WS.Enemy:SpawnRing(pick.id, 700 + WS.random() * 160, scale)
        end
        if phase.elite and WS.random() < phase.eliteChance then
            local elite = WS.Enemy:SpawnRing(phase.elite, 740, scale)
            if elite then
                WS.FloatingText:Notice(elite.x, elite.y, elite.template.name, 1, 0.7, 0.1)
            end
        end
    end

    -- The coffin of Bartholomew the Adequate: surfaces once, guarded, only
    -- while he is still locked. Walk to it (through the guard) to free him.
    if not self.coffinDone and not WoWSurvivorsDB.unlocks.characters.paladin then
        self.coffinTimer = self.coffinTimer - dt
        if self.coffinTimer <= 0 then
            local player = WS.Game.player
            local angle = WS.random() * WS.tau
            local cx = WS.Clamp(player.x + WS.cos(angle) * 380, 90, WS.Constants.WORLD_WIDTH - 90)
            local cy = WS.Clamp(player.y + WS.sin(angle) * 380, 90, WS.Constants.WORLD_HEIGHT - 90)
            -- Only burn the one-shot (and announce, and post guards) if the coffin
            -- ACTUALLY spawned. Marking it done first would silently cost the run
            -- its unlock whenever the pickup field was full.
            if WS.Pickup:Spawn("coffin", cx, cy) then
                self.coffinDone = true
                WS.Game:Announce("A weathered coffin lies open to the sky...", "Reach it. Something stirs within.", 4.0)
                WS.Audio:Play("boss")
                -- A guard of the restless dead rings the coffin.
                for i = 1, 6 do
                    local a = (i / 6) * WS.tau
                    WS.Enemy:Spawn("skeleton", cx + WS.cos(a) * 70, cy + WS.sin(a) * 70, self:EnemyScale(time) * 1.5)
                end
            else
                self.coffinTimer = 10 -- field was full; try again shortly
            end
        end
    end

    -- The Runeblade: once enough Light has rotted in a single run (desecration
    -- damage past the threshold), a blade answers. Surfaces once, ringed by the
    -- risen - claim it to free the Death Knight.
    if not self.runebladeDone and not WoWSurvivorsDB.unlocks.characters.death_knight then
        local desecrated = (run.damageByWeapon and run.damageByWeapon.desecration) or 0
        if desecrated >= (WS.Config.runebladeThreshold or 4000) then
            local player = WS.Game.player
            local angle = WS.random() * WS.tau
            local rx = WS.Clamp(player.x + WS.cos(angle) * 380, 90, WS.Constants.WORLD_WIDTH - 90)
            local ry = WS.Clamp(player.y + WS.sin(angle) * 380, 90, WS.Constants.WORLD_HEIGHT - 90)
            -- As with the coffin: no spawn, no one-shot. The threshold stays met, so
            -- this simply retries on a later tick.
            if WS.Pickup:Spawn("runeblade", rx, ry) then
                self.runebladeDone = true
                WS.Game:Announce("A runeblade answers the rot.", "Claim it, if you can reach it.", 4.0)
                WS.Audio:Play("boss")
                for i = 1, 8 do
                    local a = (i / 8) * WS.tau
                    WS.Enemy:Spawn("scourge_ghoul", rx + WS.cos(a) * 76, ry + WS.sin(a) * 76,
                        self:EnemyScale(time) * 1.6)
                end
            end
        end
    end

    -- The Warglaives: transform enough times in one run and the Illidari's blades
    -- come looking for their next bearer. Guarded, like the runeblade and coffin.
    if not self.warglaiveDone and not WoWSurvivorsDB.unlocks.characters.demon_hunter then
        if (run.metamorphoses or 0) >= (WS.Config.warglaiveMetas or 3) then
            local player = WS.Game.player
            local angle = WS.random() * WS.tau
            local gx = WS.Clamp(player.x + WS.cos(angle) * 380, 90, WS.Constants.WORLD_WIDTH - 90)
            local gy = WS.Clamp(player.y + WS.sin(angle) * 380, 90, WS.Constants.WORLD_HEIGHT - 90)
            if WS.Pickup:Spawn("warglaives", gx, gy) then
                self.warglaiveDone = true
                WS.Game:Announce("The glaives have chosen.", "Take them, and never look away again.", 4.0)
                WS.Audio:Play("boss")
                for i = 1, 8 do
                    local a = (i / 8) * WS.tau
                    WS.Enemy:Spawn("fleshripper", gx + WS.cos(a) * 76, gy + WS.sin(a) * 76,
                        self:EnemyScale(time) * 1.6)
                end
            end
        end
    end

    -- A wandering merchant occasionally sets up somewhere on the field.
    self.merchantTimer = self.merchantTimer - dt
    if self.merchantTimer <= 0 then
        local x = WS.random(90, WS.Constants.WORLD_WIDTH - 90)
        local y = WS.random(90, WS.Constants.WORLD_HEIGHT - 90)
        -- Only shout if the merchant actually turned up; otherwise retry soon
        -- rather than waiting out the whole cadence for a no-show.
        if WS.Pickup:Spawn("merchant", x, y) then
            self.merchantTimer = 165
            WS.FloatingText:Notice(x, y, "A merchant! Pssst, over here!", 1, 0.9, 0.5)
        else
            self.merchantTimer = 10
        end
    end

    -- Supply caches: a crate appears somewhere on the field every so often,
    -- holding a random prize - a reason to roam instead of circling in place.
    self.cacheTimer = self.cacheTimer - dt
    if self.cacheTimer <= 0 then
        self.cacheTimer = 75
        local x = WS.random(90, WS.Constants.WORLD_WIDTH - 90)
        local y = WS.random(90, WS.Constants.WORLD_HEIGHT - 90)
        -- A full field bumps the farthest coin so the cache always spawns; only
        -- announce if it did (no "Supply Cache!" text with no crate), and retry
        -- soon rather than losing the whole cycle.
        if WS.Pickup:Spawn("cache", x, y) then
            WS.FloatingText:Notice(x, y, "Supply Cache!", 1, 0.9, 0.6)
        else
            self.cacheTimer = 10
        end
    end

    -- Scripted swarm events ("The Riverpaw pack closes in!").
    local event = map.events[self.eventIndex]
    if event and time >= event.at * (WS.Config.eventTimeMult or 1) then
        self.eventIndex = self.eventIndex + 1
        WS.Game:Announce(event.text, nil, 3.0)
        WS.Audio:Play("boss")
        WS.Enemy:SpawnCircle(event.id, event.count, 520, self:EnemyScale(time))
    end

    -- Boss arrivals. WHICH boss comes from the map; WHEN comes from the shared
    -- Config.bossTimes schedule (falling back to the map's own time).
    local bossEntry = map.bosses[self.bossIndex]
    local bossTimes = WS.Config.bossTimes
    local bossAt = bossEntry and ((bossTimes and bossTimes[self.bossIndex]) or bossEntry.at)
    if bossEntry and time >= bossAt then
        self.bossIndex = self.bossIndex + 1
        self:SpawnBoss(bossEntry.id, bossEntry.final or false, self:BossScale(time))
    end

    -- Past the scripted schedule (after the last boss at 27:00), bosses return
    -- from the TOUGHER half of the roster - so a respawn is never a step down
    -- from the last scheduled boss - harder every visit, with swarm events. The
    -- cadence and strength both accelerate the longer the run goes.
    if not bossEntry and (WS.Game.run.victorious or WS.Game.run.mode == "endless") then
        local cfg = WS.Config
        local overtime = WS.max(0, time - 1620)
        self.endlessBossTimer = self.endlessBossTimer - dt
        if self.endlessBossTimer <= 0 then
            local base = cfg.endlessBossInterval or 75
            self.endlessBossTimer = WS.max(cfg.endlessBossMinInterval or 30,
                base - overtime / (cfg.endlessBossAccel or 18))
            local pool = self:EndlessBossPool()
            local pick = pool[WS.random(1, #pool)]
            -- endlessBossMult keeps the first respawn above the last scheduled
            -- boss; the ramp then climbs steadily from there.
            local ramp = (cfg.endlessBossMult or 1.25) * (1 + overtime / (cfg.endlessRampTime or 240))
            self:SpawnBoss(pick.id, false, self:BossScale(time) * ramp)
        end
        self.endlessEventTimer = self.endlessEventTimer - dt
        if self.endlessEventTimer <= 0 then
            self.endlessEventTimer = cfg.endlessEventInterval or 90
            local event = map.events[WS.random(1, #map.events)]
            WS.Game:Announce(event.text, nil, 3.0)
            WS.Audio:Play("boss")
            WS.Enemy:SpawnCircle(event.id, WS.floor(event.count * 1.5), 520, self:EnemyScale(time))
        end
    end

    -- The final bell (deathTime, default 30:00). Surviving to it IS the Victory -
    -- banked with no interruption (VS-style) - and Death itself then arrives to
    -- end the tale, returning every deathInterval seconds for those who fight on.
    -- A run that CHOSE Endless at the start has no Victory bell and no Death
    -- finale: it's already an unending survival, so the schedule below is skipped.
    local deathTime = WS.Config.deathTime or 1800
    if not run.startedEndless and not self.deathWarned and time >= deathTime - 60 then
        self.deathWarned = true
        WS.Game:Announce("Death approaches...", "One minute remains. Survive it.", 4.0)
        WS.Audio:Play("boss")
    end
    if time >= deathTime and not run.startedEndless then
        if not run.victorious then WS.Game:SurviveVictory() end
        self.deathTimer = self.deathTimer - dt
        if self.deathTimer <= 0 then
            self.deathTimer = WS.Config.deathInterval or 60
            local death = WS.Enemy:SpawnRing("death_itself", 680, 1 + (time - deathTime) / 300, true)
            if death then
                local template = death.template
                WS.Game:Announce("Death has come for you.", template.yell, 4.0)
                WS.Audio:Play("boss")
                WS.UI:Shake(8, 0.6)
                WS.UI:ShowBossBar(death)
            end
        end
    end
end

function Wave:SpawnBoss(id, isFinal, scale)
    local boss = WS.Enemy:SpawnRing(id, 620, scale, true) -- force: bosses always arrive on schedule
    if not boss then return end
    boss.finalBoss = isFinal
    local template = boss.template
    WS.Game:Announce(template.name .. " approaches!", template.yell, 4.0)
    WS.Audio:Play("boss")
    WS.Audio:PlayVoice(template.voice)
    WS.UI:Shake(6, 0.5)
    WS.UI:ShowBossBar(boss)
end
