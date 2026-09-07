local _, WS = ...

-- Level-up boon generation and application: weapon ranks, new weapons,
-- passives, evolutions, and the "everything is maxed" bread fallback.
-- Choice `type` doubles as the quality color key in UI_Overlays.
WS.LevelUp = {}
local LevelUp = WS.LevelUp

-- Weighted sampling without replacement from a candidates array.
local function TakeWeighted(candidates)
    if #candidates == 0 then return nil end
    local pick = WS.WeightedPick(candidates)
    for i = 1, #candidates do
        if candidates[i] == pick then
            candidates[i] = candidates[#candidates]
            candidates[#candidates] = nil
            break
        end
    end
    return pick
end

function LevelUp:BuildChoices(player)
    local candidates = {}

    -- Owned weapons: rank-ups, or the evolution once rank 8 is reached and
    -- the paired passive has been learned.
    for i = 1, #player.weapons do
        local weapon = player.weapons[i]
        local data = weapon.data
        if not player.banished[weapon.id] then
            if weapon.level < WS.WEAPON_MAX_LEVEL then
                candidates[#candidates + 1] = {
                    type = "weapon_rank", id = weapon.id, icon = data.icon, weight = 3,
                    name = data.name,
                    description = data.description,
                    note = ("Rank %d  >  %d"):format(weapon.level, weapon.level + 1),
                }
            elseif not weapon.evolved and (player.upgradeLevels[data.evolvePairing] or 0) > 0 then
                candidates[#candidates + 1] = {
                    type = "evolve", id = weapon.id, icon = data.evolveIcon, weight = 6,
                    name = data.evolveName,
                    description = data.evolveDescription,
                    note = "EVOLUTION - " .. data.name .. " transformed",
                }
            end
        end
    end

    -- Weapon unions: both source weapons must be FULLY EVOLVED to merge into one
    -- super-weapon (freeing a slot). A forged union is recorded permanently so it
    -- can never be offered - or merged - a second time.
    for i = 1, #WS.Unions do
        local recipe = WS.Unions[i]
        local a, b = recipe.from[1], recipe.from[2]
        local wa = WS.Player:GetWeapon(player, a)
        local wb = WS.Player:GetWeapon(player, b)
        if not (player.unionsForged and player.unionsForged[recipe.result])
            and not player.weaponLevels[recipe.result]
            and wa and wa.evolved and wb and wb.evolved then
            local data = WS.Weapons[recipe.result]
            candidates[#candidates + 1] = {
                type = "union", id = recipe.result, icon = data.icon, weight = 10,
                unionFrom = recipe.from,
                name = data.name,
                description = data.description,
                note = ("UNION - merges evolved %s + %s"):format(WS.Weapons[a].name, WS.Weapons[b].name),
            }
        end
    end

    -- New weapons, while there are free slots.
    if #player.weapons < WS.MAX_WEAPONS then
        for i = 1, #WS.WeaponOrder do
            local id = WS.WeaponOrder[i]
            if not player.weaponLevels[id] and not player.banished[id] then
                local data = WS.Weapons[id]
                candidates[#candidates + 1] = {
                    type = "new_weapon", id = id, icon = data.icon, weight = 2,
                    name = data.name,
                    description = data.description,
                    note = "New Weapon  -  pairs with " .. WS.Upgrades[data.evolvePairing].name,
                }
            end
        end
    end

    -- Passive boons.
    for i = 1, #WS.UpgradeOrder do
        local id = WS.UpgradeOrder[i]
        local upgrade = WS.Upgrades[id]
        local rank = player.upgradeLevels[id] or 0
        -- An upgrade may declare `offer(player)` to stay out of the pool until it
        -- would actually do something (e.g. Desecration needs healing to convert).
        local offerable = (not upgrade.offer) or upgrade.offer(player)
        if rank < upgrade.max and not player.banished[id] and offerable then
            candidates[#candidates + 1] = {
                type = "stat", id = id, icon = upgrade.icon, weight = 2,
                name = upgrade.name,
                description = upgrade.description,
                note = ("Rank %d / %d"):format(rank + 1, upgrade.max),
            }
        end
    end

    -- Deep-run fallback breads: a finished build eats bread of varying quality.
    local breads = {
        { type = "bread", id = "crust", icon = "Interface\\Icons\\INV_Misc_Food_11",
          name = "Crust of Bread", description = "A quick bite. Restores 30 health.",
          heal = 30, gold = 10, note = "Better than nothing" },
        { type = "bread", id = "loaf", icon = "Interface\\Icons\\INV_Misc_Food_11",
          name = "Hearty Loaf", description = "A hero's supper. Restores 70 health and a little gold.",
          heal = 70, gold = 25, note = "The innkeeper's finest" },
        { type = "bread", id = "feast", icon = "Interface\\Icons\\INV_Misc_Food_15",
          name = "Traveler's Feast", description = "A full spread. Restores 130 health.",
          heal = 130, gold = 20, note = "Fit for a champion" },
        { type = "bread", id = "bakers_dozen", icon = "Interface\\Icons\\INV_Misc_Food_11",
          name = "Baker's Dozen", description = "Modest food, a fat coin purse. Restores 40 health, +75 gold.",
          heal = 40, gold = 75, note = "Mostly for the gold" },
    }

    -- Fill all three slots from the weighted candidate pool FIRST (new/ranked
    -- weapons, evolutions, unions, passives). A real build never loses a choice to
    -- Limit Break - you always get three genuine picks while any remain.
    local choices = {}
    for _ = 1, 3 do
        local pick = TakeWeighted(candidates)
        if pick then choices[#choices + 1] = pick end
    end

    -- Only once there's nothing left to take (the pool couldn't fill three slots)
    -- does Limit Break appear - permanent weapon damage, repeatable - taking ONE of
    -- the leftover slots. It never crowds out a real upgrade, and it no longer needs
    -- endless/victory: any complete build (even mid normal run) unlocks it.
    if #choices < 3 then
        local pct = WS.floor((WS.Config.limitBreakDamage or 0.08) * 100 + 0.5)
        local template = WS.Config.limitBreakDesc or "Break past your limits: +%d%% weapon damage, forever."
        -- Fill a "%d" in the (editable) template with the current +%; tolerate a
        -- template that has no format specifier.
        local ok, desc = pcall(string.format, template, pct)
        choices[#choices + 1] = {
            type = "limit_break", id = "limit_break", icon = "Interface\\Icons\\Ability_Warrior_Rampage",
            name = WS.Config.limitBreakName or "Limit Break",
            description = ok and desc or template,
            note = ("Limit Breaks: %d"):format(player.limitBreaks or 0),
        }
    end

    -- Any still-empty slots get distinct bread variants (no repeats).
    local pool = {}
    for i = 1, #breads do pool[i] = breads[i] end
    while #choices < 3 and #pool > 0 do
        local index = WS.random(1, #pool)
        choices[#choices + 1] = pool[index]
        pool[index] = pool[#pool]
        pool[#pool] = nil
    end
    return choices
end

function LevelUp:IsEndless()
    local run = WS.Game.run
    return run and (run.mode == "endless" or run.victorious)
end

-- Three random blessings, excluding any the survivor has already taken (so the
-- second offering at 10:00 can never re-offer your run-start blessing).
function LevelUp:BuildBlessingChoices(player)
    local ids = {}
    for i = 1, #WS.BlessingOrder do
        local id = WS.BlessingOrder[i]
        if not (player.blessingsTaken and player.blessingsTaken[id]) then
            ids[#ids + 1] = id
        end
    end
    local choices = {}
    for _ = 1, WS.min(3, #ids) do
        local index = WS.random(1, #ids)
        local id = ids[index]
        ids[index] = ids[#ids]
        ids[#ids] = nil
        local blessing = WS.Blessings[id]
        choices[#choices + 1] = {
            type = "blessing", id = id, icon = blessing.icon,
            name = blessing.name,
            description = WS.FormatTokens(blessing.description, blessing),
            note = "Blessing - permanent for this run",
        }
    end
    return choices
end

function LevelUp:Apply(player, choice)
    if choice.type == "blessing" then
        local blessing = WS.Blessings[choice.id]
        blessing.apply(player, blessing)
        player.blessingName = blessing.name
        player.blessingNames = player.blessingNames or {}
        player.blessingNames[#player.blessingNames + 1] = blessing.name -- keep ALL (start + 10:00)
        player.blessingsTaken = player.blessingsTaken or {}
        player.blessingsTaken[choice.id] = true -- never re-offer a taken blessing
        WS.Audio:Play("evolve")
        WS.Game:Announce(blessing.name, "The blessing takes hold.", 2.5)
        return
    end

    if choice.type == "union" then
        -- Consume the two source weapons, then forge the union super-weapon
        -- at max rank.
        for i = 1, #choice.unionFrom do
            WS.Player:RemoveWeapon(player, choice.unionFrom[i])
        end
        local weapon = WS.Player:AddWeapon(player, choice.id)
        if weapon then
            weapon.level = WS.WEAPON_MAX_LEVEL
            player.weaponLevels[choice.id] = WS.WEAPON_MAX_LEVEL
        end
        player.unionsForged = player.unionsForged or {}
        player.unionsForged[choice.id] = true -- forged once, never again
        WoWSurvivorsDB.statistics.unions = (WoWSurvivorsDB.statistics.unions or 0) + 1
        WS.Audio:Play("evolve")
        WS.UI:Shake(6, 0.5)
        WS.Game:Announce(choice.name .. "!", "Two weapons become one.", 3.0)
        WS.UI:RefreshWeaponStrip(player)

    elseif choice.type == "new_weapon" then
        WS.Player:AddWeapon(player, choice.id)
        WS.Audio:Play("chest") -- a new weapon deserves a loot sting

    elseif choice.type == "weapon_rank" then
        WS.Player:LevelWeapon(player, choice.id)

    elseif choice.type == "evolve" then
        local weapon = WS.Player:GetWeapon(player, choice.id)
        if weapon and not weapon.evolved then
            weapon.evolved = true
            WoWSurvivorsDB.statistics.evolutions = WoWSurvivorsDB.statistics.evolutions + 1
            WS.Audio:Play("evolve")
            WS.UI:Shake(5, 0.4)
            WS.Game:Announce(weapon.data.evolveName .. "!", "Your weapon has evolved", 3.0)
            WS.UI:RefreshWeaponStrip(player)
        end

    elseif choice.type == "stat" then
        local upgrade = WS.Upgrades[choice.id]
        upgrade.apply(player, upgrade)
        player.upgradeLevels[choice.id] = (player.upgradeLevels[choice.id] or 0) + 1
        WS.UI:RefreshPassiveStrip(player)

    elseif choice.type == "bread" then
        WS.Player:Heal(player, choice.heal or 60, "food")
        if choice.gold and choice.gold > 0 then
            WS.Game:AddGold(WS.floor(choice.gold * WS.Game.run.goldMult), player.x, player.y)
        end
        WS.Audio:Play("potion")

    elseif choice.type == "limit_break" then
        player.damageMultiplier = player.damageMultiplier + (WS.Config.limitBreakDamage or 0.08)
        player.limitBreaks = (player.limitBreaks or 0) + 1
        WS.Audio:Play("evolve")
        WS.FloatingText:Notice(player.x, player.y, "LIMIT BREAK!", 1, 0.5, 0.2)
    end
end

-- Removes the boon (and its future offers) from this run's pool.
function LevelUp:Banish(player, choice)
    if choice.type == "bread" or choice.type == "blessing"
        or choice.type == "limit_break" or choice.type == "union" then
        return false
    end
    player.banished[choice.id] = true
    return true
end
