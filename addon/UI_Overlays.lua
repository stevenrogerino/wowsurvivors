local _, WS = ...

local UI = WS.UI

-- Quality coloring for level-up cards, matching item-quality conventions.
local QUALITY_COLORS = {
    stat       = { 0.95, 0.95, 0.95 },
    weapon_rank = { 0.25, 0.55, 1.00 },
    new_weapon = { 0.20, 1.00, 0.20 },
    evolve     = { 1.00, 0.50, 0.00 },
    bread      = { 0.62, 0.62, 0.62 },
    gold_purse = { 1.00, 0.82, 0.10 },
    gem_hoard  = { 0.25, 0.55, 1.00 },
    blessing   = { 1.00, 0.88, 0.35 },
    limit_break = { 1.00, 0.30, 0.20 },
    union      = { 1.00, 0.50, 0.00 },
}

function UI:CreateOverlays()
    self:CreateLevelUpPanel()
    self:CreatePausePanel()
    self:CreateVictoryPanel()
    self:CreateEndPanel()
    self:CreateMerchantPanel()
    self:CreateToast()
    self:CreateChestCeremony()
end

------------------------------------------------------------------------------
-- Chest ceremony: the little jackpot moment when a treasure chest opens.
-- Rewards reveal one at a time with a coin sting each - x1, x3, or x5.
------------------------------------------------------------------------------

function UI:CreateChestCeremony()
    local frame = CreateFrame("Frame", nil, self.root, "BackdropTemplate")
    frame:SetSize(280, 66)
    frame:SetPoint("TOP", self.root, "TOP", 0, -150)
    frame:SetFrameLevel(self.root:GetFrameLevel() + 55)
    self:ApplyDialogBackdrop(frame, true)

    frame.icon = frame:CreateTexture(nil, "ARTWORK")
    frame.icon:SetTexture("Interface\\Icons\\INV_Box_01")
    frame.icon:SetTexCoord(0.08, 0.92, 0.08, 0.92)
    frame.icon:SetSize(36, 36)
    frame.icon:SetPoint("LEFT", 14, 0)
    frame.iconEdge = self:AddIconEdge(frame, frame.icon)

    frame.title = self:CreateFancyText(frame, 14)
    frame.title:SetPoint("TOPLEFT", frame.icon, "TOPRIGHT", 10, -2)
    frame.title:SetText("Treasure!")
    frame.reward = self:CreateText(frame, 13, WS.Constants.TEXT_GOLD)
    frame.reward:SetPoint("BOTTOMLEFT", frame.icon, "BOTTOMRIGHT", 10, 2)

    frame:Hide()
    frame:SetScript("OnUpdate", function(self, elapsed)
        self.timer = self.timer + elapsed
        -- Reveal one bundle every 0.35s with a coin sting.
        while self.revealed < self.rolls and self.timer >= self.revealed * 0.35 do
            self.revealed = self.revealed + 1
            WS.Audio:Play(self.revealed == self.rolls and self.rolls > 1 and "chest" or "coin")
            self.title:SetText(self.rolls > 1 and ("Treasure!  x" .. self.revealed) or "Treasure!")
            self.reward:SetText("+" .. WS.floor(self.total * self.revealed / self.rolls) .. " gold")
        end
        local endTime = self.rolls * 0.35 + 1.1
        if self.timer > endTime - 0.4 then
            self:SetAlpha(WS.max(0, (endTime - self.timer) / 0.4))
        end
        if self.timer >= endTime then self:Hide() end
    end)
    self.chestCeremony = frame
end

function UI:ChestCeremony(rolls, totalGold)
    local frame = self.chestCeremony
    frame.rolls, frame.total = rolls, totalGold
    frame.revealed, frame.timer = 0, 0
    frame.title:SetText("Treasure!")
    frame.reward:SetText("")
    frame:SetAlpha(1)
    frame:Show()
end

------------------------------------------------------------------------------
-- Victory choice: claim the win, or fight on into endless mode
------------------------------------------------------------------------------

function UI:CreateVictoryPanel()
    local panel = CreateFrame("Frame", nil, self.root, "BackdropTemplate")
    panel:SetSize(460, 300)
    panel:SetPoint("CENTER", 0, 20)
    panel:SetFrameLevel(self.root:GetFrameLevel() + 65)
    panel:EnableMouse(true)
    self:ApplyDialogBackdrop(panel, true)
    self:CreateHeaderPlate(panel, "VICTORY!", 260)

    panel.text = self:CreateText(panel, 13, WS.Constants.TEXT_PARCH)
    panel.text:SetPoint("TOPLEFT", 40, -52)
    panel.text:SetPoint("TOPRIGHT", -40, -52)
    panel.text:SetJustifyH("CENTER")
    panel.text:SetSpacing(4)

    local claim = self:CreatePanelButton(panel, 220, 26, "Claim Victory", function()
        WS.Game:ClaimVictory()
    end)
    claim:SetPoint("BOTTOM", 0, 92)
    local fightOn = self:CreatePanelButton(panel, 220, 26, "Fight to the End", function()
        WS.Game:FightOn("normal")
    end)
    fightOn:SetPoint("BOTTOM", 0, 62)
    local endless = self:CreatePanelButton(panel, 220, 26, "True Endless", function()
        WS.Game:FightOn("endless")
    end)
    endless:SetPoint("BOTTOM", 0, 32)

    local hint = self:CreateText(panel, 10, WS.Constants.TEXT_GREY)
    hint:SetPoint("BOTTOM", 0, 14)
    hint:SetText("Fight to the End: Death arrives at 30:00.  True Endless: no Death, endless escalation.")

    panel:Hide()
    self.victoryPanel = panel
end

function UI:ShowVictoryChoice(run)
    local map = WS.Maps[run.mapId]
    self.victoryPanel.text:SetText(("The final terror of %s lies dead at your feet.\nThe horde, however, does not care."):format(map.name))
    self.victoryPanel:Show()
end

------------------------------------------------------------------------------
-- Level-up: three boons, with reroll / banish / skip
------------------------------------------------------------------------------

