# Provenance

What in this project is ours, what is licensed, and what is borrowed. Short
version: **every byte the game produces is ours; some of the words are not.**

## Ours — all of it original

**Code.** Every line under `src/`, `tools/` and `index.html`.

**Art.** There is not a single image file in this repository — check with
`git ls-files | grep -E '\.(png|jpg|svg|webp)$'` and you get nothing back.
Every creature, hero, prop, ability icon and interface ornament is drawn at
runtime with canvas primitives (`arc`, `bezierCurveTo`, gradients) in
`src/render/sprites.js` and `src/render/icons.js`. Nothing is traced from,
sampled from, or derived from anyone's artwork.

**Sound.** No audio files either. Every effect is synthesised on the fly in
`src/audio/audio.js` from oscillators and filtered white noise; the score is
generated per zone from the same primitives. There are no samples, and
nothing is ever fetched or decoded.

**No network.** The game makes zero requests. It runs from `file://` with the
network cable unplugged, which is also the simplest proof that no third-party
asset is being pulled in at runtime.

## Licensed — used within the licence

**Typefaces.** Two families, both under the SIL Open Font License 1.1:

| Family | Copyright | Canonical licence |
| --- | --- | --- |
| Archivo | Omnibus-Type | https://github.com/Omnibus-Type/Archivo |
| IBM Plex Mono | IBM Corp. | https://github.com/IBM/plex |

Latin subsets are embedded as data URIs in `src/ui/fonts.css`. The OFL
expressly permits bundling fonts with, and embedding them in, a program —
including a commercial one. Three conditions matter in practice:

1. The copyright and licence notice must travel with the font. **That is what
   this file is doing, and it is the one thing that was missing.** Before any
   public release, drop the two upstream `OFL.txt` files into
   `licenses/` verbatim rather than relying on this summary.
2. The fonts may not be sold on their own. Shipping them inside the game is
   fine; selling the fonts is not.
3. A modified font may not keep the family's Reserved Font Name. These
   subsets are unmodified glyph subsets, not redesigns, but if you ever
   re-hint or alter outlines, rename the family.

## Borrowed — Blizzard's, not ours

This is the honest part. The game is a Warcraft fan work, and the *setting*
is Blizzard Entertainment's intellectual property:

- **Zones** — Elwynn Forest, Westfall, Duskwood, The Barrens, Icecrown.
- **Spell and ability names** — Arcane Missiles, Fireball, Pyroblast,
  Frostbolt, Chain Lightning, Holy Nova, Death and Decay, Death Coil,
  Consecration, Avenger's Shield, Metamorphosis, Reincarnation, and the rest
  of `src/data/weapons.js`.
- **Blessings and buffs** — Blessing of Kings, Blessing of Wisdom, Mark of
  the Wild, Grace of Elune, Gift of the Bronze Dragonflight, Wrath of Air.
- **Creatures and factions** — murlocs, kobolds, gnolls, the Riverpaw, the
  Defias Brotherhood, the Scourge.
- **Named items** — Thunderfury, the warglaives, the runeblade.
- **Boss quotes** — "You no take candle!" and the other yells in
  `src/data/bosses.js` are Blizzard's lines, quoted.

The survivor roster (Baron Zul, Maeca Barefoot, Dr. Rav McBreathless,
Vonnra Hydrocheck, Professor Keegan, Nerosus, Chid, DZ, AAAAAAAAA) is *not*
Blizzard's — those are the project's own characters.

### What that means

For a personal project, or a free fan game shared with friends, this is the
normal footing that fan works stand on, and Blizzard publishes a Fan Content
Policy that permits non-commercial fan creations under conditions. Read it
before publishing anywhere public.

**You cannot sell this, or ship it to a storefront, while the Warcraft names
are in it.** If that ever becomes the goal, the fix is cheap by design:
the borrowed vocabulary lives almost entirely in `src/data/*.js` as plain
string fields, separate from every system that reads them. Renaming the
zones, spells, blessings and yells is a data edit, not a rewrite — no code,
art or audio would have to change, because none of it was ever Blizzard's.
