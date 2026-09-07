# WoW Survivors

A complete Vampire Survivors-inspired arcade game that runs entirely inside the
World of Warcraft retail UI. It is deliberately isolated from the real game: it
never reads or drives your character, combat, targeting, or movement, calls no
protected APIs, and touches no secure frames. Every texture, icon, font, and
sound comes from assets already shipped with the client.

## Installation

1. Copy the `WoWSurvivors` folder into `Interface/AddOns`.
2. Enable **WoW Survivors** in the AddOns list.
3. In game: `/survivors`, the minimap button, or the optional key binding.

The `.toc` targets interface `120007`; bump that number when the live client
moves on.

## Playing

- Pick a survivor and a battlefield, choose a run-defining **Blessing**, then
  survive. Move with **WASD** or the arrow keys; weapons attack on their own.
- Gather experience gems, choose a boon at every level, pair weapons with
  their catalyst passive to unlock **evolutions** at rank 8, and stumble into
  hidden weapon-pair **Discoveries** (codex in the Achievements panel).
- Bosses arrive at 3:00, 7:30, 12:00, and 15:30; the **final boss** walks out
  at 18:30 - kill it for Victory, then claim the win, Fight to the End
  (**Death itself arrives at 30:00**), or go True Endless.
- Elites and bosses drop treasure chests (with jackpot ceremonies); kills can
  drop coins, potions, goblin sappers, and lodestones; **supply caches**
  appear on the field over time.
- Gold banks between runs: spend it at the **Trainer** (including the endless
  Curious Egg). Winning a map unlocks its **Hyper Mode**. The **Bestiary**
  tracks every creature slain.
- Achievements unlock the other five survivors and four further battlefields
  (survive 10 minutes in a zone to open the next one).
- **Esc** pauses (full build sheet with tooltips). If real combat starts, the
  game auto-pauses and hides (configurable in Settings).

### Slash commands

| Command | Effect |
| --- | --- |
| `/survivors` | Open the game / pause a run |
| `/survivors reset` | Wipe all progress and settings |
| `/survivors unlock` | Unlock all content (showcase/debug) |
| `/survivors help` | List commands |

## Architecture

The simulation is a fixed 30 Hz tick with a per-frame catch-up cap. The
playfield is a fixed 1280x720 coordinate space letterboxed to the screen with
`SetScale`, so gameplay is identical at every resolution. The survivor is
rendered with your actual character's 3D model (`PlayerModel` widget); the
horde is rendered as pooled icon frames, which profiles far better than model
widgets at 300 enemies.

- `Core.lua`, `Constants.lua`, `Config.lua`, `SaveData.lua`, `Pools.lua`,
  `Audio.lua` — bootstrap, tuning, persistence (schema v2), pooling, sound
  kits + login-screen scores as zone music.
- `Data/` — pure data: characters, weapons, enemies, elites, bosses (with
  yells and attack patterns), maps (with full spawn timelines, swarm events,
  and boss schedules), passives, Trainer upgrades, achievements.
- `UI.lua`, `UI_HUD.lua`, `UI_Menu.lua`, `UI_Overlays.lua`,
  `FloatingText.lua` — classic dialog art, red panel buttons, Morpheus
  headers, HUD, menu + Trainer/achievements/statistics/settings panels,
  level-up cards, toasts, floating combat text, screen shake.
- `Player.lua`, `Enemy.lua`, `Projectile.lua`, `Weapon.lua`, `Pickup.lua`,
  `XP.lua`, `WaveManager.lua`, `LevelUp.lua`, `Achievements.lua`, `Game.lua`
  — the simulation and orchestration.

## Extending

- **New enemy/boss/map/passive/achievement**: add a table entry in the
  matching `Data/` file (and its `*Order` list). Maps are fully data-driven —
  timeline phases, swarm events, boss schedule, props, music.
- **New weapon**: add data in `Data/Weapons.lua`; if its behavior isn't one of
  the nine existing handlers (aimed/spray/ring/nova/zone/chain/orbit/storm/
  bounce), register a new one in `Weapon.lua`.
- **New survivor**: add to `Data/Characters.lua` plus an achievement that
  rewards `{ type = "character", id = ... }`.

## Performance notes

Enemies, projectiles, gems, pickups, and combat text are all pooled with hard
caps; no frames or tables are allocated during combat. Projectile collision
queries an 80px spatial hash grid rebuilt once per tick. The weapon system
funnels every shot through one reused scratch table, generating zero garbage
per volley.