function UI:CreateLevelUpPanel()
    local panel = CreateFrame("Frame", nil, self.root, "BackdropTemplate")
    panel:SetSize(880, 340)
    panel:SetPoint("CENTER", 0, 10)
    panel:SetFrameLevel(self.root:GetFrameLevel() + 60)
    self:ApplyDialogBackdrop(panel, true)
    self:CreateHeaderPlate(panel, "You Have Grown Stronger", 330)

    panel.hint = self:CreateText(panel, 12, WS.Constants.TEXT_GREY)
    panel.hint:SetPoint("TOP", 0, -46)
    panel.hint:SetText("Choose a boon for this run")

    panel.cards = {}
    for i = 1, 3 do
        local card = self:CreateIconCard(panel, 268, 170)
        card:SetPoint("TOPLEFT", 26 + (i - 1) * 280, -70)
        card.index = i
        -- Larger layout for the tall card: icon centered up top.
        card.icon:ClearAllPoints()
        card.icon:SetSize(44, 44)
        card.icon:SetPoint("TOP", card, "TOP", 0, -12)
        card.title:ClearAllPoints()
        card.title:SetPoint("TOP", card.icon, "BOTTOM", 0, -8)
        card.title:SetPoint("LEFT", card, "LEFT", 10, 0)
        card.title:SetPoint("RIGHT", card, "RIGHT", -10, 0)
        card.title:SetJustifyH("CENTER")
        card.description:ClearAllPoints()
        card.description:SetPoint("TOP", card.title, "BOTTOM", 0, -6)
        card.description:SetPoint("LEFT", card, "LEFT", 12, 0)
        card.description:SetPoint("RIGHT", card, "RIGHT", -12, 0)
        card.description:SetJustifyH("CENTER")
        card.note = self:CreateText(card, 10, WS.Constants.TEXT_GREY)
        card.note:SetPoint("BOTTOM", card, "BOTTOM", 0, 8)
        card:SetScript("OnClick", function(button)
            if UI.banishMode then
                UI.banishMode = false
                panel.hint:SetText("Choose a boon for this run")
                WS.Game:BanishChoice(button.index)
            else
                WS.Game:ChooseUpgrade(button.index)
            end
        end)
        card:HookScript("OnEnter", function(button) UI:ShowChoiceTooltip(button) end)
        card:HookScript("OnLeave", GameTooltip_Hide)
        panel.cards[i] = card
    end

    panel.reroll = self:CreatePanelButton(panel, 120, 24, "Reroll", function()
        UI.banishMode = false
        panel.hint:SetText("Choose a boon for this run")
        WS.Game:RerollChoices()
    end)
    panel.reroll:SetPoint("BOTTOMLEFT", 26, 16)

    panel.banish = self:CreatePanelButton(panel, 120, 24, "Banish", function()
        if UI.banishMode then
            UI.banishMode = false
            panel.hint:SetText("Choose a boon for this run")
        else
            UI.banishMode = true
            panel.hint:SetText("|cffff4040Click a boon to banish it from this run.|r")
            WS.Audio:Play("banish")
        end
    end)
    panel.banish:SetPoint("LEFT", panel.reroll, "RIGHT", 10, 0)

    panel.skip = self:CreatePanelButton(panel, 100, 24, "Skip", function()
        UI.banishMode = false
        panel.hint:SetText("Choose a boon for this run")
        WS.Game:SkipUpgrade()
    end)
    panel.skip:SetPoint("BOTTOMRIGHT", -26, 16)

    -- Shown under the Limit Break card (only when it's offered - a complete
    -- build): auto-pick Limit Break on future level-ups. Like Charm, but scoped
    -- to Limit Break so you keep picking real upgrades until there are none left.
    -- Per-run only (WS.Game.autoLimitBreak): it must NOT persist into the next
    -- game, or you'd be stuck auto-picking Limit Break instead of getting to choose.
    panel.autoLB = self:CreateCheckbox(panel, "Auto-pick Limit Break (this run)",
        function() return WS.Game.autoLimitBreak end,
        function(v) WS.Game.autoLimitBreak = v end)
    panel.autoLB:Hide()

    panel:Hide()
    self.levelUpPanel = panel
end

-- Rich hover details for level-up cards (toggleable in Settings).
function UI:ShowChoiceTooltip(card)
    if WoWSurvivorsDB.settings.levelUpTooltips == false then return end
    local choice = card.choice
    local player = WS.Game.player
    if not choice or not player then return end
    GameTooltip:SetOwner(card, "ANCHOR_RIGHT")

    if choice.type == "stat" then
        local upgrade = WS.Upgrades[choice.id]
        GameTooltip:AddLine(upgrade.name, 1, 0.82, 0.1)
        GameTooltip:AddLine(upgrade.description, 1, 1, 1, true)
        if upgrade.detail then
            GameTooltip:AddLine(upgrade.detail, 0.6, 0.8, 1, true)
        end
        for i = 1, #player.weapons do
            local weapon = player.weapons[i]
            if weapon.data.evolvePairing == choice.id and not weapon.evolved then
                GameTooltip:AddLine(("Evolution catalyst for %s (becomes %s at rank 8)."):format(
                    weapon.data.name, weapon.data.evolveName), 1, 0.5, 0, true)
            end
        end

    elseif choice.type == "weapon_rank" then
        local weapon = WS.Player:GetWeapon(player, choice.id)
        if not weapon then return end
        GameTooltip:AddLine(("%s (rank %d > %d)"):format(weapon.data.name, weapon.level, weapon.level + 1), 1, 0.82, 0.1)
        GameTooltip:AddLine("Now: " .. WS.Weapon:Describe(player, weapon), 1, 1, 1, true)
        GameTooltip:AddLine(WS.Weapon:RankNote(weapon), 0.6, 0.8, 1, true)
        GameTooltip:AddLine(("Evolves into %s at rank 8 once you know %s."):format(
            weapon.data.evolveName, WS.Upgrades[weapon.data.evolvePairing].name), 1, 0.5, 0, true)

    elseif choice.type == "new_weapon" then
        local data = WS.Weapons[choice.id]
        GameTooltip:AddLine(data.name, 0.2, 1, 0.2)
        GameTooltip:AddLine(WS.Weapon:KindLabel(data), 0.55, 0.75, 0.95)
        GameTooltip:AddLine(data.description, 1, 1, 1, true)
        GameTooltip:AddDoubleLine("Base damage", data.damage, 0.7, 0.7, 0.7, 1, 1, 1)
        GameTooltip:AddDoubleLine("Fires every", ("%.1fs"):format(data.cooldown), 0.7, 0.7, 0.7, 1, 1, 1)
        GameTooltip:AddLine(("Evolves into %s, catalyzed by %s."):format(
            data.evolveName, WS.Upgrades[data.evolvePairing].name), 1, 0.5, 0, true)
        -- Discovery tips: known synergies show their name; unknown ones only
        -- whisper that something is there.
        for i = 1, #WS.ComboOrder do
            local comboId = WS.ComboOrder[i]
            local combo = WS.Combos[comboId]
            local otherId
            if combo.weapons[1] == choice.id then otherId = combo.weapons[2]
            elseif combo.weapons[2] == choice.id then otherId = combo.weapons[1] end
            if otherId and player.weaponLevels[otherId] then
                if WoWSurvivorsDB.statistics.discoveries[comboId] then
                    GameTooltip:AddLine(("Discovery with %s: %s."):format(WS.Weapons[otherId].name, combo.name), 0.65, 0.45, 1, true)
                else
                    GameTooltip:AddLine(("You sense a hidden synergy with your %s..."):format(WS.Weapons[otherId].name), 0.65, 0.45, 1, true)
                end
            end
        end

    elseif choice.type == "evolve" then
        GameTooltip:AddLine(choice.name, 1, 0.5, 0)
        GameTooltip:AddLine(choice.description, 1, 1, 1, true)
        GameTooltip:AddLine(WS.Weapon:EvolveNote(WS.Weapons[choice.id]), 0.6, 0.8, 1, true)

    elseif choice.type == "blessing" then
        GameTooltip:AddLine(choice.name, 1, 0.88, 0.35)
        GameTooltip:AddLine(choice.description, 1, 1, 1, true)
        GameTooltip:AddLine("Blessings last the whole run and cannot be changed.", 0.6, 0.8, 1, true)

    elseif choice.type == "union" then
        GameTooltip:AddLine(choice.name, 1, 0.5, 0)
        GameTooltip:AddLine(choice.description, 1, 1, 1, true)
        GameTooltip:AddLine("A WEAPON UNION. Merges two maxed weapons into one, freeing a slot.", 0.6, 0.8, 1, true)

    elseif choice.type == "limit_break" then
        GameTooltip:AddLine("Limit Break", 1, 0.3, 0.2)
        GameTooltip:AddLine(choice.description, 1, 1, 1, true)
        GameTooltip:AddLine("Your build is complete. This is how you keep climbing.", 0.6, 0.8, 1, true)

    elseif choice.type == "bread" or choice.type == "gold_purse" or choice.type == "gem_hoard" then
        GameTooltip:AddLine(choice.name, 0.8, 0.8, 0.8)
        GameTooltip:AddLine("You have learned everything there is to learn. Enjoy the spoils.", 1, 1, 1, true)
    end
    GameTooltip:Show()
