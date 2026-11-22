# Auto Rules Resizer

> [!WARNING]
> **This script can break at any time, and there are no guarantees.** It relies on SudokuPad's internals, which aren't a public API, so any SudokuPad update can break it without notice.

The full reference. How the pane fits, the f+ and f- buttons, the drag corners and the dialog's two limits are in the README's script notes; this page adds what is saved. What every script shares, the settings dialog and the guard, is in [What every script shares](shared.md).

## The font offset

The px f+ and f- add to or take from the automatic font size, one a press, the font kept between 70% and 150% of SudokuPad's own. A press the floor or the cap cancels is not kept, so an offset stopped at either can be a fraction of a px.

## A puzzle's sizing

Each puzzle keeps its own sizing of the rules pane: its font offset and its dragged box (how far the two drag corners grew or shrank the pane, and moved the controls column).

- It is saved under `AutoRulesResizer_sizing_<puzzle>` (the puzzle's id, else its page URL) as `{ nudgePx, box }`, `nudgePx` being the font offset's stored name.
- Only f+, f-, a corner drag or Reset puzzle size changes it. A window too small for all of it, or an automatic size already at the cap, applies less of it and leaves what is saved alone.
- A puzzle never resized has no key and starts at the default, no offset and no drag.
- Reset puzzle size in the dialog clears the current puzzle's at once. The dialog's Restore defaults only empties the two limit boxes, for Save or Cancel to decide.
