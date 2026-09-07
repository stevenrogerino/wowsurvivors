# Arclite UI

The design language for **WoWSurvivors 2**. Everything on screen is either
*obsidian* (the substrate) or *arc light* (the energy running through it).

## 1. Principles

1. **The arc is the primary form.** Anything that measures something is a
   swept arc, not a bar: health and experience ring the survivor's portrait,
   weapon cooldowns sweep around their icons, boss health is a wide shallow
   arc across the top of the field. Straight bars appear only where an arc
   would be illegible (the run timer rail).
2. **Obsidian substrate.** Panels are near-black volcanic glass, not grey
   chrome: `#0b0d12` -> `#141926`, with a single 1px hairline rim at 8%
   white and an inner top-edge highlight. No drop shadows on panels; depth
   comes from the rim and a soft outer bloom.
3. **Light is spent, not sprayed.** A screen has exactly one focal glow.
   Level-up cards glow; the HUD behind them dims to 35%. Accent colour marks
   state (ready, selected, danger) and never decorates.
4. **Corner brackets, not borders.** Framed content is bracketed at the
   corners with 14px arc-lit rules. It reads as a targeting reticle - a HUD
   element, not a webpage.
5. **Micro-labels.** All-caps 10px 0.14em-tracked labels in `--ink-dim` name
   every region. Values are large, tabular, and never abbreviated below
   thousands.
6. **Motion is a sweep.** Panels reveal by sweeping their arc from 0 to full
   over 240ms `cubic-bezier(.2,.8,.2,1)`. Nothing slides in from off-screen,
   nothing bounces.

## 2. Palette

| Token | Value | Use |
| --- | --- | --- |
| `--void` | `#07080c` | behind everything |
| `--obsidian` | `#0b0d12` | panel base |
| `--obsidian-2` | `#141926` | raised panel / row hover |
| `--rim` | `rgba(255,255,255,.08)` | hairline rims |
| `--arc` | `#f5c56b` | primary arc light (gold) |
| `--arc-hot` | `#ffe6ae` | arc highlight / focus |
| `--arcane` | `#8f7bff` | arcane school + rare quality |
| `--frost` | `#59bfff` | frost school + info |
| `--fel` | `#8cf24a` | nature/fel + success |
| `--blood` | `#e2483d` | damage, danger, health |
| `--holy` | `#ffdf7a` | holy school |
| `--shadow-s` | `#b34ff2` | shadow school |
| `--ink` | `#e8ecf6` | primary text |
| `--ink-dim` | `#8b93a7` | labels, secondary text |

Quality colours for cards follow Warcraft item quality: common `#e8ecf6`,
uncommon `#3ddc7a`, rare `#59bfff`, epic `#b34ff2`, legendary `#f5c56b`.

## 3. Components

- **Arc gauge** - `svg` circle with `stroke-dasharray`; 6px stroke, round cap,
  a 1px static track at 12% white beneath it. Health gauge runs clockwise from
  the top; experience runs counter-clockwise so the two read as distinct.
- **Panel** - obsidian, 2px radius (nearly square), corner brackets, a 10px
  all-caps title sitting *on* the top rule.
- **Card** (level-up, character, map) - 260x300 panel with a 64px procedural
  icon plate, quality-tinted top arc, name, rank note, body copy. Hover lifts
  4px and lights the arc; selected state fills the arc solid.
- **Rail** - the run timer: a 3px full-width rule with tick marks at each boss
  minute and a travelling arc-lit head.
- **Toast** - bottom-centre, obsidian, one line, arc rule on the left edge.
- **Banner** - the boss/event announcement: full-width sweep of arc light with
  the title in 28px letterspaced caps over it.

## 4. Typography

System stack only (the game ships zero network requests):
`"Segoe UI", Inter, Roboto, "Helvetica Neue", Arial, sans-serif`.

- Display / banners: 28-40px, 600, `letter-spacing:.06em`, uppercase.
- Card titles: 17px 600.
- Body: 13px/1.45 `--ink-dim`.
- Numbers in the HUD: 20px 700 `font-variant-numeric: tabular-nums`.

## 5. Layout

The playfield is a fixed 1280x720 world letterboxed into the viewport. The HUD
is drawn *in the letterbox and over the corners*, never in the centre third:

```
+--------------------------------------------------------------+
| [portrait+arcs] [lvl]      -- boss arc --      [timer] [gold] |
|                                                               |
|                          PLAYFIELD                            |
|                                                               |
| [weapon arcs .....]                         [passive pips ..] |
+--------------------------------------------------------------+
```
