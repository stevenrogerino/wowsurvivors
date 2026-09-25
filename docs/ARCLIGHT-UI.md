# Arclight UI

The design language for **The Ember Watch**. Everything on screen is either
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

## The voice, the ledger, and the living pictures

- **Voice.** Alegreya (serif) carries everything the game says aloud: names,
  titles, tabs, banners, verdicts, the pane intros, the survivor's name on the
  HUD. Archivo keeps mechanical description; IBM Plex Mono is left only for
  keycaps and tiny slot ranks.
- **Ledger.** Figures are set in Alegreya with `lining-nums tabular-nums`, so
  a column still aligns and a running timer does not shimmy. The build sheet
  walks name to figure on a dotted leader. Multipliers are `×`, not `x`.
  Figure-first stats read the way you would say them: "110 health".
- **Living pictures** (`src/render/vignette.js`). The survivor cartouche is the
  survivor on watch at a fire, with something in the treeline that opens its
  eyes now and then; each battlefield cartouche is that place in its own
  weather. One ~30fps loop drives them and a picture leaves it the moment its
  canvas leaves the page; reduced motion paints each once. They draw from a
  local generator, never `WS.random`.
- **Menu backdrop.** The prologue's hills at night, mirrored so the moon rises
  in the empty sky opposite the logotype, with the watch fire below the frame
  lighting the panels from underneath.
- **Short screens.** Under 520px of height the header drops to one line and
  the footer to one row, so a phone on its side still has a pane to read.
- **Frames drawn by hand** (`src/ui/frames.js`). Surfaces are edged with
  generated pictures, not ruled borders: an outer and an inner ink stroke that
  bow slightly, swell and thin along their length, taper at their ends, cross
  or chip at the corners, and wear through here and there. They go on as
  `border-image` over the existing 1px border, so layout does not move. The
  strokes are geometry, not a displacement filter: a filter samples without
  interpolation and a stretched edge shows its steps. Three wear patterns
  alternate down a list; hover lights the line, selection gilds it and adds
  nails. The corner ticks, the card's corner marks and the ruled bevels are
  retired, and a faint mottle gives each surface a material.
- **Painted icons** (`WS.Icons.get`). The glyphs keep their grid, but the
  tile is now a small painting: a square with hand-trimmed corners, a dark
  ground brushed in the accent, a halo, and the subject lit from the upper
  left - shaded toward its foot, a lit rim on the edges facing the light, a
  cast shadow and a glow. The old machined plate is `WS.Icons.plated`.
- **The arsenal.** Weapon and passive slots hang in drawn bezels (gilt and
  nailed once evolved or ready to evolve). The cooldown is a swipe across the
  icon's face - a dark wedge for the time still owed, taken away clockwise
  from twelve with a warm hairline on the hand - not a ring around it. Ranks
  are italic serif numerals in the corner; an evolved weapon wears a ✦.
- **The top of the HUD.** The portrait is a medallion: health a painted band
  (lit at the top, deep at the foot) between inked rings, notched at each
  quarter, experience a gilt thread inside it, and the level a gilt seal. The
  clock is the night - a strip of sky from dusk to dawn with the hours to come
  under a veil, the moon riding its edge, boss hours as inked diamonds that
  gild once passed, and a sun at the end. The boss bar is a painted stroke in
  a drawn frame with a pale band that holds after a hit and drains to meet the
  health, and a seal on the bar at a finale boss's next phase gate.
- **Tips.** No native `title` tooltips. A tip is a small inked card built on
  demand (`tipOn(node, build, opts)` in ui.js; plain sentences use a
  `data-tip` attribute and one delegated handler). Weapon tips carry the
  numbers and everything the weapon works with - its evolution (rank, the
  passive, the result), its discoveries (the partner always named, the result
  only once found, its hint until then), and its union - each marked ready,
  partly held, needed or done. Passive tips list the weapons they evolve.
  They show on the HUD slots (which take a hover; the rest of the HUD still
  lets pointers through), on level-up cards when there is more to say than
  the card does, on the pause sheet's arsenal and new passives list, and in
  the bestiary. Passive level-up cards now say which carried weapon they
  evolve.
