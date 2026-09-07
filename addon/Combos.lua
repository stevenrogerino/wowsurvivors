local _, WS = ...

-- Discovery runtime: activates weapon-weapon synergies (Data\Combos.lua) the
-- moment both weapons are carried, announces them, and records first-time
-- finds in the permanent codex.
WS.ComboSystem = {}
local ComboSystem = WS.ComboSystem

-- Called after any weapon is added to the survivor.
function ComboSystem:Check(player)
    for i = 1, #WS.ComboOrder do
        local id = WS.ComboOrder[i]
        if not player.combosActive[id] then
            local combo = WS.Combos[id]
            local w1 = WS.Player:GetWeapon(player, combo.weapons[1])
            local w2 = WS.Player:GetWeapon(player, combo.weapons[2])
            if w1 and w2 then
                self:Activate(player, id, combo, w1, w2)
            end
        end
    end
end

function ComboSystem:Activate(player, id, combo, w1, w2)
    player.combosActive[id] = true
    -- apply reads its tunable magnitudes from the combo table (3rd arg).
    combo.apply(w1, w2, combo)

    local firstEver = not WoWSurvivorsDB.statistics.discoveries[id]
    WoWSurvivorsDB.statistics.discoveries[id] = true

    WS.Audio:Play("evolve")
    WS.UI:Shake(4, 0.3)
    -- Descriptions may carry {field} tokens (like blessings and class perks), so
    -- a discovery's real magnitudes show instead of the raw placeholder.
    WS.Game:Announce("Discovery: " .. combo.name .. "!",
        WS.FormatTokens(combo.description, combo), 4.0)
    if firstEver then
        WS.UI:Toast(w1.data.icon, "New Discovery!", combo.name)
    end
    WS.Projectile:SpawnFlash(player.x, player.y, 70, WS.Constants.COLORS.arcane)
end
