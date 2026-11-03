# SudokuPad theme colors

Read from sudokupad.app source at v0.611.0 on 2026-11-03: `sudokupad-colors.css`,
`style.css`, `feature-uitheme.js`. Nothing here was run on the page.

- `sudokupad-colors.css` holds the theme as CSS variables on `:root`: `--body-bg`,
  `--color-white`, `--color-black`, `--button-bg`, the `--controls-button-*` set and the
  `--puzzle-*` digit colors.
- Built-in dark mode is `.setting-darkmode`, which overrides those variables and adds
  rules of its own. It special-cases black and white kropki dots by their `fill` value,
  because a puzzle's elements carry their own colors.
- `feature-uitheme.js` is the accent color setting: `.setting-uitheme-<name>` sets
  `--main-color` and `--controls-button-bg`.
- Variables will not reach everything: `style.css` has 25 lines using `var(--` and 128
  lines with a literal color. Which of those a theme would show was not checked.
- Digit Color's defaults were chosen for a white grid. Several, such as digit 7's
  `#3d2bb8`, would be hard to read on a dark one.

Search for an existing script: one Exa search (five results). None is a SudokuPad
theme. `Owyn/Universal_Dark_Theme` and the Stylus global dark mode are generic, and
per their own notes they flatten or invert colors, which would alter puzzle colors.
