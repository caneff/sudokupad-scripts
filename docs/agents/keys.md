# Keys

Read before you propose, add or change a keyboard shortcut in any script.

**The rule** (Chris, 2026-11-21): a script's tool treats keys as SudokuPad's own pen tool does.

- **A key the pen tool acts on stays SudokuPad's.** A design never proposes one as a script's shortcut: Tab, Space, PageUp and PageDown, the tool
  hotkeys Z X C V B N M, `/`, and the modifiers Ctrl, Cmd, Shift and Alt. The modifiers switch the tool while held, so every chord with one
  (Ctrl+A included) is off the table.
- **A key the pen tool ignores is free while a script's tool is current:** the digit keys, `+` and `-`. Pen Tool Extras picks a pen with a digit
  key and steps Thickness with `+` and `-`; Text Anywhere steps Size with them.
- **A key typed into a script's own text field is free.** Ctrl+Enter closes a Text Anywhere note, and stays.

Sources: `docs/research/sudokupad-pen-tool.md` (§ Holding a modifier leaves the pen tool, § + and -), `docs/research/sudokupad-custom-tool.md`
§ Tool keys, `docs/research/sudokupad-letter-tool.md` and `docs/research/sudokupad-color-tool-paging.md`. The research does not say what
SudokuPad does with Ctrl+Enter while a text field has the focus.
