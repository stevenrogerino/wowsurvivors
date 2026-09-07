-- WoW Survivors is a self-contained UI minigame. It never reads or drives the
-- player's character, combat, targeting, or movement in the game world, calls
-- no protected APIs, and touches no secure frames.
local ADDON_NAME, WS = ...
_G.WoWSurvivors = WS

WS.name = ADDON_NAME
WS.version = "2.17.0"

-- Local math aliases shared by every hot path.
WS.random = math.random
WS.floor = math.floor
WS.sqrt = math.sqrt
WS.min = math.min
WS.max = math.max
WS.abs = math.abs
WS.sin = math.sin
WS.cos = math.cos
WS.pi = math.pi
WS.tau = math.pi * 2

------------------------------------------------------------------------------
-- Tiny utility layer (kept allocation-free for use inside the tick loop)
------------------------------------------------------------------------------

function WS.Clamp(value, low, high)
    if value < low then return low end
    if value > high then return high end
    return value
end

function WS.Lerp(a, b, t)
    return a + (b - a) * t
end

function WS.DistanceSquared(ax, ay, bx, by)
    local dx, dy = bx - ax, by - ay
    return dx * dx + dy * dy
end

function WS.Normalize(dx, dy)
    local length = WS.sqrt(dx * dx + dy * dy)
    if length < 0.0001 then return 0, 0, 0 end
    return dx / length, dy / length, length
end

-- Rotate a unit vector by `angle` radians.
function WS.Rotate(dx, dy, angle)
    local c, s = WS.cos(angle), WS.sin(angle)
    return dx * c - dy * s, dx * s + dy * c
end

function WS.Copy(source)
    local result = {}
    for key, value in pairs(source) do result[key] = value end
    return result
end

-- Fills tooltip tokens from an entity's own fields, so a description's numbers
-- always match the tuned magnitudes:
--   {field}    -> the raw value            (perkArmor 2 -> "2")
--   {field%}   -> round(value*100)         (additive fraction: dmg 0.08 -> "8")
--   {field*%}  -> round((value-1)*100)     (multiplier: speedMult 1.08 -> "8")
--   {field~%}  -> round((1-value)*100)     (reduction: cooldownMult 0.90 -> "10")
function WS.FormatTokens(template, e)
    if type(template) ~= "string" or not e then return template end
    local out = template:gsub("{([%w_]+)([%%*~]*)}", function(field, mode)
        local v = e[field]
        if v == nil then return "{" .. field .. mode .. "}" end
        if mode == "%" then return tostring(WS.floor(v * 100 + 0.5))
        elseif mode == "*%" then return tostring(WS.floor((v - 1) * 100 + 0.5))
        elseif mode == "~%" then return tostring(WS.floor((1 - v) * 100 + 0.5))
        else return tostring(v) end
    end)
    return out
end

