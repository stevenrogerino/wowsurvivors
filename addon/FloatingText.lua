local _, WS = ...

-- Pooled floating combat text drawn inside the world frame: damage numbers,
-- crits, heals, gold, and pickup callouts. FontStrings are recycled and the
-- pool is hard-capped; when full, the oldest entry is stolen rather than
-- allocating more.
WS.FloatingText = {}
local FloatingText = WS.FloatingText

local RISE_SPEED = 42
local LIFETIME = 0.85

function FloatingText:Initialize()
    -- A dedicated child frame keeps text above entity frames.
    self.layer = CreateFrame("Frame", nil, WS.UI.world)
    self.layer:SetAllPoints()
    self.layer:SetFrameLevel(WS.UI.world:GetFrameLevel() + 30)

    self.pool = WS.Pool:New(function()
        local text = self.layer:CreateFontString(nil, "OVERLAY", "GameFontNormal")
        -- Blizzard's own floating combat text font (locale-correct); if the
        -- font file is unavailable the template's font quietly remains.
        text:SetFont(DAMAGE_TEXT_FONT or "Fonts\\FRIZQT__.TTF", 16, "OUTLINE")
        return { fs = text }
    end, function(entry)
        entry.fs:Hide()
    end, 24)
end

function FloatingText:Spawn(x, y, message, r, g, b, size, isCrit)
    if self.pool.count >= WS.Constants.MAX_FLOATING_TEXT then
        self.pool:Release(self.pool.active[1])
    end
    local entry = self.pool:Acquire()
    entry.x, entry.y = x, y + 16
    entry.life = LIFETIME
    entry.crit = isCrit
    local fs = entry.fs
    fs:SetFont(DAMAGE_TEXT_FONT or "Fonts\\FRIZQT__.TTF", isCrit and (size + 7) or size, "OUTLINE")
    fs:SetText(message)
    fs:SetTextColor(r, g, b, 1)
    fs:SetAlpha(1)
    fs:ClearAllPoints()
    fs:SetPoint("CENTER", WS.UI.world, "BOTTOMLEFT", entry.x, entry.y)
    fs:Show()
end

-- Convenience wrappers -------------------------------------------------------

function FloatingText:Damage(x, y, amount, isCrit)
    if not WoWSurvivorsDB.settings.damageNumbers then return end
    if isCrit then
        self:Spawn(x, y, WS.floor(amount), 1.0, 0.82, 0.1, 15, true)
    else
        self:Spawn(x, y, WS.floor(amount), 1.0, 1.0, 1.0, 13, false)
    end
end

function FloatingText:PlayerHurt(x, y, amount)
    self:Spawn(x, y, "-" .. WS.floor(amount), 0.95, 0.2, 0.2, 15, false)
end

function FloatingText:Heal(x, y, amount)
    if not WoWSurvivorsDB.settings.healNumbers then return end
    self:Spawn(x, y, "+" .. WS.floor(amount), 0.25, 0.95, 0.3, 14, false)
end

function FloatingText:Gold(x, y, amount)
    self:Spawn(x, y, "+" .. WS.floor(amount) .. "g", 1.0, 0.82, 0.1, 14, false)
end

function FloatingText:Notice(x, y, message, r, g, b)
    self:Spawn(x, y, message, r or 0.9, 0.9, 1.0, 14, false)
end

------------------------------------------------------------------------------

function FloatingText:Update(dt)
    local i = 1
    while i <= self.pool.count do
        local entry = self.pool.active[i]
        entry.life = entry.life - dt
        if entry.life <= 0 then
            self.pool:Release(entry)
        else
            entry.y = entry.y + RISE_SPEED * dt
            local fs = entry.fs
            fs:ClearAllPoints()
            fs:SetPoint("CENTER", WS.UI.world, "BOTTOMLEFT", entry.x, entry.y)
            if entry.life < 0.35 then
                fs:SetAlpha(entry.life / 0.35)
            end
            i = i + 1
        end
    end
end

function FloatingText:Clear()
    if self.pool then self.pool:ReleaseAll() end
end
