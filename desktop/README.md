# The Ember Watch, on the desktop

The game does not change here. `main.js` loads the exact single file that
`tools/bundle.js` produces and that a web host would serve — same bytes, same
game — and everything in this folder is window management. If you never build
a desktop version, deleting this folder costs the browser build nothing.

```
cd desktop
npm install
npm start          # rebuilds the bundle, copies it in, opens the window
npm run check      # ../tools/check-desktop.js: launches it twice, for real
npm run dist       # installers into desktop/release/
```

`game/` and `release/` are build output and are not in the repository;
`npm start` and `npm run dist` regenerate `game/` from `../dist`.

**Set `author` in `package.json` before you ship.** It is a placeholder on
purpose — that string ends up in the installer, the app's properties and the
copyright line, and it is not something this repository should guess.

## The one thing that is not window management

`loadFile()` is the obvious way to open the page, and it is a trap. It serves
the game from `file://`, `file://` is an opaque origin, and storage written to
an opaque origin is not reliably the same storage next launch. Nothing about
that is visible while you develop — you launch, you play, the gold is there.
It surfaces as a player who closed the game on Tuesday and opened an empty
account on Wednesday.

So the bundle is served over a registered `emberwatch://` scheme instead. The
load-bearing privilege is `standard`, which gives the scheme a real origin;
storage is keyed to the origin. (`secure` is not what carries the save —
measured — it makes the page a secure context, which is worth having for its
own sake.)

`../tools/check-desktop.js` proves it the only way worth proving: it banks
424,242 gold through the game's own `WS.Save`, quits the application, launches
it again, and reads the gold back out. It also holds the shell to the rest of
its promises — loaded over the scheme rather than off the disk, no application
menu, no popups, no navigating away, no serving files from outside `game/`,
and a canvas that has actually painted rather than a window that merely
opened.

Both negative tests are confirmed against a deliberately broken shell:
swapping in `loadFile` fails at *"the shell is serving the game off the
disk"*, and dropping `standard` fails at *"came back to 0 gold"*.

## Verified

Electron 44.3.0. `npm run check` passes against the development shell, and the
packaged Linux build was launched from `release/linux-unpacked` and reached
`emberwatch://game/the-ember-watch.html` with the full cast of ten and a
painted 1280x720 canvas — which is the check that catches an `asar` `files`
glob that forgot to include the game.

The Windows and macOS targets are configured but have not been built here;
they need to be built on (or cross-signed for) their own platforms anyway.

## If it is going to Steam

The shell above is the technical half and it is close to done. The rest is
paperwork and platform work, roughly in the order it bites:

- **Steamworks.** A partner account, the one-off app fee, tax and bank
  identity, and a store page with capsule art at five sizes, a trailer and
  screenshots. The store page is the long pole, not the build.
- **Signing.** Windows SmartScreen will warn on an unsigned installer until
  it has built reputation; macOS will refuse to open an unnotarised app at
  all. Budget for a certificate on both.
- **Steamworks SDK.** Achievements, cloud saves and the overlay need
  `steamworks.js` (or Greenworks) wired into `main.js`. The game already has
  achievements internally, so they map across; cloud saves want Steam pointed
  at Electron's `userData` directory.
- **The overlay.** Steam's overlay does not composite reliably over Chromium's
  GPU compositing. It is usually fixed with `--in-process-gpu` or by
  disabling the overlay for the app; test it early, because "the shift-tab
  overlay is black" is a review-score problem.
- **Controller.** The game already navigates every screen with a pad, and
  `../tools/check-nav.js` proves every control on all eleven screens is
  reachable. What is missing is Steam Input glyphs and a binding config.
- **A depot upload.** `steamcmd` and an app build script; straightforward once
  the above is done.
