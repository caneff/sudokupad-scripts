# What a SudokuPad puzzle link can carry besides the puzzle

2026-11-23, #1170 (map #1167). SudokuPad 0.616.0. Facts for the "hints inside the link" options; where hints live is #1171's to
decide, not this note's.

Every claim says how it was found:

- **read**: read in SudokuPad's source, from the live tests' recording (`~/.cache/sudokupad-scripts/live/sudokupad.har`, 0.616.0),
  with the file and function named.
- **run (page)**: run on the recorded page by `docs/research/setter-hints/what-a-puzzle-link-can-carry-probe.mjs`, which opens five
  built puzzles by link and prints what a script can read after Start Puzzle.
- **run (node)**: SudokuPad's `puzpatcher.bundle.js` from the recording, run in a node `vm` (scratch script, not kept).
- **run (server)**: a plain GET to sudokupad.app with curl or `fetch`, no JavaScript run. No request posted anything, and no short
  link was made.

## Answer in brief

- An `scl` link (plain JSON, compressed) carries any key. A key inside `metadata` reaches
  `Framework.app.currentPuzzle.metadata` and `Framework.app.sourcePuzzle.metadata`. A key at the top level reaches only
  `Framework.app.sourcePuzzle`. An f-puzzles link (`fpuz`, `fpuzzles`) keeps a `metadata` object and `key: value` cages, and drops
  any other unknown top-level key.
- The "compact" (zipped) JSON form, which SudokuPad's own dialogs, `ctc` links and the Penpa importer write, changes the data
  inside a custom key: nested keys named `t`, `v`, `c` and so on, double quotes, six-hex-digit strings, and strings that are all
  digits.
- The rules box shows all of the rules text, with no length limit and no way to hide part of it. HTML in the rules is shown as
  literal text, or stripped when the rules come from a cage. A custom metadata key is shown nowhere.
- **sudokupad.app turns any `scl` or `fpuz` link whose body is 1000 characters or longer into a short link when it opens.** That
  is most real 9x9 variant links (820 to 2830 characters measured). The server stores the whole payload, and anyone can read it
  back with one GET. The redirect keeps only the `setting-*` query parameters. A request over about 16 KB is refused with 431.
- A setter can fill in title, author, rules and solution from every setting tool. A custom key needs hand-made JSON, except an
  f-puzzles cage whose text is `key: value`.

## 1. The formats SudokuPad loads, and what survives

### The formats (read)

`PuzzleLoader` (`puzzleloader.js`) registers three inline formats with `addPuzzleFormat`:

| Prefix (aliases) | Parser | What it does |
| --- | --- | --- |
| `scl` (`ctc`) | `parsePuzzleScl` | `decompressPuzzleId` (lz-string base64) then `PuzzleZipper.saveJsonUnzip` |
| `fpuz` (`fpuzzles`) | `parsePuzzleFpuz` | the same, then `loadFPuzzle.parseFPuzzle` turns f-puzzles JSON into SudokuPad's |
| `scf` | `parsePuzzleScf` | `PuzzleTools.decodeSCF`, a compact classic-sudoku form |

`feature-puzzlepack.js` adds `pack` (puzzle packs). Anything else is a **short id**: `fetchPuzzle` tries `/api/puzzle/<id>`, then
the legacy proxy, then Firebase storage. The text it gets back is wrapped as `scl` if it has no prefix. There is no Penpa+ importer
in the 0.616.0 client: no file in the recording mentions Penpa. A Penpa+ puzzle reaches SudokuPad through an outside converter
(`docs/research/sudokubank-to-sudokupad.md` names `marktekfan.github.io/sudokupad-penpa-import`). Its output is an `scl` link in
the compact form; sudoku-kit's fixture `tests/sudokupad/compact-position-sums.txt` is one, with id `penpa…`.

`saveJsonUnzip` (in `puzpatcher.bundle.js`, `PuzzleZipper`) first tries `JSON.parse`, and only when that fails runs
`PuzzleZipper.unzip` on the compact form. So an `scl` body can be either plain JSON or the compact form (read).

### Where the metadata goes (read)

`App.convertPuzzle` (`script.js`) does three things:

1. It keeps a deep copy of the parsed source: `this.sourcePuzzle = JSON.parse(JSON.stringify(puzzle))`. This is
   `Framework.app.sourcePuzzle`, and every top-level key the parser returned is in it.
2. `initMetadata` calls `extractPuzzleMeta(sourcePuzzle)`. That collects every cage with **no cells** whose `value` matches
   `App.reMetaTags` (`/^(.+?):\s*([\s\S]+)/m`), so `name: value`. `rules` cages are passed through `sanitizeHTML` and pushed onto an
   array. Any other name overwrites, so the last cage wins. It then does
   `Object.assign(metadata, puzzle.metaData, puzzle.metadata)`: **every key of the source's `metadata` (or `metaData`) object is
   copied, known or not**, and wins over a cage of the same name.
