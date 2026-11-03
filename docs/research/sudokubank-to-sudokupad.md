# SudokuBank to SudokuPad: is a translator feasible?

Read on 2026-11-03. No translator was built and no converted puzzle was loaded.

## SudokuBank's data

- Sampled 17 fetches of `sudokubank.com/puzzles/<uuid>` with no login: one first probe
  and the 16 puzzle links on the home page. The sample is what the home page showed,
  so it is not random.
- Each page embeds the whole puzzle as JSON in its `self.__next_f.push` chunks:
  `givenCells`, `solutionData` (`symbols-v1`, the solution in plain text),
  `constraints` (`[{id, type, data}]`), `puzzleName` and `puzzleRuleset`.
- `puzzleRuleset` is structured (categories and types). Whether the page also holds
  the rule text as prose was not checked.
- Line and shape points are `[row, col]` floats with cell centres at `.5`, which looks
  like the same grid coordinates as SCL's `wayPoints`. Compare before relying on it.
- 26 constraint types appear in the sample, against the "73 constraint types" the home
  page advertises, so about 47 are unseen. Most common: `Regions` 15 pages, `KillerCage`
  5, `DifferenceKropki` 5, then `Arrows`, `Palindrome`, `Renban`, `CosmeticShape` and
  `RatioKropki` 3 each.
- Some types have no drawing of their own: `AntiKnight`, `CustomKnightmare`,
  `GlobalEntropy`. Others look harder to draw or carry over: `FogOfWar`,
  `AuxiliaryCells`, `NumberedRooms`.
- A HEAD request sent with `Origin: https://jsfiddle.net` returned no
  `access-control-*` headers, so a page on another origin should not be able to read
  a puzzle with `fetch`. A script on sudokubank.com itself can.
- `robots.txt` allows everything but `/auth/`. The raw `/terms` HTML has no match for
  scrap, crawl, automated or reverse engineer. The terms and copyright policy were not
  read in full.

## SudokuPad's side

`puzzleloader.js` (v0.611.0) registers three URL formats: `scl` (alias `ctc`), `fpuz`
(alias `fpuzzles`) and `scf`. `scl` is an LZ-compressed JSON puzzle
(`parsePuzzleScl`), so a translator writes JSON and compresses it.

## Existing converters

Two Exa searches: none is described as reading SudokuBank. The closest are
`marktekfan.github.io/sudokupad-penpa-import` (Penpa+ and f-puzzles input) and
`sudokupad.app/demo/puzzleimporter.html`. Only the search result text was read.

## A paste-a-URL page

- A GET and an OPTIONS sent to a puzzle page with an `Origin` header returned no
  `access-control-*` headers, so a static page's `fetch` of the URL should fail. This
  was tested with curl, not in a browser.
- The Penpa converter (`marktekfan.github.io/sudokupad-penpa-import`) is such a static
  page. Its bundle expands tinyurl and tinypuz links through its author's own API,
  `marktekfan-api.azurewebsites.net`, so it uses a small server for the fetch it cannot
  make itself.
- A page of ours needs the same: a small proxy limited to `sudokubank.com/puzzles/`.
  Whether SudokuBank answers a request from a proxy host was not tested; this box's
  curl got a 200.
