local _, WS = ...

-- Familiars: spirit wolves that HUNT. Each wolf picks the nearest enemy,
-- bounds it down, and bites - a leaping melee maul - then peels off, retargets,
-- and does it again. Rendered with the real spirit-wolf 3D model (icon
-- fallback), bounding as it runs and pouncing on each bite.
--
-- Granted in-run by the Spirit Companion passive (one wolf per rank). Numbers
-- live in `Familiar.tuning` so the Tuning page can adjust them live.
WS.Familiar = {}
local Familiar = WS.Familiar

local MAX = 6 -- shared cap across every summon kind (3 wolves + 3 ghouls)
local SIZE = 46

Familiar.tuning = {
    dashSpeed   = 340,  -- how fast a wolf closes on prey
    biteRadius  = 46,   -- area of each bite
    biteCooldown = 0.55,-- seconds between bites
    dmgBase     = 14,   -- bite damage floor
    dmgPerLevel = 1.0,  -- + per survivor level
    huntRange   = 560,  -- how far a wolf will chase
    leash       = 440,  -- snap back toward the survivor past this
    wanderSpeed = 150,  -- loping speed when nothing to hunt
    -- Ghouls are the DK's shambling counterpart: slower to close and slower to
    -- swing, but they hit harder and their claws sweep a wider arc.
    ghoulSpeedMult  = 0.70, -- x dashSpeed
    ghoulRadiusMult = 1.35, -- x biteRadius
    ghoulCdMult     = 1.45, -- x biteCooldown
    ghoulDmgMult    = 2.10, -- x bite damage
    -- Creature models. Blind display-ID picks are unreliable, so these are
    -- tunable and previewable live with "/survivors summon <kind> <id>".
    -- 1236 = spirit wolf. 137 = the classic ghoul, the same model the
    -- "Rotting Shambler" enemy already uses, so it is known-good here.
    wolfDisplay  = 1236,
    ghoulDisplay = 137,
}

-- Per-kind presentation + the multipliers applied on top of the shared tuning.
-- Adding another summon later means one more entry here, nothing else.
local KINDS = {
    wolf = {
        display = "wolfDisplay", icon = "Interface\\Icons\\Spell_Nature_SpiritWolf",
        source = "wolves", flash = { 0.60, 0.85, 1.00 },
        -- (wolves use the shared tuning values unmodified)
    },
    ghoul = {
        display = "ghoulDisplay", icon = "Interface\\Icons\\Spell_Shadow_AnimateDead",
        source = "ghouls", flash = { 0.55, 0.90, 0.40 },
        speedMult = "ghoulSpeedMult", radiusMult = "ghoulRadiusMult",
        cdMult = "ghoulCdMult", dmgMult = "ghoulDmgMult",
    },
}
Familiar.KINDS = KINDS

function Familiar:Initialize()
    self.list = {}
    self.count = 0
end

function Familiar:Reset()
    self.count = 0
    if self.list then
        for i = 1, #self.list do
            local fam = self.list[i]
            fam.frame:Hide()
            if fam.model then fam.model:Hide() end
        end
    end
end

-- Adds a summon of `kind` ("wolf" / "ghoul"), rendered as a 3D creature model
-- (icon fallback if it fails).
function Familiar:Add(kind)
    local spec = KINDS[kind] or KINDS.wolf
    local displayId = self.tuning[spec.display]
    if (self.count or 0) >= MAX then return end
    self.count = (self.count or 0) + 1
    local fam = self.list[self.count]
    if not fam then
        local frame = WS.UI:CreateEntityFrame(SIZE)
        WS.UI:ApplyRoundMask(frame)
        frame:SetFrameLevel(WS.UI.world:GetFrameLevel() + 12)
        fam = { frame = frame }
        -- The 3D wolf sits above the (fallback) icon.
        local model = CreateFrame("PlayerModel", nil, frame)
        model:SetPoint("TOPLEFT", -8, 16)
        model:SetPoint("BOTTOMRIGHT", 8, -4)
        model:SetScript("OnModelLoaded", function()
            if fam.modelActive then frame.icon:SetAlpha(0) end
        end)
        fam.model = model
        self.list[self.count] = fam
    end

    fam.spec = spec
    fam.frame.icon:SetTexture(spec.icon)
    fam.frame.icon:SetTexCoord(0.08, 0.92, 0.08, 0.92)
    fam.frame.icon:SetAlpha(1)
    fam.frame:SetSize(SIZE, SIZE)

    fam.modelActive = false
    fam.model:ClearModel()
    if displayId then
        fam.model:SetDisplayInfo(displayId)
        fam.model:SetAlpha(1)
        fam.model:Show()
        fam.modelActive = true
        fam.facing = 0
        fam.model:SetFacing(0)
    end

    local player = WS.Game.player
    local a = (self.count / MAX) * WS.tau
    fam.x = player.x + WS.cos(a) * 60
    fam.y = player.y + WS.sin(a) * 60
    fam.target = nil
    fam.biteTimer = 0
    fam.leap = 0        -- >0 during a pounce (drives the bound arc + scale pop)
    fam.wander = a
    fam.frame:Show()