3. `title`, `author`, `rules` and `solution` are copied up onto the converted puzzle. The converted puzzle becomes
   `Framework.app.currentPuzzle`, with the whole merged object at `currentPuzzle.metadata`.

### What a script can read after load (run (page))

| Link | `currentPuzzle.metadata` | `sourcePuzzle` |
| --- | --- | --- |
| `scl`, `metadata: {title, author, rules, hints, msgcorrect}` and a top-level `hintsTop` | all five keys, `hints` included | top-level keys `id,size,metadata,cells,regions,hintsTop`; `metadata.hints` and `hintsTop` both there |
| `scl`, only cages `title: …`, `rules: …`, `hints: from a cage`, `hints: second` | `title`, `rules` (array, sanitized), `hints: "second"` (the last cage won) | no `hints` in `sourcePuzzle.metadata`; the cages are in `sourcePuzzle.cages` |
| `fpuzzles` with `title`, `author`, `ruleset`, `metadata: {hints}`, an unknown top-level `hintsTop`, and a cell-less cage `hints2: …` | `title`, `author`, `rules`, `hints`, `hints2` | `metadata` holds `hints` and `hints2`; **`hintsTop` is gone** |

f-puzzles (read, then run (node)): `parseFPuzzle` copies `fpuzzle.metadata` whole in `createBlankPuzzle`. `parseMetaData` turns a
cage into metadata (`puzzleAddMeta`, which makes an array when a name repeats) when its text matches `name: value` and it has no
cells, **or** its font and outline colors are both transparent or missing (`reTransparentColor`). Every top-level key without a
`parse[feature]` handler is logged as "Unsupported feature" and dropped. `title`, `author` and `ruleset` become meta cages through
`fpuzzlesParseMeta`, and missing ones get the defaults "Untitled", "Unknown" and "No rules provided…" (`applyDefaultMeta`).

### The compact form changes custom data (read, run (node), run (page))

The `PuzzleZipper.zip` / `unzip` pair (in `puzpatcher.bundle.js`) is lossy for data it does not know about:

- `mapProps` renames keys **at any depth** using `propMap` (`title`↔`t`, `value`↔`v`, `color`↔`c`, `text`↔`te`, `cells`↔`ce`,
  `width`↔`w`, `duration`↔`d` and others). So a custom nested key `t` comes back as `title`, and `v` as `value`. A key and its short
  name in the same object throw "Prop mapping collission".
- `mapValues` turns a string that is all digits (with no leading zero) into a number, and `unzip` turns any six-hex-digit string
  into a colour: `"beef12"` came back as `"#beef12"`.
- `zipQuotes` / `unzipQuotes` turn double quotes inside strings into single quotes: `say "hi"` came back as `say 'hi'`.

The probe's "zip" case showed all of this on the page. SudokuPad's own link-writing dialogs use the compact form:
`feature-gifting.js` `createGiftedPuzzle` and `feature-bgimage.js` `encodePuzzle` both call `zip`. So do `ctc` links, and the Penpa
import fixture is in it too. `createPuzzleWithSolution` (`script.js`) and SudokuMaker's export (sudoku-kit fixture
`tests/sudokupad/scl-with-solution.txt`) use plain JSON, which keeps the data as written.

### Keys SudokuPad already gives a meaning (read)

A custom key must avoid these names, which SudokuPad reads from `metadata`:

- `title`, `author`, `rules`, `solution` and `source`; a `source` of "Sudoku Maker pre-version" changes how colors are drawn.
- `msg<type>` (`getDialogParts`: `msgcorrect`, `msgpartial`, `msgincorrect`, `msgvalid` and the rest), which replaces the text of
  the check dialogs.
- `giftmessage`, `nextpuzzle` (endless mode), `sudorkle`, `grids` (`feature-gridrules.js`) and `bgimage`, `bgimageopacity`,
  `bgimagetarget`, plus `customstyle` for f-puzzles arrows.
- `norowcol`, and any global rule name: `Checker.hasGlobalRule` returns `metadata[rule]` when it is set, for rules such as
  `antiking` and `antiknight`.

## 2. The rules text

- **How it is stored (read).** `metadata.rules` is a string or an array of strings. `rules:` cages each add one array entry.
  `Puzzle.getRules` joins an array with `\n` and trims trailing blank lines.
