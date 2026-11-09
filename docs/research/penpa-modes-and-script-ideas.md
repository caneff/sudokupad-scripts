# Penpa+ solve mode: switching modes, and what the script ideas have to build on

Read from the Penpa+ source, `swaroopg92/penpa-edit` at 34e3fe9 (2026-06-02), for two questions (Chris,
2026-11-08): (1) why is switching modes with Tab so hard to follow in solve mode, and what could a userscript
hook; (2) for six candidate scripts, what Penpa+ already has and what is missing. Free text in solve mode is
settled in `penpa-solve-mode-text.md` and not repeated here.

Files are under `docs/js/` and `docs/index.html` in that repo. Nothing was run in a browser: every claim is
from reading the source, and the places where that is not enough are marked "not determined".

## 1. Switching modes

### How Tab cycling works

- **Keys.** Tab and Enter do the same thing; Shift+Tab and Shift+Enter go backward (`onKeyDown` in `main.js`,
  the `key === "Tab" || key === "Enter"` branch; README, "Tab" section). The handler sits on `document` in the
  bubble phase (`document.addEventListener("keydown", onKeyDown, {passive: false})` in `main.js`). It returns
  early only when the focused element is an `input` of type text/number or one of seven listed ids
  (`targetTypes`, `targetIDs`: `savetextarea_pp`, `custom_message`, `iostring`, `inputtext`, `select2_search`,
  `saveinforules`, `urlstring`).
- **The "checked" set.** It is the multi-select `<select id="mode_choices" multiple>` inside
  `<span id="tab_selection">` in `index.html`, turned into a dropdown (labelled "Tab/↵" in the README) by
  `PenpaUI.initPenpaLite()` in `interface.js` (library `vanillaSelectBox`). Its 29 options come from
  `PenpaText.modes.EN` in `translate.js`: Surface, Multicolor, Line Normal/Diagonal/Free/Middle/Helper, Edge
  Normal/Diagonal/Free/Helper/Erase, Wall, Move All, Number Normal/L/M/S/Candidates/1/4/Side, Sudoku
  Normal/Corner/Centre, Shape, Special, Thermo, Sudoku Arrow, Composite. So the set mixes main modes
  (Surface, Wall, Shape, Composite), sub-modes (Number L, Sudoku Corner) and one combination of both.
  `PenpaText.modes.mapping` gives each entry's target: a main-mode name (`surface`, `wall`, `symbol`, `combi`,
  ...) or a sub-mode radio id (`sub_number10`, `sub_sudoku2`, ...).
