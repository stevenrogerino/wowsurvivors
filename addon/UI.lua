local _, WS = ...

-- UI core: shared Warcraft-styled widget factories, the fullscreen root, and
-- the scaled world (playfield). Screens live in UI_Menu / UI_HUD /
-- UI_Overlays; all of them build on the helpers defined here.
WS.UI = {}
local UI = WS.UI

-- Classic interface art shipped with every client. Everything visual in the
-- addon is drawn from these files plus spell/item icons.
WS.Media = {
    fancyFont    = "Fonts\\MORPHEUS.TTF", -- quest-title font; falls back safely
    dialogBg     = "Interface\\DialogFrame\\UI-DialogBox-Background",
    dialogBgDark = "Interface\\DialogFrame\\UI-DialogBox-Background-Dark",
    dialogEdge   = "Interface\\DialogFrame\\UI-DialogBox-Border",
    header       = "Interface\\DialogFrame\\UI-DialogBox-Header",
    tooltipBg    = "Interface\\Tooltips\\UI-Tooltip-Background",
    tooltipEdge  = "Interface\\Tooltips\\UI-Tooltip-Border",
    statusBar    = "Interface\\TargetingFrame\\UI-StatusBar",
    buttonUp     = "Interface\\Buttons\\UI-Panel-Button-Up",
    buttonDown   = "Interface\\Buttons\\UI-Panel-Button-Down",
    buttonHi     = "Interface\\Buttons\\UI-Panel-Button-Highlight",
    buttonOff    = "Interface\\Buttons\\UI-Panel-Button-Disabled",
    iconBorder   = "Interface\\Buttons\\UI-Quickslot2",
    glowBorder   = "Interface\\Buttons\\UI-ActionButton-Border",
    raidIcons    = "Interface\\TargetingFrame\\UI-RaidTargetingIcons",
    softCircle   = "Interface\\CharacterFrame\\TempPortraitAlphaMask",
    white        = "Interface\\Buttons\\WHITE8x8",
}

------------------------------------------------------------------------------
-- Widget factories
------------------------------------------------------------------------------

-- The classic gold-trimmed dialog box (quest/system dialog styling).
function UI:ApplyDialogBackdrop(frame, dark)
    frame:SetBackdrop({
        bgFile = dark and WS.Media.dialogBgDark or WS.Media.dialogBg,
        edgeFile = WS.Media.dialogEdge,
        tile = true, tileSize = 32, edgeSize = 32,
        insets = { left = 11, right = 11, top = 11, bottom = 11 },
    })
end

-- Small tooltip-styled inset panels (stat rows, list containers).
function UI:ApplyInsetBackdrop(frame, r, g, b, a)
    frame:SetBackdrop({
        bgFile = WS.Media.tooltipBg,
        edgeFile = WS.Media.tooltipEdge,
        tile = true, tileSize = 16, edgeSize = 14,
        insets = { left = 3, right = 3, top = 3, bottom = 3 },
    })
    frame:SetBackdropColor(r or 0.05, g or 0.05, b or 0.08, a or 0.92)
    frame:SetBackdropBorderColor(0.55, 0.45, 0.25, 1)
end

function UI:CreateText(parent, size, color, layer)
    local text = parent:CreateFontString(nil, layer or "OVERLAY", "GameFontNormal")
    text:SetFont(STANDARD_TEXT_FONT, size, "")
    text:SetShadowOffset(1, -1)
    text:SetShadowColor(0, 0, 0, 0.9)
    color = color or WS.Constants.TEXT_WHITE
    text:SetTextColor(color[1], color[2], color[3], color[4] or 1)
    return text
end

-- Morpheus (the quest-title font), outlined for readability against the dark
-- panels. If the file is missing on this client the SetFont call fails and
-- the inherited FrizQT face quietly remains.
function UI:CreateFancyText(parent, size, color, layer)
    local text = parent:CreateFontString(nil, layer or "OVERLAY", "GameFontNormal")
    text:SetFont(WS.Media.fancyFont, size, "OUTLINE")
    text:SetShadowOffset(1, -1)
    text:SetShadowColor(0, 0, 0, 1)
    color = color or WS.Constants.TEXT_GOLD
    text:SetTextColor(color[1], color[2], color[3], color[4] or 1)
    return text
end

