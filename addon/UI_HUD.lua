local _, WS = ...

local UI = WS.UI

-- In-run HUD: XP bar across the top, a unit-frame-styled survivor plate with
-- the player's real portrait, run timer, kill/gold counters, a raid-style
-- boss bar, weapon + passive strips, and center-screen announcements.
function UI:CreateHUD()
    local root = self.root
    local hud = CreateFrame("Frame", nil, root)
    hud:SetAllPoints()
    -- Above the world frame so HUD text is never shaded by the vignette.
    hud:SetFrameLevel(root:GetFrameLevel() + 30)
    hud:Hide()
    self.hud = hud

    ----------------------------------------------------------------- XP bar
    local xp = CreateFrame("StatusBar", nil, hud, "BackdropTemplate")
    xp:SetPoint("TOPLEFT", root, "TOPLEFT", 10, -8)
    xp:SetPoint("TOPRIGHT", root, "TOPRIGHT", -10, -8)
    xp:SetHeight(16)
    xp:SetStatusBarTexture(WS.Media.statusBar)
    xp:SetStatusBarColor(0.58, 0.10, 0.85)
    xp:SetMinMaxValues(0, 100)
    self:ApplyInsetBackdrop(xp, 0.04, 0.03, 0.07, 0.95)
    xp.text = self:CreateText(xp, 11)
    xp.text:SetPoint("CENTER")
    self.xpBar = xp

    --------------------------------------------------- Survivor plate (left)
    local plate = CreateFrame("Frame", nil, hud, "BackdropTemplate")
    plate:SetSize(250, 34)
    plate:SetPoint("TOPLEFT", xp, "BOTTOMLEFT", 0, -4)
    self:ApplyInsetBackdrop(plate)

    plate.portrait = plate:CreateTexture(nil, "ARTWORK")
    plate.portrait:SetSize(26, 26)
    plate.portrait:SetPoint("LEFT", 5, 0)
    plate.portraitRing = self:AddIconEdge(plate, plate.portrait)

    local health = CreateFrame("StatusBar", nil, plate)
    health:SetPoint("TOPLEFT", plate.portrait, "TOPRIGHT", 6, -1)
    health:SetPoint("BOTTOMRIGHT", plate, "BOTTOMRIGHT", -6, 5)
    health:SetStatusBarTexture(WS.Media.statusBar)
    health:SetStatusBarColor(0.0, 0.75, 0.0)
    health:SetMinMaxValues(0, 100)
    health:SetValue(100)
    health.bg = health:CreateTexture(nil, "BACKGROUND")
    health.bg:SetAllPoints()
    health.bg:SetTexture(WS.Media.white)
    health.bg:SetVertexColor(0.2, 0, 0, 0.8)
    health.text = self:CreateText(health, 10)
    health.text:SetPoint("CENTER")
    self.healthBar = health
    self.playerPlate = plate

    ----------------------------------------------------------- Timer center
    local timer = self:CreateFancyText(hud, 26)
    timer:SetPoint("TOP", xp, "BOTTOM", 0, -4)
    timer:SetText("0:00")
    self.timerText = timer

    ------------------------------------------------- Kills + gold (right)
    local counters = CreateFrame("Frame", nil, hud, "BackdropTemplate")
    counters:SetSize(420, 34)
    counters:SetPoint("TOPRIGHT", xp, "BOTTOMRIGHT", 0, -4)
    self:ApplyInsetBackdrop(counters)

    counters.skull = counters:CreateTexture(nil, "ARTWORK")
    counters.skull:SetTexture(WS.Media.raidIcons)
    counters.skull:SetTexCoord(0.75, 1, 0.25, 0.5)
    counters.skull:SetSize(16, 16)
    counters.skull:SetPoint("LEFT", 10, 0)
    counters.kills = self:CreateText(counters, 13)
    counters.kills:SetPoint("LEFT", counters.skull, "RIGHT", 5, 0)
    counters.kills:SetText("0")

    counters.sword = counters:CreateTexture(nil, "ARTWORK")
    counters.sword:SetTexture("Interface\\Icons\\INV_Sword_27")
    counters.sword:SetTexCoord(0.08, 0.92, 0.08, 0.92)
    counters.sword:SetSize(15, 15)
    counters.sword:SetPoint("LEFT", counters, "CENTER", -128, 0)
    counters.dps = self:CreateText(counters, 13, { 1.0, 0.55, 0.35 })
    counters.dps:SetPoint("LEFT", counters.sword, "RIGHT", 5, 0)
    counters.dps:SetText("0 DPS")

    -- Healing per second, right next to DPS (green cross).
    counters.cross = counters:CreateTexture(nil, "ARTWORK")
    counters.cross:SetTexture("Interface\\Icons\\Spell_Holy_Heal")
    counters.cross:SetTexCoord(0.08, 0.92, 0.08, 0.92)
    counters.cross:SetSize(15, 15)
    counters.cross:SetPoint("LEFT", counters, "CENTER", -18, 0)
    counters.hps = self:CreateText(counters, 13, { 0.45, 0.9, 0.5 })
    counters.hps:SetPoint("LEFT", counters.cross, "RIGHT", 5, 0)
    counters.hps:SetText("0 HPS")

    counters.coin = counters:CreateTexture(nil, "ARTWORK")
    counters.coin:SetTexture("Interface\\Icons\\INV_Misc_Coin_01")
    counters.coin:SetTexCoord(0.08, 0.92, 0.08, 0.92)
    counters.coin:SetSize(15, 15)
    counters.coin:SetPoint("LEFT", counters, "CENTER", 108, 0)
    counters.gold = self:CreateText(counters, 13, WS.Constants.TEXT_GOLD)
    counters.gold:SetPoint("LEFT", counters.coin, "RIGHT", 5, 0)
    counters.gold:SetText("0")
    self.counters = counters

    ------------------------------------------------------------- Boss bar
    local boss = CreateFrame("StatusBar", nil, hud, "BackdropTemplate")
    boss:SetSize(460, 20)
    boss:SetPoint("TOP", timer, "BOTTOM", 0, -6)
    boss:SetStatusBarTexture(WS.Media.statusBar)
    boss:SetStatusBarColor(0.85, 0.10, 0.10)
    boss:SetMinMaxValues(0, 1)
    self:ApplyInsetBackdrop(boss, 0.1, 0.02, 0.02, 0.95)
    boss.name = self:CreateText(boss, 12, { 1.0, 0.9, 0.9 })
    boss.name:SetPoint("CENTER")
    boss.skullLeft = boss:CreateTexture(nil, "OVERLAY")
    boss.skullLeft:SetTexture(WS.Media.raidIcons)
    boss.skullLeft:SetTexCoord(0.75, 1, 0.25, 0.5)
    boss.skullLeft:SetSize(22, 22)
    boss.skullLeft:SetPoint("RIGHT", boss, "LEFT", -6, 0)
    boss.skullRight = boss:CreateTexture(nil, "OVERLAY")
    boss.skullRight:SetTexture(WS.Media.raidIcons)
    boss.skullRight:SetTexCoord(0.75, 1, 0.25, 0.5)
    boss.skullRight:SetSize(22, 22)
    boss.skullRight:SetPoint("LEFT", boss, "RIGHT", 6, 0)
    boss:Hide()
    self.bossBar = boss

    --------------------------------------------- Weapon and passive strips
    local weapons = CreateFrame("Frame", nil, hud)
    weapons:SetSize(320, 40)
    weapons:SetPoint("BOTTOMLEFT", root, "BOTTOMLEFT", 14, 8)
    self.weaponStrip = weapons
    self.weaponIcons = {}

    local passives = CreateFrame("Frame", nil, hud)
    passives:SetSize(420, 30)
    passives:SetPoint("BOTTOMRIGHT", root, "BOTTOMRIGHT", -14, 12)
    self.passiveStrip = passives
    self.passiveIcons = {}

    local hint = self:CreateText(hud, 11, WS.Constants.TEXT_GREY)
    hint:SetPoint("BOTTOM", root, "BOTTOM", 0, 36)
    hint:SetText("Move with WASD or the arrow keys - your weapons fight for you.  Esc to pause.")
    self.hudHint = hint

    -- Persistent status line across the bottom-center blank space: the run's mode
    -- + modifiers, and the live Death Itself tally once Death has arrived (30:00).
    local status = self:CreateText(hud, 12)
    status:SetPoint("BOTTOM", root, "BOTTOM", 0, 14)
    self.statusLine = status

    ------------------------------------------------------- Announcements
    -- Big Morpheus headline with a raid-warning styled subline, centered
    -- high in the world so it never covers the survivor.
    local announce = self:CreateFancyText(self.world, 34)
    announce:SetPoint("CENTER", self.world, "CENTER", 0, 190)
    announce:SetText("")
    announce:Hide()
    self.announceTitle = announce
    local announceSub = self:CreateText(self.world, 18, { 1.0, 0.25, 0.2 })
    announceSub:SetPoint("TOP", announce, "BOTTOM", 0, -8)
    announceSub:SetText("")
    announceSub:Hide()
    self.announceSub = announceSub