end

function UI:ShowLevelChoices(choices, rerolls, banishes, headerText)
    local panel = self.levelUpPanel
    self.banishMode = false
    panel.headerTitle:SetText(headerText or "You Have Grown Stronger")
    panel.hint:SetText(headerText and "A run-defining boon - choose well" or "Choose a boon for this run")
    for i = 1, 3 do
        local card, choice = panel.cards[i], choices[i]
        card.choice = choice
        local color = QUALITY_COLORS[choice.type] or QUALITY_COLORS.stat
        card.icon:SetTexture(choice.icon)
        card.title:SetText(choice.name)
        card.title:SetTextColor(color[1], color[2], color[3])
        card.description:SetText(choice.description)
        card.note:SetText(choice.note or "")
        self:SetCardBorder(card, color[1] * 0.8, color[2] * 0.8, color[3] * 0.8)
    end
    panel.reroll:SetText("Reroll (" .. rerolls .. ")")
    panel.reroll:SetEnabled(rerolls > 0)
    panel.banish:SetText("Banish (" .. banishes .. ")")
    panel.banish:SetEnabled(banishes > 0)

    -- Surface the "auto-pick Limit Break" toggle under its card when offered.
    local lbIndex
    for i = 1, 3 do
        if choices[i] and choices[i].type == "limit_break" then lbIndex = i; break end
    end
    if lbIndex then
        panel.autoLB:ClearAllPoints()
        panel.autoLB:SetPoint("TOPLEFT", panel.cards[lbIndex], "BOTTOMLEFT", 6, -4)
        panel.autoLB:SetChecked(WS.Game.autoLimitBreak and true or false)
        panel.autoLB:Show()
    else
        panel.autoLB:Hide()
    end
    panel:Show()
end

------------------------------------------------------------------------------
-- Pause
------------------------------------------------------------------------------

