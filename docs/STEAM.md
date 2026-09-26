# Shipping The Ember Watch on Steam

A walkthrough, in the order it has to happen, of everything between this
repository and a "Buy" button on Steam. What the code already does is marked
**done**; what only you can do (accounts, money, forms, clicking Release) is
marked **you**.

The calendar is set by the waits, not the work, so start step 1 now:

| Wait | How long |
| --- | --- |
| Identity, tax and bank verification | a few days |
| After paying the Steam Direct fee, before a first game can release | 30 days |
| "Coming Soon" page visible before release | at least 2 weeks |
| Store page review | about 3 to 5 working days |
| Build review | about 3 to 5 working days |

Realistically: about five to six weeks from signing up to release day, most
of it waiting. Wishlists collect during that time, which is the point of
putting the page up early.

---

## 1. Become a Steamworks partner (**you**)

1. Sign up at **partner.steamgames.com** with the Steam account that should
   own the company's games. Use an account with Steam Guard on.
2. Fill in the legal name, address and contact, then the **bank details**
   (where revenue is paid) and the **tax interview** (a W-9 in the US, a
   W-8BEN or W-8BEN-E elsewhere). Valve verifies your identity. This can take a
   few days, so do it first.
3. Pay the **Steam Direct fee: $100 per game**. It comes back once the game
   has made $1,000 in gross revenue. The 30-day clock for a new partner starts
   here.
4. Steamworks creates the app and gives you an **App ID** (a number like
   `1234560`). Everything below needs it.

## 2. Put the App ID into the build (**done**, one setting for **you**)

The desktop build already talks to Steam (`desktop/steam.js`,
`desktop/preload.js`, `src/core/platform.js`). It finds the App ID like this:

- **Shipped through Steam:** Steam passes it when it launches the game.
  Nothing to configure.