end

------------------------------------------------------------------------------
-- Per-tick refresh
------------------------------------------------------------------------------

function UI:UpdateHUD(player, run)
    local health = self.healthBar
    health:SetMinMaxValues(0, player.maxHealth)
    health:SetValue(WS.max(0, player.health))
    health.text:SetText(WS.floor(WS.max(0, player.health)) .. " / " .. WS.floor(player.maxHealth))

    self.xpBar:SetMinMaxValues(0, player.xpToNext)
    self.xpBar:SetValue(WS.min(player.xp, player.xpToNext))
    self.xpBar.text:SetText("Level " .. player.level .. "  -  " .. WS.floor(player.xp) .. " / " .. player.xpToNext .. " XP")

    -- The movement hint has done its job after the first minute.
    if self.hudHint:IsShown() and run.time > 45 then
        self.hudHint:Hide()
    elseif not self.hudHint:IsShown() and run.time <= 45 then
        self.hudHint:Show()
    end

    self.timerText:SetText(WS.FormatTime(run.time))
    self.counters.kills:SetText(WS.FormatNumber(run.kills))
    self.counters.dps:SetText(WS.FormatNumber(run.dps) .. " DPS")
    self.counters.hps:SetText(WS.FormatNumber(run.hps or 0) .. " HPS")
    self.counters.gold:SetText(WS.FormatNumber(run.gold))
    self:UpdateStatusLine(run)