-- The classic red Warcraft panel button.
function UI:CreatePanelButton(parent, width, height, label, onClick)
    local button = CreateFrame("Button", nil, parent)
    button:SetSize(width, height)

    button:SetNormalTexture(WS.Media.buttonUp)
    button:SetPushedTexture(WS.Media.buttonDown)
    button:SetDisabledTexture(WS.Media.buttonOff)
    button:SetHighlightTexture(WS.Media.buttonHi, "ADD")
    -- The button art occupies only part of its texture file.
    local coords = { 0, 0.625, 0, 0.6875 }
    for _, texture in next, { button:GetNormalTexture(), button:GetPushedTexture(), button:GetDisabledTexture(), button:GetHighlightTexture() } do
        if texture then texture:SetTexCoord(coords[1], coords[2], coords[3], coords[4]) end
    end

    button:SetNormalFontObject(GameFontNormal)
    button:SetHighlightFontObject(GameFontHighlight)
    button:SetDisabledFontObject(GameFontDisable)
    button:SetText(label)

    button:SetScript("OnClick", function(self, mouseButton)
        WS.Audio:Play("click")
        if onClick then onClick(self, mouseButton) end
    end)
    return button
end

-- The scroll-top header plate used on every window ("WoW Survivors", etc).
function UI:CreateHeaderPlate(frame, titleText, width)
    local plate = frame:CreateTexture(nil, "ARTWORK")
    plate:SetTexture(WS.Media.header)
    plate:SetSize(width or 300, 64)
    plate:SetPoint("TOP", 0, 12)
    local title = self:CreateFancyText(frame, 17)
    title:SetPoint("TOP", plate, "TOP", 0, -14)
    title:SetText(titleText)
    frame.headerPlate, frame.headerTitle = plate, title
    return title
end

-- Permanently rounds a frame's icon into a disc (gems, pickups).
function UI:ApplyRoundMask(frame)
    if not frame.CreateMaskTexture then return end
    local mask = frame:CreateMaskTexture()
    mask:SetTexture(WS.Media.softCircle, "CLAMPTOBLACKADDITIVE", "CLAMPTOBLACKADDITIVE")
    mask:SetAllPoints(frame.icon)
    frame.icon:AddMaskTexture(mask)
end

-- A clean 1px dark frame behind an icon (replaces the old slot-art borders,
-- whose ring art never lined up with arbitrary icon sizes).
function UI:AddIconEdge(parent, icon)
    local edge = parent:CreateTexture(nil, "BORDER")
    edge:SetTexture(WS.Media.white)
    edge:SetVertexColor(0, 0, 0, 0.9)
    edge:SetPoint("TOPLEFT", icon, "TOPLEFT", -1, 1)
    edge:SetPoint("BOTTOMRIGHT", icon, "BOTTOMRIGHT", 1, -1)
    return edge
end

-- Icon + title + description selection card (menu rows, level-up choices).
-- A clipping viewport whose contents scroll with the mouse wheel. Used for the
-- survivor/battlefield lists so the roster can keep growing without the menu
-- outgrowing the screen. Cards are parented to `view.content` and positioned
-- relative to it; call view:SetContentHeight(n) once they're laid out.
function UI:CreateScrollList(parent, width, height)
    local view = CreateFrame("Frame", nil, parent)
    view:SetSize(width, height)
    view:SetClipsChildren(true)
    view:EnableMouseWheel(true)

    local content = CreateFrame("Frame", nil, view)
    content:SetSize(width, height)
    content:SetPoint("TOPLEFT", 0, 0)
    view.content = content
    view.offset, view.contentHeight = 0, height

    -- A soft "more below" hint, shown only while there is somewhere to scroll.
    local more = self:CreateText(view, 10, WS.Constants.TEXT_GREY)
    more:SetPoint("BOTTOM", 0, 1)
    more:SetText("scroll for more")
    view.moreHint = more

    function view:Refresh()
        local max = WS.max(0, (self.contentHeight or 0) - self:GetHeight())
        self.offset = WS.Clamp(self.offset, 0, max)
        self.content:SetPoint("TOPLEFT", 0, self.offset)
        self.moreHint:SetShown(max > 0 and self.offset < max - 1)
    end
    function view:SetContentHeight(h) self.contentHeight = h; self:Refresh() end

    view:SetScript("OnMouseWheel", function(self, delta)
        self.offset = self.offset - delta * 46
        self:Refresh()
    end)
    return view
