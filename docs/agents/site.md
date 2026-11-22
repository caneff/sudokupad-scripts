# The site: hosting, pictures and slideshows

Read this before you change `site/`, retake a picture, edit a slideshow or touch how the site is hosted.

## Hosting

- **Pages**: `site/` is the static homepage and one details page per script that has one. GitHub Pages serves it from `main`
  (`.github/workflows/pages.yml`, at `https://caneff.github.io/sudokupad-scripts/`).
- **Netlify**: serves `site/` from the `release` branch (`netlify.toml`). `git push origin main:release` publishes it and
  spends 15 of the plan's 300 credits a month (`docs/research/tooling/netlify-credits.md`). It is pushed very rarely, so it lags
  `main` by design: Chris kept Netlify on 2026-11-05. It will not be pushed for a long time, so no report, PR or ticket mentions
  Netlify or what it lacks (Chris, 2026-11-21).

## A change to what a script shows

A change to what a script shows (its panel, buttons, dialog or what it draws) updates that script's text in `site/`, in Pen Tool Extras' reference page
(`docs/pen-tool-extras.md`) and in the README's script notes, and retakes the site pictures that show it, with their scripts
(`docs/research/<script name>/*-screenshot.mjs` or `docs/research/site/*-screenshot.mjs` that write a picture `site/` links), in the same PR (Chris, 2026-11-06).

- After retaking a picture, run `node tag-pictures.js`: it rewrites the `?v=` tag on every picture's address in `site/`, so browsers fetch the new file,
  and `test/site.test.js` fails until you do. README pictures, if added, follow the same rule.
- A small touch a user would not look for (a hover state, a fade, a snap feel, a cursor) gets no line in `site/`, on any script's page; only a feature a user
  would look up gets one (Chris, 2026-11-08). Pictures are still retaken when a change alters what they show.

## Slideshows

`site/slideshows.json` is the one source of every slideshow's pictures, `alt` text and captions. After editing it, or retaking a slide picture,
run `node sync-slides.js`: it rewrites each `<!-- slideshow:id -->` block on every page in `site/`, picture tags included.
Never edit inside a block; `test/site.test.js` fails until you run it.