- **How it is drawn (read, run (page)).** `showMetaInfoUI` sets `.puzzle-rules` to `getRules(true)`, which is `textToHtml`. That
  escapes all HTML through `textContent`, turns newlines into `<br />`, and makes links only for Markdown links to `sudokupad.app`
  or `app.crackingthecryptic.com`, `sudokucon.com` links, and `puzzleu.com` links on that site's puzzles. A link to any other site
  stays as literal text. When the puzzle has no solution, a "does not have solution checking" note is appended.
- **Markup and hidden text (run (page)).**
  - From `metadata.rules`: `<b>`, `<!-- comment -->` and `<span style="display:none">` all showed as literal text.
  - From a `rules:` cage: `sanitizeHTML` (`utilities.js`, DOMParser `textContent`) stripped the tags and dropped the comment
    completely, from the data as well, and the "hidden" span's text **showed**.
  - So no part of the rules can be hidden from the solver.
- **Emoji (read, run (page)).** `feature-emoji.js` swaps emoji in title, author and rules for Twemoji pictures
  (`C.emojiSelHtml`). The probe's 🎉 made the page request `/assets/twemoji/svg/1f389.svg`.
- **Length (run (page)).** 20,400 characters of rules drew in full, in a box 224 px high that scrolls (scrollHeight 6892).
  `getRules`, `textToHtml` and `showMetaInfoUI` set no length limit.
- **Side effects (read).** `RulesParser` (`rulesparser.js`) reads the rules text as data. `hasKillerCage` makes `killer` cages
  unique and summed, and `hasXV` decides whether XV marks are kept. Hint text in the rules that uses those phrases could change how
  the puzzle is checked.
- **Other (read).** Gifting (`feature-gifting.js`) caps its own message at `MaxMessageLength` 200, its own limit only.
  `msg<type>` text goes through `sanitizeHTML` and `textToHtml` too.

## 3. How long a link may be

- **Auto short link (run (server)).**
  - An `scl` or `fpuz` body of **1000 characters or more** is not served the app. The server sends instead a small page,
    "Creating short id for puzzle...", whose script posts the id to `/admin/createlink` and redirects to `/<shortid>`. Boundary
    measured: `scl` plus 999 characters got the app, `scl` plus 1000 got that page, and `fpuz` the same.
  - A `ctc` body of 1000 got the app, and so did an id with no format prefix.
  - The page's redirect copies over only the query parameters that start with `setting-`.
  - `/sudoku/<id>` and `?puzzleid=<id>` answer 301 to `/<id>` and keep the query, and `fpuzzles` answers 301 to `fpuz`.
- **Request size (run (server)).** A path of `scl` plus 16,000 characters still got the short-link page. `scl` plus 16,200 got
  **431** (request header fields too large) and longer paths were refused, so a request line and headers over about 16 KB are
  refused. Measured with a bare client: a browser's cookies and headers take some of that space.
- **The short-link service (read).**
  - `FeatureShortUrl.apiCreateShortId` (`feature-shorturl.js`) posts `{puzzle: <id>}` to `/admin/createlink`, using the path id
    from `getPuzzleId()`, which is never the query, and shows `origin/<shortid>`.
  - The client sets no size limit. The server's limit, and whether it rejects or changes a payload, could not be read, and no
    test data was posted.
  - A short id resolves through `/api/puzzle/<id>`. One GET of the live tests' puzzle (`live/puzzle-url.txt`) returned the
    stored `scl…` payload (run (server)), so **a short link hides nothing from anyone who requests the API**.
