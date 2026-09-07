local _, WS = ...

-- Experimental Boss Arena mode. A fixed fight against a single scripted boss with
-- telegraphed hazards - a pure test of movement and dodging, distinct from the
-- survivors sandbox. First boss: Aethelgard, the Eclipse Sovereign.
--
-- The arena is the whole playfield (1280x720). A small player-hazard system
-- (telegraph -> active damage) drives the mechanics:
--   rect   - a rectangle that warns then burns (grid cells)
--   mark   - a non-damaging highlight (the safe grid squares)
--   ring   - an expanding ring with one gap to find and stand in
--   cutter - a spinning 4-arm cross; the safe zones are the rotating quadrants
-- Umbral Chains (Phase 2) are handled separately (breakable anchors + a pull).
WS.BossArena = {}
local BA = WS.BossArena

local CX, CY = 640, 360
local WORLD_W, WORLD_H = 1280, 720
BA.bounds = { minX = 16, maxX = WORLD_W - 16, minY = 16, maxY = WORLD_H - 16 }
BA.displayId = nil -- Aethelgard renders as its icon for now (no verified model id)

-- Every knob the fight runs on, in one table so the Tuning bench can drive the
-- pace, damage, gap/box counts and rain density without touching code. Loaded
-- before Tuning.lua, so `af(WS.BossArena.tuning, T.bossArena)` overrides these.
-- Angles are stored in DEGREES here (friendlier to tune); Start converts to radians.
BA.tuning = {
    -- Boss + phases
    bossHealth   = 300000,
    phase2HP     = 60,   -- % health that triggers Phase 2 (Umbral Divide)
    phase3HP     = 20,   -- % health that triggers Phase 3 (Total Darkness)
    enrageTime   = 30,   -- Phase-3 hard enrage (seconds) that wipes the arena

    -- Solar Flare (the expanding rings)
    ringDamage   = 26,
    ringSpeed    = 165,  -- ring expansion speed (px/sec)
    ringGapP1    = 40,   -- Phase-1 gap width (deg); the FIRST of the two rings is 2x this
    ringGapP2    = 26,   -- Phase-2 gap width (deg), for the rotating multi-gap ring
    ringGapsP2   = 7,    -- number of openings in the Phase-2 ring
    ringSpinP2   = 0.5,  -- how fast the Phase-2 openings drift (rad/sec)
    ringDelay    = 1.4,  -- gap between the two consecutive rings (sec)
    flareInterval= 6.5,  -- seconds between Solar Flare casts (Track 1)

    -- Sunfall Spears (the grid)
    spearDamage  = 30,
    gridSafeP1   = 4,    -- green (safe) squares in Phase 1
    gridSafeP2   = 5,    -- green squares once it overlaps Phase 2
    gridWaves    = 3,    -- slams per cast (re-rolls the safe squares each slam)
    gridWarn     = 1.15, -- telegraph time before a slam (sec)
    gridActive   = 0.5,  -- burn time of a slam (sec)
    spearInterval= 8.5,  -- seconds between Sunfall Spears casts (Track 1)

    -- Eclipse Cross (the spinning cutter)
    cutterDamage = 32,
    cutterSpin   = 0.7,  -- rotation speed while active (rad/sec)
    cutterTele   = 1.2,  -- telegraph time (two flashes) before it goes solid (sec)
    cutterInterval = 9.0,-- seconds between Cross casts (Track 2, Phase 2)

    -- Umbral Chains
    chainCount   = 6,    -- number of anchors to run through
    pullSpeed    = 120,  -- base drag toward center (px/sec)
    chainRamp    = 0.3,  -- +pull per anchor already broken (0.3 = +30% each)
    chainBreak   = 46,   -- run within this many px of an anchor to break it
    chainInterval= 11.0, -- seconds between Chain casts (Track 2, Phase 2)

    -- Total Darkness (Phase 3)
    collapseRate = 8,    -- how fast each wall closes in (px/sec)
    horizonMin   = 110,  -- the box never shrinks tighter than this half-size (px)
    darkDamage   = 45,   -- damage per tick while outside the safe box
    rainInterval = 0.7,  -- seconds between Eclipse Rain drops
    rainMin      = 3,    -- meteors per drop (minimum)
    rainMax      = 6,    -- meteors per drop (maximum)
    meteorRadius = 66,   -- blast radius of one meteor (px)
    meteorDamage = 34,   -- meteor hit damage
}

