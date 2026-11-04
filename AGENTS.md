# sudokupad-scripts

Standalone Tampermonkey userscripts for SudokuPad, written to be shared. Each
script is one `*.user.js` file with no build step and no ties to any other repo.
`site/` is the static homepage and its Pen Tool Extras details page: GitHub Pages serves it from `main` (`.github/workflows/pages.yml`, at `https://caneff.github.io/sudokupad-scripts/`) and Netlify serves it from the `release` branch (`netlify.toml`); `git push origin main:release` publishes to Netlify at 15 credits a push; `docs/research/` holds what was read from SudokuPad's source; `GLOSSARY.md` holds
the vocabulary.

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

- **Seam**: `npm test` (`node --test`), against each script's pure functions and
  against every page in `site/` (`site.test.js`: every script has an install link on the homepage)
- **Blind to**: real SudokuPad: the `Framework` calls, rendering, undo. `npm run
  test:live` (every `live/*.live.mjs`) covers them on sudokupad.app in headless Chromium, with the script
  injected after Start Puzzle. Only `live/startup.live.mjs` injects at the other two times as well
  (at `DOMContentLoaded`, and after load before Start Puzzle), checking each script's startup:
  it loads with no page error, its control appears, one action works. SudokuPad is served from a recording (`live/cache.mjs`, kept in
  `${XDG_CACHE_HOME:-~/.cache}/sudokupad-scripts/live/`, shared by every worktree): the first run
  of a day, or after `LIVE_REFRESH=1`, needs the network to record it, and the rest replay it;
  `LIVE_OFFLINE=1` never touches the network and fails naming any request the recording lacks.
  It also needs a Playwright Chromium
  (`npx playwright install chromium`), so it stays out of `npm test` and
  `land.testcmd`; run it when a change touches a `Framework` call, rendering or
  undo. While you iterate, run only the changed script's files (`live/<script name>*.live.mjs`, and `live/startup.live.mjs` when its startup changed);
  the full suite runs once, at the controller's merge check. When your change alters behavior on purpose,
  first change the live tests that check the old behavior, then run them: a wrong expectation waits out its time limit. It does not cover a real Tampermonkey install or `crackingthecryptic.com`:
  a PR names those as still owed

`npm run lint` runs StandardJS over the repo, excluding `docs/research/`.
