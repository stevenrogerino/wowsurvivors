# Provenance

What in Emberwatch is ours, what is licensed, and what is neither. Short
version: **all of it is ours except two typefaces, which are used within their
licence.**

## Ours — all of it original

**Names.** The setting, the roster, the bestiary, the spell list, the
blessings, the zones and every line of flavour text are Emberwatch's own.
`tools/check-original.js` enforces this: it scans the whole tree and the built
bundles against a list of ~90 borrowed terms and fails the build if any of them
appear. Run it before you ship anything.

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
   this file is doing.** Before any public release, drop the two upstream
   `OFL.txt` files into `licenses/` verbatim rather than relying on this
   summary.
2. The fonts may not be sold on their own. Shipping them inside the game is
   fine; selling the fonts is not.
3. A modified font may not keep the family's Reserved Font Name. These
   subsets are unmodified glyph subsets, not redesigns, but if you ever
   re-hint or alter outlines, rename the family.

## What used to be here, and is not any more

Emberwatch began as a Warcraft fan work. It was called WoWSurvivors 2 — the
first three letters being Blizzard Entertainment's own abbreviation for World
of Warcraft — and its zones, creatures, factions, spells, buffs, named items
and boss quotes were Blizzard's intellectual property. That made it a fan
project: shareable under Blizzard's Fan Content Policy, and not sellable.

All of it has been replaced:

| Was | Is |
| --- | --- |
| WoWSurvivors 2 | **Emberwatch** |
| Elwynn Forest, Westfall, Duskwood, The Barrens, Icecrown | Thornhollow, the Dustreach, Mourneholt, the Ochre Plains, the Pale Wastes |
| murlocs, worgen, quilboar, kobolds, gnolls | gilkin, moonwretches, bristlekin, lamplings, mongrels |
| the Defias Brotherhood, the Riverpaw, Kolkar, Razormane, Witchwing, the Scourge | the Crimson Kerchief, the Snarlpack, the Karrash, Thornhide, Shrikewing, the Pale |
| Arcane Missiles, Fireball, Frostbolt, Chain Lightning, Holy Nova, … | Seeking Motes, Cinderfall, Rimeshard, Arcweb, Dawnpulse, … |
| Blessing of Kings, Grace of Elune, Wrath of Air, … | Warden's Charge, Grace of the Moon, Wrath of the Gale, … |
| Thunderfury, the warglaives, the runeblade | Stormcall, the twin glaives, the graveblade |
| Death Knight, Demon Hunter | Graveblade, Ruinseeker |
| Metamorphosis, Desecration, Reincarnation, Limit Break | the ruinform, Curdled Light, Second Wind, Breaking Point |

The survivors themselves (Baron Zul, Maeca Barefoot, Dr. Rav McBreathless,
Vonnra Hydrocheck, Professor Keegan, Nerosus, Chid, DZ, AAAAAAAAA, Nim
B'ladin) were always the project's own characters, and are unchanged.

Saves made before the rename are migrated on load — see `migrate()` in
`src/core/save.js`, which rewrites the old keys so no bestiary count, personal
best or unlock is lost. That migration table is the one place in the shipped
source that still names the old vocabulary, and it is exempt from the guard for
exactly that reason.

## The ancestor, removed

Emberwatch was ported from a personal Lua addon that ran inside the World of
Warcraft client and drew on that client's own textures, fonts and sounds. There
was no renaming it into something shippable, so it has been deleted from the
tree rather than carried along beside a game meant to be sold. It remains in
git history at `ddd9d28` for anyone who wants it back.

Nothing in Emberwatch depends on it, and nothing in Emberwatch came from it
except the design of the game — which is the author's own.