-- The preset "strong kit" the survivor spawns with in the arena. Weapons are a
-- list of { id, level, evolved }; passives map upgrade id -> ranks. Overridable
-- wholesale via T.arenaLoadout.
BA.loadout = {
    weapons = {
        { id = "arcane_missiles", level = 8, evolved = true },
        { id = "whirlwind",       level = 8, evolved = true },
        { id = "chain_lightning", level = 8, evolved = true },
        { id = "holy_nova",       level = 8, evolved = true },
    },
    passives = {
        might = 5, precision = 4, ferocity = 3, area = 3, velocity = 3,
        fleetfoot = 4, vitality = 4, armor = 3, recovery = 4, dodge = 2,
    },
}

local function AngleDiff(a, b)
    local d = math.abs(a - b) % WS.tau
    if d > WS.pi then d = WS.tau - d end
    return d
end

-- True if `ang` falls inside one of a ring's evenly-spaced (and possibly rotating)
-- openings. One gap in Phase 1; seven rotating gaps in Phase 2.
local function InGap(hz, ang)
    local step = WS.tau / hz.gapCount
    local base = hz.gapCenter + hz.gapRot
    for k = 0, hz.gapCount - 1 do
        if AngleDiff(ang, base + k * step) <= hz.gapWidth / 2 then return true end
    end
    return false
end

------------------------------------------------------------------------------
-- Pooled world textures
------------------------------------------------------------------------------

local function PlaceRect(tex, cx, cy, w, h)
    tex:ClearAllPoints()
    tex:SetRotation(0)
    tex:SetPoint("CENTER", WS.UI.world, "BOTTOMLEFT", cx, cy)
    tex:SetSize(w, h)
end

