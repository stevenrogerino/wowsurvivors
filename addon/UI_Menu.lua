local _, WS = ...

local UI = WS.UI

local function ClassColor(class)
    local token = class and class:upper()
    local color = token and RAID_CLASS_COLORS and RAID_CLASS_COLORS[token]
    if color then return color.r, color.g, color.b end
    return 1, 0.82, 0.1
end

------------------------------------------------------------------------------
-- Main menu: survivor + battlefield selection, footer actions, sub-panels.
------------------------------------------------------------------------------

function UI:CreateMenu()
    local menu = CreateFrame("Frame", nil, self.root, "BackdropTemplate")
    menu:SetSize(950, 700)
    menu:SetPoint("CENTER", 0, 0)
    -- Above the world frame and its vignette shading, which otherwise draw
    -- over text written directly on this frame.
    menu:SetFrameLevel(self.root:GetFrameLevel() + 30)
    self:ApplyDialogBackdrop(menu, true)
    self.menu = menu

    self:CreateHeaderPlate(menu, "WoW Survivors", 330)
    local subtitle = self:CreateText(menu, 12, WS.Constants.TEXT_GREY)
    subtitle:SetPoint("TOP", menu, "TOP", 0, -42)
    subtitle:SetText("An arcade of endless hordes, contained entirely within your interface")

    -- Banked gold, top right.
    local goldFrame = CreateFrame("Frame", nil, menu, "BackdropTemplate")
    goldFrame:SetSize(130, 26)
    goldFrame:SetPoint("TOPRIGHT", -20, -20)
    self:ApplyInsetBackdrop(goldFrame)
    goldFrame.coin = goldFrame:CreateTexture(nil, "ARTWORK")
    goldFrame.coin:SetTexture("Interface\\Icons\\INV_Misc_Coin_01")
    goldFrame.coin:SetTexCoord(0.08, 0.92, 0.08, 0.92)
    goldFrame.coin:SetSize(16, 16)
    goldFrame.coin:SetPoint("LEFT", 6, 0)
    goldFrame.text = self:CreateText(goldFrame, 13, WS.Constants.TEXT_GOLD)
    goldFrame.text:SetPoint("LEFT", goldFrame.coin, "RIGHT", 6, 0)
    self.menuGold = goldFrame

    ------------------------------------------------------------ Survivors
    local charHeading = self:CreateFancyText(menu, 15)
    charHeading:SetPoint("TOPLEFT", 32, -66)
    charHeading:SetText("Choose Your Survivor")

    -- Scrolling viewport: the roster outgrew the panel once the Death Knight
    -- joined, so the list clips and scrolls instead of running off the bottom.
    local charList = self:CreateScrollList(menu, 444, 470)
    charList:SetPoint("TOPLEFT", 30, -88)
    self.characterList = charList

    self.characterButtons = {}
    for i = 1, #WS.CharacterOrder do
        local id = WS.CharacterOrder[i]
        local card = self:CreateIconCard(charList.content, 430, 56)
        card:SetPoint("TOPLEFT", 0, -(i - 1) * 62)
        card.id = id
        card:SetScript("OnClick", function(button)
            if button.locked then return end
            WS.Game.selectedCharacter = button.id
            WS.Audio:Play("click")
            UI:RefreshMenu()
        end)
        card:HookScript("OnEnter", function(button) UI:ShowCharacterTooltip(button) end)
        card:HookScript("OnLeave", GameTooltip_Hide)
        self.characterButtons[i] = card
    end
    charList:SetContentHeight(#WS.CharacterOrder * 62)

    ---------------------------------------------------------- Battlefields
    local mapHeading = self:CreateFancyText(menu, 15)
    mapHeading:SetPoint("TOPLEFT", 492, -66)
    mapHeading:SetText("Choose Your Battlefield")

    local mapList = self:CreateScrollList(menu, 444, 470)
    mapList:SetPoint("TOPLEFT", 490, -88)
    self.mapList = mapList

    self.mapButtons = {}
    for i = 1, #WS.MapOrder do
        local id = WS.MapOrder[i]
        local card = self:CreateIconCard(mapList.content, 430, 56)
        card:SetPoint("TOPLEFT", 0, -(i - 1) * 62)
        card.id = id
        card:SetScript("OnClick", function(button)
            if button.locked then return end
            WS.Game.selectedMap = button.id
            WS.Audio:Play("click")
            UI:RefreshMenu()
        end)
        card:HookScript("OnEnter", function(button) UI:ShowMapTooltip(button) end)
        card:HookScript("OnLeave", GameTooltip_Hide)
        self.mapButtons[i] = card
    end
    mapList:SetContentHeight(#WS.MapOrder * 62)

    -- Best-time note, pinned under the (fixed-height) list rather than tracking
    -- the map count, so adding battlefields can never push it off the panel.
    local mapNote = self:CreateText(menu, 11, WS.Constants.TEXT_GREY)
    mapNote:SetPoint("TOPLEFT", 494, -88 - 470 - 6)
    mapNote:SetText("Survive the full 30 minutes for Victory - when Death itself arrives to end the tale.")

    ---------------------------------------------------------------- Footer
    -- Row 1: difficulty preset + run modifiers.
    local difficulty = self:CreatePanelButton(menu, 200, 24, "", function()
        local order = WS.Config.difficultyOrder
        local current = WoWSurvivorsDB.settings.difficulty
        local index = 1
        for i = 1, #order do if order[i] == current then index = i end end
        WoWSurvivorsDB.settings.difficulty = order[index % #order + 1]
        UI:RefreshMenu()
    end)
    difficulty:SetPoint("BOTTOMLEFT", 30, 54)
    self.difficultyButton = difficulty

    -- Hyper mode: unlocked per battlefield by winning it once.
    local hyperCheck = self:CreateCheckbox(menu, "Hyper",
        function() return WS.Game.hyperSelected end,
        function(value) WS.Game.hyperSelected = value end)
    hyperCheck:SetPoint("LEFT", difficulty, "RIGHT", 16, 0)
    hyperCheck.labelText:SetTextColor(1, 0.4, 0.3)
    hyperCheck:HookScript("OnEnter", function(self)
        GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
        GameTooltip:AddLine("Hyper Mode", 1, 0.4, 0.3)
        GameTooltip:AddLine("Unlocked by winning this battlefield. +40% enemy strength, +15% speed, denser spawns, +50% gold.", 1, 1, 1, true)
        GameTooltip:Show()
    end)
    hyperCheck:HookScript("OnLeave", GameTooltip_Hide)
    self.hyperCheck = hyperCheck

    local hurryCheck = self:CreateCheckbox(menu, "Hurry",
        function() return WS.Game.hurrySelected end,
        function(value) WS.Game.hurrySelected = value end)
    hurryCheck:SetPoint("LEFT", hyperCheck.labelText, "RIGHT", 14, 0)
    hurryCheck.labelText:SetTextColor(1, 0.7, 0.3)
    hurryCheck:HookScript("OnEnter", function(self)
        GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
        GameTooltip:AddLine("Hurry", 1, 0.7, 0.3)
        GameTooltip:AddLine("The entire run plays at 1.5x speed.", 1, 1, 1, true)
        GameTooltip:Show()
    end)
    hurryCheck:HookScript("OnLeave", GameTooltip_Hide)

    local inverseCheck = self:CreateCheckbox(menu, "Inverse",
        function() return WS.Game.inverseSelected end,
        function(value) WS.Game.inverseSelected = value end)
    inverseCheck:SetPoint("LEFT", hurryCheck.labelText, "RIGHT", 14, 0)
    inverseCheck.labelText:SetTextColor(0.7, 0.5, 1)
    inverseCheck:HookScript("OnEnter", function(self)
        GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
        GameTooltip:AddLine("Inverse", 0.7, 0.5, 1)
        GameTooltip:AddLine("+40% enemy strength from the start, +25% gold. For the hardened.", 1, 1, 1, true)
        GameTooltip:Show()
    end)
    inverseCheck:HookScript("OnLeave", GameTooltip_Hide)

    -- Endless: start straight into the never-ending mode instead of the 30:00
    -- Death finale. Limit Break is on the level-up table from the first level.
    local endlessCheck = self:CreateCheckbox(menu, "Endless",
        function() return WS.Game.endlessSelected end,
        function(value) WS.Game.endlessSelected = value end)
    endlessCheck:SetPoint("LEFT", inverseCheck.labelText, "RIGHT", 14, 0)
    endlessCheck.labelText:SetTextColor(0.55, 0.85, 1)
    endlessCheck:HookScript("OnEnter", function(self)
        GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
        GameTooltip:AddLine("Endless", 0.55, 0.85, 1)
        GameTooltip:AddLine("No 30:00 Death finale - bosses return forever, harder each time, with no end. Otherwise a normal run plays the timeline out and Death itself arrives at 30:00 (the run continues endlessly from there either way).", 1, 1, 1, true)
        GameTooltip:Show()
    end)
    endlessCheck:HookScript("OnLeave", GameTooltip_Hide)

    -- Row 2: begin.
    local begin = self:CreatePanelButton(menu, 200, 28, "Begin Survival", function()
        WS.Game:StartRun()
    end)
    begin:SetPoint("BOTTOMLEFT", 30, 22)
    self.beginButton = begin

    local trainer = self:CreatePanelButton(menu, 100, 24, "Trainer", function() UI:OpenPanel(UI.trainerPanel) end)
    trainer:SetPoint("BOTTOMRIGHT", menu, "BOTTOM", 25, 24)
    local bestiary = self:CreatePanelButton(menu, 100, 24, "Bestiary", function() UI:OpenPanel(UI.bestiaryPanel) end)
    bestiary:SetPoint("LEFT", trainer, "RIGHT", 6, 0)
    local achievements = self:CreatePanelButton(menu, 120, 24, "Achievements", function() UI:OpenPanel(UI.achievementPanel) end)
    achievements:SetPoint("LEFT", bestiary, "RIGHT", 6, 0)
    local statistics = self:CreatePanelButton(menu, 100, 24, "Statistics", function() UI:OpenPanel(UI.statsPanel) end)
    statistics:SetPoint("LEFT", achievements, "RIGHT", 6, 0)
    local settings = self:CreatePanelButton(menu, 90, 24, "Settings", function() UI:OpenPanel(UI.settingsPanel) end)
    settings:SetPoint("LEFT", statistics, "RIGHT", 6, 0)

    self:CreateTrainerPanel()
    self:CreateBestiaryPanel()
    self:CreateAchievementPanel()
    self:CreateStatsPanel()
    self:CreateSettingsPanel()
end

------------------------------------------------------------------------------
-- Tooltips
------------------------------------------------------------------------------

function UI:ShowCharacterTooltip(card)
    local data = WS.Characters[card.id]
    GameTooltip:SetOwner(card, "ANCHOR_RIGHT")
    if card.locked then
        GameTooltip:AddLine("Locked Survivor", 0.6, 0.6, 0.6)
        GameTooltip:AddLine(data.unlockHint or "Complete achievements to unlock.", 1, 1, 1, true)
    else
        GameTooltip:AddLine(data.name, ClassColor(data.class))
        GameTooltip:AddLine(data.title, 1, 0.82, 0.1)
        GameTooltip:AddLine(" ")
        GameTooltip:AddLine(data.description, 1, 1, 1, true)
        GameTooltip:AddLine(" ")
        GameTooltip:AddDoubleLine("Starting weapon", WS.Weapons[data.weapon].name, 0.7, 0.7, 0.7, 0.3, 1, 0.3)
        GameTooltip:AddDoubleLine("Health", data.maxHealth, 0.7, 0.7, 0.7, 1, 1, 1)
        GameTooltip:AddDoubleLine("Armor", data.armor, 0.7, 0.7, 0.7, 1, 1, 1)
        GameTooltip:AddLine(" ")
        GameTooltip:AddLine(WS.FormatTokens(data.perk, data), 0.3, 1, 0.3, true)
    end
    GameTooltip:Show()
end

function UI:ShowMapTooltip(card)
    local data = WS.Maps[card.id]
    GameTooltip:SetOwner(card, "ANCHOR_RIGHT")
    if card.locked then
        GameTooltip:AddLine("Locked Battlefield", 0.6, 0.6, 0.6)
        GameTooltip:AddLine(data.unlockHint or "Survive to unlock new lands.", 1, 1, 1, true)
    else
        GameTooltip:AddLine(data.name, 1, 0.82, 0.1)
        GameTooltip:AddLine(data.subtitle, 0.8, 0.8, 0.9)
        GameTooltip:AddLine(" ")
        GameTooltip:AddLine(data.description, 1, 1, 1, true)
        GameTooltip:AddLine(" ")
        GameTooltip:AddDoubleLine("Difficulty", string.rep("|TInterface\\TargetingFrame\\UI-RaidTargetingIcons:12:12:0:0:256:256:192:256:64:128|t", WS.floor(data.difficulty + 0.5)), 0.7, 0.7, 0.7, 1, 1, 1)
        GameTooltip:AddDoubleLine("Gold bounty", string.format("x%.2f", data.goldMult), 0.7, 0.7, 0.7, 1, 0.82, 0.1)
        local best = WoWSurvivorsDB.records.bestTimeByMap[card.id]
        if best and best > 0 then
            GameTooltip:AddDoubleLine("Your best", WS.FormatTime(best), 0.7, 0.7, 0.7, 0.3, 1, 0.3)
        end
        if WoWSurvivorsDB.unlocks.hyper[card.id] then
            GameTooltip:AddLine("Hyper Mode unlocked: faster, denser, 50% more gold.", 1, 0.4, 0.3, true)
        end
    end
    GameTooltip:Show()
end

------------------------------------------------------------------------------
-- Refresh
------------------------------------------------------------------------------

function UI:RefreshMenu()
    local db = WoWSurvivorsDB

    for i = 1, #self.characterButtons do
        local card = self.characterButtons[i]
        local data = WS.Characters[card.id]
        local unlocked = db.unlocks.characters[card.id]
        card.locked = not unlocked
        card.icon:SetTexture(data.classIcon)
        card.icon:SetDesaturated(not unlocked)
        if unlocked then
            card.title:SetText(data.name)
            card.title:SetTextColor(ClassColor(data.class))
            card.description:SetText(data.title .. "  -  " .. data.class)
        else
            card.title:SetText("Locked Survivor")
            card.title:SetTextColor(0.55, 0.55, 0.55)
            card.description:SetText(data.unlockHint or "Complete achievements to unlock.")
        end
        if card.id == WS.Game.selectedCharacter then
            self:SetCardBorder(card, 1, 0.82, 0.1)
        elseif unlocked then
            self:SetCardBorder(card, 0.55, 0.45, 0.25)
        else
            self:SetCardBorder(card, 0.3, 0.3, 0.3)
        end
    end

    for i = 1, #self.mapButtons do
        local card = self.mapButtons[i]
        local data = WS.Maps[card.id]
        local unlocked = db.unlocks.maps[card.id]
        card.locked = not unlocked
        card.icon:SetTexture(data.icon)
        card.icon:SetDesaturated(not unlocked)
        if unlocked then
            card.title:SetText(data.name)
            card.title:SetTextColor(1, 0.82, 0.1)
            card.description:SetText(data.subtitle)
        else
            card.title:SetText("Locked Battlefield")
            card.title:SetTextColor(0.55, 0.55, 0.55)
            card.description:SetText(data.unlockHint or "Survive to unlock new lands.")
        end
        if card.id == WS.Game.selectedMap then
            self:SetCardBorder(card, 1, 0.82, 0.1)
        elseif unlocked then
            self:SetCardBorder(card, 0.55, 0.45, 0.25)
        else
            self:SetCardBorder(card, 0.3, 0.3, 0.3)
        end
    end

    -- Difficulty preset label.
    local preset = WS.Config.difficulties[db.settings.difficulty] or WS.Config.difficulties.veteran
    self.difficultyButton:SetText("Difficulty: " .. preset.label)

    -- Hyper mode is offered only once the selected battlefield has been won.
    local hyperUnlocked = db.unlocks.hyper[WS.Game.selectedMap]
    self.hyperCheck:SetShown(hyperUnlocked and true or false)
    if not hyperUnlocked then WS.Game.hyperSelected = false end
    self.hyperCheck:SetChecked(WS.Game.hyperSelected and true or false)

    self:RefreshGold()
end

function UI:RefreshGold()
    local gold = WS.FormatNumber(WoWSurvivorsDB.gold)
    self.menuGold.text:SetText(gold)
    if self.trainerGold then self.trainerGold:SetText(gold .. " gold") end
end

------------------------------------------------------------------------------
-- Sub-panel plumbing (one open at a time, Esc closes)
------------------------------------------------------------------------------

-- Panels live on the root (not the menu) so they can also be opened from the
-- pause screen mid-run.
local function CreatePanel(width, height, title)
    local panel = CreateFrame("Frame", nil, UI.root, "BackdropTemplate")
    panel:SetSize(width, height)
    panel:SetPoint("CENTER", UI.root, "CENTER", 0, 0)
    panel:SetFrameLevel(UI.root:GetFrameLevel() + 70)
    panel:EnableMouse(true) -- swallow clicks so frames below are unreachable
    UI:ApplyDialogBackdrop(panel, true)
    UI:CreateHeaderPlate(panel, title, 280)
    local close = UI:CreatePanelButton(panel, 100, 24, "Close", function() UI:CloseActivePanel() end)
    close:SetPoint("BOTTOM", 0, 16)
    panel:Hide()
    return panel
end

function UI:OpenPanel(panel)
    self:CloseActivePanel()
    self.activePanel = panel
    if panel.Refresh then panel.Refresh() end
    panel:Show()
    WS.Audio:Play("open")
end

function UI:CloseActivePanel()
    if self.activePanel then
        self.activePanel:Hide()
        self.activePanel = nil
        WS.Audio:Play("close")
    end
end

------------------------------------------------------------------------------
-- Trainer: permanent upgrades bought with banked gold
------------------------------------------------------------------------------

function UI:CreateTrainerPanel()
    local panel = CreatePanel(560, 682, "The Trainer")
    self.trainerPanel = panel

    local intro = self:CreateText(panel, 11, WS.Constants.TEXT_GREY)
    intro:SetPoint("TOP", 0, -46)
    intro:SetText("Gold earned on the battlefield buys permanent lessons for all survivors.")

    self.trainerGold = self:CreateText(panel, 14, WS.Constants.TEXT_GOLD)
    self.trainerGold:SetPoint("TOP", 0, -64)

    panel.rows = {}
    for i = 1, #WS.MetaUpgradeOrder do
        local id = WS.MetaUpgradeOrder[i]
        local row = CreateFrame("Frame", nil, panel, "BackdropTemplate")
        row:SetSize(510, 38)
        row:SetPoint("TOPLEFT", 25, -84 - (i - 1) * 41)
        self:ApplyInsetBackdrop(row)
        row.id = id

        row.icon = row:CreateTexture(nil, "ARTWORK")
        row.icon:SetSize(28, 28)
        row.icon:SetPoint("LEFT", 8, 0)
        row.icon:SetTexCoord(0.08, 0.92, 0.08, 0.92)
        row.name = self:CreateText(row, 12, WS.Constants.TEXT_GOLD)
        row.name:SetPoint("TOPLEFT", row.icon, "TOPRIGHT", 8, 0)
        row.description = self:CreateText(row, 10, WS.Constants.TEXT_PARCH)
        row.description:SetPoint("BOTTOMLEFT", row.icon, "BOTTOMRIGHT", 8, 0)
        row.buy = self:CreatePanelButton(row, 110, 22, "", function()
            if WS.SaveData:BuyMeta(row.id) then
                WS.Audio:Play("coin")
                UI.trainerPanel.Refresh()
                UI:RefreshGold()
            end
        end)
        row.buy:SetPoint("RIGHT", -8, 0)
        panel.rows[i] = row
    end

    panel.Refresh = function()
        for i = 1, #panel.rows do
            local row = panel.rows[i]
            local meta = WS.MetaUpgrades[row.id]
            local rank = WS.SaveData:GetMetaRank(row.id)
            row.icon:SetTexture(meta.icon)
            if meta.max >= 9999 then
                row.name:SetText(string.format("%s  (x%d)", meta.name, rank))
            else
                row.name:SetText(string.format("%s  (rank %d/%d)", meta.name, rank, meta.max))
            end
            row.description:SetText(meta.description)
            if rank >= meta.max then
                row.buy:SetText("Learned")
                row.buy:SetEnabled(false)
            else
                local cost = WS.SaveData:MetaCost(row.id)
                row.buy:SetText(cost .. " gold")
                row.buy:SetEnabled(WoWSurvivorsDB.gold >= cost)
            end
        end
        UI:RefreshGold()
    end
end

------------------------------------------------------------------------------
-- Bestiary: every creature ever slain, with kill counts; unmet creatures
-- show as "???" until first blood.
------------------------------------------------------------------------------

function UI:CreateBestiaryPanel()
    local panel = CreatePanel(560, 560, "Bestiary")
    self.bestiaryPanel = panel

    -- Stable alphabetical roster across regular enemies, elites, and bosses.
    local roster = {}
    local function Collect(source, kind)
        for id, data in pairs(source) do
            roster[#roster + 1] = { id = id, data = data, kind = kind }
        end
    end
    Collect(WS.Enemies, "Creature")
    Collect(WS.Elites, "Elite")
    Collect(WS.Bosses, "Boss")
    table.sort(roster, function(a, b) return a.data.name < b.data.name end)

    local scroll = CreateFrame("ScrollFrame", "WoWSurvivorsBestiaryScroll", panel, "UIPanelScrollFrameTemplate")
    scroll:SetPoint("TOPLEFT", 24, -52)
    scroll:SetPoint("BOTTOMRIGHT", -44, 52)
    local content = CreateFrame("Frame", nil, scroll)
    content:SetSize(460, #roster * 38 + 8)
    scroll:SetScrollChild(content)

    panel.rows = {}
    for i = 1, #roster do
        local entry = roster[i]
        local row = CreateFrame("Frame", nil, content, "BackdropTemplate")
        row:SetSize(460, 34)
        row:SetPoint("TOPLEFT", 0, -(i - 1) * 38)
        self:ApplyInsetBackdrop(row)
        row.entry = entry

        row.icon = row:CreateTexture(nil, "ARTWORK")
        row.icon:SetSize(24, 24)
        row.icon:SetPoint("LEFT", 6, 0)
        row.icon:SetTexCoord(0.08, 0.92, 0.08, 0.92)
        row.name = self:CreateText(row, 12)
        row.name:SetPoint("LEFT", row.icon, "RIGHT", 8, 0)
        row.kind = self:CreateText(row, 10, WS.Constants.TEXT_GREY)
        row.kind:SetPoint("LEFT", row, "CENTER", 40, 0)
        row.kills = self:CreateText(row, 12, WS.Constants.TEXT_GOLD)
        row.kills:SetPoint("RIGHT", -10, 0)
        panel.rows[i] = row
    end

    panel.Refresh = function()
        local byEnemy = WoWSurvivorsDB.statistics.killsByEnemy
        for i = 1, #panel.rows do
            local row = panel.rows[i]
            local entry = row.entry
            local kills = byEnemy[entry.id] or 0
            if kills > 0 then
                if entry.data.displayId and SetPortraitTextureFromCreatureDisplayID then
                    SetPortraitTextureFromCreatureDisplayID(row.icon, entry.data.displayId)
                    row.icon:SetTexCoord(0, 1, 0, 1)
                else
                    row.icon:SetTexture(entry.data.icon)
                end
                row.icon:SetDesaturated(false)
                row.name:SetText(entry.data.name)
                row.name:SetTextColor(0.95, 0.95, 0.95)
                row.kind:SetText(entry.kind .. "  -  " .. (entry.data.family or ""))
                row.kills:SetText(WS.FormatNumber(kills) .. " slain")
            else
                row.icon:SetTexture("Interface\\Icons\\INV_Misc_QuestionMark")
                row.icon:SetTexCoord(0.08, 0.92, 0.08, 0.92)
                row.icon:SetDesaturated(true)
                row.name:SetText("???")
                row.name:SetTextColor(0.5, 0.5, 0.5)
                row.kind:SetText(entry.kind)
                row.kills:SetText("")
            end
        end
    end
end

------------------------------------------------------------------------------
-- Achievements
------------------------------------------------------------------------------

function UI:CreateAchievementPanel()
    local panel = CreatePanel(600, 560, "Achievements")
    self.achievementPanel = panel

    local scroll = CreateFrame("ScrollFrame", "WoWSurvivorsAchievementScroll", panel, "UIPanelScrollFrameTemplate")
    scroll:SetPoint("TOPLEFT", 24, -52)
    scroll:SetPoint("BOTTOMRIGHT", -44, 52)
    local comboCount = #WS.ComboOrder
    local content = CreateFrame("Frame", nil, scroll)
    content:SetSize(500, (comboCount + #WS.AchievementOrder) * 50 + 64)
    scroll:SetScrollChild(content)

    -- Discoveries codex: hidden weapon synergies, shown as "???" plus a
    -- cryptic hint until found in a run.
    local comboHeading = self:CreateFancyText(content, 14)
    comboHeading:SetPoint("TOPLEFT", 4, -2)
    comboHeading:SetText("Discoveries")

    panel.comboRows = {}
    for i = 1, comboCount do
        local id = WS.ComboOrder[i]
        local row = CreateFrame("Frame", nil, content, "BackdropTemplate")
        row:SetSize(500, 46)
        row:SetPoint("TOPLEFT", 0, -24 - (i - 1) * 50)
        self:ApplyInsetBackdrop(row)
        row.id = id
        row.icon = row:CreateTexture(nil, "ARTWORK")
        row.icon:SetSize(32, 32)
        row.icon:SetPoint("LEFT", 7, 0)
        row.icon:SetTexCoord(0.08, 0.92, 0.08, 0.92)
        row.name = self:CreateText(row, 12, WS.Constants.TEXT_GOLD)
        row.name:SetPoint("TOPLEFT", row.icon, "TOPRIGHT", 8, -2)
        row.description = self:CreateText(row, 10, WS.Constants.TEXT_PARCH)
        row.description:SetPoint("BOTTOMLEFT", row.icon, "BOTTOMRIGHT", 8, 3)
        row.description:SetPoint("RIGHT", row, "RIGHT", -10, 0)
        row.description:SetJustifyH("LEFT")
        panel.comboRows[i] = row
    end

    local achieveHeading = self:CreateFancyText(content, 14)
    achieveHeading:SetPoint("TOPLEFT", 4, -30 - comboCount * 50)
    achieveHeading:SetText("Achievements")

    panel.rows = {}
    for i = 1, #WS.AchievementOrder do
        local id = WS.AchievementOrder[i]
        local row = CreateFrame("Frame", nil, content, "BackdropTemplate")
        row:SetSize(500, 46)
        row:SetPoint("TOPLEFT", 0, -52 - comboCount * 50 - (i - 1) * 50)
        self:ApplyInsetBackdrop(row)
        row.id = id

        row.icon = row:CreateTexture(nil, "ARTWORK")
        row.icon:SetSize(32, 32)
        row.icon:SetPoint("LEFT", 7, 0)
        row.icon:SetTexCoord(0.08, 0.92, 0.08, 0.92)
        row.name = self:CreateText(row, 12, WS.Constants.TEXT_GOLD)
        row.name:SetPoint("TOPLEFT", row.icon, "TOPRIGHT", 8, -2)
        row.description = self:CreateText(row, 10, WS.Constants.TEXT_PARCH)
        row.description:SetPoint("BOTTOMLEFT", row.icon, "BOTTOMRIGHT", 8, 3)
        row.description:SetPoint("RIGHT", row, "RIGHT", -40, 0)
        row.description:SetJustifyH("LEFT")
        row.check = row:CreateTexture(nil, "OVERLAY")
        row.check:SetTexture("Interface\\RaidFrame\\ReadyCheck-Ready")
        row.check:SetSize(24, 24)
        row.check:SetPoint("RIGHT", -8, 0)
        panel.rows[i] = row
    end

    panel.Refresh = function()
        for i = 1, #panel.comboRows do
            local row = panel.comboRows[i]
            local combo = WS.Combos[row.id]
            local found = WoWSurvivorsDB.statistics.discoveries[row.id]
            if found then
                row.icon:SetTexture(WS.Weapons[combo.weapons[1]].icon)
                row.icon:SetDesaturated(false)
                row.name:SetText(combo.name)
                row.name:SetTextColor(0.65, 0.45, 1)
                row.description:SetText(("%s + %s:  %s"):format(
                    WS.Weapons[combo.weapons[1]].name, WS.Weapons[combo.weapons[2]].name,
                    WS.FormatTokens(combo.description, combo)))
            else
                row.icon:SetTexture("Interface\\Icons\\INV_Misc_QuestionMark")
                row.icon:SetDesaturated(true)
                row.name:SetText("???")
                row.name:SetTextColor(0.55, 0.55, 0.55)
                row.description:SetText(combo.hint)
            end
        end
        for i = 1, #panel.rows do
            local row = panel.rows[i]
            local data = WS.AchievementData[row.id]
            local earned = WoWSurvivorsDB.achievements[row.id]
            row.icon:SetTexture(data.icon)
            row.icon:SetDesaturated(not earned)
            row.name:SetText(data.name)
            row.name:SetTextColor(earned and 1 or 0.55, earned and 0.82 or 0.55, earned and 0.1 or 0.55)
            local text = data.description
            local rewardText = data.rewardText or (data.reward and data.reward.type == "gold" and ("Reward: " .. data.reward.amount .. " gold"))
            if rewardText then
                text = text .. "  |cff44cc44" .. rewardText .. "|r"
            end
            row.description:SetText(text)
            row.check:SetShown(earned and true or false)
        end
    end
end

------------------------------------------------------------------------------
-- Statistics
------------------------------------------------------------------------------

function UI:CreateStatsPanel()
    local panel = CreatePanel(460, 480, "Statistics")
    self.statsPanel = panel

    panel.text = self:CreateText(panel, 13, WS.Constants.TEXT_PARCH)
    panel.text:SetPoint("TOPLEFT", 40, -56)
    panel.text:SetPoint("BOTTOMRIGHT", -40, 52)
    panel.text:SetJustifyH("LEFT")
    panel.text:SetJustifyV("TOP")
    panel.text:SetSpacing(4)

    panel.Refresh = function()
        local records, stats = WoWSurvivorsDB.records, WoWSurvivorsDB.statistics
        local lines = {
            "|cffffd100Records|r",
            ("Longest survival: |cffffffff%s|r"):format(WS.FormatTime(records.bestTime)),
            ("Highest level: |cffffffff%d|r"):format(records.highestLevel),
            ("Most kills in a run: |cffffffff%s|r"):format(WS.FormatNumber(records.mostKillsRun)),
            ("Richest run: |cffffffff%s gold|r"):format(WS.FormatNumber(records.bestGoldRun)),
            "",
            "|cffffd100Lifetime|r",
            ("Runs: |cffffffff%d|r    Victories: |cffffffff%d|r"):format(records.totalRuns, stats.totalVictories),
            ("Enemies slain: |cffffffff%s|r"):format(WS.FormatNumber(records.totalKills)),
            ("Bosses felled: |cffffffff%d|r"):format(stats.bossesSlain),
            ("Damage dealt: |cffffffff%s|r"):format(WS.FormatNumber(stats.damageDone)),
            ("Gems gathered: |cffffffff%s|r"):format(WS.FormatNumber(stats.gemsCollected)),
            ("Gold earned: |cffffffff%s|r"):format(WS.FormatNumber(stats.goldEarned)),
            ("Weapons evolved: |cffffffff%d|r"):format(stats.evolutions),
            ("Time on the field: |cffffffff%s|r"):format(WS.FormatTime(stats.secondsSurvived)),
            "",
            "|cffffd100Best time by battlefield|r",
        }
        for i = 1, #WS.MapOrder do
            local id = WS.MapOrder[i]
            local best = records.bestTimeByMap[id]
            if best and best > 0 then
                lines[#lines + 1] = ("%s: |cffffffff%s|r"):format(WS.Maps[id].name, WS.FormatTime(best))
            end
        end
        panel.text:SetText(table.concat(lines, "\n"))
    end
end

------------------------------------------------------------------------------
-- Settings
------------------------------------------------------------------------------

function UI:CreateSettingsPanel()
    -- Height tracks the option count: 15 rows at 32px each, plus the sliders and
    -- the bottom profile/reset block. Adjust by 32 whenever a row is added/removed.
    local panel = CreatePanel(440, 788, "Settings")
    self.settingsPanel = panel

    -- Volume sliders (real volume: the game borrows the Dialog/Ambience
    -- channels while open and restores your originals when it closes).
    local effects = self:CreateSlider(panel, "Effects volume",
        function() return WoWSurvivorsDB.settings.effectsVolume end,
        function(value)
            WoWSurvivorsDB.settings.effectsVolume = value
            WS.Audio:ApplyVolumes()
            WS.Audio:Play("click")
        end)
    effects:SetPoint("TOP", 0, -70)
    local music = self:CreateSlider(panel, "Music volume",
        function() return WoWSurvivorsDB.settings.musicVolume end,
        function(value)
            WoWSurvivorsDB.settings.musicVolume = value
            WS.Audio:ApplyVolumes()
            if value > 0.01 and not WS.Audio.musicHandle then
                WS.Audio:ResumeMusic()
            elseif value <= 0.01 then
                WS.Audio:PauseMusic()
            end
        end)
    music:SetPoint("TOP", 0, -118)

    local options = {
        { key = "sound", label = "Sound effects" },
        { key = "soundPickups", label = "  Pickup sounds (gems, coins, chests)" },
        { key = "soundAlerts", label = "  Alert horns and boss voices" },
        { key = "music", label = "Zone music" },
        { key = "screenShake", label = "Screen shake" },
        { key = "damageNumbers", label = "Floating damage numbers" },
        { key = "healNumbers", label = "Floating healing numbers" },
        { key = "hideFodderBars", label = "Hide trash-mob health bars (helps low-end PCs)" },
        { key = "combatPause", label = "Auto-pause when real combat starts" },
        { key = "pauseReadyCheck", label = "  ...also on a ready check" },
        { key = "pauseWhisper", label = "  ...also on an incoming whisper" },
        { key = "levelUpTooltips", label = "Show boon tooltips on level-up" },
        { key = "charm", label = "Charm: auto-pick level-up boons" },
        { key = "autoEmote", label = "Emote \"is playing WoW Survivors\" (once per session)" },
        { key = "minimapButton", label = "Show minimap button" },
    }
    for i = 1, #options do
        local option = options[i]
        local check = self:CreateCheckbox(panel, option.label,
            function() return WoWSurvivorsDB.settings[option.key] end,
            function(value)
                WoWSurvivorsDB.settings[option.key] = value
                if option.key == "minimapButton" and WS.minimapButton then
                    WS.minimapButton:SetShown(value)
                elseif option.key == "music" then
                    if value then WS.Audio:ResumeMusic() else WS.Audio:PauseMusic() end
                end
            end)
        check:SetPoint("TOPLEFT", 50, -146 - (i - 1) * 32)
    end

    -- Save profiles: three independent accounts of progress.
    local profileHeading = self:CreateText(panel, 12, WS.Constants.TEXT_GOLD)
    profileHeading:SetPoint("BOTTOM", 0, 148)
    profileHeading:SetText("Save Profile")
    panel.profileButtons = {}
    for i = 1, WS.NUM_PROFILES do
        local button = self:CreatePanelButton(panel, 122, 34, "Profile " .. i, function()
            if WS.Game.running then return end
            if WS.SaveData:SwitchProfile(i) then
                -- Re-validate the current selection against the new profile.
                if not WoWSurvivorsDB.unlocks.characters[WS.Game.selectedCharacter] then
                    WS.Game.selectedCharacter = WS.Config.startCharacter
                end
                if not WoWSurvivorsDB.unlocks.maps[WS.Game.selectedMap] then
                    WS.Game.selectedMap = WS.Config.startMap
                end
                WS.Audio:Play("click")
                UI:RefreshMenu()
                panel.Refresh()
            end
        end)
        button:SetPoint("BOTTOM", (i - 2) * 128, 108)
        button.summary = self:CreateText(button, 9, WS.Constants.TEXT_GREY)
        button.summary:SetPoint("TOP", button, "BOTTOM", 0, -2)
        panel.profileButtons[i] = button
    end

    local resetSettings = self:CreatePanelButton(panel, 180, 24, "Restore Defaults", function()
        WS.SaveData:ResetSettings()
        panel:Hide()
        UI:OpenPanel(panel)
    end)
    resetSettings:SetPoint("BOTTOM", 0, 78)

    -- Full progress wipe wants a deliberate double-click.
    local wipeButton = self:CreatePanelButton(panel, 180, 24, "Erase All Progress", function(button)
        if button.armed then
            if WS.Game.running then WS.Game:EndRun("abandoned", true) end
            WS.SaveData:ResetAll()
            button.armed = nil
            button:SetText("Erase All Progress")
            UI:ShowMenu()
        else
            button.armed = true
            button:SetText("Are you sure?")
        end
    end)
    wipeButton:SetPoint("BOTTOM", 0, 48)
    wipeButton:SetScript("OnHide", function(button)
        button.armed = nil
        button:SetText("Erase All Progress")
    end)

    panel.Refresh = function()
        for i = 1, WS.NUM_PROFILES do
            local button = panel.profileButtons[i]
            local active = (WoWSurvivorsDB.activeProfile == i)
            button:SetText((active and "|cffffd100* " or "") .. "Profile " .. i .. (active and "|r" or ""))
            button.summary:SetText(WS.SaveData:ProfileSummary(i))
        end
    end
end

------------------------------------------------------------------------------
-- Screen switching
------------------------------------------------------------------------------

function UI:ShowMenu()
    self.root:Show()
    self:CloseActivePanel()
    self.hud:Hide()
    self.levelUpPanel:Hide()
    self.pausePanel:Hide()
    self.victoryPanel:Hide()
    self.endPanel:Hide()
    self.menu:Show()
    self:HideBossBar()
    self:RefreshMenu()
    if WS.Audio.context ~= "menu" then
        WS.Audio.context = "menu"
        WS.Audio:PlayMusicFiles({ 53223 }) -- the WoW main title theme
    end
end

function UI:HideGame()
    if WS.Game.running then WS.Game:EndRun("abandoned", true) end
    WS.Audio:StopMusic()
    WS.Audio.context = nil
    self.root:Hide()
end

-- Step-away hotkey entry point, exposed as a plain global. Wired to a real key
-- binding (Bindings.xml, which WoW auto-loads by filename - it must NOT be in
-- the .toc, or the generic XML loader rejects <Binding> with warnings). Bind it
-- under Key Bindings > WoW Survivors, or run it as a /run macro.
-- (A "mini window" that scaled the root frame was removed - it collapsed the
--  fullscreen frame and broke input; a safe picture-in-picture would need a
--  separate render surface, which the WoW UI can't easily give us.)
function _G.WoWSurvivors_ToggleGame()
    local ui, game = WS.UI, WS.Game
    if not ui.root then return end
    if ui.root:IsShown() then
        if game.running and not game.paused and not game.leveling and not game.merchanting then
            game:TogglePause() -- freeze the horde while you step away
            ui.hotkeyPaused = true
        end
        ui.root:Hide()
    else
        ui.root:Show()
        if ui.hotkeyPaused and game.paused then game:TogglePause(); ui.hotkeyPaused = false end
        if not game.running then ui:ShowMenu() end
    end
end
-- Name shown in the Key Bindings UI (referenced by Bindings.xml).
_G.BINDING_HEADER_WOWSURVIVORS = "WoW Survivors"
_G.BINDING_NAME_WOWSURVIVORS_TOGGLE = "Step Away / Return"

function UI:ShowGameplay(map)
    self.menu:Hide()
    self:CloseActivePanel()
    self.endPanel:Hide()
    self.pausePanel:Hide()
    self.victoryPanel:Hide()
    self.levelUpPanel:Hide()
    self:HideBossBar()
    self.hud:Show()
    self:DressWorld(map)
end
