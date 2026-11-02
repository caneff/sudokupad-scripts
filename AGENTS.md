# sudokupad-scripts

Standalone Tampermonkey userscripts for SudokuPad, written to be shared. Each
script is one `*.user.js` file with no build step and no ties to any other repo.
`docs/research/` holds what was read from SudokuPad's source; `GLOSSARY.md` holds
the vocabulary.

## Agent skills

- **Issue tracker:** GitHub issues at `caneff/sudokupad-scripts`, through `gh`.
- **Triage labels:** `needs-triage`, `needs-info`, `ready-for-agent`,
  `ready-for-human`, `wontfix`, `spec`, each label string equal to its role.
- **Domain docs:** a root `GLOSSARY.md`, plus `docs/adr/` once one is needed.

## End-to-end seam

- **Seam**: `npm test` (`node --test`), against each script's pure functions
- **Blind to**: real SudokuPad: the `Framework` calls, rendering, undo. A PR names
  those checks as owed, because only a live page can make them
- **Narrowed**: none; the suite is small enough to run whole