end

function UI:CreateIconCard(parent, width, height)
    local card = CreateFrame("Button", nil, parent, "BackdropTemplate")
    card:SetSize(width, height)
    self:ApplyInsetBackdrop(card, 0.07, 0.06, 0.05, 0.95)

    card.icon = card:CreateTexture(nil, "ARTWORK")
    card.icon:SetSize(40, 40)
    card.icon:SetPoint("TOPLEFT", 9, -9)
    card.icon:SetTexCoord(0.08, 0.92, 0.08, 0.92)
    card.iconBorder = self:AddIconEdge(card, card.icon)

    card.title = self:CreateText(card, 13, WS.Constants.TEXT_GOLD)
    card.title:SetPoint("TOPLEFT", card.icon, "TOPRIGHT", 8, -1)
    card.title:SetPoint("RIGHT", card, "RIGHT", -8, 0)
    card.title:SetJustifyH("LEFT")
    card.description = self:CreateText(card, 11, WS.Constants.TEXT_PARCH)
    card.description:SetPoint("TOPLEFT", card.title, "BOTTOMLEFT", 0, -3)
    card.description:SetPoint("BOTTOMRIGHT", card, "BOTTOMRIGHT", -8, 6)
    card.description:SetJustifyH("LEFT")
    card.description:SetJustifyV("TOP")

    card:SetScript("OnEnter", function(self)
        if not self.locked then self:SetBackdropBorderColor(1, 0.82, 0.1, 1) end
    end)
    card:SetScript("OnLeave", function(self)
        local c = self.borderColor
        if c then self:SetBackdropBorderColor(c[1], c[2], c[3], 1)
        else self:SetBackdropBorderColor(0.55, 0.45, 0.25, 1) end
    end)
    return card
end

function UI:SetCardBorder(card, r, g, b)
    card.borderColor = card.borderColor or {}
    card.borderColor[1], card.borderColor[2], card.borderColor[3] = r, g, b
    card:SetBackdropBorderColor(r, g, b, 1)
end

-- Classic horizontal slider (0..1 shown as 0..100%); get/set are closures
-- over saved settings. `onChange` fires live while dragging.
function UI:CreateSlider(parent, label, get, set)
    local slider = CreateFrame("Slider", nil, parent, "BackdropTemplate")
    slider:SetOrientation("HORIZONTAL")
    slider:SetSize(220, 16)
    slider:SetMinMaxValues(0, 1)
    slider:SetValueStep(0.05)
    slider:SetObeyStepOnDrag(true)
    slider:SetBackdrop({
        bgFile = "Interface\\Buttons\\UI-SliderBar-Background",
        edgeFile = "Interface\\Buttons\\UI-SliderBar-Border",
        tile = true, tileSize = 8, edgeSize = 8,
        insets = { left = 3, right = 3, top = 6, bottom = 6 },
    })
    slider:SetThumbTexture("Interface\\Buttons\\UI-SliderBar-Button-Horizontal")

    slider.label = self:CreateText(slider, 12)
    slider.label:SetPoint("BOTTOMLEFT", slider, "TOPLEFT", 0, 2)
    slider.value = self:CreateText(slider, 12, WS.Constants.TEXT_GOLD)
    slider.value:SetPoint("BOTTOMRIGHT", slider, "TOPRIGHT", 0, 2)

    local function Refresh(value)
        slider.value:SetText(WS.floor(value * 100 + 0.5) .. "%")
    end
    slider.label:SetText(label)
    slider:SetScript("OnShow", function(self)
        self:SetValue(get() or 1)
        Refresh(self:GetValue())
    end)
    slider:SetScript("OnValueChanged", function(self, value, isUserInput)
        Refresh(value)
        if isUserInput then set(value) end
    end)
    return slider
end

-- Classic checkbox with a label; get/set are closures over saved settings.
function UI:CreateCheckbox(parent, label, get, set)
    local check = CreateFrame("CheckButton", nil, parent, "UICheckButtonTemplate")
    check:SetSize(26, 26)
    check.labelText = self:CreateText(check, 12)
    check.labelText:SetPoint("LEFT", check, "RIGHT", 4, 0)
    check.labelText:SetText(label)
    check:SetScript("OnShow", function(self) self:SetChecked(get()) end)
    check:SetScript("OnClick", function(self)
        WS.Audio:Play("click")
        set(self:GetChecked() and true or false)
    end)
    return check
