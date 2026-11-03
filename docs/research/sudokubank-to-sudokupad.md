# SudokuBank to SudokuPad: is a translator feasible?

Read on 2026-11-03. No translator was built and no converted puzzle was loaded.

Dropped: Chris ruled on 2026-11-03 not to build this, after reading SudokuBank's terms
(below). Reopening it starts from those terms.

## SudokuBank's data

- Sampled 17 fetches of `sudokubank.com/puzzles/<uuid>` with no login: one first probe
  and the 16 puzzle links on the home page. The sample is what the home page showed,
  so it is not random.
- Each page embeds the whole puzzle as JSON in its `self.__next_f.push` chunks:
  `givenCells`,
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

## Could it be a fiddle?

- `jsfiddle.net/uhecb8yf` ("SudokuMaker Resize Test", read through Exa as a truncated
  extract because Cloudflare blocked curl and headless Chromium) loads lz-string and
  takes a SudokuMaker URL. That URL holds the compressed puzzle, so the fiddle needs no
  network call. A SudokuBank URL holds only a UUID, so the data has to be fetched.
- Three public CORS proxies, one try each from curl with `Origin: https://jsfiddle.net`,
  returned no puzzle: `api.allorigins.win` 522, `api.codetabs.com` 522, `corsproxy.io`
  401. The 522s may be temporary; the 401 looks like a paid-plan limit, but the body was
  not read.
- A fiddle is only the page's host. It still needs a proxy of ours for a pasted URL, or
  the pasted page source without one.

## SudokuBank's terms

`sudokubank.com/legal` holds the terms and copyright policy on one page (keyword pass
over its 11 KB of text on 2026-11-03, not a full read), which says:

- "No bots or scrapers, no bulk-copying the puzzle library, no malware, and no poking at
  data that isn't yours".
- "A specific puzzle is different: its grid, clues, and solution belong to whoever made
  them."

The 17-page sample above was a scripted fetch, made before this page was read. It is
not repeated. A translator's fit with these terms is Chris's ruling.

`puzzleRuleset` holds structured rules only, with no prose in the one page checked; the
prose appears to be generated in the browser.