-- The pause screen doubles as the run's character sheet: weapons down the
-- left with live stats, passives/discoveries/attributes on the right, all
-- hoverable, with the actions in a row along the bottom.
function UI:CreatePausePanel()
    local panel = CreateFrame("Frame", nil, self.root, "BackdropTemplate")
    panel:SetSize(680, 560)
    panel:SetPoint("CENTER")
    panel:SetFrameLevel(self.root:GetFrameLevel() + 60)
    panel:EnableMouse(true)
    self:ApplyDialogBackdrop(panel, true)
    self:CreateHeaderPlate(panel, "Paused", 220)

    panel.summary = self:CreateText(panel, 13, WS.Constants.TEXT_PARCH)
    panel.summary:SetPoint("TOP", 0, -48)
    panel.summary:SetJustifyH("CENTER")

    ------------------------------------------------ Left: weapon rows
    local weaponsTitle = self:CreateFancyText(panel, 14)
    weaponsTitle:SetPoint("TOPLEFT", 36, -76)
    weaponsTitle:SetText("Weapons")

    panel.weaponRows = {}
    for i = 1, WS.MAX_WEAPONS do
        local row = CreateFrame("Frame", nil, panel, "BackdropTemplate")
        row:SetSize(320, 42)
        row:SetPoint("TOPLEFT", 34, -96 - (i - 1) * 46)
        self:ApplyInsetBackdrop(row)
        row:EnableMouse(true)
        row.icon = row:CreateTexture(nil, "ARTWORK")
        row.icon:SetSize(30, 30)
        row.icon:SetPoint("LEFT", 6, 0)
        row.icon:SetTexCoord(0.08, 0.92, 0.08, 0.92)
        row.iconEdge = self:AddIconEdge(row, row.icon)
        row.name = self:CreateText(row, 12, WS.Constants.TEXT_GOLD)
        row.name:SetPoint("TOPLEFT", row.icon, "TOPRIGHT", 8, 0)
        row.stats = self:CreateText(row, 10, WS.Constants.TEXT_GREY)
        row.stats:SetPoint("BOTTOMLEFT", row.icon, "BOTTOMRIGHT", 8, 0)
        row.stats:SetPoint("RIGHT", row, "RIGHT", -6, 0)
        row.stats:SetJustifyH("LEFT")
        row:SetScript("OnEnter", function(self)
            local weapon = self.weapon
            if not weapon then return end
            local player = WS.Game.player
            GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
            if weapon.evolved then
                GameTooltip:AddLine(weapon.data.evolveName, 1, 0.5, 0)
                GameTooltip:AddLine(weapon.data.evolveDescription, 1, 1, 1, true)
            elseif weapon.data.isUnion then
                GameTooltip:AddLine(weapon.data.name, 1, 0.5, 0)
                GameTooltip:AddLine(weapon.data.description, 1, 1, 1, true)
                GameTooltip:AddLine("A weapon union - already at its peak.", 0.6, 0.8, 1, true)
            else
                GameTooltip:AddLine(("%s (rank %d)"):format(weapon.data.name, weapon.level), 1, 0.82, 0.1)
                GameTooltip:AddLine(weapon.data.description, 1, 1, 1, true)
                if weapon.data.evolvePairing then
                    GameTooltip:AddLine(("Evolves into %s at rank 8 with %s."):format(
                        weapon.data.evolveName, WS.Upgrades[weapon.data.evolvePairing].name), 1, 0.5, 0, true)
                end
            end
            GameTooltip:AddLine(WS.Weapon:Describe(player, weapon), 0.6, 0.8, 1, true)
            GameTooltip:Show()
        end)
        row:SetScript("OnLeave", GameTooltip_Hide)
        panel.weaponRows[i] = row
    end

    ---------------------------------------- Right: passives, discoveries
    local passivesTitle = self:CreateFancyText(panel, 14)
    passivesTitle:SetPoint("TOPLEFT", 386, -76)
    passivesTitle:SetText("Passives")

    panel.passiveButtons = {}
    for i = 1, #WS.UpgradeOrder do
        local button = CreateFrame("Frame", nil, panel)
        button:SetSize(32, 32)
        button:SetPoint("TOPLEFT", 386 + ((i - 1) % 7) * 38, -96 - WS.floor((i - 1) / 7) * 40)
        button:EnableMouse(true)
        button.icon = button:CreateTexture(nil, "ARTWORK")
        button.icon:SetAllPoints()
        button.icon:SetTexCoord(0.08, 0.92, 0.08, 0.92)
        button.iconEdge = self:AddIconEdge(button, button.icon)
        button.rank = self:CreateText(button, 11, WS.Constants.TEXT_GOLD)
        button.rank:SetPoint("BOTTOMRIGHT", 1, -1)
        button:SetScript("OnEnter", function(self)
            local upgrade = self.upgrade
            if not upgrade then return end
            GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
            GameTooltip:AddLine(("%s (rank %d / %d)"):format(upgrade.name, self.rankValue, upgrade.max), 1, 0.82, 0.1)
            GameTooltip:AddLine(upgrade.description, 1, 1, 1, true)
            if upgrade.detail then GameTooltip:AddLine(upgrade.detail, 0.6, 0.8, 1, true) end
            GameTooltip:Show()
        end)
        button:SetScript("OnLeave", GameTooltip_Hide)
        panel.passiveButtons[i] = button
    end

    -- Below the passive grid, which is up to 3 rows (21 upgrades, 7 per row).
    panel.discoveryTitle = self:CreateFancyText(panel, 14)
    panel.discoveryTitle:SetPoint("TOPLEFT", 386, -216)
    panel.discoveryTitle:SetText("Discoveries")
    panel.discoveries = self:CreateText(panel, 11, { 0.65, 0.45, 1.0 })
    panel.discoveries:SetPoint("TOPLEFT", 388, -236)
    panel.discoveries:SetPoint("RIGHT", panel, "RIGHT", -32, 0)
    panel.discoveries:SetJustifyH("LEFT")
    panel.discoveries:SetSpacing(3)

    ------------------------------------------------- Right: attributes
    local statsTitle = self:CreateFancyText(panel, 14)
    statsTitle:SetPoint("TOPLEFT", 386, -292)
    statsTitle:SetText("Attributes")
    panel.stats = self:CreateText(panel, 11, WS.Constants.TEXT_PARCH)
    panel.stats:SetPoint("TOPLEFT", 388, -312)
    panel.stats:SetPoint("BOTTOMRIGHT", -32, 74)
    panel.stats:SetJustifyH("LEFT")
    panel.stats:SetJustifyV("TOP")
    panel.stats:SetSpacing(4)

    ------------------------------------------------- Bottom: action row
    local resume = self:CreatePanelButton(panel, 148, 26, "Resume", function() WS.Game:TogglePause() end)
    resume:SetPoint("BOTTOMLEFT", 34, 38)
    local settingsButton = self:CreatePanelButton(panel, 148, 26, "Settings", function()
        UI:OpenPanel(UI.settingsPanel)
    end)
    settingsButton:SetPoint("LEFT", resume, "RIGHT", 8, 0)
    local stepAway = self:CreatePanelButton(panel, 148, 26, "Step Away", function()
        UI.root:Hide()
    end)
    stepAway:SetPoint("LEFT", settingsButton, "RIGHT", 8, 0)
    local abandon = self:CreatePanelButton(panel, 148, 26, "Abandon Run", function() WS.Game:EndRun("abandoned") end)
    abandon:SetPoint("LEFT", stepAway, "RIGHT", 8, 0)

    local hint = self:CreateText(panel, 10, WS.Constants.TEXT_GREY)
    hint:SetPoint("BOTTOM", 0, 20)
    hint:SetText("Step Away pauses the run - return via /survivors, the minimap button, or your Step-Away keybind (Esc > Keybindings > WoW Survivors).")

    panel:Hide()
    self.pausePanel = panel
end

