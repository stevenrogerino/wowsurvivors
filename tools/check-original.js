#!/usr/bin/env node
/* Provenance guard rail: no borrowed vocabulary, anywhere, ever again.
 *
 * This game began as a Warcraft fan work, and NOTICE.md was honest that it
 * could not be sold while the borrowed names were in it: zones called Elwynn
 * Forest and Icecrown, creatures called murlocs and worgen, spells called
 * Arcane Missiles and Death and Decay, factions called the Defias Brotherhood,
 * and a title - WoWSurvivors - whose first three letters are Blizzard's own
 * abbreviation for World of Warcraft.
 *
 * All of it is gone, replaced by Emberwatch's own setting. This exists so it
 * stays gone. A rename is a one-time act; keeping a codebase clean is not,
 * because the next weapon somebody adds is exactly where "Pyroblast" creeps
 * back in as a placeholder that ships.
 *
 * WHAT IS ON THE LIST, AND WHY. Some entries are ordinary English words -
 * "consecration", "whirlwind", "reincarnation", "defile". Nobody owns those,
 * and this guard is not pretending otherwise. They are listed because of what
 * they were doing HERE: standing in a set of abilities that mapped one-to-one
 * onto a particular game's class kits, inside a product named after it. It is
 * the constellation that is recognisable, not any single star, and the cheap
 * way to never have to argue about where that line falls is to not be near it.
 *
 * The built bundle is checked as well as the source, because dist/ is what a
 * player actually receives, and a stale bundle is the one artefact that can
 * carry an old name into someone's hands long after the source is clean.
 *
 * NEGATIVE TEST - confirmed to fail on the pre-rename tree, which it flags at
 * 300-odd occurrences across 20 files, the first being the game's own title.
 *
 *   node tools/check-original.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

/* Phrases, not tokens: the check is case-insensitive and matches on word
 * boundaries, so "pale" does not trip on "palewastes" and "air" never fires. */
const BORROWED = [
  // The setting and the shop window.
  'warcraft', 'wowsurvivors', 'world of warcraft', 'azeroth', 'blizzard',
  // Places.
  'elwynn', 'westfall', 'duskwood', 'icecrown', 'stormwind', 'goldshire',
  'northshire', 'westbrook', 'raven hill', 'twilight grove', 'frozen throne',
  'silver hand', 'the barrens',
  // Peoples and factions.
  'murloc', 'worgen', 'quilboar', 'kobold', 'gnoll', 'defias', 'riverpaw',
  'kolkar', 'razormane', 'witchwing', 'scourge', 'brotherhood', 'illidari',
  'elune', 'sunscale', 'stonetusk', 'plainstrider', 'bronze dragonflight',
  // Classes and named characters.
  'death knight', 'demon hunter', 'kel\'thuzad', 'sylvanas', 'illidan',
  // Abilities. Ordinary words, listed for the company they were keeping.
  'arcane missile', 'arcane barrage', 'fireball', 'pyroblast', 'frostbolt',
  'chain lightning', 'holy nova', 'death coil', 'death and decay',
  'death strike', 'consecration', 'shadow bolt', 'chaos bolt', 'fan of knives',
  'blade flurry', 'whirlwind', 'bladestorm', 'multi-shot', 'moonfire',
  'starfall', 'avenger\'s shield', 'metamorphosis', 'reincarnation',
  'desecration', 'soul rending', 'retribution aura', 'divine bulwark',
  'divine storm', 'seal of command', 'raise dead', 'unholy command',
  'icebound fury', 'stormcaller', 'windseeker', 'windrunner', 'marrowrend',
  'eye beam', 'defile', 'limit break',
  // Buffs and named items.
  'blessing of kings', 'blessing of wisdom', 'mark of the wild',
  'grace of elune', 'wrath of air', 'ancestral guidance', 'thunderfury',
  'warglaive', 'runeblade', 'ankh of reincarnation',
  // Quoted lines.
  'you no take candle', 'mrglglgl', 'you are prepared',
];

/* Files that are ALLOWED to say these words, because saying them is their job:
 * the provenance note explains what was removed, and the migration table has
 * to name the old save keys in order to rewrite them. */
const EXEMPT = new Set([
  'NOTICE.md',
  path.join('tools', 'check-original.js'),
]);

/* The one region of shipped code that is allowed to say the old words.
 *
 * Renaming a saved key requires naming what it used to be, so save.js carries
 * a table mapping the pre-Emberwatch ids onto the new ones - and because the
 * bundler inlines save.js, that table travels into dist/ too. Exempting the
 * whole file would have been easy and dishonest: it would let a real term
 * hide anywhere else in the save layer, and it would let the bundle claim to
 * be clean without anyone checking why.
 *
 * So the exemption is bounded to the marked region, and counted. Every run
 * prints how many occurrences it skipped and where, which means the shim can
 * never quietly grow into a hiding place. */
const SKIP_OPEN = '== legacy-name map: begin ==';
const SKIP_CLOSE = '== legacy-name map: end ==';

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|css|html|md)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const patterns = BORROWED.map((term) => ({
  term,
  re: new RegExp('\\b' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'ig'),
}));

const hits = [];
const shimmed = [];
let scanned = 0;
for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file);
  if (EXEMPT.has(rel)) continue;
  scanned++;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  let inShim = false;
  lines.forEach((line, i) => {
    if (line.includes(SKIP_OPEN)) inShim = true;
    for (const { term, re } of patterns) {
      re.lastIndex = 0;
      if (re.test(line)) {
        if (inShim) shimmed.push(rel);
        else hits.push({ rel, line: i + 1, term, text: line.trim().slice(0, 96) });
      }
    }
    if (line.includes(SKIP_CLOSE)) inShim = false;
  });
}

if (hits.length) {
  console.error(`FAIL - ${hits.length} borrowed term(s) across `
    + `${new Set(hits.map((h) => h.rel)).size} file(s):`);
  for (const h of hits.slice(0, 40)) {
    console.error(`  ${h.rel}:${h.line}  "${h.term}"  ${h.text}`);
  }
  if (hits.length > 40) console.error(`  ...and ${hits.length - 40} more`);
  console.error('\nEmberwatch owns every name it ships. Pick a new one.');
  process.exit(1);
}

const dist = path.join(ROOT, 'dist');
const built = fs.existsSync(dist) ? fs.readdirSync(dist).length : 0;
console.log(`ok: ${scanned} files and ${built} built bundle(s) checked against `
  + `${BORROWED.length} borrowed terms - none present`);
if (shimmed.length) {
  const where = [...new Set(shimmed)].join(', ');
  console.log(`     (${shimmed.length} skipped inside the legacy save-migration `
    + `table in ${where} - a compatibility shim, never shown to a player)`);
}