- **The interface sounds like what it looks like.** A button is a knock on
  wood, a hover the scratch of a pen nib, a choice a piece set down on the
  table, a tab a page turned - noise and oscillators, no files, replacing the
  square-wave beeps. Under the menu the watch fire burns
  (`Audio.setAmbience('hearth')`): a breathing low roar, a hiss, crackles,
  pops and the odd settling log. It lives only while the menu is up, is torn
  down with sound off, and books nothing against a suspended clock.
- **The Bestiary is the Watch's book.** An index of every entry (creatures,
  elites, bosses) and the open page beside it: the thing on its own ground at
  night under a lantern (`WS.Vignette.beast`), a field note in the Watch's
  voice (`WS.Lore.bestiary`, tunable like the rest of the writing), a boss's
  cry, and a ledger - put down, first met (`stats.firstMet`: when, where, how
  far into the night), where it walks (from the battlefields' own
  schedules), how it fights (from what its template actually does), and its
  measure. An unmet page is a shape against its sky and says where it walks.
- **The watchers are met, not unlocked.** Five survivors are found on the
  field (`src/game/encounters.js`): Rav tied up by the Kerchiefs, Maeca
  holding off a pack, AAAAAAAAA screaming under a cairn, Nim drawn out by a
  slaughter, Vonnra in her storm. Each answers something done in that run
  (Config.encounters), and is brought in by standing with them a few seconds.
  Every watcher has a record in `WS.Lore.watchers` - their story, a line in
  their own voice, and for the unfound a rumor of where to look - shown on
  the roster and in a record page.

## Sound

- **No hiss.** The weather bed - looping filtered noise under every zone - is
  gone for good (`check-voices` fails if any score names one or a zone's top
  end reads as noise). Places are made of what lives in them: `LIFE` voices in
  audio.js, pitched and short, placed across the stereo field with some room
  on them. Crickets, birds, frogs and an owl in Thornhollow; hawks and crows
  and a low gust over the Dustreach; owls and a wail in Mourneholt; cicadas
  on Ambergrass; wind through ice, chimes and glints in the Rimewaste; a bell
  under the Eclipse.
- **A room.** One generated impulse feeds a reverb behind the effects and one
  behind the score. Kits ask for as much as suits them (`ROOM`).
- **Voices.** `Audio.babble(who, text)` is a small formant synth: a grumble
  with each finale line and each boss's arrival, its syllables taken from the
  line and its mood from the punctuation. Per-speaker recipes in `VOICES`.
- **Signatures.** The finales have their own sounds - the Candlecrawler's
  rumble, the Galleon's cannons, Mordecai's lanterns breaking, the
  Stormbreaker's zap and stamp, the Heart-Drill, Marrowfrost's ice and winter.
- **Spells by school.** `cast` takes the weapon's school as a variant, with
  its own throttle per school.

## The notice, the villains, the horde and the ground

- **The notice.** Toasts are small inked cards: the drawn frame, a seal with
  the news painted in it (`Game.toast(title, body, { kind, art, tint })`),
  the title in the voice and its own colour, and a wick that burns down for
  as long as it stays. Kinds: loot, merchant, glory, discovery, warn,
  watcher, system. Keyed by id, so a new one never restarts the others.
- **The villains are drawn as themselves** (`src/render/villains.js`, on the
  house brushes `WS.Sprites.paint` exports): Grimtunnel, the Masked Admiral,
  Mordecai and Death each have their own painter, the way Marrowfrost
  always did, plus a `*_face` crop for dialogue portraits and banners.
  Grimtunnel is the pilot in every cockpit bubble.
- **Machines have material.** finale-art.js's `seam`, `bolt`, `wear` and
  `drips` lay engraved plate lines, lit bolts, scratches, soot and runs
  inside whatever is clipped, so nothing grows a silhouette.
- **Regalia is plate, not a slab.** Thirteen bosses borrow a mob's body and
  are told apart by `bossKit`. Elites wear one piece, bosses two.
- **The horde faces you.** Every profile creature is drawn looking left; the
  renderer mirrors it when the survivor is to its right.
- **Faces.** An open-faced survivor has an iris in their own colour, a lid,
  a catchlight, a half smile. Robed casters have a worked hem.
- **The ground is made of something.** `map.terrain` (forest, road, grave,
  crack, ice) picks a painter in renderer.js `TERRAIN`, run once into the
  ground canvas on its own seed. Dark and light in balance: check-ground
  pins each map's brightness and everything's visibility is measured on it.

## The arsenal as objects