function UI:ShowPause(run)
    local panel = self.pausePanel
    local player = WS.Game.player
    panel.summary:SetText(string.format("%s  -  Level %d  -  %s slain  -  %s gold  -  %s DPS  -  %s HPS",
        WS.FormatTime(run.time), run.level, WS.FormatNumber(run.kills),
        WS.FormatNumber(run.gold), WS.FormatNumber(run.dps), WS.FormatNumber(run.hps or 0)))

    -- Weapon rows.
    for i = 1, WS.MAX_WEAPONS do
        local row = panel.weaponRows[i]
        local weapon = player.weapons[i]
        row.weapon = weapon
        if weapon then
            if weapon.evolved then
                row.icon:SetTexture(weapon.data.evolveIcon)
                row.name:SetText("|cffff8000" .. weapon.data.evolveName .. "|r  -  Evolved")
            else
                row.icon:SetTexture(weapon.data.icon)
                local rank = weapon.level >= WS.WEAPON_MAX_LEVEL and "MAX" or ("Rank " .. weapon.level)
                row.name:SetText(weapon.data.name .. "  -  " .. rank)
            end
            row.stats:SetText(WS.Weapon:Describe(player, weapon))
            row:Show()
        else
            row:Hide()
        end
    end

    -- Passive grid.
    local shown = 0
    for i = 1, #WS.UpgradeOrder do
        local id = WS.UpgradeOrder[i]
        local rank = player.upgradeLevels[id]
        if rank and rank > 0 then
            shown = shown + 1
            local button = panel.passiveButtons[shown]
            button.upgrade = WS.Upgrades[id]
            button.rankValue = rank
            button.icon:SetTexture(WS.Upgrades[id].icon)
            button.rank:SetText(rank)
            button:Show()
        end
    end
    for i = shown + 1, #panel.passiveButtons do
        panel.passiveButtons[i]:Hide()
        panel.passiveButtons[i].upgrade = nil
    end

    -- Discoveries.
    local discoveries = {}
    for i = 1, #WS.ComboOrder do
        if player.combosActive[WS.ComboOrder[i]] then
            discoveries[#discoveries + 1] = WS.Combos[WS.ComboOrder[i]].name
        end
    end
    panel.discoveries:SetText(#discoveries > 0 and table.concat(discoveries, ",  ")
        or "|cff9d9d9dNone yet - some weapons whisper to each other...|r")

    -- Attributes.
    panel.stats:SetText(table.concat({
        string.format("Damage +%d%%    Cooldowns -%d%%", (player.damageMultiplier - 1) * 100 + 0.5, (1 - player.cooldownMultiplier) * 100 + 0.5),
        string.format("Crit %d%% (x%.2f)    Area +%d%%", player.critChance * 100 + 0.5, player.critDamage, (player.areaMultiplier - 1) * 100 + 0.5),
        string.format("Armor %d (-%d%% dmg)    Regen %.1f/s",
            player.armor, player.armor / (player.armor + (WS.Config.armorConstant or 30)) * 100 + 0.5, player.healthRegen),
        string.format("|cff73d977Healing %s HPS    Restored %s total|r", WS.FormatNumber(run.hps or 0), WS.FormatNumber(run.healingDone or 0)),
        string.format("Move speed %d    Pickup %d", player.moveSpeed + 0.5, player.pickupRadius + 0.5),
        string.format("Luck +%d%%    XP +%d%%    Gold +%d%%", (player.luck - 1) * 100 + 0.5, (player.xpMultiplier - 1) * 100 + 0.5, (player.goldMultiplier - 1) * 100 + 0.5),
        string.format("Rerolls %d    Banishes %d", player.rerolls, player.banishes),
        (player.blessingNames and #player.blessingNames > 0)
            and ("|cffffe060" .. (#player.blessingNames > 1 and "Blessings: " or "Blessing: ")
                .. table.concat(player.blessingNames, ", ") .. "|r") or "",
    }, "\n"))

    panel:Show()
end

------------------------------------------------------------------------------
-- Damage meter (per-source breakdown, like the tuning bench)
------------------------------------------------------------------------------

-- Non-weapon damage sources get a friendly name/icon/color here; weapon ids
-- resolve straight from WS.Weapons.
local METER_SPECIAL = {
    wolves      = { name = "Spirit Wolves",   icon = "Interface\\Icons\\Spell_Nature_SpiritWolf",     color = { 0.55, 0.75, 1.0 } },
    ghouls      = { name = "Ghouls",          icon = "Interface\\Icons\\Spell_Shadow_AnimateDead",    color = { 0.55, 0.90, 0.40 } },
    thorns      = { name = "Thorns",          icon = "Interface\\Icons\\Spell_Nature_Thorns",         color = { 0.45, 0.85, 0.45 } },
    retribution = { name = "Retribution Aura",icon = "Interface\\Icons\\Spell_Holy_RetributionAura",  color = { 1.0, 0.85, 0.4 } },
    bomb        = { name = "Runic Bomb",      icon = "Interface\\Icons\\INV_Misc_Bomb_02",            color = { 1.0, 0.5, 0.3 } },
    desecration = { name = "Desecration",     icon = "Interface\\Icons\\Spell_Shadow_DeathAndDecay",  color = { 0.45, 0.9, 0.4 } },
    reincarnation = { name = "Reincarnation", icon = "Interface\\Icons\\Spell_Nature_Reincarnation",  color = { 0.5, 0.9, 0.6 } },
    overflow    = { name = "Everything else", icon = "Interface\\Icons\\INV_Misc_QuestionMark",       color = { 0.7, 0.7, 0.7 } },
    -- If this ever appears, some damage reached an enemy without a source tag.
    untagged    = { name = "Untagged (bug)",  icon = "Interface\\Icons\\INV_Misc_QuestionMark",       color = { 1.0, 0.4, 0.4 } },
    other       = { name = "Other",           icon = "Interface\\Icons\\INV_Misc_QuestionMark",       color = { 0.7, 0.7, 0.7 } },
}

local function MeterSourceInfo(key)
    local weapon = WS.Weapons[key]
    if weapon then
        local color = weapon.color or WS.Constants.COLORS[weapon.school] or { 0.9, 0.9, 0.9 }
        return weapon.name, weapon.icon, color
    end
    local s = METER_SPECIAL[key] or METER_SPECIAL.other
    return s.name, s.icon, s.color
end

-- Healing meter buckets (the exact mirror of the damage meter). Player:Heal
-- tags every heal with one of these source keys.
local HEAL_SPECIAL = {
    regen       = { name = "Regeneration",  icon = "Interface\\Icons\\Spell_Nature_Rejuvenation",  color = { 0.45, 0.9, 0.5 } },
    potion      = { name = "Potions",       icon = "Interface\\Icons\\INV_Potion_54",              color = { 1.0, 0.35, 0.4 } },
    food        = { name = "Food",          icon = "Interface\\Icons\\INV_Misc_Food_11",           color = { 0.9, 0.75, 0.45 } },
    lifesteal   = { name = "Lifesteal",     icon = "Interface\\Icons\\Spell_Shadow_LifeDrain02",   color = { 0.7, 0.35, 0.8 } },
    bloodthirst = { name = "Bloodthirst",   icon = "Interface\\Icons\\Spell_Nature_BloodLust",     color = { 0.85, 0.2, 0.25 } },
    vitality    = { name = "Vitality",      icon = "Interface\\Icons\\Spell_Holy_Devotion",        color = { 0.5, 0.8, 0.55 } },
    holy        = { name = "Holy Ground",   icon = "Interface\\Icons\\Spell_Holy_HolyNova",        color = { 1.0, 0.9, 0.55 } },
    runeblade   = { name = "Runeblade",     icon = "Interface\\Icons\\Spell_Deathknight_DeathStrike", color = { 0.85, 0.2, 0.25 } },
    other       = { name = "Other",         icon = "Interface\\Icons\\INV_Misc_QuestionMark",      color = { 0.7, 0.7, 0.7 } },
}

local function HealSourceInfo(key)
    local s = HEAL_SPECIAL[key] or HEAL_SPECIAL.other
    return s.name, s.icon, s.color
end

-- A titled column of horizontal bars, filled by PopulateDamageMeter (damage) or
-- PopulateHealMeter (healing). `title`/`emptyText` default to the damage labels.
function UI:CreateDamageMeter(parent, width, rowCount, title, emptyText)
    local rowH, gap, titleH = 22, 5, 22
    local meter = CreateFrame("Frame", nil, parent)
    meter:SetSize(width, titleH + rowCount * (rowH + gap))

    meter.title = self:CreateText(meter, 12, WS.Constants.TEXT_GOLD)
    meter.title:SetPoint("TOPLEFT", 0, 0)
    meter.title:SetText(title or "Damage by Source")

    meter.empty = self:CreateText(meter, 12, WS.Constants.TEXT_GREY)
    meter.empty:SetPoint("TOPLEFT", 2, -titleH - 4)
    meter.empty:SetText(emptyText or "No damage recorded.")
    meter.empty:Hide()

    meter.rows = {}
    for i = 1, rowCount do
        local row = CreateFrame("Frame", nil, meter)
        row:SetSize(width, rowH)
        row:SetPoint("TOPLEFT", 0, -(titleH + (i - 1) * (rowH + gap)))

        row.icon = row:CreateTexture(nil, "ARTWORK")
        row.icon:SetSize(rowH, rowH)
        row.icon:SetPoint("LEFT", 0, 0)
        row.icon:SetTexCoord(0.08, 0.92, 0.08, 0.92)
        row.iconEdge = self:AddIconEdge(row, row.icon)

        -- Bar track + fill fill the space right of the icon.
        row.track = row:CreateTexture(nil, "BACKGROUND")
        row.track:SetTexture(WS.Media.white)
        row.track:SetVertexColor(0, 0, 0, 0.5)
        row.track:SetPoint("LEFT", row.icon, "RIGHT", 6, 0)
        row.track:SetPoint("RIGHT", row, "RIGHT", 0, 0)
        row.track:SetHeight(rowH)

        row.fill = row:CreateTexture(nil, "BORDER")
        row.fill:SetTexture(WS.Media.white)
        row.fill:SetPoint("TOPLEFT", row.track, "TOPLEFT", 0, 0)
        row.fill:SetPoint("BOTTOM", row.track, "BOTTOM", 0, 0)
        row.fill:SetWidth(1)

        row.name = self:CreateText(row, 11, WS.Constants.TEXT_WHITE)
        row.name:SetPoint("LEFT", row.track, "LEFT", 5, 0)
        row.name:SetJustifyH("LEFT")

        row.value = self:CreateText(row, 11, WS.Constants.TEXT_PARCH)
        row.value:SetPoint("RIGHT", row.track, "RIGHT", -5, 0)
        row.value:SetJustifyH("RIGHT")

        row.trackWidth = width - rowH - 6
        row:Hide()
        meter.rows[i] = row
    end
    return meter
end

-- Shared meter fill: sorts `data` (key -> amount) descending, folds any overflow
-- past the last row into a combined "Other" bar, sizes each fill relative to the
-- top source, and shows the share of total. `infoFn(key)` resolves name/icon/color.
local function FillMeter(meter, data, infoFn)
    local list = {}
    local total = 0
    for key, amount in pairs(data or {}) do
        if amount > 0 then
            list[#list + 1] = { key = key, amount = amount }
            total = total + amount
        end
    end
    table.sort(list, function(a, b) return a.amount > b.amount end)

    local rows = meter.rows
    local rowCount = #rows
    if #list == 0 or total <= 0 then
        for i = 1, rowCount do rows[i]:Hide() end
        meter.empty:Show()
        return
    end
    meter.empty:Hide()

    -- Fold everything past the last visible slot into a single "Other" bar.
    if #list > rowCount then
        local overflow = 0
        for i = rowCount, #list do overflow = overflow + list[i].amount end
        for i = #list, rowCount, -1 do list[i] = nil end
        list[rowCount] = { key = "overflow", amount = overflow, forceOther = true }
    end

    local top = list[1].amount
    for i = 1, rowCount do
        local row = rows[i]
        local entry = list[i]
        if entry then
            local name, icon, color = infoFn(entry.key)
            -- The folded remainder is NOT the same thing as an unattributed
            -- source, so it must not share a label with one.
            if entry.forceOther then name = "Everything else" end
            row.icon:SetTexture(icon)
            row.name:SetText(name)
            row.value:SetText(("%s  |cffb0b0b0%d%%|r"):format(
                WS.FormatNumber(WS.floor(entry.amount)), WS.floor(entry.amount / total * 100 + 0.5)))
            row.fill:SetVertexColor(color[1], color[2], color[3], 0.55)
            row.fill:SetWidth(WS.max(2, row.trackWidth * (entry.amount / top)))
            row:Show()
        else
            row:Hide()
        end
    end
end

function UI:PopulateDamageMeter(meter, run)
    FillMeter(meter, run.damageByWeapon, MeterSourceInfo)
end

function UI:PopulateHealMeter(meter, run)
    FillMeter(meter, run.healingBySource, HealSourceInfo)
end

------------------------------------------------------------------------------
-- End of run
------------------------------------------------------------------------------

function UI:CreateEndPanel()
    local panel = CreateFrame("Frame", nil, self.root, "BackdropTemplate")
    panel:SetSize(680, 540)
    panel:SetPoint("CENTER")
    panel:SetFrameLevel(self.root:GetFrameLevel() + 60)
    self:ApplyDialogBackdrop(panel, true)
    self:CreateHeaderPlate(panel, "You Have Fallen", 300)

    panel.epitaph = self:CreateText(panel, 12, WS.Constants.TEXT_GREY)
    panel.epitaph:SetPoint("TOP", 0, -48)

    -- The killing blow: a small creature portrait + "Slain by NAME - N damage".
    panel.slainPortrait = panel:CreateTexture(nil, "ARTWORK")
    panel.slainPortrait:SetSize(30, 30)
    panel.slainPortrait:SetPoint("TOP", -128, -66)
    panel.slainPortrait:SetTexCoord(0, 1, 0, 1)
    panel.slainEdge = self:AddIconEdge(panel, panel.slainPortrait)
    panel.slainBy = self:CreateText(panel, 13, WS.Constants.TEXT_RED)
    panel.slainBy:SetPoint("LEFT", panel.slainPortrait, "RIGHT", 8, 0)

    panel.summary = self:CreateText(panel, 13, WS.Constants.TEXT_PARCH)
    panel.summary:SetPoint("TOPLEFT", 44, -104)
    panel.summary:SetWidth(300)
    panel.summary:SetJustifyH("LEFT")
    panel.summary:SetJustifyV("TOP")
    panel.summary:SetSpacing(5)

    -- Right column: damage-by-source on top, healing-by-source stacked below it
    -- (the two meters mirror each other exactly).
    panel.meter = self:CreateDamageMeter(panel, 264, 7)
    panel.meter:SetPoint("TOPRIGHT", -36, -88)
    panel.healMeter = self:CreateDamageMeter(panel, 264, 5, "Healing by Source", "No healing recorded.")
    panel.healMeter:SetPoint("TOPLEFT", panel.meter, "BOTTOMLEFT", 0, -16)

    local again = self:CreatePanelButton(panel, 170, 26, "Survive Again", function() WS.Game:StartRun() end)
    again:SetPoint("BOTTOMLEFT", 48, 20)
    local toMenu = self:CreatePanelButton(panel, 170, 26, "Main Menu", function() UI:ShowMenu() end)
    toMenu:SetPoint("BOTTOMRIGHT", -48, 20)

    panel:Hide()
    self.endPanel = panel
end

function UI:ShowEnd(run, reason)
    local panel = self.endPanel
    self.hud:Hide()
    self.levelUpPanel:Hide()
    self.pausePanel:Hide()
    self.victoryPanel:Hide()
    if self.merchantPanel then self.merchantPanel:Hide() end
    self:HideBossBar()

    local map = WS.Maps[run.mapId]
    local character = WS.Characters[run.characterId]
    -- Surviving to the 30:00 bell banks run.victorious, so any ending after that
    -- reads as the triumph it is - Death takes the body, never the victory.
    if reason == "victory" then
        panel.headerTitle:SetText("VICTORY!")
        panel.epitaph:SetText(("The final terror of %s lies dead at your feet."):format(map.name))
    elseif run.victorious then
        panel.headerTitle:SetText("A Glorious End")
        panel.epitaph:SetText(("You outlasted the horde to the final bell. %s is conquered - Death claimed only the body."):format(map.name))
    elseif reason == "abandoned" then
        panel.headerTitle:SetText("Run Abandoned")
        panel.epitaph:SetText(("You slipped away from %s while you still could."):format(map.name))
    elseif reason == "defeated" and run.time >= 1800 then
        panel.headerTitle:SetText("Death Comes For All")
        panel.epitaph:SetText("You outlasted the horde. Nothing outlasts Death.")
    else
        panel.headerTitle:SetText("You Have Fallen")
        panel.epitaph:SetText(("The horde of %s has claimed another hero."):format(map.name))
    end

    local lines = {
        ("|cffffd100%s|r - %s"):format(character.name, character.title),
        "",
        ("Survived: |cffffffff%s|r"):format(WS.FormatTime(run.time)),
        ("Level reached: |cffffffff%d|r"):format(run.level),
        ("Enemies slain: |cffffffff%s|r"):format(WS.FormatNumber(run.kills)),
        ("Bosses felled: |cffffffff%d|r"):format(run.bossesSlain),
    }
    -- Once you've reached Death (30:00), brag about how many you put down.
    if run.time >= 1800 or (run.deathsSlain or 0) > 0 then
        lines[#lines + 1] = ("Death Itself slain: |cffff6060%d|r"):format(run.deathsSlain or 0)
    end
    lines[#lines + 1] = ("Damage dealt: |cffffffff%s|r"):format(WS.FormatNumber(run.damageDone))
    lines[#lines + 1] = ("Health restored: |cff73d977%s|r"):format(WS.FormatNumber(run.healingDone or 0))
    -- Damage prevented by armor + dodge + block, and what share of incoming that mitigated.
    local prevented, taken = run.damagePrevented or 0, run.damageTaken or 0
    local incoming = prevented + taken
    local mitPct = incoming > 0 and WS.floor(prevented / incoming * 100 + 0.5) or 0
    lines[#lines + 1] = ("Damage prevented: |cff8fd3ff%s|r (|cff8fd3ff%d%%|r mitigated)")
        :format(WS.FormatNumber(prevented), mitPct)
    lines[#lines + 1] = ("Gems gathered: |cffffffff%s|r"):format(WS.FormatNumber(run.gemsCollected))
    lines[#lines + 1] = ("Gold earned: |cffffd100%s|r (banked)"):format(WS.FormatNumber(run.gold))
    panel.summary:SetText(table.concat(lines, "\n"))
    -- The killing blow (hidden for abandoned runs, which have no killer).
    local kb = run.killedBy
    if kb then
        panel.slainBy:SetText(("Slain by |cffff6060%s|r  —  |cffffffff%s|r damage"):format(
            kb.name, WS.FormatNumber(kb.damage)))
        panel.slainBy:Show()
        if kb.displayId and SetPortraitTextureFromCreatureDisplayID then
            SetPortraitTextureFromCreatureDisplayID(panel.slainPortrait, kb.displayId)
            panel.slainPortrait:Show()
            panel.slainEdge:Show()
        else
            panel.slainPortrait:Hide()
            panel.slainEdge:Hide()
        end
    else
        panel.slainBy:Hide()
        panel.slainPortrait:Hide()
        panel.slainEdge:Hide()
    end
    self:PopulateDamageMeter(panel.meter, run)
    self:PopulateHealMeter(panel.healMeter, run)
    panel:Show()
end

------------------------------------------------------------------------------
-- Egg Merchant (in-run vendor; arrives on a timer, sells run-only eggs)
------------------------------------------------------------------------------

function UI:CreateMerchantPanel()
    local panel = CreateFrame("Frame", nil, self.root, "BackdropTemplate")
    panel:SetSize(440, 340)
    panel:SetPoint("CENTER")
    panel:SetFrameLevel(self.root:GetFrameLevel() + 65)
    panel:EnableMouse(true)
    self:ApplyDialogBackdrop(panel, true)
    self:CreateHeaderPlate(panel, "Egg Merchant", 240)

    -- A big golden egg stands in for the merchant's cart of wares.
    panel.egg = panel:CreateTexture(nil, "ARTWORK")
    panel.egg:SetSize(60, 60)
    panel.egg:SetPoint("TOP", 0, -52)
    panel.egg:SetTexture("Interface\\Icons\\INV_Egg_02")
    panel.egg:SetTexCoord(0.08, 0.92, 0.08, 0.92)
    panel.eggEdge = self:AddIconEdge(panel, panel.egg)

    panel.flavor = self:CreateText(panel, 12, WS.Constants.TEXT_GREY)
    panel.flavor:SetPoint("TOP", panel.egg, "BOTTOM", 0, -8)
    panel.flavor:SetWidth(376)
    panel.flavor:SetJustifyH("CENTER")
    panel.flavor:SetText("\"These eggs hatch only for today's fight - but hatch they will. Spend, hero!\"")

    panel.info = self:CreateText(panel, 13, WS.Constants.TEXT_PARCH)
    panel.info:SetPoint("TOP", panel.flavor, "BOTTOM", 0, -12)
    panel.info:SetWidth(376)
    panel.info:SetJustifyH("CENTER")
    panel.info:SetSpacing(4)

    -- Buttons: buy one, buy all, leave.
    panel.buyOne = self:CreatePanelButton(panel, 176, 26, "Buy Egg", function()
        if WS.Game:BuyEggs(1) > 0 then UI:RefreshMerchant() end
    end)
    panel.buyOne:SetPoint("BOTTOMLEFT", 40, 60)

    panel.buyAll = self:CreatePanelButton(panel, 176, 26, "Buy All", function()
        if WS.Game:BuyEggs(math.huge) > 0 then UI:RefreshMerchant() end
    end)
    panel.buyAll:SetPoint("BOTTOMRIGHT", -40, 60)

    local leave = self:CreatePanelButton(panel, 160, 26, "Move On", function() WS.Game:CloseMerchant() end)
    leave:SetPoint("BOTTOM", 0, 24)

    panel:Hide()
    self.merchantPanel = panel
end

function UI:ShowMerchant(run, player)
    self:RefreshMerchant()
    self.merchantPanel:Show()
end

-- Recomputes the affordability display and button labels/enabled state.
function UI:RefreshMerchant()
    local panel = self.merchantPanel
    if not panel then return end
    local run, player = WS.Game.run, WS.Game.player
    local cost = WS.Config.eggVendorCost or 100
    local dmgPct = (WS.Config.eggRunDamage or 0.001) * 100
    local hp = WS.Config.eggRunHealth or 1
    local affordable = WS.floor((run.gold or 0) / cost)

    panel.info:SetText(table.concat({
        ("Each egg: |cffffd100%d gold|r  ->  |cff88ff88+%.1f%% damage, +%d health|r"):format(cost, dmgPct, hp),
        ("Your gold: |cffffd100%s|r      Eggs this run: |cffffffff%d|r"):format(
            WS.FormatNumber(run.gold or 0), run.runEggs or 0),
    }, "\n"))

    if affordable > 0 then
        panel.buyOne:Enable()
        panel.buyAll:Enable()
        panel.buyAll:SetText(("Buy All (%d)"):format(affordable))
    else
        panel.buyOne:Disable()
        panel.buyAll:Disable()
        panel.buyAll:SetText("Buy All")
    end
end

function UI:HideMerchant()
    if self.merchantPanel then self.merchantPanel:Hide() end
end

------------------------------------------------------------------------------
-- Achievement toast (queued, top of screen, WoW alert styled)
------------------------------------------------------------------------------

function UI:CreateToast()
    local toast = CreateFrame("Frame", nil, self.root, "BackdropTemplate")
    toast:SetSize(340, 64)
    toast:SetPoint("TOP", self.root, "TOP", 0, -80)
    toast:SetFrameLevel(self.root:GetFrameLevel() + 80)
    self:ApplyDialogBackdrop(toast, true)

    toast.icon = toast:CreateTexture(nil, "ARTWORK")
    toast.icon:SetSize(36, 36)
    toast.icon:SetPoint("LEFT", 14, 0)
    toast.icon:SetTexCoord(0.08, 0.92, 0.08, 0.92)
    toast.iconBorder = self:AddIconEdge(toast, toast.icon)

    toast.heading = self:CreateText(toast, 11, WS.Constants.TEXT_GOLD)
    toast.heading:SetPoint("TOPLEFT", toast.icon, "TOPRIGHT", 10, -2)
    toast.title = self:CreateText(toast, 13)
    toast.title:SetPoint("BOTTOMLEFT", toast.icon, "BOTTOMRIGHT", 10, 4)

    toast.queue = {}
    toast:Hide()
    toast:SetScript("OnUpdate", function(frame, elapsed)
        frame.timer = (frame.timer or 0) - elapsed
        if frame.timer <= 0.5 then
            frame:SetAlpha(WS.max(0, frame.timer / 0.5))
        end
        if frame.timer <= 0 then
            frame:Hide()
            UI:PumpToastQueue()
        end
    end)
    self.toast = toast
end

-- Queues a toast; shown immediately if nothing is playing.
function UI:Toast(icon, heading, title)
    local queue = self.toast.queue
    queue[#queue + 1] = { icon = icon, heading = heading, title = title }
    if not self.toast:IsShown() then
        self:PumpToastQueue()
    end
end

function UI:PumpToastQueue()
    local toast = self.toast
    local next_ = table.remove(toast.queue, 1)
    if not next_ then return end
    toast.icon:SetTexture(next_.icon)
    toast.heading:SetText(next_.heading)
    toast.title:SetText(next_.title)
    toast.timer = 3.5
    toast:SetAlpha(1)
    toast:Show()
end