- **Running by hand while developing:** `cd desktop && STEAM_APP_ID=1234560
  npm run steam:dev`. This writes `desktop/steam_appid.txt` (git-ignored, and
  excluded from uploads) and starts the game. Keep the Steam client running
  and logged in to an account that owns the app. Without an App ID it uses
  480 (Valve's test app, "Spacewar"), which is enough to see the overlay
  come up.

With no Steam client, no App ID or no `steamworks.js`, the game runs exactly
as it does in a browser. Nothing Steam-related can stop the window opening.
`node tools/check-steam.js` and `node tools/check-desktop.js` (under
`xvfb-run -a` on a headless Linux box) hold that contract.

**Before your first real build (you):** open `desktop/package.json` and
replace the placeholder `author` with your name or company. It goes into
the installer, the app's properties and the copyright line.

## 3. Achievements (**done** in code; **you** enter them in Steamworks)

All 28 achievements unlock on Steam the moment the game awards them. The
first launch with Steam also unlocks every one the save already holds, so a
player who played before Steam loses nothing.

Steamworks has to know about them first, under exactly the names the game
uses. Everything is generated for you:

- `steam/achievements/achievements.csv`: API name, display name and
  description for all 28.
- `steam/achievements/<API_NAME>.png` and `<API_NAME>_locked.png`: the
  256x256 achieved and unachieved icons (the same icons the in-game codex
  shows).

In Steamworks: **App Admin > Stats & Achievements > Achievements**, then
**New Achievement** for each row. Enter the **API Name** exactly as in the
CSV (upper case, underscores, e.g. `FIRST_BLOOD`), then the display name,
the description and both icons. Leave "Hidden" off unless you want the
secret ones hidden. Then go to the **Publish** tab and publish. Achievements
added in Steamworks do nothing until they are published.

Test with your App ID and `npm run steam:dev`: earn **First Blood** and the
toast should appear in the Steam overlay. To reset while testing, run
`achievement_clear 1234560 FIRST_BLOOD` in the Steam console
(`steam://open/console`).

The API name is always the game's own id upper-cased
(`WS.Platform.apiName`). If you ever rename an achievement, keep its id. The
display name can change freely.

## 4. Steam Cloud (**done** in code; **you** switch it on)

The whole account (gold, unlocks, records, settings) is one small JSON
file. The game mirrors it to Steam Cloud as `save.json` a few seconds after
anything changes, and again on quit. At launch, whichever copy was written
most recently wins, so a second PC or a Steam Deck picks up where the first
left off.

In Steamworks: **App Admin > Application > Steam Cloud**. Set **Byte quota
per user** to 10 MB and **Number of files allowed per user** to 5 (the
game uses one file of well under 1 MB; the headroom is free). Leave
**Auto-Cloud** off, since the game uses the Cloud API directly. Publish.

## 5. Controller and Steam Deck (**done** in code; **you** configure and apply)

The game plays completely on a controller: move on the left stick or D-pad,
A to choose, B to back out of any screen, Start to pause, X to reroll and
Y to banish on the level-up, LB and RB to change tabs. On a Deck it opens
with the interface text at 115% the first time, and never overrides the
player's own setting after that.

In Steamworks:

1. **App Admin > Application > Steam Input**: set the default configuration
   to **Gamepad** (the Xbox-style template). Every controller (PlayStation,
   Switch Pro, the Deck's own) then reaches the game as an Xbox pad, which is
   what the game reads.
2. Under the same page, confirm **Steam Deck**'s default is also the Gamepad
   template.
3. **App Admin > Steam Deck Compatibility**: fill it in and request a review
   once a build is uploaded (step 8). Valve tests it and gives it Verified,
   Playable or Unsupported. The things they check are the things above:
   full controller support, legible text at 1280x800, no launcher, no
   keyboard needed to play. The only text boxes in the game are the
   optional note on a bug report and pasting a save code in Settings; on the
   Deck, Steam + X brings up the on-screen keyboard for both. If the review
   still marks it "Playable" rather than "Verified", it will say exactly
   why.

**Linux and the Deck:** Electron's sandbox helper needs a setuid bit that
Steam depots cannot carry. If the native Linux build fails to start on the
Deck, add a Linux launch option with the argument `--no-sandbox` (step 7).
The alternative is to ship Windows only and let the Deck run it through
Proton, which Electron games generally do well. Try the native build first.

## 6. The store page (**done**: assets; **you**: text and forms)

Every image Steam asks for is already drawn by the game itself. Regenerate
any time with `node tools/steam-assets.js` (Chromium required):

| Steamworks slot | File | Size |
| --- | --- | --- |
| Header capsule | `steam/store/header_capsule.png` | 920x430 |
| Small capsule | `steam/store/small_capsule.png` | 462x174 |
| Main capsule | `steam/store/main_capsule.png` | 1232x706 |
| Vertical capsule | `steam/store/vertical_capsule.png` | 748x896 |
| Page background | `steam/store/page_background.png` | 1438x810 |
| Library capsule | `steam/library/library_capsule.png` | 600x900 |
| Library hero (no text) | `steam/library/library_hero.png` | 3840x1240 |
| Library logo (transparent) | `steam/library/library_logo.png` | 1280x720 |
| Community icon | `steam/store/community_icon.png` | 184x184 |
| Client icon | `steam/library/client_icon.png` | 32x32 |
| Screenshots (8) | `steam/screenshots/*.jpg` | 1920x1080 |
| Trailer | `steam/trailer/the-ember-watch-trailer.mp4` | 1920x1080, H.264 |

Wallpapers of the whole cast (3840x2160, 2560x1440, 1920x1080) are in
`steam/wallpapers/`, for the store page's description, social posts, or a
desktop.

The trailer is generated separately, since it takes about ten minutes and is
too large to commit: `node tools/steam-assets.js --only trailer` writes the
full-quality master to `steam/trailer/`. It needs Chromium (Playwright) and
ffmpeg (on the PATH, `FFMPEG=/path/to/ffmpeg`, or `npm i ffmpeg-static`).
Run it on your own computer and you have the master locally, at any size.

**The trailer has sound, and all of it is the game's.** Two layers, both
rendered offline, so nothing is recorded and nothing needs a microphone:

- **The score** (`tools/steam-score.js`): a 56-second orchestral cue
  synthesised for this cut. It is in D minor at 120 bpm, so every cut lands
  on a bar line. It drops to silence (with the picture going black) before
  the boss, the finale and the end card, and it resolves to D major on the
  title: the dawn.
- **The game's own effects**: while the trailer is filmed, every sound the
  game asks for is logged with the frame it happened on, then replayed
  through the game's real audio engine. The hits, level-up, boss horn and
  finale voices are exactly the game's, exactly in sync.

`steam/trailer/` also gets `trailer-score.wav` and `trailer-effects.wav`
separately, if you ever want to remix it or swap in other music. Steam
shows the first seconds of the trailer on hover in some places, so keep the
opening (the fire and the title) as it is.

**In Steamworks > Store Page Admin (you):**

- **Short description** (300 characters max). A draft:
  *Hold a single light through one long night. Choose a survivor, take your
  powers one level at a time, and outlast a horde that thickens by the
  minute. At dawn, the thing the night was saving comes for you.*
- **About this game**: the long description. Lift from the wiki's opening,
  and embed two or three of the screenshots between paragraphs.
- **Tags**: at least Action Roguelike, Bullet Heaven, Roguelite, Survival,
  Cute, Singleplayer, Controller support.
- **System requirements**: Windows 10+, any GPU from the last decade, 4 GB
  RAM, 500 MB disk. The game draws on the GPU through the browser, so it is
  light.
- **Content survey** (mature content questionnaire). Fantasy violence, no
  blood or gore beyond cartoon effects, no online interaction.
- **Supported languages**: English (interface, full audio N/A, subtitles
  N/A).
- **Controller**: "Full controller support".
- **Cloud**, **Achievements**: tick them once steps 3 and 4 are published.

Then **submit the store page for review**. When it passes, click **Coming
Soon** to make it public. That starts the two-week minimum, and from then
on every visitor can wishlist it.

## 7. Launch options and depots (**you**, once)

**App Admin > Installation > General:** add one launch option per platform:

| OS | Executable | Arguments |
| --- | --- | --- |
| Windows | `The Ember Watch.exe` | |
| Linux | `the-ember-watch` | (`--no-sandbox` only if needed, see step 5) |
| macOS | `The Ember Watch.app` | |

**App Admin > SteamPipe > Depots:** add a depot per platform and set its
OS. Steamworks numbers them after the App ID: App ID + 1 for Windows, + 2
for macOS, + 3 for Linux is what `tools/steam-upload.js` assumes. If yours
come out differently, set `STEAM_DEPOT_WIN`, `STEAM_DEPOT_MAC` and
`STEAM_DEPOT_LINUX`.

**Mac is optional.** Shipping it needs an Apple Developer account ($99 a
year), code signing and notarization, and a Mac to build on. Windows plus
Linux (or Windows alone, with Proton on the Deck) is a perfectly normal
launch. Windows code signing is not required by Steam.

## 8. Build and upload (**done**: scripts; **you** run them)

On each OS you ship, build the unpacked app:

```
cd desktop
npm install
npm run dist:steam        # this OS's build, unpacked, in desktop/release/
```

Then install **steamcmd** (from the Steamworks SDK, or your package
manager) and upload from the repository root:

```
STEAM_APP_ID=1234560 STEAM_BUILD_USER=yourbuilder node tools/steam-upload.js --dry     # look first
STEAM_APP_ID=1234560 STEAM_BUILD_USER=yourbuilder node tools/steam-upload.js --branch beta
```

The script writes the SteamPipe scripts (`steam/build/app_build_*.vdf` and
one `depot_build_*.vdf` per platform, git-ignored because they carry your
IDs), uploads whatever platforms are built, and can set the build live on a
test branch. The first `steamcmd` login asks for the password and a Steam
Guard code, then remembers them. Use a separate builder account with only
the "Edit App Metadata" and "Publish App Changes" permissions rather than
the account that owns everything.

In Steamworks, **SteamPipe > Builds** shows every upload. Put one on a
private `beta` branch (with a password) to test on your own machines and
the Deck. Install it, launch it through Steam, earn an achievement, change
PC, and check the save followed you.

## 9. Review, then release (**you**)

1. On the **Release** tab of the app, work down the checklist. The store
   page and the build are each reviewed; the build review needs a build set
   live on the default branch, which you do by hand in **SteamPipe >
   Builds** (the upload script refuses to, on purpose).
2. Both reviews come back in a few working days, sometimes with a list of
   fixes. Common ones: capsule text too small (ours is large), missing
   system requirements, a trailer that is only title cards (ours is mostly
   play).
3. Once both pass and the page has been Coming Soon for two weeks, the
   **Release** button unlocks. Pick the moment, press it, and the game is
   on sale.

**Pricing:** set it under **Pricing** well before release (it needs
approval too). Steam suggests regional prices from your base price; accept
them unless you have a reason not to. A launch discount of 10 to 20% is
normal and shows in the wishlist emails that go out on release day.

## What stays as it is

- **The Nightly's scores stay on the player's machine.** The Steam library
  the build uses (`steamworks.js` 0.4.0) has no leaderboard calls, so a
  global Nightly board would need a different binding or a small server. The
  seed is the same for everyone on a given day, so shared scores can still
  be compared by hand.
- **The browser version keeps working** at emberwatch.online. Nothing in the
  Steam work changes the web build; `WS.Platform` is simply "web" there.

## Checklist

- [ ] Partner signup, bank, tax, identity (step 1)
- [ ] Steam Direct fee paid, App ID received (step 1)
- [ ] `author` set in `desktop/package.json` (step 2)
- [ ] 28 achievements entered from the CSV, with icons, and published (step 3)
- [ ] Steam Cloud quota set and published (step 4)
- [ ] Steam Input default set to Gamepad (step 5)
- [ ] Store page text, tags, requirements, content survey (step 6)
- [ ] Capsules, library art, 5+ screenshots uploaded (step 6)
- [ ] Trailer uploaded (step 6)
- [ ] Store page reviewed and set to Coming Soon (step 6)
- [ ] Launch options and depots (step 7)
- [ ] Builds uploaded and tested on a beta branch, including the Deck (step 8)
- [ ] Deck compatibility review requested (step 5)
- [ ] Price set (step 9)
- [ ] Build review passed, two weeks of Coming Soon, Release (step 9)