- **A bolt is painted, not filled** (`src/render/spellart.js`). Each shape
  keeps the silhouette the renderer always drew and is painted as a
  material: a coal with cracks of fire, cut ice, a faceted gem, a knife
  with a brass guard and wrapped grip, an arrow with fletching, a rent of
  shadow, a cratered moon, a bone talon, fused shards, a gilded disc.
  Cached per shape, colour and size: one `drawImage` a bolt, which put the
  detail in at no extra cost per frame.
- **The gyre's axes are steel** on the same chosen silhouette, with an ash
  haft. Stormcall's crackle. The survivor **pirouettes** during a whirl
  instead of cartwheeling, with wind sweeping round the figure.
- **A chain link is lightning**: jagged, forking with rank, pinned to what
  it hit at both ends, re-struck every couple of frames.
- **A nova is a shockwave** with a crisp front where the damage is. Holy
  throws tapered sunrays and a corona of beads. Shadow reaps, with crescent
  blades riding the wave over darkened ground. Echo waves are faint bands.
- **The two fields are different ground.** Hallowed Ring consecrates, with
  a turning rune band, a seal and rising motes. Blightfield festers, with a
  ragged rim, tendrils and bubbles that swell and pop.
- **A hit flashes the creature's own shape** instead of a disc the size
  of its hitbox.
- check-skills still guards all of it: every weapon keeps edges at rank 8
  and none blows out to white.

## Ceilings, so the busiest frame stays a frame

Measured per layer in a maxed run (320 creatures, six evolved weapons,
unions, Arcane Overflow at 25%). Main-thread cost stayed near 5-10 ms a
frame. What didn't was **overdraw**: rings and fields stacking far past
the point of being visible.

- **Orbit rings:** capped at 48 drawn blades per weapon. Cooldown and
  duration boons at their limits, or Overflow, kept up to 21 rings (317
  blades) on one circle. The newest rings by time left are drawn; the rest
  still turn and cut. Past 24 blades the afterimages and Stormcall's crackle
  drop. The blade glow is a baked image (`SpellArt.glow`), not a fresh
  gradient per blade.
- **Ground fields:** capped at 6 washes. Twenty-odd overlapping Blightfields
  washed the screen twenty times; now the six newest carry the wash (same
  total light) and older fields keep their rim and their damage.
- **Gems** draw in two batched passes. **Creature shadows** are one path.
  **Floating numbers** only reset the font when the size changes.
- **Balanced** quality also draws at 1x on high-DPI screens: a quarter of
  the pixels for every glow.
- **Menu idle warm-up** also pre-encodes every level-up card icon and
  builds the Trainer, so neither stalls the first time it's shown.
  Bestiary images come first.

## The top-down pass: first ten seconds to the last line

A walkthrough of the whole journey, from a fresh profile through the
prologue, menu, run, boss, midpoint, death, dawn, finale and victory.

- **The story speaks in the voice.** The prologue and the dawn were the
  last text in the game still set in the interface's Archivo. Their lines
  now use Alegreya, with the second line in its italic. The same goes for
  the finale's "The field is clear. Breathe."
- **The start prompt** was 11 px spaced capitals in slate on a black sky,
  the only thing on the first screen. It is now an italic line at reading
  size, with an ember breathing either side, and it mentions tapping.
- **"Up through the furrows and the open graves"** has its own beat,
  `rise`, drawn by `WS.Scene.graves`. Graves open across the near ground,
  lit from inside, and the dead climb out in turn with the Pale's cold
  eyes. It used to reuse the empty night before it.
- **The finale's speech box** is an inked Arclight plate: gilt edge and
  inner rule, the speaker's colour across the top, a gilt medallion, the
  name in spaced Alegreya capitals. The words arrive at speaking pace, and
  the layout is measured on the full line so the box never grows.
- **The victory nameplate** is gilt again. Chrome paints an inherited
  text-shadow over a background clipped to text, so it had been black
  letters with a gold rim.
- **Each night opens** with the battlefield's name and the watcher's own
  line from their record, in their voice.
- **Smaller fixes:**
  - The Watch's log says "came out of the fire tonight" once instead of
    twice in a row.
  - Health on the sheet no longer goes negative on the death screen.
  - Long survivor names wrap instead of being cut.
  - The zone wash grows more gently with rank, so an evolved Hallowed Ring
    no longer turns a finale arena gold.