end

function Familiar:Update(dt)
    if not self.count or self.count == 0 then return end
    local player = WS.Game.player
    local t = self.tuning

    -- Unholy Command (and any future summon buff) scales every kind at once.
    local dmgBoost = 1 + (player.summonDamage or 0)
    local hasteBoost = 1 + (player.summonHaste or 0)

    for i = 1, self.count do
        local fam = self.list[i]
        local spec = fam.spec or KINDS.wolf
        -- Per-kind multipliers over the shared tuning (wolves = 1x across the board).
        local kSpeed = spec.speedMult and t[spec.speedMult] or 1
        local kRadius = spec.radiusMult and t[spec.radiusMult] or 1
        local kCd = spec.cdMult and t[spec.cdMult] or 1
        local kDmg = spec.dmgMult and t[spec.dmgMult] or 1
        fam.biteTimer = fam.biteTimer - dt
        if fam.leap > 0 then fam.leap = fam.leap - dt end

        -- Drop a dead / gone / too-far target.
        local target = fam.target
        if target and (not target.poolIndex
            or WS.DistanceSquared(fam.x, fam.y, target.x, target.y) > t.huntRange * t.huntRange) then
            target = nil
        end
        if not target and fam.biteTimer <= 0 then
            target = WS.Enemy:FindNearest(fam.x, fam.y, t.huntRange)
        end
        fam.target = target

        local speed, tx, ty, moving = 0, nil, nil, true
        if target then
            tx, ty, speed = target.x, target.y, t.dashSpeed * kSpeed
        else
            fam.wander = fam.wander + dt * 1.6
            tx = player.x + WS.cos(fam.wander) * 90
            ty = player.y + WS.sin(fam.wander) * 90
            speed = t.wanderSpeed
        end
        if WS.DistanceSquared(fam.x, fam.y, player.x, player.y) > t.leash * t.leash then
            tx, ty, speed, fam.target = player.x, player.y, t.dashSpeed * kSpeed, nil
        end

        local dx, dy, dist = WS.Normalize(tx - fam.x, ty - fam.y)
        fam.x = fam.x + dx * speed * dt
        fam.y = fam.y + dy * speed * dt
        if speed < 20 then moving = false end

        -- Drive the model: face travel, run while moving, and leap on bite.
        if fam.modelActive then
            local facing = (dx < -0.05 and 0.7) or (dx > 0.05 and -0.7) or fam.facing or 0
            if facing ~= fam.facing then fam.facing = facing; fam.model:SetFacing(facing) end
            local anim = (fam.leap > 0 and 5) or (moving and 5 or 0)
            if anim ~= fam.anim then fam.anim = anim; fam.model:SetAnimation(anim) end
        end

        -- Bounding: a bob while running, and a bigger arc mid-pounce.
        local bob = 0
        if fam.leap > 0 then
            bob = WS.sin((1 - fam.leap / 0.28) * WS.pi) * 22 -- pounce arc
        elseif moving then
            bob = WS.abs(WS.sin(WS.Game.run.time * 13 + i)) * 6 -- running bound
        end
        local size = SIZE + (fam.leap > 0 and 10 or 0)
        WS.UI:Place(fam.frame, fam.x, fam.y + bob, size)

        -- Strike when it reaches prey: a wolf's leaping maul, a ghoul's wide claw.
        local radius = t.biteRadius * kRadius
        if target and fam.biteTimer <= 0 and dist < target.radius + radius * 0.6 then
            fam.biteTimer = t.biteCooldown * kCd / hasteBoost
            fam.leap = 0.28
            local dmg = (t.dmgBase + player.level * t.dmgPerLevel) * kDmg * dmgBoost
                * player.damageMultiplier * WS.Constants.PLAYER_DAMAGE_SCALE
            WS.Enemy:DamageArea(fam.x, fam.y, radius, dmg, nil, nil, spec.source)
            WS.Projectile:SpawnFlash(fam.x, fam.y, radius, spec.flash)
            fam.target = nil
        end
    end
end

-- Re-skin every summon of `kind` on the spot. Display IDs are near-impossible to
-- pick blind, so "/survivors summon ghoul 137" swaps the model live rather than
-- forcing a new run to find out what a number looks like.
function Familiar:SetKindDisplay(kind, displayId)
    local spec = KINDS[kind]
    if not spec then return false end
    self.tuning[spec.display] = displayId
    for i = 1, (self.count or 0) do
        local fam = self.list[i]
        if fam and fam.spec == spec and fam.model then
            fam.model:ClearModel()
            fam.model:SetDisplayInfo(displayId)
            fam.model:SetAlpha(1)
            fam.model:Show()
            fam.modelActive = true
            fam.facing, fam.anim = nil, nil -- force facing/animation to re-apply
        end
    end
    return true
end

function Familiar:Clear()
    self:Reset()
end
