# The site: hosting, pictures and slideshows

Read this before you change `site/`, retake a picture, edit a slideshow or touch how the site is hosted.

## Hosting

- **Pages**: `site/` is the static homepage and one details page per script that has one. GitHub Pages serves it from `main`
  (`.github/workflows/pages.yml`, at `https://chinstrap45.github.io/sudokupad-scripts/`).
- **Netlify**: serves `site/` from the `release` branch (`netlify.toml`). `git push origin main:release` publishes it and
  spends 15 of the plan's 300 credits a month (`docs/research/tooling/netlify-credits.md`). It is pushed very rarely, so it lags
  `main` by design, and Netlify is kept (Chris, 2026-11-05). It will not be pushed for a long time, so no report, PR or ticket mentions
  Netlify or what it lacks (Chris, 2026-11-21).

## A change to what a script shows

The rule is `AGENTS.md`'s (Chris, 2026-11-06). The pictures it retakes are the site pictures that show the change, with their scripts
(`docs/research/<script name>/*-screenshot.mjs` or `docs/research/site/*-screenshot.mjs` that write a picture `site/` links).

- After retaking a picture, run `node tag-pictures.js`: it rewrites every picture's address in `site/` to
  `raw.githubusercontent.com/.../main/pictures/<tag>/<file>`, `<tag>` being the file's blob hash, and writes the copy at
  `pictures/<tag>/<file>` (the old copy goes). `test/site.test.js` fails until you do. README pictures, if added, follow the same rule.
  Why a path and not `?v=<tag>`: raw.githubusercontent.com ignores the query when it caches, serving the old bytes under the new
  address for up to 5 minutes after a push (#1183), and Discord kept the old link-preview card. A path nobody has asked for yet
  has no cached copy. Two costs follow. raw caches a 404 too, so open the new addresses in a real browser only after the merge
  lands, never from the PR's branch. And a retake deletes the old `pictures/<old tag>/` copy, so an address already handed out
  (a cached page, a posted preview card) stops serving once it is fetched again. Pinning to a commit sha was weighed and dropped:
  the tag is written before the commit exists, and the squash merge's own sha is not known until after it. Never edit `pictures/`:
  it is generated, and git stores each picture once.
- A small touch a user would not look for (a hover state, a fade, a snap feel, a cursor) gets no line in `site/`, on any script's
  page; only a feature a user would look up gets one (Chris, 2026-11-08). Pictures are still retaken when a change alters what
  they show.

## Slideshows

`site/slideshows.json` is the one source of every slideshow's pictures, `alt` text and captions. After editing it, or retaking a
slide picture, run `node sync-slides.js`: it rewrites each `<!-- slideshow:id -->` block on every page in `site/`, picture tags
included. Never edit inside a block; `test/site.test.js` fails until you run it.