end

------------------------------------------------------------------------------
-- Root frame + scaled world
------------------------------------------------------------------------------

function UI:Create()
    if self.root then return end

    local root = CreateFrame("Frame", "WoWSurvivorsFrame", UIParent, "BackdropTemplate")
    root:SetAllPoints(UIParent)
    root:SetFrameStrata("FULLSCREEN_DIALOG")
    root:SetToplevel(true)
    root:EnableKeyboard(true)
    root:EnableMouse(true)
    if root.SetPropagateKeyboardInput then root:SetPropagateKeyboardInput(false) end
    root:Hide()
    self.root = root

    -- Stretched (not tiled): tiling silently fails to render on textures
    -- created without wrap modes, leaving a black void on some clients.
    root.background = root:CreateTexture(nil, "BACKGROUND")
    root.background:SetAllPoints()
    root.background:SetTexture(WS.Media.dialogBgDark)
    root.background:SetVertexColor(0.35, 0.33, 0.35, 1)

    -- The host reserves space for the HUD; the world letterboxes inside it.
    local host = CreateFrame("Frame", nil, root)
    host:SetPoint("TOPLEFT", root, "TOPLEFT", 10, -64)
    host:SetPoint("BOTTOMRIGHT", root, "BOTTOMRIGHT", -10, 54)
    self.host = host

    -- Fixed-size world: gameplay coordinates are identical on every screen;
    -- SetScale letterboxes it to fit, scaling all children (and their text).
    local world = CreateFrame("Frame", nil, host)
    world:SetSize(WS.Constants.WORLD_WIDTH, WS.Constants.WORLD_HEIGHT)
    world:SetPoint("CENTER")
    if world.SetClipsChildren then world:SetClipsChildren(true) end
    self.world = world
    self.shakeTime, self.shakeIntensity = 0, 0

    local function Rescale()
        local width, height = host:GetWidth(), host:GetHeight()
        if width < 1 or height < 1 then return end
        world:SetScale(WS.min(width / WS.Constants.WORLD_WIDTH, height / WS.Constants.WORLD_HEIGHT))
    end
    host:SetScript("OnSizeChanged", Rescale)
    root:SetScript("OnShow", function()
        Rescale()
        WS.Audio:ApplyVolumes()
        WS.Audio:Play("open")
        WS.Audio:ResumeMusic()
    end)
    root:SetScript("OnHide", function()
        WS.Audio:Play("close")
        WS.Audio:PauseMusic()
        WS.Audio:RestoreVolumes()
    end)

    world.ground = world:CreateTexture(nil, "BACKGROUND", nil, -8)
    world.ground:SetAllPoints()
    world.ground:SetTexture(WS.Media.dialogBgDark)

    -- Soft dark vignette bands for depth (plain alpha if gradients are absent).
    local function VignetteBand(point, invert)
        local band = world:CreateTexture(nil, "BACKGROUND", nil, -1)
        band:SetTexture(WS.Media.white)
        band:SetPoint(point == "TOP" and "TOPLEFT" or "BOTTOMLEFT")
        band:SetPoint(point == "TOP" and "TOPRIGHT" or "BOTTOMRIGHT")
        band:SetHeight(150)
        if band.SetGradient and CreateColor then
            local clear, dark = CreateColor(0, 0, 0, 0), CreateColor(0, 0, 0, 0.45)
            band:SetGradient("VERTICAL", invert and dark or clear, invert and clear or dark)
        else
            band:SetVertexColor(0, 0, 0, 0.18)
        end
        return band
    end
    VignetteBand("TOP", false)
    VignetteBand("BOTTOM", true)

    -- Gold-trimmed frame around the playfield.
    local border = CreateFrame("Frame", nil, world, "BackdropTemplate")
    border:SetPoint("TOPLEFT", -6, 6)
    border:SetPoint("BOTTOMRIGHT", 6, -6)
    border:SetBackdrop({ edgeFile = WS.Media.dialogEdge, edgeSize = 24 })
    border:SetFrameLevel(world:GetFrameLevel() + 40)

    self.props = {}

    root:SetScript("OnKeyDown", function(_, key) WS.Game:SetKey(key, true) end)
    root:SetScript("OnKeyUp", function(_, key) WS.Game:SetKey(key, false) end)

    WS.FloatingText:Initialize()
    self:CreateHUD()
    self:CreateMenu()
    self:CreateOverlays()
