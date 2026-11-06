# sudokupad-scripts

Standalone Tampermonkey userscripts for SudokuPad, written to be shared. Each
script is one `*.user.js` file with no build step and no ties to any other repo.

- **Pages**: `site/` is the static homepage and its Pen Tool Extras details page. GitHub Pages serves it from `main`
  (`.github/workflows/pages.yml`, at `https://caneff.github.io/sudokupad-scripts/`).
- **Netlify**: serves `site/` from the `release` branch (`netlify.toml`). `git push origin main:release` publishes it and
  spends 15 of the plan's 300 credits a month (`docs/research/netlify-credits.md`). It is pushed very rarely, so it lags
  `main` by design: Chris kept Netlify on 2026-11-05.
- **`docs/research/`**: research notes, chiefly what was read from SudokuPad's source, and also screenshots, the scripts that take them and frozen scratch.
- **`GLOSSARY.md`**: the vocabulary.
- **A change to what a script shows** (its panel, buttons, dialog or drawing) updates that script's text in `site/` and retakes the site pictures that
  show it, with their scripts in `docs/research/` (`*-screenshot.mjs` that write a picture `site/` links), in the same PR (Chris, 2026-11-06).
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

- **Seam**: `npm test` (`node --test`), against each script's pure functions, the live harness's helper tests
  (`live/*.test.mjs`) and every page in `site/` (`site.test.js`: every script has an install link on the homepage)
- **Blind to**: real SudokuPad: the `Framework` calls, rendering, undo. `npm run test:live` (every `live/*.live.mjs`)
  covers them on sudokupad.app in headless Chromium, with the script injected after Start Puzzle.
- Before you write or debug a live test: read `live/README.md`.
- `npm run test:live` needs a Playwright Chromium (`npx playwright install chromium`), so it stays out of `npm test` and
  `land.testcmd`.
- Run it when a change touches a `Framework` call, rendering or undo.
- While you iterate, run only the changed script's files (`live/<script name>*.live.mjs`, and `live/startup.live.mjs` when
  its startup changed); the full suite runs once, at the controller's merge check.
- When your change alters behavior on purpose, first change the live tests that check the old behavior, then run them: a
  wrong expectation waits out its time limit.
- It does not cover a real Tampermonkey install or `crackingthecryptic.com`: a PR names those as still owed.

`npm run lint` runs StandardJS over the repo, excluding `docs/research/`. Run it before you hand off a change:
`land.testcmd` runs only the tests, and no hook or CI job runs the linter.