- **Where the set is stored.** `onchange` of `#mode_choices` (`main.js`) copies `getValues('mode_choices')` into
  `UserSettings.tab_settings` (`settings.js`); the Tab handler reads that. It is persisted two ways: the cookie
  `tab_settings` (`UserSettings.attemptSave`, `loadFromCookies`) and, for a puzzle link, field 6 of the saved
  text (`rtext[6]` in `load_data` in `general.js`, written by the setter; README: "Tab settings are now
  retained in the shared URL"). Order in `general.js`: cookies load first, then the link's `rtext[6]` overwrites
  `UserSettings.tab_settings`, so a setter's choice beats the solver's cookie. Whether the dropdown is hidden
  in solve mode: `set_solvemode()` does not hide `#tab_selection`, so it is visible.
- **Order.** `getValues()` (`general.js`) walks the `<option>` elements in DOM order, which is the
  `PenpaText.modes.EN` order above. It is not the order the user ticked them in.
- **What one press does.** The handler keeps `counter_index` and `previous_length` as closure variables inside
  `main.js` (not on any global). It steps the index by one (minus one for Shift, with wrap-around), looks up
  the mapping, and calls `pu.mode_set(<main mode>)` and, for sub-mode entries, `pu.submode_check(<radio id>)`.
  Every branch calls `preventDefault()`, so Tab no longer moves browser focus. If the set is empty the handler
  does nothing and Tab behaves as an ordinary focus key.
- **Styles are not cycled.** The style (colour, line type) is the second slot of
  `pu.mode.pu_a[<mode>]` and is whatever that mode last had; `mode_set()` re-applies it via
  `stylemode_check('st_' + mode + style)`. Tab never changes a style.

### Quirks of the cycle that make it hard to trust

These come straight from the code in `onKeyDown`:

1. **The index is private and not synced with the real mode.** If you click a mode button, press a hotkey (Z/X/C/V),
   or use a mouse/other path, `counter_index` does not move. The next Tab goes to "last Tab target + 1" in the
   list, not "next after where I am now". Nothing reads `pu.mode` to find the starting point.
2. **A first-press skip.** `previous_length` starts at 2. With exactly two checked items the first press
   increments the index to 1 and skips item 0; with any other count the first press resets to 0 and goes to
   item 0. Changing the number of checked items resets the index to 0 on the next press.
3. **Order is list order,** not tick order, so the sequence the user sees may not be the one they pictured.
4. **Shift and Ctrl change the Sudoku sub-mode on their own.** Pressing Shift in Sudoku mode switches to Corner,
   Ctrl to Centre, and release restores the earlier sub-mode (`onKeyDown`/`onKeyUp`, `shift_counter`,
   `ctrl_counter`, `present_submode`). This also moves the radios while the user is working, and is independent
   of Tab's index.
5. **Enter is taken too.** Enter is hijacked wherever focus is not in one of the exempt fields above (the
   target list does not include every text area; which other on-page controls this reaches was not tested).

### Every way the current mode is shown

All of these are updated by `mode_set` / `submode_check` / `stylemode_check` in `class_p.js`.

| Where | Element / call | What changes |
|---|---|---|
| Main mode row | `input[type=radio][name=mode]#mo_<mode>` with label `#mo_<mode>_lb` | The radio itself is `display: none` (`input[type=radio]` in `base-structure.css`). The label gets `background: var(--greyLight); color: var(--black); box-shadow: 0 0 0 1px var(--orange)` (`input[type="radio"]:checked + label`), a 1px orange outline on a light grey fill. |
| Sub-mode row | `#mode_<mode>` (e.g. `#mode_number`, `#mode_sudoku`), radios `#sub_<mode><n>` | `submode_reset()` hides every `#mode_*` row, then `mode_set()` shows only the current mode's row. So the row under the main buttons swaps its contents. The checked sub-mode label gets the same grey/orange style. |
| Style row | `#style_<mode>` (e.g. `#style_surface`, `#style_line`), radios `#st_<mode><n>` | Same swap: `submode_reset()` hides all, `mode_set()` shows one. |
| Panel header | `#float-key-header-lb` | `mode_set()` writes `"Mode: " + mode_names[mode]` (main mode only, no sub-mode). It is inside `#float-key`, the floating number/symbol panel, so it is visible only while that panel is open. |
| Shape / Composite names | `#symmode_content`, `#combimode_content` | Set by `subsymbolmode()` and `subcombimode()`. |
| On the board | `draw_cursol()` and `draw_selection()` in `class_p.js` | A cursor square is drawn only in single-cell Number mode and Shape mode (`edit_mode === "number" && !number_multi_enabled()` or `"symbol"`). A selection glow is drawn in Sudoku, multi-cell Number, Multicolor and Cage Killer. In Surface, Line, Edge, Wall, Special, Composite and Move there is no mode-dependent mark on the board. |
| Mouse cursor, page title, tab title | none found | `document.title` is set only by `update_title()` from the puzzle title (`general.js`). No `cursor` style was found tied to the mode. |
| Penpa Lite | `advancecontrol_off()` in `general.js` | If "Enable PenpaLite" is on, main-mode labels not in the checked set get `is_hidden` (`#mo_<mode>_lb`). Then the visible buttons are exactly the Tab set, which makes the highlight easier to find, but only for main modes. |

Why it is easy to miss, from that table:

- The only constant indicator is a 1px orange outline on a pale grey label, in the button strip at the top of
  the tool area, away from the board where the eyes are. Nothing marks the board itself for most modes.
- Radios are hidden, so there is no native control to focus or announce; the highlight is the only signal.
- When Tab lands on a sub-mode of the same main mode (Number Normal to Number L, Sudoku Normal to Corner), the
  main-mode label does not move at all; only a sub-mode label in the row below changes.
- When Tab lands on a different main mode, the sub-mode and style rows are replaced wholesale, so the layout
  under the buttons shifts.
- With Composite or Shape, the actual tool (e.g. "battleship") is the small text in `#combimode_content`
  / `#symmode_content`, not a highlighted button.
- The cycle's own position (see quirk 1) is shown nowhere.

### Other keyboard shortcuts for modes, sub-modes, styles

Confirmed in `main.js` (`onKeyDown`, `checkShortcutKeys`, `checkFunctionKeys`, `onKeyUp`):

- **Z, X, C, V** (`shortcutModeMap`, `checkShortcutKeys`): Z = Sudoku Normal (`mo_sudoku` + `sub_sudoku1`),
  X = Sudoku Corner (`sub_sudoku2`), C = Sudoku Centre (`sub_sudoku3`), V = Surface. They only act when the
  current mode is Surface or Sudoku, when caps lock is off, and when `UserSettings.shortcuts_enabled` is on
  (README: "Sudoku Z/Y & XCV Keys" can be turned off). Not available from Line, Number or other modes.
- **Shift / Ctrl held in Sudoku mode:** temporary Corner / Centre (above).
- **Digits in Surface mode** switch the style: 1 to 9 and 0 map to `st_surface1`, `st_surface8`, `st_surface3`,
  ... (`surfaceKeys`); two quick digits give styles 11 and 12.
- **Digits in Multicolor mode** pick the colour via `MULTICOLOR_REMAP`, Alt+digit the second set
  (`pu.stylemode_check('st_surface' + key)`).
- **F2 / F3** switch Problem / Solution (`checkFunctionKeys`, calls `pu.mode_qa`); F4 hides/shows the timer.
  In solve mode `mode_qa("pu_a")` is the only side.
- **`?`** opens the shortcut list (`show_shortcuts()` shows `#modal-keys`) when not in Number or Sudoku mode.
- **Middle mouse button** toggles Problem/Solution only in setter mode (`mousemiddle_button` in `onDown`).
- Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z undo and redo; Ctrl+D duplicates; Ctrl+A selects all. None change mode.

There is no shortcut that names a mode directly outside Z/X/C/V; every other change is Tab, Enter or a click.
The click path is one delegated handler in `main.js` (`eventTarget.id.slice(0, 3) === "mo_"` calls
`pu.mode_set`, `"sub_"` calls `pu.submode_check`, `"st_"` calls `pu.stylemode_check`).

### The JS API a userscript can reach

- **`pu`** is the single puzzle object, a global created by `pu = new Puzzle_square(...)` (and the hex, tri,
  pyramid, sudoku, kakuro variants, all `extends Puzzle` in `class_p.js`); `main.js` itself tests `window.pu`.
  It is **replaced** on load, on new board and on update, so a patch must go on the class prototype
  (`Puzzle.prototype`), not on one `pu` instance.
- **State:** `pu.mmode` (`"solve"` in solve mode, set by `set_solvemode()`), `pu.mode.qa` (`"pu_a"` in solve
  mode), `pu.mode[pu.mode.qa].edit_mode` (the main mode: `surface`, `multicolor`, `line`, `lineE`, `wall`,
  `number`, `symbol`, `special`, `cage`, `combi`, `sudoku`, `board`, `move`), and for each mode an array:
  `[0]` = sub-mode (a string for most, a name like `"battleship"` for combi, `"circle_L"` for symbol),
  `[1]` = style, `[2]` = orientation/custom colour. The initial structure is in the `Puzzle` constructor
  (`this.mode = {...}`).
- **Mode changers** (all methods of `Puzzle`, `class_p.js`): `mode_set(mode, loadtype, skipredraw)`,
  `submode_check(radioId, skipredraw)`, `stylemode_check(radioId)`, `subsymbolmode(name)`,
  `subcombimode(name)`, `set_orientation(dir)`, `mode_qa("pu_a" | "pu_q")`. Names match what the task
  guessed: `mode_set`, `submode_check`, `stylemode_check` are all real.
- **UI ids** a script can read or set: radios `mo_<mode>`, `sub_<mode><n>`, `st_<mode><n>`, and rows
  `mode_<mode>`, `style_<mode>`. Setting `.checked` by script fires no event.
- **Observing a change.** No custom event, no callback list, no `MutationObserver` use, and no `change` event
  for programmatic changes (`mode_set` sets `.checked = true` directly). The reliable hook is to wrap
  `Puzzle.prototype.mode_set`, `submode_check` and `stylemode_check` (every path above ends in one of them:
  the click handler, Tab, Z/X/C/V, Shift/Ctrl, the constraint presets in `main.js`). `pu.redraw()` is also a
  method and runs after each of them unless `skipredraw` is passed, so wrapping `redraw` would see changes
  too, but also every other redraw.
- **Reading the mode's display name:** `mode_names` (`modes.js`) is a top-level `const` mapping mode id to the
  label; sub-mode labels are the text of `#sub_<mode><n>_lb`.
- **Top-level `const`/`let` bindings** (`UserSettings` in `settings.js`, `PenpaUI` in `interface.js`,
  `PenpaProgress` in `progress.js`, `mode_names`, `PenpaText`) are not `window` properties. They are reachable
  by bare name from a script running in the page's own context, but not through a sandboxed `unsafeWindow`.
  `pu` and `panel_pu` are implicit globals (assigned without a declaration) so they are `window` properties.
  Whether a given Tampermonkey `@grant` mode sees them was not tested here.
- **Intercepting the keyboard before Penpa.** Penpa's listener is on `document`, bubble phase, added in
  `main.js` at load. A listener added with `{capture: true}` on `window` (or `document`) runs before it, and
  `stopImmediatePropagation()` or `stopPropagation()` there keeps Penpa from seeing the key. So a script can
  replace Tab/Enter handling entirely: swallow the key and drive `pu.mode_set` / `pu.submode_check` itself,
  with its own index that starts from the real current mode, and its own indicator. The exempt-field test
  (`targetTypes`/`targetIDs`) would need to be copied so typing in the text fields still works.
- **Reading the Tab set:** `UserSettings.tab_settings` (array of the English option names), or the selected
  options of `#mode_choices`; map to ids with `PenpaText.modes.EN` / `.mapping`.

### What this means for a mode-switching script (options, not a decision)

- A visible indicator of "current mode, sub-mode, style" next to the board, driven by wrapping the three
  `Puzzle.prototype` methods, with no dependence on the Tab logic.
- Replacing the Tab cycle with one that starts from the current mode, includes styles if wanted, and flashes a
  label at the cursor or on the board when it changes.
- Both can be done without touching Penpa's files; neither needs more than the globals above.

## 2. The candidate scripts

### a. Checkpoints (named board states, roll back): partial

- **Exists:**
  - Linear undo/redo: `Stack` objects at `pu.pu_a.command_undo`, `command_redo` (and the `_col` twins), with
    `undo()` / `redo()` in `class_p.js` and the toolbar `#tb_undo`, `#tb_redo` (`set_redoundocolor()`).
    `record()` pushes each edit; grouped edits share a `groupcounter` and undo together.
  - A timestamped replay log, `pu.pu_a.command_replay`, with replay playback (`replay_play`, `maketext_replay()`
    in `class_p.js`; `replaycutoff` is 60 minutes).
  - A full serialisation of the state: `pu.maketext_duplicate()` returns a link containing `pu_a`, `pu_a_col`,
    the undo/redo stacks, `pu.mode`, and the timer (`sw_timer.getTimeValues()`).
  - `duplicate()` (Ctrl+D, `general.js`) opens that link in a new tab; with the setting `auto_save_history`
    (`UserSettings.auto_save_history`) `PenpaProgress.save()` calls `duplicate(true)` which does
    `history.pushState` with it.
  - The restore path is in `load_data` (`general.js`, the `PenpaProgress.tryLoad` branch): it assigns
    `pu.pu_q`, `pu.pu_a`, `pu.pu_q_col`, `pu.pu_a_col`, rebuilds the three `Stack`s of each with
    `new Stack().set(...)`, then `pu.redraw()`.
- **Missing:** any named save, any list of saves, any one-click restore; only one auto-save slot per puzzle
  exists (see f).
- **Userscript?** Yes, probably. Take a snapshot as `pu.maketext_duplicate()` (a string) or a deep copy of
  `pu.pu_a` / `pu.pu_a_col`; restore by repeating the assignment sequence above, or cheaper, by recording
  `pu.pu_a.command_undo.__a.length` and calling `pu.undo()` until it is back (this loses the later work,
  which a checkpoint does not want unless the snapshot is kept too). Not determined from the source alone:
  whether assigning those fields from outside leaves `sol_flag`, the conflict cache, and the timer consistent.
  That needs a live test.

### b. Live counts for shading puzzles (stars/shaded per row, column, region): partial, in the wrong place

- **Exists:** `check_conflict()` in `class_p.js` picks a checker by the puzzle's genre tags
  (`pu.user_tags`); `check_star_battle()` in `conflicts.js` marks, in `pu.conflict_cells`, two stars that touch,
  a row or column whose star total is over the number in the clue cell, and a region over that number.
  `calculate_star_grid()` reads stars as `pu_a.symbol[i]` equal to `[2, "star", _]`;
  `calculate_region_grid()` uses `getregiondata(..., "pu_q")`. `draw_conflicts()` paints the cells red. Other
  checkers in the same file: `check_sudoku`, `check_irregular`, `check_consecutive`,
  `check_consecutivepairs`, `check_tomtom`, `check_latin_square`.
- **Missing:** nothing counts shaded cells or any other genre; only over-count is reported, never a
  count shown or a "full" mark; star battle assumes one number cell in the question layer and a square grid with
  as many regions as rows; there is no checker for Nurikabe, Heyawake, LITS, Battleships, Minesweeper or Tents
  (the commented names in `penpa_constraints` in `constraints.js` are setter presets, not checkers).
  Conflicts run only when the puzzle has a stored solution (`check_solution()` calls `check_conflict()` only
  `if (this.solution)` and `!this.multisolution`) and the setter tagged the genre; the solver's switch is
  `#conflict_detection_opt` (values 1 ON, 2 OFF this puzzle, 3 OFF all; `UserSettings.show_conflicts` is true
  when it is OFF, despite the name). Pencil-mark checking is a separate setting (`check_pencil_marks`).
- **Userscript?** Yes. Cell content is plain data: `pu.pu_a.surface[i]` (shading, style number),
  `pu.pu_a.symbol[i]`, `pu.pu_a.number[i]`; the grid size is `pu.nx`, `pu.ny`, `pu.space`, the region
  borders come from `pu.getregiondata`. Redraw after each `pu.redraw()` wrapper to update a counter overlay.
  The set of colour/style numbers that mean "shaded" for a given setter is not fixed; not determined.

### c. Loop progress for Slitherlink and Masyu: missing

- **Exists:** `getloopdata(row_size, col_size, type)` in `class_p.js` walks `pu_a.line` (Masyu, Yajilin,
  Castle Wall, ...) or `pu_a.lineE` (Slitherlink), for `loop_type === 3` segments only, and builds a text grid;
  it is used to make the answer string, not to show progress. `constraints.js` has presets for slitherlink
  (which modes to show) and nothing that checks lines. No code in `conflicts.js` mentions loops or
  dead ends; a grep for "loose", "dead end", "slither" and "masyu" outside `puzzlink.js` and `translate.js`
  finds only `getloopdata`, the preset lists and `genre_tags.js`.
- **Missing:** loose-end detection, branch detection (degree 3 or 4), premature closed loop, loop length or
  cell-coverage count.
- **Userscript?** Yes. Edges are in `pu.pu_a.line` (keys like `"i,j"` for the two point indices, value is the
  line style, 3 = solid) and `pu.pu_a.lineE` for edges; point positions are `pu.point[i]`. Degree per vertex
  is a few lines. The point-index scheme differs between Line and Edge (the `subtract` offset in
  `getloopdata`), which the script must copy; its behaviour on non-square grids was not read.

### d. Running sums for cages and rows (Killer, Sandwich): missing

- **Exists:** Cages are drawn objects (`pu.pu_q.killercages`, `draw_cage()`, mode `cage`, `sub_cage1`
  Killer); a killer total is just a Number in the cage's corner. The answer check and `conflicts.js` have no
  sum logic for cages or sandwiches (the only sums in `conflicts.js` are star counts and Tom-Tom arithmetic);
  `check_sudoku` flags duplicate digits in rows, columns and boxes only, and only for 9x9.
- **Missing:** cage totals, cage repeat-digit check, sandwich sums, "remaining" values.
- **Userscript?** Yes for the arithmetic: cage cell lists are in `pu.pu_q.killercages` and the clue is in
  `pu.pu_q.number` or `numberS`; solved digits are in `pu.pu_a.number[i]`. How exactly a cage's clue is stored
  per cage was not traced; not determined.

### e. Rules pane sizing: exists as a popup only

- **Exists:** the rules text is in the link (`rtext_para[18]`), sanitised with DOMPurify and stored as
  `pu.rules` and in `#ruletext` (`general.js`, `load_data`). In normal layouts `#ruletext` is
  `display: none` (`base-structure.css`) and `#puzzlerules` ("Show Rules", under `#puzzleinfo`) only appears
  with the class `rules-present`. Clicking it calls `display_rules()`, which opens a SweetAlert2 modal
  (`Swal.fire({title: 'Rules:', html: '<h5 class="info">' + pu.rules + '</h5>'})`) with no size options.
  Only in Streaming layout (`#app-container.streaming-mode`, set by `UserSettings.display_layout`, option
  "Streaming 1 (beta)") is `#ruletext` shown inline (`display: block`, selectable) and the button hidden.
  `#puzzleinfo` is 400px wide.
- **Missing:** a docked, resizable or always-visible rules pane in the default layout; text size for rules;
  the modal is dismissed on click-away and covers the board.
- **Userscript?** Yes. `#ruletext` and `pu.rules` hold the text; a script can show `#ruletext` in its own
  pane (it is in the DOM from load) and style it. No Penpa code needs to be replaced.

### f. Saved progress across reloads: exists

- **Exists:** `PenpaProgress` in `progress.js`. `save()` runs from `window` `beforeunload` and from
  `document` `visibilitychange` to `hidden` (`main.js`). It writes
  `localforage.setItem("penpa_" + md5(pu.url), pu.maketext_duplicate() + "&l=solvedup")`; `pu.url` is the
  puzzle's `p=` parameter. It only saves when local storage works (`canSaveProgress()`), `pu.mmode === "solve"`,
  `UserSettings.save_current_puzzle` (default follows `#allow_local_storage`, ON = 1), and `!pu.replay`.
  `tryLoad(hash)` reads localforage then falls back to `localStorage`; `load()` in `general.js` calls it on open
  and restores the grid, undo stack and timer. `clear_storage_one` / `clear_storage_all` (`main.js`) remove
  the entry or every key containing "penpa".
- **Missing:** saving at any other moment (no timer-based or per-edit save, so a crash or a killed browser
  loses everything since the last tab hide); more than one slot per puzzle; any list or export of saves.
- **Userscript?** Yes, either by calling `PenpaProgress.save()` on a timer or after edits (it is a plain
  object, global by bare name), or by writing its own keys with a different prefix in `localforage` (a global
  loaded by `index.html`).
  `PenpaProgress.clearAllPuzzles()` deletes every key that contains "penpa", so a script's own keys must not
  contain that string.

## Not determined from the source

- How the highlighted label looks in practice (the theme variables `--greyLight`, `--orange` in
  `light_theme.css` / `dark_theme.css` were not read for contrast).
- Whether any CSS sets a mouse cursor by mode (searched `cursor` only through the mode code, not all CSS).
- Whether bare-name access to `UserSettings` and `PenpaProgress` works under each Tampermonkey `@grant` setting.
- Whether restoring a snapshot from outside leaves `sol_flag`, conflicts and the timer correct (idea a).
- How killer cage clues and the shading style numbers are stored per puzzle (ideas b, d).