- **Browsers.** Chromium documents a 2 MB limit on URLs and shows at most 32 kB in the address bar (Chromium's "Guidelines for URL
  Display" § URL Length). Firefox and Safari were not checked. Neither matters here: sudokupad.app's 16 KB comes first.
- **Discord.** A message holds 2000 characters, or 4000 with Nitro; a longer message becomes a file (Discord support, "Sending
  Messages" and "Discord Account Caps, Server Caps, and More"). How Discord unfurls a SudokuPad link was not checked.
- **What is left for hints (run (node)).**
  - Measured on four real 9x9 variant links from sudoku-kit's fixtures: f-puzzles 820, `ctc` 1159, SudokuMaker `scl` 1647 and
    Penpa-import `scl` 2827 characters.
  - The sample hint text (`hints` in `metadata`, plain English steps of hints) cost about 0.7 link characters per text character:
    2644 characters added 1888.
  - Room left inside a full URL (`https://sudokupad.app/…`):

    | Full URL at most | f-puzzles 820 | `ctc` 1159 | SudokuMaker 1647 | Penpa import 2827 |
    | --- | --- | --- | --- | --- |
    | 1000 (no auto short link) | 141 | 0 | 0 | 0 |
    | 1900 (Discord, plain account, room for a word or two) | 1314 | 765 | 221 | 0 |
    | 3900 (Discord, Nitro) | 4785 | 3971 | 3093 | 1375 |

    Up to the 16 KB request limit, about 18,000 to 21,000 characters of such text fit, worked out from that cost rather than
    measured.
  - A link 1000 characters or longer becomes a short link when someone opens it, and **most real variant links already do**.
    After that, its length in Discord is the short link's.

## 4. What a setter can fill in without hand-editing JSON

| Tool | Fields it writes into the link | A custom key? |
| --- | --- | --- |
| SudokuPad itself | No editor. The Gift Puzzle dialog (setting group `experimental`) writes `rules`, `giftmessage` and `msgcorrect`; Add Background (group `advanced`) writes `bgimage` and `bgimageopacity`. Both write compact JSON. (read) | No |
| f-puzzles | Title, author, rules (`ruleset`) and solution. Any `name: value` cage with no cells, or with transparent colors, becomes metadata (read). Whether f-puzzles' own editor can make such a cage was not checked. | Only by that cage trick, unverified in the f-puzzles UI |
| SudokuMaker | Its document holds `name`, `author` and `comment` (the rules) (sudoku-kit fixture `tests/links/numbered-rooms-6x6.json`). Its SudokuPad export writes `metadata.source`, `title`, `rules` and `solution` as plain JSON (fixture `tests/sudokupad/scl-with-solution.json`). A success-message field was not checked. | No field seen |
| Penpa+ | The owner's fork (`~/src/penpa-edit`) has no SudokuPad export. The outside converter's output (fixture `tests/sudokupad/compact-position-sums.json`) has `title`, `author`, `rules` and `solution` in the compact form. The converter's own code was not read. | No field seen |

In every tool, a key named `hints` needs the JSON edited by hand, or a tool of our own that rewrites the link.

## 5. What a solver sees without asking

- **Rules box (run (page)):** all the rules text, as above. Its copy button (`handleRulesCopy`) copies title, author and rules.
- **Page title (read, run (page)):** `App.createDocTitle` gives "<title> by <author> (Sven's SudokuPad v…)". The served HTML for
  an `scl` link has only the generic title. For a short id it has the puzzle's title and author in `<title>` (run (server)), which
  is what a link preview could show. There were no Open Graph or description tags.
- **Check dialogs (read):** `msg<type>` text shows only when the solver checks.
- **Custom metadata and top-level keys (run (page)):** drawn nowhere. They stay readable by any script, from the console, or by
  decoding the link (lz-string, readable to anyone who tries) or GETting `/api/puzzle/<shortid>`.
- **The link text:** the payload is compressed base64, not readable at a glance. A query parameter (`?hints=…`) is plain text and
  survives on the page (run (page): `location.search` and `location.hash` were both readable). It is lost in the auto and manual
  short links (read), and `getPuzzleId` never reads it.
- **Replay files (read):** `feature-replaysave.js` saves `{puzzle: <id>, replay}`, so a saved replay carries the whole payload.

## What each "inside the link" option is up against

- **A custom key in `metadata`:**
  - It survives `scl` and `fpuz` loading and both short-link routes, and is readable at `currentPuzzle.metadata`. It is not
    drawn.
  - It costs about 0.7 link characters per character of text, and any link over 1000 characters ends up as a short link.
  - Through the compact form, its nested keys and quotes are changed, so a plain string, or nested keys that cannot collide with
    `propMap`, is safer.
  - No setting tool writes it.
  - It is hidden from the eye only. Anyone who decodes the link or GETs the API can read it.
- **A top-level key:** `scl` only, readable only at `sourcePuzzle`. f-puzzles drops it.
- **A `name: value` cage:** the one route f-puzzles can carry, perhaps from its editor (unchecked). The last cage of a name wins
  in `scl` and they make an array in `fpuz`. A cage with cells would also be drawn (not run).
- **Rules text:** every setting tool writes it, and it survives everywhere. But it is all shown in the rules box, nothing in it
  can be hidden, and it feeds `RulesParser`.
- **Query string or hash:** costs the payload nothing and is readable at `location`. But it is plain text, never stored with the
  puzzle, and the query is dropped by the auto short link, which most real variant links trigger, and by the manual one.

## Not determined

- The `/admin/createlink` payload limit, and whether the server changes a stored payload. No test data was posted.
- Whether the 1000-character rule counts the body before or after percent-decoding. The probes were plain ASCII.
- Firefox and Safari URL limits, and how Discord unfurls or shortens a SudokuPad link.
- Whether f-puzzles' editor can make a cell-less or transparent `name: value` cage; whether SudokuMaker has a success-message or
  custom field; what the Penpa converter copies beyond what its output showed.
- Whether a top-level key or a `metadata` key survives the Gift Puzzle and Add Background rewrites end to end: read as kept
  (they re-zip the parsed puzzle), not run.
