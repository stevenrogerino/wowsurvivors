# Arclight UI

The design language for **Emberwatch**. Everything on screen is either
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

Quality colours for cards follow the usual five-step loot ladder: common `#e8ecf6`,
uncommon `#3ddc7a`, rare `#59bfff`, epic `#b34ff2`, legendary `#f5c56b`.

## 3. Icons

Sixty-odd glyphs read as one set because they all obey the same system, not
because they were drawn in one sitting:

- a 100x100 field, with every mark inside an **optical circle of radius 36**.
  Nothing touches the plate edge.
- **two stroke weights only** - 8 units for the subject, 4.5 for detail - with
  round caps and joins throughout.
- **one density target**: a glyph covers roughly a third of its optical circle,
  so a stroked icon never looks starved beside a filled one.
- **one treatment per glyph**. A shape is drawn or outlined, never a hairline
  stapled to a heavy fill.
- **a distinct silhouette**. Five edged weapons must not all be a thin
  vertical: the dagger is a leaf blade, the sword adds a pommel, the spear
  trails motion, the axe is a double head, and Ferocity is a crossed slash.

The plate under them is a **chamfered machined tile** - an octagon, not a
rounded rectangle - carrying an outer rim, a bevel lit from the top, an accent
hairline inlaid three units in, and a pool of light for the subject to sit in.
Below 40px the inlay is dropped, because at pip size it and the rim collapse
into each other.

## 4. Edges

Flat boxes with one uniform border is what makes an interface look generated.
Every raised surface here carries a **bevel** - `inset 0 1px 0 rgba(255,255,255,.075)`
along the top, `inset 0 -1px 0 rgba(0,0,0,.55)` along the foot - and every
sunken one (meter tracks, the timer rail, a pressed button) carries its
inverse. Panels and cards add an **inlay**: a second hairline set five to seven
pixels in from the rim. Cards add four **corner ticks** that take the quality
colour on hover. Rows grow a lit left edge. Stat tiles get a 12px accent tab at
the top-left corner. The detail is small on purpose; it is the accumulation
that reads as machined rather than any single flourish.

## 5. Components

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

## 6. Typography

Two faces, embedded as data URIs in `src/ui/fonts.css` so the game still makes
no network requests and never falls back to whatever the OS happens to ship:

- **Archivo** 400/500/600 — the interface voice. A grotesque with tight
  apertures that holds up at 10px caps and at a 40px title.
- **IBM Plex Mono** 400/500 — every figure that has to line up or tick:
  health, level, the clock, tallies, cooldown ranks, the damage meter.

One scale, used everywhere (`--t-micro` 10px through `--t-hero` 40px).

- Display / banners: `--t-head` 28px, 600, `letter-spacing:.05em`, uppercase.
- Card titles: 17px 600. Body: 13.5px/1.5 `--ink-dim`.
- Micro-labels: 10px 600 caps, `.14em` tracking, `--ink-dim`.
- All numerals: IBM Plex Mono with `font-variant-numeric: tabular-nums`.

## 7. Layout

The playfield is a fixed 1280x720 world letterboxed into the viewport. The HUD
is drawn *in the letterbox and over the corners*, never in the centre third:

```
+--------------------------------------------------------------+
| [portrait+arcs]          [ timer rail ]        GOLD  1,162    |
| [lv][hp][meters]                               SLAIN 2,189    |
|                        -- boss arc --          DPS   2,298    |
|                                                HPS       0    |
|                          PLAYFIELD                            |
|                                                               |
|                      [ toasts, low centre ]                   |
| [weapon arcs x6 ...]                        [passive pips ..] |
+--------------------------------------------------------------+
```

## 8. Feel

The interface is only half of it; the other half is how the world answers.

- **Hit-stop.** A boss death freezes the simulation for 160ms, an elite for
  50ms. The accumulator is not fed while it holds, so no time is owed back.
- **Bodies, not confetti.** A kill leaves the creature's own silhouette,
  squashing into the ground and fading over 420ms (900ms for a boss).
- **Numbers fan.** Successive damage numbers spread along an arc rather than
  stacking on one point, pop 55% oversize on arrival, and — once the text pool
  is two-thirds full — small non-crit hits stop printing at all. A wall of tiny
  digits carries less information than a few readable ones.
- **Gems fall off with distance.** Far gems are texture at 26% opacity; gems
  inside the pickup radius brighten to full and pull a comet tail toward the
  survivor.
- **The survivor is never lost.** A lit ground disc sits under them at all
  times, and past sixty enemies on the field four crosshair ticks fan out
  around it.
- **The rim answers damage.** A red vignette flares on every hit and stands as
  a slow pulse below 30% health, where the portrait ring also starts beating.
- **Weapons show their muzzle.** Every aimed, spray, ring or bounce volley
  flashes at the survivor in the weapon's own school colour, and its slot in
  the strip flashes with it.
- **The level-up eases.** Taking a boon returns the world at quarter speed,
  ramping back to full over half a second, instead of snapping back.
- **Nothing hits without saying so.** A boss charge plants for three quarters
  of a second first: the body compresses, and the lane ahead fills with a bar
  and chevrons pointing out of it. Volleys swell a ring before they fire.
- **Scroll areas never fade their content.** A masked fade across visible text
  is exactly what reads as truncation; instead a sticky scrim rides the fold
  and clears the moment the reader reaches the end.
- **The mix has headroom.** Everything runs through a limiter, and the score
  ducks under horns, level-ups and detonations rather than fighting them.
- **The verdict comes before the accounting.** Victory and defeat open with one
  panel stating the outcome and six figures, then the ledger below it.