function BA:AcquireTex()
    for i = 1, #self.texPool do
        local t = self.texPool[i]
        if not t.inUse then t.inUse = true; t:Show(); return t end
    end
    local tex = WS.UI.world:CreateTexture(nil, "ARTWORK")
    tex:SetTexture(WS.Media.white)
    self.texPool[#self.texPool + 1] = tex
    tex.inUse = true
    return tex
end

function BA:ReleaseTex(tex)
    tex.inUse = false
    tex:SetRotation(0)
    tex:SetTexture(WS.Media.white)
    tex:SetTexCoord(0, 1, 0, 1)
    tex:Hide()
end

------------------------------------------------------------------------------
-- Hazard spawners
------------------------------------------------------------------------------

function BA:Rect(cx, cy, w, h, warn, active, dmg, r, g, b)
    local tex = self:AcquireTex()
    PlaceRect(tex, cx, cy, w, h)
    tex:SetVertexColor(r, g, b, 0.22)
    self.hazards[#self.hazards + 1] = {
        shape = "rect", cx = cx, cy = cy, w = w, h = h,
        warn = warn, active = active, dmg = dmg, r = r, g = g, b = b, tex = tex,
    }
end

function BA:Mark(cx, cy, w, h, dur, r, g, b)
    local tex = self:AcquireTex()
    PlaceRect(tex, cx, cy, w, h)
    tex:SetVertexColor(r, g, b, 0.30)
    self.hazards[#self.hazards + 1] = {
        shape = "mark", warn = dur, tex = tex, r = r, g = g, b = b,
        cx = cx, cy = cy, w = w, h = h, safe = true,
    }
end

-- A circular impact (Eclipse Rain meteor): a red ring warns, then it detonates,
-- searing anyone inside for a brief window.
function BA:Circle(cx, cy, radius, warn, active, dmg)
    local tex = self:AcquireTex()
    tex:SetTexture(WS.Media.softCircle)
    tex:ClearAllPoints()
    tex:SetPoint("CENTER", WS.UI.world, "BOTTOMLEFT", cx, cy)
    tex:SetSize(radius * 2, radius * 2)
    tex:SetVertexColor(1.0, 0.28, 0.18, 0.25)
    self.hazards[#self.hazards + 1] = {
        shape = "circle", cx = cx, cy = cy, radius = radius,
        warn = warn, active = active, dmg = dmg, tex = tex,
    }
end

-- An expanding ring with `gapCount` openings (which rotate at `spin` rad/s),
-- rendered as a fan of segment textures.
function BA:Ring(gapCenter, gapWidth, dmg, speed, gapCount, spin, warn)
    local N = 128
    local hz = {
        shape = "ring", cx = CX, cy = CY, r = 26, speed = speed or 165, thick = 30,
        gapCenter = gapCenter, gapWidth = gapWidth, dmg = dmg, maxR = 790,
        warn = warn or 0.7, N = N, segs = {},
        gapCount = gapCount or 1, spin = spin or 0, gapRot = 0,
    }
    for i = 1, N do
        local t = self:AcquireTex() -- plain white; many small tangent tiles = smooth band
        t:SetVertexColor(1.0, 0.82, 0.25, 0.9)
        hz.segs[i] = t
    end
    self.hazards[#self.hazards + 1] = hz
    self:DrawRing(hz, 0.4) -- position at once so a pooled texture never flashes its old shape
end

function BA:DrawRing(hz, alpha)
    local N, r = hz.N, hz.r
    -- 128 small uniform tangent tiles, each ~1.5x its arc share so neighbours meet
    -- with no seam: reads as one smooth gold band (no soft-texture blend artifacts).
    local segW = math.max(6, (WS.tau * r / N) * 1.5)
    for i = 1, N do
        local ang = (i / N) * WS.tau
        local seg = hz.segs[i]
        if InGap(hz, ang) then
            seg:Hide()
        else
            seg:Show()
            seg:SetSize(segW, hz.thick)
            seg:SetRotation(ang + WS.pi / 2)
            seg:ClearAllPoints()
            seg:SetPoint("CENTER", WS.UI.world, "BOTTOMLEFT",
                hz.cx + math.cos(ang) * r, hz.cy + math.sin(ang) * r)
            seg:SetVertexColor(1.0, 0.82, 0.25, alpha)
        end
    end
end

-- A spinning 4-arm cross ("cutter"). Telegraphs as two flashes then goes solid and
-- rotates; the safe zones are the four quadrants between the arms.
function BA:Cutter()
    WS.Game:Announce("Eclipse Cross", "Slip into a quadrant.", 1.8)
    local hz = {
        shape = "cutter", cx = CX, cy = CY, ang = WS.random() * WS.pi * 0.5,
        spin = self.cutterSpin, half = 0.12, len = 900, dmg = self.cutterDamage,
        telegraph = self.tuning.cutterTele, arms = { self:AcquireTex(), self:AcquireTex(), self:AcquireTex(), self:AcquireTex() },
        hub = self:AcquireTex(), stopIn = nil,
    }
    self.cutter = hz
    self.hazards[#self.hazards + 1] = hz
    self:DrawCutter(hz, 0.5)
end

function BA:DrawCutter(hz, alpha)
    for k = 0, 3 do
        local a = hz.ang + k * (WS.pi * 0.5)
        local tex = hz.arms[k + 1]
        tex:Show()
        -- A brighter leading half and a darker trailing half sells the spin: even
        -- arms lead (hot white-purple), odd arms trail (deep violet).
        tex:SetSize(hz.len, 40 + 8 * (k % 2))
        tex:SetRotation(a)
        tex:ClearAllPoints()
        tex:SetPoint("CENTER", WS.UI.world, "BOTTOMLEFT",
            hz.cx + math.cos(a) * hz.len * 0.5, hz.cy + math.sin(a) * hz.len * 0.5)
        if k % 2 == 0 then tex:SetVertexColor(0.95, 0.55, 1.0, alpha)
        else tex:SetVertexColor(0.55, 0.20, 0.95, alpha) end
    end
    -- A bright counter-spinning core so the whole thing reads as a whirling blade.
    if hz.hub then
        hz.hub:Show()
        hz.hub:SetSize(60, 60)
        hz.hub:SetRotation(-hz.ang * 2.5)
        hz.hub:ClearAllPoints()
        hz.hub:SetPoint("CENTER", WS.UI.world, "BOTTOMLEFT", hz.cx, hz.cy)
        hz.hub:SetVertexColor(1.0, 0.78, 1.0, math.min(1, alpha + 0.15))
    end
end

------------------------------------------------------------------------------
-- Hazard update (dispatch by shape)
------------------------------------------------------------------------------

function BA:UpdateHazards(dt, player)
    for i = #self.hazards, 1, -1 do
        local hz = self.hazards[i]

        if hz.shape == "mark" then
            hz.warn = hz.warn - dt
            hz.tex:SetVertexColor(hz.r, hz.g, hz.b, 0.16 + 0.22 * math.abs(math.sin(hz.warn * 6)))
            if hz.warn <= 0 then
                self:ReleaseTex(hz.tex)
                table.remove(self.hazards, i)
            end

        elseif hz.shape == "ring" then
            hz.gapRot = hz.gapRot + hz.spin * dt -- the openings drift (Phase 2)
            if hz.warn > 0 then
                hz.warn = hz.warn - dt
                self:DrawRing(hz, 0.35 + 0.30 * math.abs(math.sin(hz.warn * 10)))
            else
                hz.r = hz.r + hz.speed * dt
                self:DrawRing(hz, 0.9)
                local px, py = player.x - hz.cx, player.y - hz.cy
                local dist = math.sqrt(px * px + py * py)
                if math.abs(dist - hz.r) <= hz.thick / 2 + player.radius * 0.4
                    and not InGap(hz, math.atan2(py, px)) then
                    WS.Player:TakeDamage(player, hz.dmg, "Aethelgard", self.displayId)
                    if not WS.Game.running then return end
                end
                if hz.r > hz.maxR then
                    for s = 1, #hz.segs do self:ReleaseTex(hz.segs[s]) end
                    table.remove(self.hazards, i)
                end
            end

        elseif hz.shape == "cutter" then
            if hz.telegraph > 0 then
                hz.telegraph = hz.telegraph - dt
                local vis = (hz.telegraph % 0.5) > 0.25 -- ~two flashes before it lands
                self:DrawCutter(hz, vis and 0.7 or 0.05)
            else
                hz.ang = hz.ang + hz.spin * dt
                self:DrawCutter(hz, 0.78 + 0.16 * math.abs(math.sin(WS.Game.run.time * 8)))
                local px, py = player.x - hz.cx, player.y - hz.cy
                local dist = math.sqrt(px * px + py * py)
                if dist > 30 and dist <= hz.len then
                    local pa = math.atan2(py, px)
                    for k = 0, 3 do
                        if AngleDiff(pa, hz.ang + k * (WS.pi * 0.5)) <= hz.half then
                            WS.Player:TakeDamage(player, hz.dmg, "Aethelgard", self.displayId)
                            break
                        end
                    end
                    if not WS.Game.running then return end
                end
                if hz.stopIn then
                    hz.stopIn = hz.stopIn - dt
                    if hz.stopIn <= 0 then
                        for k = 1, 4 do self:ReleaseTex(hz.arms[k]) end
                        if hz.hub then self:ReleaseTex(hz.hub) end
                        if self.cutter == hz then self.cutter = nil end
                        table.remove(self.hazards, i)
                    end
                end
            end

        elseif hz.shape == "circle" then
            if hz.warn > 0 then
                hz.warn = hz.warn - dt
                hz.tex:SetVertexColor(1.0, 0.28, 0.18, 0.18 + 0.26 * math.abs(math.sin(hz.warn * 9)))
            else
                hz.active = hz.active - dt
                hz.tex:SetVertexColor(1.0, 0.72, 0.25, 0.4 + 0.4 * math.min(1, hz.active))
                if WS.DistanceSquared(player.x, player.y, hz.cx, hz.cy)
                    <= (hz.radius + player.radius * 0.4) * (hz.radius + player.radius * 0.4) then
                    WS.Player:TakeDamage(player, hz.dmg, "Eclipse Rain", nil)
                    if not WS.Game.running then return end
                end
                if hz.active <= 0 then
                    self:ReleaseTex(hz.tex)
                    table.remove(self.hazards, i)
                end
            end

        else -- rect
            if hz.warn > 0 then
                hz.warn = hz.warn - dt
                hz.tex:SetVertexColor(hz.r, hz.g, hz.b, 0.18 + 0.20 * math.abs(math.sin(hz.warn * 9)))
                if hz.warn <= 0 then
                    hz.tex:SetVertexColor(hz.r * 1.1, hz.g, hz.b, 0.72)
                    WS.Audio:Play("boss")
                end
            else
                hz.active = hz.active - dt
                hz.tex:SetVertexColor(1.0, 0.5 + 0.2 * hz.active, 0.18, 0.35 + 0.30 * math.min(1, hz.active))
                if math.abs(player.x - hz.cx) <= hz.w / 2 + player.radius * 0.35
                    and math.abs(player.y - hz.cy) <= hz.h / 2 + player.radius * 0.35 then
                    WS.Player:TakeDamage(player, hz.dmg, "Aethelgard", self.displayId)
                    if not WS.Game.running then return end
                end
                if hz.active <= 0 then
                    self:ReleaseTex(hz.tex)
                    table.remove(self.hazards, i)
                end
            end
        end
    end
end

------------------------------------------------------------------------------
-- Umbral Chains (Phase 2): six anchors you break by running through them. The
-- pull toward the center hardens with every break, so the last ones are a fight.
------------------------------------------------------------------------------

function BA:ChainBind()
    if self.chains then return end
    WS.Game:Announce("Umbral Chains", "Run through the anchors to break them - the pull hardens with each.", 3.2)
    local anchors = {}
    for i = 1, self.tuning.chainCount do
        local x = 130 + WS.random() * (WORLD_W - 260)
        local y = 120 + WS.random() * (WORLD_H - 240)
        local tex = self:AcquireTex()
        tex:SetTexture("Interface\\Icons\\Spell_Frost_ChainsOfIce") -- a jailer's shackle
        tex:SetTexCoord(0.08, 0.92, 0.08, 0.92)
        tex:ClearAllPoints()
        tex:SetPoint("CENTER", WS.UI.world, "BOTTOMLEFT", x, y)
        tex:SetSize(48, 48)
        tex:SetVertexColor(0.85, 0.45, 1.0, 0.95)
        tex:Show()
        anchors[i] = { x = x, y = y, broken = false, tex = tex }
    end
    self.chains = { anchors = anchors, broken = 0 }
end

function BA:UpdateChains(dt, player)
    local ch = self.chains
    local remaining = 0
    for i = 1, #ch.anchors do
        local a = ch.anchors[i]
        if not a.broken then
            remaining = remaining + 1
            a.tex:SetVertexColor(0.8, 0.3, 1.0, 0.55 + 0.30 * math.abs(math.sin(WS.Game.run.time * 5 + i)))
            WS.Projectile:SpawnBeam(a.x, a.y, player.x, player.y, { 0.70, 0.32, 1.0 }, 4, 0.09)
            local br = self.tuning.chainBreak
            if WS.DistanceSquared(player.x, player.y, a.x, a.y) <= br * br then
                a.broken = true
                ch.broken = ch.broken + 1
                self:ReleaseTex(a.tex)
                WS.Projectile:SpawnFlash(a.x, a.y, 66, { 0.85, 0.45, 1.0 })
                WS.Audio:Play("evolve")
            end
        end
    end
    if remaining == 0 then
        self.chains = nil
        WS.Game:Announce("Chains shattered!", nil, 2.0)
        return
    end
    -- Drag toward the center, harder for each anchor already broken.
    local strength = self.pullSpeed * (1 + ch.broken * self.chainRamp)
    local dx, dy = CX - player.x, CY - player.y
    local d = math.sqrt(dx * dx + dy * dy)
    if d > 4 then
        player.x = player.x + dx / d * strength * dt
        player.y = player.y + dy / d * strength * dt
    end
end

------------------------------------------------------------------------------
-- Timed sub-events
------------------------------------------------------------------------------

function BA:After(delay, fn)
    self.pending[#self.pending + 1] = { t = delay, fn = fn }
end

function BA:UpdatePending(dt)
    for i = #self.pending, 1, -1 do
        local p = self.pending[i]
        p.t = p.t - dt
        if p.t <= 0 then
            table.remove(self.pending, i)
            p.fn()
        end
    end
end

------------------------------------------------------------------------------
-- Attacks
------------------------------------------------------------------------------

-- Solar Flare: two consecutive rings. Phase 1 = one wide opening then a normal
-- gap. Phase 2 = SEVEN small openings that slowly rotate, so there's always a way
-- through even when a Cross is spinning too - you just track a moving gap. The
-- second Phase-2 ring keeps full speed but waits an extra second before it goes.
function BA:SolarFlare()
    WS.Game:Announce("Solar Flare", "Find the gaps.", 1.6)
    local spd, gaps, spin, delay = self.ringSpeed, self.tuning.ringGapsP2, self.ringSpin, self.tuning.ringDelay
    if self.phase >= 2 then
        self:Ring(WS.random() * WS.tau, self.ringGap7, self.ringDamage, spd, gaps, spin, 0.7)
        self:After(delay, function()
            self:Ring(WS.random() * WS.tau, self.ringGap7, self.ringDamage, spd, gaps, spin, 1.7)
        end)
    else
        local g1 = WS.random() * WS.tau
        self:Ring(g1, self.ringGap * 2, self.ringDamage, spd, 1, 0, 0.7)
        self:After(delay, function()
            -- The second gap lands within +-90 deg of the first, so you never have
            -- to sprint across the whole ring to reach it in time.
            local g2 = g1 + (WS.random() - 0.5) * WS.pi
            self:Ring(g2, self.ringGap, self.ringDamage, spd, 1, 0, 0.7)
        end)
    end
end

-- Sunfall Spears: a full-screen grid; almost every cell is a death zone, a few
-- random ones are safe (green). It blows up, re-rolls, and slams three times.
function BA:SunfallSpears()
    WS.Game:Announce("Sunfall Spears", "Only the marked squares are safe.", 1.4)
    self:GridWave(1)
end

function BA:GridWave(n)
    local cols, rows = 6, 4
    local cw, ch = WORLD_W / cols, WORLD_H / rows
    local gap = 8
    local warn, active = self.tuning.gridWarn, self.tuning.gridActive
    local cells = {}
    for c = 0, cols - 1 do for r = 0, rows - 1 do cells[#cells + 1] = { c, r } end end
    local safe = {}
    local nSafe = (self.phase >= 2) and self.tuning.gridSafeP2 or self.tuning.gridSafeP1
    for _ = 1, nSafe do
        if #cells == 0 then break end
        local idx = WS.random(1, #cells)
        local cell = cells[idx]
        safe[cell[1] * rows + cell[2]] = true
        table.remove(cells, idx)
    end
    for c = 0, cols - 1 do
        for r = 0, rows - 1 do
            local cx, cy = (c + 0.5) * cw, (r + 0.5) * ch
            if safe[c * rows + r] then
                -- The safe square stays lit through the slam (warn + active) so it's
                -- a real haven, not just a telegraph.
                self:Mark(cx, cy, cw - gap, ch - gap, warn + active, 0.35, 0.9, 0.42)
            else
                self:Rect(cx, cy, cw - gap, ch - gap, warn, active, self.spearDamage, 0.95, 0.22, 0.16)
            end
        end
    end
    self:After(warn, function() WS.UI:Shake(6, 0.4); WS.Audio:Play("boss") end)
    if n < self.tuning.gridWaves then
        self:After(warn + active + 0.9, function() self:GridWave(n + 1) end)
    end
end

------------------------------------------------------------------------------
-- Phase transition + attack rotation
------------------------------------------------------------------------------

-- The Eclipse Strike at 60% HP: Aethelgard is briefly invincible and the screen
-- reels, then the Phase-2 track (Cross, then Chains) begins - OVERLAPPING the
-- Phase-1 track (Solar Flare / Sunfall Spears), which never stops or resets.
function BA:EnterPhase2()
    self.phase = 2
    self.t2Timer = 3.0 -- first Phase-2 mechanic shortly after the strike
    self.t2Index = 1   -- Cross first, then Chains, then alternating
    if self.boss then self.boss.invuln = 2.2 end
    if self.tint then self.tint:SetVertexColor(0.17, 0.05, 0.22, 0.50) end -- the sky darkens
    WS.Projectile:SpawnFlash(CX, CY, 240, { 1.0, 0.85, 0.35 })
    WS.Game:Announce("The Eclipse Strike", "Sun and shadow split apart - and everything comes at once.", 3.6)
    WS.UI:Shake(14, 1.2)
    WS.Audio:Play("boss")
end

-- Track 1 (both phases): Solar Flare and Sunfall Spears, forever alternating.
function BA:AdvanceTrack1()
    if self.attackIndex == 1 then self:SolarFlare(); self.attackTimer = self.tuning.flareInterval
    else self:SunfallSpears(); self.attackTimer = self.tuning.spearInterval end
    self.attackIndex = self.attackIndex % 2 + 1
end

-- Track 2 (Phase 2 only): the Eclipse Cross and the Umbral Chains, alternating,
-- running in parallel with (and layered over) Track 1.
function BA:AdvanceTrack2()
    -- A spinning Cross keeps going until 1s into the next Phase-2 mechanic.
    if self.cutter and not self.cutter.stopIn and self.cutter.telegraph <= 0 then
        self.cutter.stopIn = 1.0
    end
    if self.t2Index == 1 then self:Cutter(); self.t2Timer = self.tuning.cutterInterval
    else self:ChainBind(); self.t2Timer = self.tuning.chainInterval end
    self.t2Index = self.t2Index % 2 + 1
end

------------------------------------------------------------------------------
-- Phase 3: Total Darkness (20% HP). The arena collapses inward and a rotating
-- shrinking floor + a rain of eclipse shards make a frantic DPS race.
------------------------------------------------------------------------------

-- Release every active hazard/chain/cutter texture (used at the Phase-3 wipe and
-- at Stop).
function BA:ClearHazards()
    for i = 1, #self.hazards do
        local hz = self.hazards[i]
        if hz.segs then
            for s = 1, #hz.segs do self:ReleaseTex(hz.segs[s]) end
        elseif hz.arms then
            for k = 1, #hz.arms do self:ReleaseTex(hz.arms[k]) end
            if hz.hub then self:ReleaseTex(hz.hub) end
        elseif hz.tex then
            self:ReleaseTex(hz.tex)
        end
    end
    self.hazards = {}
    if self.chains then
        for i = 1, #self.chains.anchors do
            local a = self.chains.anchors[i]
            if not a.broken then self:ReleaseTex(a.tex) end
        end
        self.chains = nil
    end
    self.cutter = nil
    self.pending = {}
end

function BA:EnterPhase3()
    self.phase = 3
    if self.boss then self.boss.invuln = 2.2 end
    self:ClearHazards() -- clean slate for the final phase
    if self.tint then self.tint:SetVertexColor(0.05, 0.02, 0.13, 0.60) end -- near-total dark
    WS.Game:Announce("Total Darkness", "The horizon collapses. Burn her down before the dark takes you.", 3.8)
    WS.UI:Shake(16, 1.4)
    WS.Audio:Play("boss")
    WS.Projectile:SpawnFlash(CX, CY, 260, { 0.9, 0.4, 1.0 })
    self.horizon = {
        minX = self.bounds.minX, maxX = self.bounds.maxX,
        minY = self.bounds.minY, maxY = self.bounds.maxY,
    }
    self.horizonTex = { self:AcquireTex(), self:AcquireTex(), self:AcquireTex(), self:AcquireTex() }
    self.rainTimer = 1.2
    self.enrageTimer = self.tuning.enrageTime
end

-- Collapsing Horizon: the safe box shrinks toward the center; the outer dark deals
-- heavy damage. Rendered as four black borders that close in.
function BA:UpdateHorizon(dt, player)
    local h = self.horizon
    local rate = self.collapseRate * dt
    h.minX = math.min(CX - self.horizonMin, h.minX + rate)
    h.maxX = math.max(CX + self.horizonMin, h.maxX - rate)
    h.minY = math.min(CY - self.horizonMin, h.minY + rate)
    h.maxY = math.max(CY + self.horizonMin, h.maxY - rate)
    local t = self.horizonTex
    PlaceRect(t[1], CX, (h.maxY + WORLD_H) / 2, WORLD_W, WORLD_H - h.maxY) -- top
    PlaceRect(t[2], CX, h.minY / 2, WORLD_W, h.minY)                       -- bottom
    PlaceRect(t[3], h.minX / 2, CY, h.minX, WORLD_H)                       -- left
    PlaceRect(t[4], (h.maxX + WORLD_W) / 2, CY, WORLD_W - h.maxX, WORLD_H) -- right
    for k = 1, 4 do t[k]:SetVertexColor(0.02, 0.0, 0.06, 0.86); t[k]:Show() end
    if player.x < h.minX or player.x > h.maxX or player.y < h.minY or player.y > h.maxY then
        WS.Player:TakeDamage(player, self.darkDamage, "the collapsing dark", nil)
    end
end

-- Eclipse Rain: shards of sun and shadow rain into the shrinking arena. Each
-- telegraphs a red circle, then detonates. As the horizon closes, the same rain
-- fills less space - the squeeze. (Simple distance check, so it always lands fair.)
function BA:UpdateRain(dt, player)
    self.rainTimer = self.rainTimer - dt
    if self.rainTimer > 0 then return end
    self.rainTimer = self.rainInterval
    local h = self.horizon
    local rad = self.meteorRadius
    local count = WS.random(self.tuning.rainMin, self.tuning.rainMax) -- shards per drop
    for _ = 1, count do
        local x = (h.minX + rad) + WS.random() * math.max(1, (h.maxX - rad) - (h.minX + rad))
        local y = (h.minY + rad) + WS.random() * math.max(1, (h.maxY - rad) - (h.minY + rad))
        self:Circle(x, y, rad, 1.05, 0.35, self.meteorDamage)
    end
end

------------------------------------------------------------------------------
-- Lifecycle
------------------------------------------------------------------------------

function BA:Start()
    self.hazards = {}
    self.pending = {}
    self.texPool = self.texPool or {}
    -- Pull every knob from the (bench-overridable) tuning table. Convenience
    -- self.X fields feed the hot loops; the rest are read straight off self.tuning.
    local t = self.tuning
    self.ringDamage = t.ringDamage
    self.ringSpeed = t.ringSpeed
    self.ringGap = t.ringGapP1 * WS.pi / 180   -- single gap (Phase 1); first ring is 2x
    self.ringGap7 = t.ringGapP2 * WS.pi / 180  -- gaps for the multi-opening Phase-2 ring
    self.ringSpin = t.ringSpinP2               -- rad/sec the Phase-2 openings drift
    self.spearDamage = t.spearDamage
    self.cutterDamage = t.cutterDamage
    self.cutterSpin = t.cutterSpin             -- rad/sec; the Cross rotates while active
    self.pullSpeed = t.pullSpeed               -- base Chain drag (px/sec); grows per break
    self.chainRamp = t.chainRamp               -- extra pull per anchor broken
    self.collapseRate = t.collapseRate         -- Phase 3: px/sec each wall closes
    self.horizonMin = t.horizonMin             -- ...but never tighter than this half-size
    self.darkDamage = t.darkDamage             -- per tick in the outer dark
    self.rainInterval = t.rainInterval         -- seconds between Eclipse Rain drops
    self.meteorRadius = t.meteorRadius
    self.meteorDamage = t.meteorDamage
    self.phase = 1
    self.attackIndex = 1        -- Track 1 (flare/spears)
    self.attackTimer = 3.0
    self.t2Index = 1            -- Track 2 (cutter/chains), Phase 2 only
    self.t2Timer = 999
    self.active = true
    self.victoryPending = false
    self.chains = nil
    self.cutter = nil
    self.horizon = nil
    self.horizonTex = nil
    self.rainTimer = 0
    self.enrageTimer = 0

    if not self.tint then
        self.tint = WS.UI.world:CreateTexture(nil, "BACKGROUND", nil, 7)
        self.tint:SetAllPoints(WS.UI.world)
        self.tint:SetTexture(WS.Media.white)
    end
    self.tint:SetVertexColor(0.14, 0.07, 0.26, 0.42)
    self.tint:Show()

    WS.Game.arenaBounds = self.bounds
    if WS.Game.player then WS.Game.player.x, WS.Game.player.y = CX, CY - 240 end

    WS.Enemy:Clear()
    self.boss = WS.Enemy:Spawn("aethelgard", CX, CY, 1, true)
    if self.boss then
        self.boss.maxHealth = t.bossHealth -- tunable arena HP (authoritative over the template)
        self.boss.health = t.bossHealth
        WS.UI:ShowBossBar(self.boss)
        WS.Audio:Play("boss")
        WS.UI:Shake(8, 0.7)
    end
    WS.Game:Announce("Aethelgard, the Eclipse Sovereign", "Sun and shadow converge. Survive.", 4.0)
end

function BA:Update(dt)
    if self.victoryPending then
        self.victoryPending = false
        WS.Game:Announce("Aethelgard is vanquished!", "The eclipse breaks. Dawn returns.", 4.0)
        WS.UI:Shake(10, 0.9)
        WS.Audio:Play("victory")
        WS.Game:EndRun("victory")
        return
    end
    if not self.active then return end
    local player = WS.Game.player
    if not player then return end

    if self.boss then
        self.boss.x, self.boss.y = CX, CY
        if self.boss.invuln and self.boss.invuln > 0 then self.boss.invuln = self.boss.invuln - dt end
        local hp = self.boss.health / self.boss.maxHealth
        if self.phase == 1 and hp <= self.tuning.phase2HP / 100 then self:EnterPhase2()
        elseif self.phase == 2 and hp <= self.tuning.phase3HP / 100 then self:EnterPhase3() end
    end

    if self.chains then self:UpdateChains(dt, player) end

    -- Standing on a safe (green) square grants immunity - a haven to reach when
    -- overlapping mechanics would otherwise be unavoidable. Set BEFORE hazards deal
    -- their damage this tick so it actually protects.
    for i = 1, #self.hazards do
        local hz = self.hazards[i]
        if hz.safe
            and math.abs(player.x - hz.cx) <= hz.w / 2 + player.radius * 0.35
            and math.abs(player.y - hz.cy) <= hz.h / 2 + player.radius * 0.35 then
            player.invulnerable = math.max(player.invulnerable, 0.16)
            break
        end
    end

    self:UpdatePending(dt)
    self:UpdateHazards(dt, player)
    if not WS.Game.running then return end

    if self.phase == 3 then
        -- Total Darkness: the collapse + Eclipse Rain ARE the fight; earlier tracks
        -- stop. Win by killing her, or the 30s enrage wipes the arena.
        self:UpdateHorizon(dt, player)
        self:UpdateRain(dt, player)
        if not WS.Game.running then return end
        self.enrageTimer = self.enrageTimer - dt
        if self.enrageTimer <= 0 then
            WS.Projectile:SpawnFlash(CX, CY, 900, { 1.0, 0.9, 0.6 })
            WS.UI:Shake(20, 1.6)
            player.invulnerable = 0
            WS.Player:TakeDamage(player, 99999, "the Total Eclipse", nil)
        end
        return
    end

    -- Track 1 runs in Phases 1-2; Track 2 layers on in Phase 2 (overlapping).
    self.attackTimer = self.attackTimer - dt
    if self.attackTimer <= 0 then self:AdvanceTrack1() end
    if self.phase == 2 then
        self.t2Timer = self.t2Timer - dt
        if self.t2Timer <= 0 then self:AdvanceTrack2() end
    end
end

function BA:OnBossDead()
    if not self.active then return end
    self.active = false
    self.boss = nil
    self.victoryPending = true
    WS.Game.run.victorious = true
end

function BA:Stop()
    self.active = false
    self.boss = nil
    WS.Game.arenaBounds = nil
    if self.tint then self.tint:Hide() end
    if self.hazards then self:ClearHazards() end
    if self.horizonTex then
        for k = 1, #self.horizonTex do self:ReleaseTex(self.horizonTex[k]) end
        self.horizonTex = nil
    end
    self.horizon = nil
end
