# Netlify deploy folder

This folder is the whole live site, exactly as Netlify should serve it:

```
site/
  index.html       <- the game (dist/the-ember-watch.html, renamed)
  wiki/
    index.html     <- the companion codex/wiki
    img/            <- its pictures, drawn by the game's own painters
```

Netlify replaces the *entire* published site with whatever folder you deploy -
it does not merge. So this folder always has to contain both the game and the
wiki together; deploying a folder with only the game in it will remove the
wiki from the live site even though it still exists here in the repo.

**To deploy manually:** drag this whole `site` folder onto the Netlify
dashboard (or `netlify deploy --prod --dir=site`), every time.

**To stop doing that by hand:** connect this repo to Netlify (Netlify ->
Add new site -> Import from Git) and set the **publish directory** to
`site`, with no build command. Every `git push` then deploys automatically,
and the wiki never needs re-uploading again - it only changes when this
folder's contents change.

**Keeping the game current:** after any change to the game, rebuild it and
copy the result over this folder's copy:

```
node tools/bundle.js
cp dist/the-ember-watch.html site/index.html
```

**Keeping the wiki current:** it is generated, not written. After a change a
player would read about - a new creature, a retuned number, a redrawn
sprite, new lore - regenerate it from the game:

```
node tools/wiki.js
```

That loads the game headless, reads every table it ships, runs the text
through the game's own templates so the numbers are the live ones, redraws
every picture with the game's own painters, and rewrites `site/wiki/`.
