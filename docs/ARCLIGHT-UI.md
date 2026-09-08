# Arclight UI

*The Endless Night — gilt, gable, candlelight.*

The interface for **WoWSurvivors 2**, implemented from the Arclight design
canvas. It is an illuminated manuscript that happens to be a game: a wine-dark
ground lit as if by candle, gilt metal frames, parchment pages, and tarot
cards with cut shoulders.

## 1. Principles

1. **The card is the primary form.** Every choice the player makes is dealt to
   them as a card — a gilt edge around a parchment face, clipped to a gabled
   silhouette (cut top corners meeting at a peak), rotated a degree or two off
   square, and dropped onto the table with a heavy shadow. The Arcana at the
   start of a run, the boons at every level: same object, different register.
2. **Menus are a book, not a screen.** The roster, the Trainer, the Codex and
   the ledgers are two parchment pages inside one gilt frame, with rivets at
   the corners and a gutter shadow where the pages meet the spine.
3. **Bars, not gauges.** Experience is a single rail across the very top of the
   field with a gold lozenge riding its head. Health is a bar under the
   survivor's name. Boss health is a wide crimson bar under the clock, flanked
   by two orbs and ticked into tenths.
4. **Numbers are set in the manuscript's hand.** Tallies, the clock and stat
   values are Cinzel with tabular figures; live readouts that change every
   frame (health, level) are IBM Plex Mono. Ranks and levels are Roman.
5. **Light is candlelight.** One warm bloom at the centre of the field, blood
   banked along the bottom edge, and a fine paper grain over everything. No
   element glows for decoration; the gilding does the work.
6. **The level-up is a held breath, not a takeover.** It opens as a lit band
   across the middle third of the field with hairline gold rules top and
   bottom. The horde stays visible above and below it.

## 2. Palette

| Token | Value | Use |
| --- | --- | --- |
| `--night` / `--night-deep` | `#0a0710` / `#06040a` | the ground |
| `--vellum-dark` | `#1a1220` | card and slot interiors |
| `--parchment` | `#e2d2ae` | pages and card faces |
| `--ink` | `#231525` | text on parchment |
| `--rule` | `rgba(122,90,36,.5)` | rules and dotted leaders |
| `--gilt` | `#d9b467` | the working gold |
| `--gilt-hi` / `--gilt-dark` | `#efdcb0` / `#6b4f1d` | the two ends of every gilt gradient |
| `--leaf` | `#e6d0a2` | gold ink on dark |
| `--blood` | `#8f1526` | kickers, marks, the seal, danger |
| `--health` | `#b8442f` → `#7a1220` | the health bar |
| `--arcane` | `#9a86c4` → `#3a2c60` | the experience rail |
| `--ember` | `#c9835c` | damage per second |
| `--verdant` | `#6fb494` | healing per second |
| `--candle` | `#e2c07a` | gold found |

Gilt is never a flat colour. Edges are a gradient across the metal —
`linear-gradient(160deg, #7a5a24, #e2c07a 45%, #7a5a24)` for small tiles, a
six-stop version for card edges — so every frame reads as a lit surface.

## 3. Type

Four faces, embedded as data URIs (`src/ui/fonts.css`) so the game still makes
no network requests:

- **Cinzel Decorative** 700 — display only: *The Arcana*, *The horde holds its
  breath*. Never below 30px.
- **Cinzel** 400/500/600 — the working face. Headings, names, all-caps kickers
  (`letter-spacing` .12em–.36em), buttons, and every tabular number.
- **EB Garamond** 400 roman and italic — prose. Card bodies, flavour lines,
  descriptions, the difficulty line.
- **IBM Plex Mono** 400 — live figures that tick: health, level, clock ticks
  on the schedule rail.

## 4. Components

- **Gable** — `clip-path: polygon(50% 0, 100% N%, 100% 100%, 0 100%, 0 N%)`.
  N is 13% for Arcana cards, 15% for boon cards, 22% for tiles and portraits,
  26% for buttons. The gilt edge and the face inside are clipped identically,
  the edge showing through as 2–6px of padding.
- **Spread** — a gilt frame (`--gilt-frame`, 5px padding, 5px gap) holding one
  or two `.page` elements, with four corner rivets and a gutter gradient.
- **Page** — parchment plus a 3.5px dot grain plus a corner bloom. A head with
  a crimson sigil, kicker, title and italic sub; a scrolling body; a foot bar.
- **Seal** — a rotated ring in the page's top corner carrying the run number.
- **Dotted leader** — label, a dotted rule that stretches, value. Used for
  every stat block; it is what makes the pages read as a ledger.
- **Passage** — a called-out block with a 3px crimson left border and a
  crimson kicker, for the survivor's perk.
- **Schedule rail** — a hairline with a black lozenge at each boss minute and a
  larger crimson lozenge at 30:00 for Death.
- **Band** — the level-up: `inset: 136px 0 92px`, a scrim with a warm centre,
  hairline rules top and bottom, cards centred in it.
- **Chips** — reroll and banish. Inset gilt hairline on dark; on parchment they
  invert to ink on a warm wash.

## 5. Layout

The playfield is a fixed 1280×720 world letterboxed into the viewport. The HUD
lives at the very top and the very bottom, never in the middle third:

```
+--------------------------------------------------------------+
| ============ experience rail, gold lozenge at the head ====== |
| [gable] Name  LVL XXIV        17:42        SLAIN  DPS  HPS  G |
| [ptrt ] [==== health ====]  (o)[= boss =](o)   1654 2853 0 383|
|                                                               |
|                          PLAYFIELD                            |
|                                                               |
| [gable arms x6]   Veteran · Duskwood · Death arrives in 22:59  [runes] |
+--------------------------------------------------------------+
```
