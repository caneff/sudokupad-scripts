# sudokupad-scripts

Standalone Tampermonkey userscripts for SudokuPad, written to be shared. Each
script is one `*.user.js` file with no build step and no ties to any other repo.
`site/` is the static homepage Netlify serves (`netlify.toml`); `docs/research/` holds what was read from SudokuPad's source; `GLOSSARY.md` holds
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
  against `site/index.html` (`site.test.js`: every script has an install link)
- **Blind to**: real SudokuPad: the `Framework` calls, rendering, undo. `npm run
  test:live` (every `live/*.live.mjs`) covers them on sudokupad.app in headless Chromium, with the script
  injected at three times (at `DOMContentLoaded`, after load before Start Puzzle,
  after Start Puzzle). It needs the network and a Playwright Chromium
  (`npx playwright install chromium`), so it stays out of `npm test` and
  `land.testcmd`; run it when a change touches a `Framework` call, rendering or
  undo. It does not cover a real Tampermonkey install or `crackingthecryptic.com`:
  a PR names those as still owed

`npm run lint` runs StandardJS over the repo, excluding `docs/research/`.