end

-- Bottom-center status: run mode/modifiers, plus how many Death Itself stalk the
-- field and how many you've put down (shown once Death is in play at 30:00).
function UI:UpdateStatusLine(run)
    local diff = run.difficulty or "veteran"
    local parts = { diff:sub(1, 1):upper() .. diff:sub(2) }
    if run.mode == "endless" then parts[#parts + 1] = "Endless" end
    if run.hyper then parts[#parts + 1] = "Hyper" end
    if run.hurry then parts[#parts + 1] = "Hurry" end
    if run.inverse then parts[#parts + 1] = "Inverse" end
    local text = "|cffe6cf8a" .. table.concat(parts, "  \194\183  ") .. "|r" -- \194\183 = middot
    -- (Desecration has no HUD readout on purpose - the burst speaks for itself,
    --  and the end-screen meter carries the totals.)
    local player = WS.Game.player
    -- Fel charge / Metamorphosis, shown only once the survivor is fel-attuned.
    if player and (player.felAttuned or 0) > 0 then
        if (player.metaTimer or 0) > 0 then
            text = text .. ("      |cff88ff33METAMORPHOSIS  %.1fs|r"):format(player.metaTimer)
        else
            local pct = WS.floor((player.fel or 0) / (WS.Config.felToMeta or 1200) * 100)
            text = text .. ("      |cff88ff33Fel:|r |cffbbff88%d%%|r"):format(WS.min(100, pct))
        end
    end
    if run.time >= 1800 or (run.deathsSlain or 0) > 0 then
        local onField = WS.Enemy:CountDeath()
        text = text .. "      |cffff5555Death Itself:|r |cffffb3b3" .. onField
            .. " on field  \194\183  " .. (run.deathsSlain or 0) .. " slain|r"
    end
    if text ~= self.statusLine.last then
        self.statusLine:SetText(text)
        self.statusLine.last = text
    end
end

function UI:SetPortrait(characterData)
    SetPortraitTexture(self.playerPlate.portrait, "player")
end

function UI:ShowBossBar(enemy)
    self.bossBar.enemy = enemy
    self.bossBar.name:SetText(enemy.template.name)
    self.bossBar:SetValue(1)
    self.bossBar:Show()
end

function UI:UpdateBossBar()
    local enemy = self.bossBar.enemy
    if not enemy or not enemy.poolIndex or not enemy.boss then
        self.bossBar:Hide()
        self.bossBar.enemy = nil
        return
    end
    self.bossBar:SetValue(WS.max(0, enemy.health / enemy.maxHealth))
end

function UI:HideBossBar()
    self.bossBar:Hide()
    self.bossBar.enemy = nil
end

-- Weapon strip: one slot per carried weapon with its rank (or "MAX"/"EVO").
function UI:RefreshWeaponStrip(player)
    for i = 1, #self.weaponIcons do self.weaponIcons[i]:Hide() end
    for i = 1, #player.weapons do
        local weapon = player.weapons[i]
        local slot = self.weaponIcons[i]
        if not slot then
            slot = CreateFrame("Frame", nil, self.weaponStrip)
            slot:SetSize(34, 34)
            slot:SetPoint("BOTTOMLEFT", self.weaponStrip, "BOTTOMLEFT", (i - 1) * 40, 0)
            slot.texture = slot:CreateTexture(nil, "ARTWORK")
            slot.texture:SetAllPoints()
            slot.texture:SetTexCoord(0.08, 0.92, 0.08, 0.92)
            slot.border = self:AddIconEdge(slot, slot.texture)
            slot.rank = self:CreateText(slot, 10, WS.Constants.TEXT_GOLD)
            slot.rank:SetPoint("BOTTOMRIGHT", -1, 1)
            slot.glow = slot:CreateTexture(nil, "OVERLAY")
            slot.glow:SetTexture(WS.Media.glowBorder)
            slot.glow:SetBlendMode("ADD")
            slot.glow:SetPoint("TOPLEFT", -10, 10)
            slot.glow:SetPoint("BOTTOMRIGHT", 10, -10)
            slot.glow:SetVertexColor(1, 0.5, 1, 0.9)
            self.weaponIcons[i] = slot
        end
        slot.texture:SetTexture(weapon.evolved and weapon.data.evolveIcon or weapon.data.icon)
        if weapon.evolved then
            slot.rank:SetText("EVO")
            slot.glow:Show()
        else
            slot.rank:SetText(weapon.level >= WS.WEAPON_MAX_LEVEL and "MAX" or weapon.level)
            slot.glow:Hide()
        end
        slot:Show()
    end
    self:RefreshPassiveStrip(player)
end

-- Passive strip: smaller icons with rank pips, right-aligned.
function UI:RefreshPassiveStrip(player)
    for i = 1, #self.passiveIcons do self.passiveIcons[i]:Hide() end
    local shown = 0
    for i = 1, #WS.UpgradeOrder do
        local id = WS.UpgradeOrder[i]
        local rank = player.upgradeLevels[id]
        if rank and rank > 0 then
            shown = shown + 1
            local slot = self.passiveIcons[shown]
            if not slot then
                slot = CreateFrame("Frame", nil, self.passiveStrip)
                slot:SetSize(24, 24)
                slot:SetPoint("BOTTOMRIGHT", self.passiveStrip, "BOTTOMRIGHT", -(shown - 1) * 29, 0)
                slot.texture = slot:CreateTexture(nil, "ARTWORK")
                slot.texture:SetAllPoints()
                slot.texture:SetTexCoord(0.08, 0.92, 0.08, 0.92)
                slot.border = self:AddIconEdge(slot, slot.texture)
                slot.rank = self:CreateText(slot, 9, WS.Constants.TEXT_GOLD)
                slot.rank:SetPoint("BOTTOMRIGHT", 0, 0)
                self.passiveIcons[shown] = slot
            end
            slot.texture:SetTexture(WS.Upgrades[id].icon)
            slot.rank:SetText(rank)
            slot:Show()
        end
    end
end

-- Center-screen announcement ("Gnarlfang the Ravager approaches!" etc).
-- Fade-out is driven from Game:Tick via UpdateAnnouncement.
function UI:Announce(title, subtitle, holdTime)
    self.announceTitle:SetText(title or "")
    self.announceTitle:SetAlpha(1)
    self.announceTitle:Show()
    if subtitle and subtitle ~= "" then
        self.announceSub:SetText(subtitle)
        self.announceSub:SetAlpha(1)
        self.announceSub:Show()
    else
        self.announceSub:Hide()
    end
    self.announceTime = holdTime or 3.0
end

function UI:UpdateAnnouncement(dt)
    if not self.announceTime then return end
    self.announceTime = self.announceTime - dt
    if self.announceTime <= 0 then
        self.announceTime = nil
        self.announceTitle:Hide()
        self.announceSub:Hide()
    elseif self.announceTime < 0.6 then
        local alpha = self.announceTime / 0.6
        self.announceTitle:SetAlpha(alpha)
        self.announceSub:SetAlpha(alpha)
    end
end
