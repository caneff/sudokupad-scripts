# sudokupad-scripts

Standalone Tampermonkey userscripts for SudokuPad, written to be shared. Each
script is one `*.user.js` file with no build step for users. Shared code lives in `lib/<name>.js` and `node sync-lib.js` copies it into each
script between `// <lib:name>` and `// </lib:name>` markers, so an installed script is still one file. Never edit inside a marked block;
`lib/*.test.js` tests each module.

- **Pages**: `site/` is the static homepage and its Pen Tool Extras details page. GitHub Pages serves it from `main`
  (`.github/workflows/pages.yml`, at `https://caneff.github.io/sudokupad-scripts/`).
- **Netlify**: serves `site/` from the `release` branch (`netlify.toml`). `git push origin main:release` publishes it and
  spends 15 of the plan's 300 credits a month (`docs/research/netlify-credits.md`). It is pushed very rarely, so it lags
  `main` by design: Chris kept Netlify on 2026-11-05.
- **`docs/research/`**: research notes, chiefly what was read from SudokuPad's source, and also screenshots, the scripts that take them and frozen scratch.
  Each script's notes and pictures are in its own folder (`docs/research/<script name>/`), pictures of a whole site page in `docs/research/site/`,
  and notes about SudokuPad itself at the top.
- **Tests**: unit tests are in `test/` (`test/<script name>.test.js`), each shared module's in `lib/<name>.test.js`, a spec's closing test in `test/specs/`, and live tests in
  `live/<script name>/`. The six `*.user.js` stay at the root: every installed copy checks that address for updates.
- **`GLOSSARY.md`**: the vocabulary.
- **A change to what a script shows** (its panel, buttons, dialog or drawing) updates that script's text in `site/` and retakes the site pictures that
  show it, with their scripts (`docs/research/<script name>/*-screenshot.mjs` or `docs/research/site/*-screenshot.mjs` that write a picture `site/` links), in the same PR (Chris, 2026-11-06).
  After retaking a picture, run `node tag-pictures.js`: it rewrites the `?v=` tag on every picture's address in `site/`, so browsers fetch the new file,
  and `test/site.test.js` fails until you do. README pictures, if added, follow the same rule.
- **Shared code**: after editing `lib/<name>.js`, run `node sync-lib.js`, as `node tag-pictures.js` is run after a picture: it rewrites each
  marked block in the `*.user.js` and raises the version of every script it changed. `test/sync-lib.test.js` fails until you do.
- **No feature relies on a right-button drag** (Chris, 2026-11-07): SudokuPad's Test Large Puzzle UI setting pans the board on it and no
  script sees the moves (`docs/research/large-puzzle-ui-right-drag.md`). A right click is fine; a right-drag may only be an extra on top of
  one, and the site teaches the right click.
- **Phones and tablets are not supported**, in any script, and never will be (Chris, 2026-11-07). No change is checked, styled, screenshot or
  demonstrated at a phone or tablet size, and no ticket or PR asks for it.
- **SudokuPad's own dark mode** (`.setting-darkmode`) is not supported, in any script, and no change is checked or styled for it (Chris,
  2026-11-06). A dark page means Dark Page.

## Agent skills

### Issue tracker

GitHub issues at `caneff/sudokupad-scripts`, through `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

The six default roles, each label string equal to its role: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `backlog`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: a root `GLOSSARY.md`, plus `docs/adr/` once one is needed. See `docs/agents/domain.md`.

## Coding standards

Before you write or review code: read `CODING_STANDARDS.md`.

## End-to-end seam

- **Seam**: `npm test` (`node --test`), against each script's pure functions (`test/`), each shared module's (`lib/*.test.js`), the live harness's helper tests
  (`live/**/*.test.mjs`) and every page in `site/` (`test/site.test.js`: every script has an install link on the homepage)
- **Blind to**: real SudokuPad: the `Framework` calls, rendering, undo. `npm run test:live` (every `live/**/*.live.mjs`)
  covers them on sudokupad.app in headless Chromium, with the script injected after Start Puzzle.
- Before you write or debug a live test: read `live/README.md`.
- `npm run test:live` needs a Playwright Chromium (`npx playwright install chromium`), so it stays out of `npm test` and
  `land.testcmd`.
- Run it when a change touches a `Framework` call, rendering or undo.
- While you iterate, run only the changed script's files (`live/<script name>/*.live.mjs`, and `live/startup.live.mjs` when
  its startup changed); the full suite runs once, at the controller's merge check.
- When your change alters behavior on purpose, first change the live tests that check the old behavior, then run them: a
  wrong expectation waits out its time limit.
- It does not cover a real Tampermonkey install: a PR names that as still owed. `crackingthecryptic.com` only redirects to
  SudokuPad now, so no PR, ticket or report names it as owed (Chris, 2026-11-07).

`npm run lint` runs StandardJS over the repo, excluding `docs/research/`. Run it before you hand off a change:
`land.testcmd` runs only the tests, and no hook runs the linter. GitHub does: `.github/workflows/ci.yml` runs `npm ci`, `npm test`
and `npm run lint` on every push and pull request (no Playwright browser; the live suite stays out).