end

-- Positions an entity frame in world coordinates. Entity frames are only ever
-- anchored here, with a single CENTER point, so no ClearAllPoints is needed.
function UI:Place(frame, x, y, size)
    frame:SetPoint("CENTER", self.world, "BOTTOMLEFT", x, y)
    if size then frame:SetSize(size, size) end
end

------------------------------------------------------------------------------
-- Screen shake (respects the player's setting)
------------------------------------------------------------------------------

function UI:Shake(intensity, duration)
    if not WoWSurvivorsDB.settings.screenShake then return end
    if intensity >= self.shakeIntensity or self.shakeTime <= 0 then
        self.shakeIntensity, self.shakeTime = intensity, duration
    end
end

function UI:UpdateShake(dt)
    if self.shakeTime <= 0 then return end
    self.shakeTime = self.shakeTime - dt
    if self.shakeTime <= 0 then
        self.shakeIntensity = 0
        self.world:SetPoint("CENTER", 0, 0)
    else
        local strength = self.shakeIntensity
        self.world:SetPoint("CENTER", (WS.random() * 2 - 1) * strength, (WS.random() * 2 - 1) * strength)
    end
end

------------------------------------------------------------------------------
-- Map dressing: ground tint and decorative scatter
------------------------------------------------------------------------------

function UI:DressWorld(map)
    -- Stretched, not tiled: tiling can silently fail and render nothing at
    -- all, and a stretched texture under the splotch patches reads fine.
    local tint = map.groundTint
    self.world.ground:SetTexture(map.groundTexture)
    self.world.ground:SetVertexColor(tint[1] * 1.6, tint[2] * 1.6, tint[3] * 1.6, 1)
    self:ScatterProps(map)
end

function UI:ScatterProps(map)
    -- Large soft light/shadow patches first: they break up the obvious
    -- tiling of the ground texture and read as terrain variation.
    self.splotches = self.splotches or {}
    for i = 1, 9 do
        local patch = self.splotches[i]
        if not patch then
            patch = self.world:CreateTexture(nil, "BACKGROUND", nil, -6)
            patch:SetTexture(WS.Media.softCircle)
            self.splotches[i] = patch
        end
        local dark = WS.random() < 0.6
        local shade = dark and 0 or 1
        patch:SetVertexColor(shade, shade, shade, dark and 0.10 or 0.05)
        local width = 240 + WS.random(0, 280)
        patch:SetSize(width, width * (0.55 + WS.random() * 0.4))
        patch:ClearAllPoints()
        patch:SetPoint("CENTER", self.world, "BOTTOMLEFT",
            WS.random(0, WS.Constants.WORLD_WIDTH), WS.random(0, WS.Constants.WORLD_HEIGHT))
        patch:Show()
    end

    -- Decorative scatter, randomly rotated and dimmed so it sits in the
    -- ground rather than floating on it. Some maps (the bare Boss Arena) carry no
    -- props - hide any leftovers and skip, or random(1, 0) would error.
    if #map.props == 0 then
        for i = 1, #self.props do if self.props[i] then self.props[i]:Hide() end end
        return
    end
    for i = 1, WS.Constants.MAX_PROPS do
        local prop = self.props[i]
        if not prop then
            prop = self.world:CreateTexture(nil, "BACKGROUND", nil, -4)
            prop:SetTexCoord(0.08, 0.92, 0.08, 0.92)
            self.props[i] = prop
        end
        local style = map.props[WS.random(1, #map.props)]
        local size = 22 + WS.random(0, 26)
        prop:SetTexture(style.icon)
        prop:SetVertexColor(style.tint[1], style.tint[2], style.tint[3], 0.35)
        prop:SetSize(size, size)
        prop:SetRotation((WS.random() - 0.5) * 1.2)
        prop:ClearAllPoints()
        prop:SetPoint("CENTER", self.world, "BOTTOMLEFT",
            WS.random(30, WS.Constants.WORLD_WIDTH - 30), WS.random(30, WS.Constants.WORLD_HEIGHT - 30))
        prop:Show()
    end
end

------------------------------------------------------------------------------
-- Entity frame factories (pooled by Enemy/Projectile/Pickup/XP systems)
------------------------------------------------------------------------------

-- A crisp circular border drawn as small tangent tiles around a frame's edge -
-- the same trick the Boss Arena rings use, which reads as a clean curve rather
-- than a blurry halo. Ground zones don't move or resize, so this is positioned
-- once at spawn and left alone. Tiles are created lazily and pooled with the frame.
function UI:SetRingBorder(frame, radius, color, thickness)
    frame.ring = frame.ring or {}
    local N = 48
    -- Each tile is a touch wider than its arc share so neighbours meet seamlessly.
    local segW = WS.max(4, (WS.tau * radius / N) * 1.7)
    for i = 1, N do
        local tex = frame.ring[i]
        if not tex then
            tex = frame:CreateTexture(nil, "OVERLAY")
            tex:SetTexture(WS.Media.white)
            frame.ring[i] = tex
        end
        local a = (i / N) * WS.tau
        tex:SetSize(segW, thickness or 3)
        tex:SetRotation(a + WS.pi / 2)
        tex:ClearAllPoints()
        tex:SetPoint("CENTER", frame, "CENTER", WS.cos(a) * radius, WS.sin(a) * radius)
        tex:SetVertexColor(color[1], color[2], color[3], 0.9)
        tex:Show()
    end
end

function UI:HideRingBorder(frame)
    if not frame.ring then return end
    for i = 1, #frame.ring do frame.ring[i]:Hide() end
end

function UI:CreateEntityFrame(size)
    local frame = CreateFrame("Frame", nil, self.world)
    frame:SetSize(size, size)
    frame.icon = frame:CreateTexture(nil, "ARTWORK")
    frame.icon:SetAllPoints()
    frame.icon:SetTexCoord(0.08, 0.92, 0.08, 0.92)
    -- Optional small centered marker. Ground zones used to show their spell art
    -- here, but it read as an object lying on the floor - they use SetRingBorder
    -- now. Kept for any future entity that wants a centre glyph.
    frame.badge = frame:CreateTexture(nil, "OVERLAY")
    frame.badge:SetSize(24, 24)
    frame.badge:SetPoint("CENTER")
    frame.badge:SetTexCoord(0.08, 0.92, 0.08, 0.92)
    frame.badge:Hide()
    frame:Hide()
    return frame
end

-- Lazily adds a 3D creature model to a pooled enemy frame. Only elites and
-- bosses use models (a handful at once); the icon underneath stays visible
-- until the model actually loads, so a bad display ID degrades gracefully.
function UI:AttachEnemyModel(frame)
    if frame.model then return frame.model end
    local model = CreateFrame("PlayerModel", nil, frame)
    model:SetPoint("TOPLEFT", -18, 34)
    model:SetPoint("BOTTOMRIGHT", 18, -4)
    model:SetScript("OnModelLoaded", function()
        if frame.modelActive then frame.icon:SetAlpha(0) end
    end)
    model:Hide()
    frame.model = model
    return model
end

function UI:CreateEnemyFrame(size)
    local frame = self:CreateEntityFrame(size)

    frame.health = CreateFrame("StatusBar", nil, frame)
    frame.health:SetPoint("BOTTOMLEFT", frame, "BOTTOMLEFT", 1, -5)
    frame.health:SetPoint("BOTTOMRIGHT", frame, "BOTTOMRIGHT", -1, -5)
    frame.health:SetHeight(3)
    frame.health:SetStatusBarTexture(WS.Media.white)
    frame.health:SetStatusBarColor(0.82, 0.12, 0.10)
    frame.health:SetMinMaxValues(0, 1)
    frame.health:SetValue(1)
    frame.health.bg = frame.health:CreateTexture(nil, "BACKGROUND")
    frame.health.bg:SetAllPoints()
    frame.health.bg:SetTexture(WS.Media.white)
    frame.health.bg:SetVertexColor(0, 0, 0, 0.6)

    frame.name = self:CreateText(frame, 10, { 1.0, 0.85, 0.85 })
    frame.name:SetFont(STANDARD_TEXT_FONT, 10, "OUTLINE")
    frame.name:SetPoint("BOTTOM", frame, "TOP", 0, 4)
    frame.name:Hide()

    -- Circular mask so creature portraits (and fallback icons) read as round
    -- WoW unit portraits rather than floating squares.
    if frame.CreateMaskTexture then
        frame.mask = frame:CreateMaskTexture()
        frame.mask:SetTexture(WS.Media.softCircle, "CLAMPTOBLACKADDITIVE", "CLAMPTOBLACKADDITIVE")
        frame.mask:SetAllPoints(frame.icon)
        frame.icon:AddMaskTexture(frame.mask)
    end

    -- Additive glow ring: gold for elites, violet for bosses. Sized per-spawn
    -- (Enemy:Spawn) since pooled frames are reused at many sizes.
    frame.glow = frame:CreateTexture(nil, "OVERLAY")
    frame.glow:SetTexture(WS.Media.glowBorder)
    frame.glow:SetBlendMode("ADD")
    frame.glow:SetPoint("CENTER")
    frame.glow:Hide()

    -- Raid-marker skull, hovering over bosses like a proper kill target.
    frame.skull = frame:CreateTexture(nil, "OVERLAY")
    frame.skull:SetTexture(WS.Media.raidIcons)
    frame.skull:SetTexCoord(0.75, 1, 0.25, 0.5)
    frame.skull:SetSize(18, 18)
    frame.skull:SetPoint("BOTTOM", frame, "TOP", 0, 14)
    frame.skull:Hide()
    return frame
end

-- The survivor is drawn with the player's actual 3D character model, standing
-- on a soft shadow. If the model somehow fails to load, the class ability
-- icon beneath it remains visible as a fallback.
function UI:CreatePlayerFrame()
    if self.playerFrame then return self.playerFrame end
    local frame = CreateFrame("Frame", nil, self.world)
    frame:SetSize(64, 64)
    frame:SetFrameLevel(self.world:GetFrameLevel() + 10)

    frame.shadow = frame:CreateTexture(nil, "BACKGROUND")
    frame.shadow:SetTexture(WS.Media.softCircle)
    frame.shadow:SetVertexColor(0, 0, 0, 0.45)
    frame.shadow:SetSize(44, 18)
    frame.shadow:SetPoint("BOTTOM", 0, 2)

    -- A faint frost ring on the ground, shown only when Chilling Presence is
    -- learned, so the slow aura's reach is (barely) visible.
    frame.chillAura = frame:CreateTexture(nil, "BACKGROUND", nil, -1)
    frame.chillAura:SetTexture(WS.Media.softCircle)
    frame.chillAura:SetBlendMode("ADD")
    frame.chillAura:SetVertexColor(0.45, 0.72, 1.0, 0.09)
    frame.chillAura:SetPoint("CENTER", 0, 0)
    frame.chillAura:Hide()

    -- A faint golden ring for Retribution Aura.
    frame.retAura = frame:CreateTexture(nil, "BACKGROUND", nil, -2)
    frame.retAura:SetTexture(WS.Media.softCircle)
    frame.retAura:SetBlendMode("ADD")
    frame.retAura:SetVertexColor(1.0, 0.78, 0.28, 0.10)
    frame.retAura:SetPoint("CENTER", 0, 0)
    frame.retAura:Hide()

    -- (Desecration deliberately has NO standing aura - it reads as a burst, and a
    --  permanent ring under a proc just muddies it.)

    -- A fel-green corona worn only during Metamorphosis (Demon Hunter).
    frame.felAura = frame:CreateTexture(nil, "BACKGROUND", nil, -3)
    frame.felAura:SetTexture(WS.Media.softCircle)
    frame.felAura:SetBlendMode("ADD")
    frame.felAura:SetVertexColor(0.55, 1.0, 0.20, 0.30)
    frame.felAura:SetPoint("CENTER", 0, 0)
    frame.felAura:SetSize(120, 120)
    frame.felAura:Hide()

    frame.fallback = frame:CreateTexture(nil, "ARTWORK")
    frame.fallback:SetSize(30, 30)
    frame.fallback:SetPoint("CENTER", 0, 6)
    frame.fallback:SetTexCoord(0.08, 0.92, 0.08, 0.92)

    frame.model = CreateFrame("PlayerModel", nil, frame)
    frame.model:SetAllPoints()
    frame.model:SetScript("OnModelLoaded", function() frame.fallback:Hide() end)

    frame:Hide()
    self.playerFrame = frame
    return frame
end
