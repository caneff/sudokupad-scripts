# What every script shares

The parts the SudokuPad scripts have in common: the settings dialog, the color block, the guard that turns off a part SudokuPad
has broken, and how a saved value is read. Each script's own page has the rest: [Pen Tool Extras](pen-tool-extras.md), [Text
Anywhere](text-anywhere.md), [Color by Digit](color-by-digit.md), [Auto Rules Resizer](auto-rules-resizer.md) and [Dark
Page](dark-page.md). UI Tweaks' is the README's script notes. The words are defined in `GLOSSARY.md`.

## The settings dialog

- **The settings entry**: each script adds a row to SudokuPad's own settings dialog, in the Experimental settings group, that
  opens the script's dialog (`addSettingsEntry` of `lib/settings-dialog.js`). The entry and the dialog run under one feature of
  the guard, so a SudokuPad without what they need leaves the entry out.
- **Drafts**: while a dialog is open, an edit changes the draft only. Save writes every draft, and Cancel drops them. A Restore
  defaults press and a Paste settings also fill the draft. A slider in a pen panel is no draft: it saves at once.
- **Restore defaults**, in the dialog's button row, sets the draft of every setting back to its default and saves nothing: Save or
  Cancel decides. What it leaves is each script's own: Text Anywhere's size and opacity, which its dialog does not set, and Auto
  Rules Resizer's saved sizings, its dialog only emptying the two limit boxes. An extra button of a dialog, such as Reset puzzle
  size, is no Restore defaults.
- **Copy settings** carries the saved settings only. **Paste settings** saves the pasted keys at once and puts only those into the
  dialog's draft, so an unsaved edit of any setting the pasted text lacks stays there for Save or Cancel. Color by Digit's paste
  rule for profiles and mode is on its page.
- **A failed Save, Copy or Paste**: any throw in a dialog's Save, Copy or Paste, whether a write or the script's own step, leaves
  its feature on. The dialog stays open and its status line names the failure, after a Save or Paste has put every key back.
- **The off line**: every dialog names its script's features that are off in one line under its title, "Off because SudokuPad
  changed: …", and shows nothing when all is well.
- **The error log buttons**: each dialog has a Copy error log button (the whole log, newest first, as text) and a Clear button for it.

## The color block and edit mode

- **The color block** is the part of a dialog that `lib/color-picker.js` draws for Pen Tool Extras, Text Anywhere and Color by
  Digit: a pulldown (the presets or the cell color page) above a grid of swatches, three to a row. Text Anywhere's and Pen Tool
  Extras' swatches are color inputs, one per pen or ink color. The block's palette mode, used by Color by Digit, makes them
  buttons.
- **Edit mode** starts with a hold of 1000 ms on a color button, the delay SudokuPad's color tool uses, which
  `lib/color-picker.js` turns into edit mode for a script's panel: a color picker sits over each of the nine buttons. A second
  hold, leaving the tool, Escape, a press outside the panel, the window losing focus or a pen page change ends it. SudokuPad's
  color tool has the same state for its cell color buttons.

## When SudokuPad changes

The guard is `lib/sudokupad.js`.

- **Features**: a script declares its features, each with the label the console warning and the notice bar call it and the
  SudokuPad internals it needs. A feature that lacks one at startup, or whose own code throws, turns off alone while the rest of
  the script keeps working. Its calls into SudokuPad run under it, so one that throws turns it off; off, it acts as if the script
  lacked it, until the page reloads. Its saved settings go through the guard's store for it.
- **Startup**: every script starts through the guard (`start`; Dark Page, which starts at document-start, through its
  `catchStartup`), so a throw at startup outside every feature turns off one more, labelled startup, under the script's name, and
  the features that had started stay on.
- **Two failures leave a feature on**: a refused write, and a throw in a settings dialog's Save, Copy or Paste (above).
- **The skip line**: a feature that turns off logs `<script>: <feature> skipped because SudokuPad has no <internal>`, or
  `<script>: <feature> skipped because SudokuPad changed:` with the error. The live harness collects every one into `errors`, so a
  suite that asserts `errors` is empty fails on one; a suite that breaks a feature on purpose declares the ones it expects
  (`expectedSkips`). More in `live/README.md` § Errors and skip lines.
- **The notice bar** sits at the bottom of the page, in the one purple every script's bar uses (Pen Tool Extras' and the site's
  accent): "<script>: <features> is/are off because SudokuPad changed.", a Report link to a new issue filled in with the script,
  each feature, its missing internal or error, and SudokuPad's version, and a × that dismisses it. A dismissal is saved per
  SudokuPad version, so a new version shows the bar again; until dismissed it shows on every page load. Where it cannot be saved
  (a page with no SudokuPad version, or a Framework whose saved data is missing or throws) a dismissal holds for the page load
  only.
- **The error log** records every feature the guard turns off, shown on the notice bar or not: one list in the page's
  `localStorage` shared by every script, the newest 50 records, each with the time, script and version, SudokuPad's version, the
  feature, the page address and either the missing internal or the error's message and stack. A missing internal already recorded
  for the same script version and SudokuPad version is not recorded again.
- **A refused write** is a save the browser refuses with `QuotaExceededError` (a full `localStorage`). It is the browser's doing,
  not a SudokuPad change: the guard warns once in the console and puts up a second, plain bar in the notice bar's place,
  "<script>: the browser has no room left, so <feature> could not be saved.", with a × and no Report link, once per page load. The
  feature keeps saving once space frees.

## Saved values

- **Versioned values**: Color by Digit's profiles, Auto Rules Resizer's two limits and sizings, and Text Anywhere's notes are
  saved as `{ v, data }`. A value saved before that is version 0, and a version above the script's own is unreadable.
- **An unreadable value** is one its script's reader refuses (`lib/store.js`), as a later version's shape would be after a
  downgrade. The script goes on with its defaults, and the value as it was is copied under the same key with `_unreadable` added
  (`_unreadable2` and on for a second, different one) before any save can write over it. A kept copy is never replaced.
- With an unreadable value, Text Anywhere shows no notes and saves none on that puzzle until Clear all or Restart, and Color by
  Digit's dialog shows one line saying saved profiles could not be read and are kept, for as long as a copy is kept.