-- Picks an entry from { { weight = n, ... }, ... } proportionally to weight.
function WS.WeightedPick(entries)
    local total = 0
    for i = 1, #entries do total = total + (entries[i].weight or 1) end
    local roll = WS.random() * total
    for i = 1, #entries do
        roll = roll - (entries[i].weight or 1)
        if roll <= 0 then return entries[i] end
    end
    return entries[#entries]
end

function WS.FormatTime(seconds)
    seconds = WS.max(0, WS.floor(seconds or 0))
    return string.format("%d:%02d", WS.floor(seconds / 60), seconds % 60)
end

function WS.FormatNumber(value)
    value = WS.floor(value or 0)
    if value >= 1000000 then return string.format("%.1fM", value / 1000000) end
    if value >= 10000 then return string.format("%.1fk", value / 1000) end
    return tostring(value)
end

function WS.Print(message)
    print("|cffffd100WoW Survivors:|r " .. tostring(message))
end

function WS.Debug(message)
    if WoWSurvivorsDB and WoWSurvivorsDB.settings.debug then
        WS.Print("|cff9d8cff[debug]|r " .. tostring(message))
    end
end

------------------------------------------------------------------------------
-- Bootstrap
------------------------------------------------------------------------------

-- Every data file the UI cannot be built without. If one failed to parse (most
-- often because the addon folder was being written to while the game reloaded),
-- say so plainly instead of exploding somewhere deep in the menu code.
local REQUIRED_DATA = {
    { "Characters", "CharacterOrder" }, { "Maps", "MapOrder" },
    { "Weapons", "WeaponOrder" }, { "Upgrades", "UpgradeOrder" },
    { "Blessings", "BlessingOrder" },
}

function WS:OnAddonLoaded()
    for i = 1, #REQUIRED_DATA do
        local tbl, order = REQUIRED_DATA[i][1], REQUIRED_DATA[i][2]
        if type(self[tbl]) ~= "table" or type(self[order]) ~= "table" then
            self.Print("|cffff3030Data\\" .. tbl .. ".lua failed to load|r - the game cannot start. "
                .. "This usually means the addon files were mid-update when you reloaded. "
                .. "Type /reload once more; if it persists, reinstall the addon folder.")
            return
        end
    end
    self.SaveData:Initialize()
    self.UI:Create()
    self.Game:Initialize()
    self:CreateMinimapButton()
end

-- Toggle behavior of /survivors and the minimap button:
--   game running + visible  -> pause/unpause
--   game running + hidden   -> bring the (paused) game back
--   otherwise               -> open or close the main menu
function WS:Toggle()
    if self.Game.running and not self.UI.root:IsShown() then
        self.UI.root:Show()
        return
    end
    if self.Game.running then
        self.Game:TogglePause()
    elseif self.UI.root:IsShown() then
        self.UI:HideGame()
    else
        self.UI:ShowMenu()
    end
end

------------------------------------------------------------------------------
-- Minimap button (drag the edge of the minimap to reposition)
------------------------------------------------------------------------------

function WS:CreateMinimapButton()
    local button = CreateFrame("Button", "WoWSurvivorsMinimapButton", Minimap)
    button:SetSize(32, 32)
    button:SetFrameStrata("MEDIUM")
    button:SetFrameLevel(8)
    button:RegisterForClicks("LeftButtonUp", "RightButtonUp")
    button:RegisterForDrag("LeftButton")
    button:SetMovable(true)

    button.icon = button:CreateTexture(nil, "BACKGROUND")
    button.icon:SetTexture("Interface\\Icons\\Spell_Shadow_AnimateDead")
    button.icon:SetSize(20, 20)
    button.icon:SetPoint("CENTER", -1, 1)
    button.icon:SetTexCoord(0.08, 0.92, 0.08, 0.92)
    button.border = button:CreateTexture(nil, "OVERLAY")
    button.border:SetTexture("Interface\\Minimap\\MiniMap-TrackingBorder")
    button.border:SetSize(54, 54)
    button.border:SetPoint("TOPLEFT")
    button:SetHighlightTexture("Interface\\Minimap\\UI-Minimap-ZoomButton-Highlight")

    local function Reposition()
        local angle = math.rad(WoWSurvivorsDB.settings.minimapAngle or 225)
        button:ClearAllPoints()
        button:SetPoint("CENTER", Minimap, "CENTER", math.cos(angle) * 80, math.sin(angle) * 80)
    end

    button:SetScript("OnDragStart", function(self)
        self:SetScript("OnUpdate", function()
            local mx, my = Minimap:GetCenter()
            local cx, cy = GetCursorPosition()
            local scale = Minimap:GetEffectiveScale()
            WoWSurvivorsDB.settings.minimapAngle = math.deg(math.atan2(cy / scale - my, cx / scale - mx))
            Reposition()
        end)
    end)
    button:SetScript("OnDragStop", function(self) self:SetScript("OnUpdate", nil) end)

    button:SetScript("OnClick", function(_, mouseButton)
        if mouseButton == "RightButton" then
            WS.UI:ShowMenu()
        else
            WS:Toggle()
        end
    end)
    button:SetScript("OnEnter", function(self)
        GameTooltip:SetOwner(self, "ANCHOR_LEFT")
        GameTooltip:AddLine("WoW Survivors", 1, 0.82, 0.1)
        GameTooltip:AddLine("Left-click: play / pause", 1, 1, 1)
        GameTooltip:AddLine("Right-click: main menu", 0.7, 0.7, 0.7)
        GameTooltip:AddLine("Drag: move this button", 0.7, 0.7, 0.7)
        GameTooltip:Show()
    end)
    button:SetScript("OnLeave", GameTooltip_Hide)

    self.minimapButton = button
    Reposition()
    if not WoWSurvivorsDB.settings.minimapButton then button:Hide() end
end

------------------------------------------------------------------------------
-- Key binding + slash commands
------------------------------------------------------------------------------

BINDING_HEADER_WOWSURVIVORS = "WoW Survivors"
BINDING_NAME_WOWSURVIVORS_TOGGLE = "Toggle WoW Survivors"

SLASH_WOWSURVIVORS1 = "/survivors"
SLASH_WOWSURVIVORS2 = "/wowsurvivors"
SlashCmdList.WOWSURVIVORS = function(message)
    message = (message or ""):lower():match("^%s*(.-)%s*$")
    if message == "reset" then
        WS.SaveData:ResetAll()
        WS.Print("all saved progress has been reset.")
        if WS.UI.root:IsShown() then WS.UI:ShowMenu() end
    elseif message == "unlock" then
        -- Debug/showcase cheat: opens every survivor and battlefield.
        WS.SaveData:UnlockEverything()
        WS.Print("every survivor and battlefield unlocked. Enjoy!")
        if WS.UI.root:IsShown() then WS.UI:ShowMenu() end
    elseif message:match("^demon") then
        -- Live-preview a creature display ID on the survivor, because display IDs
        -- are near-impossible to pick blind. "/survivors demon" alone restores you.
        local id = tonumber(message:match("^demon%s+(%d+)$"))
        local player = WS.Game.player
        if not player then
            WS.Print("start a run first - the demon preview needs a survivor on the field.")
        elseif id then
            WS.Config.metaDisplayId = id
            WS.Player:SetDemonForm(player, true)
            WS.Print("previewing display " .. id .. ". Like it? Put metaDisplayId = "
                .. id .. " in the tuning bench. '/survivors demon' to change back.")
        else
            WS.Player:SetDemonForm(player, false)
            WS.Print("back to your own skin.")
        end
    elseif message:match("^summon") then
        -- Live-preview a summon's creature model, same reason as /survivors demon.
        local kind, id = message:match("^summon%s+(%a+)%s+(%d+)$")
        if kind and WS.Familiar:SetKindDisplay(kind, tonumber(id)) then
            WS.Print(kind .. "s now use display " .. id
                .. ". Like it? Put " .. kind .. "Display = " .. id .. " in the tuning bench.")
        else
            WS.Print("usage: /survivors summon wolf|ghoul <displayId>  (e.g. 'summon ghoul 137')")
        end
    elseif message == "help" then
        WS.Print("/survivors - open the game (or pause a run)")
        WS.Print("/survivors reset - wipe all progress and settings")
        WS.Print("/survivors unlock - unlock all content (no achievements)")
        WS.Print("/survivors demon <id> - preview a demon-form model (blank to revert)")
        WS.Print("/survivors summon wolf|ghoul <id> - preview a summon's model live")
    else
        WS:Toggle()
    end
end

------------------------------------------------------------------------------
-- Events. If real combat begins (or, if enabled, a ready check / whisper) while
-- the arcade is up, step out of the way: pause the run and hide the fullscreen
-- frame so the keyboard is released.
------------------------------------------------------------------------------

-- Pause + hide the arcade (only if it's actually up) so the real game has focus.
local function StepAway(reason)
    if not (WS.UI.root and WS.UI.root:IsShown()) then return end
    if WS.Game.running and not WS.Game.paused then WS.Game:TogglePause() end
    WS.UI.root:Hide()
    WS.Print(reason .. " The game is paused - /survivors to return.")
end

local events = CreateFrame("Frame")
events:RegisterEvent("ADDON_LOADED")
events:RegisterEvent("PLAYER_REGEN_DISABLED") -- entering combat
events:RegisterEvent("READY_CHECK")           -- a ready check begins (opt-in)
events:RegisterEvent("CHAT_MSG_WHISPER")       -- an incoming whisper (opt-in)
events:RegisterEvent("CHAT_MSG_BN_WHISPER")    -- ...and Battle.net whispers
events:SetScript("OnEvent", function(_, event, addon)
    if event == "ADDON_LOADED" then
        if addon == ADDON_NAME then WS:OnAddonLoaded() end
        return
    end
    if not WoWSurvivorsDB then return end
    local s = WoWSurvivorsDB.settings
    if event == "PLAYER_REGEN_DISABLED" then
        if s.combatPause then StepAway("Combat!") end
    elseif event == "READY_CHECK" then
        if s.pauseReadyCheck then StepAway("Ready check!") end
    elseif event == "CHAT_MSG_WHISPER" or event == "CHAT_MSG_BN_WHISPER" then
        if s.pauseWhisper then StepAway("Whisper received.") end
    end
end)
