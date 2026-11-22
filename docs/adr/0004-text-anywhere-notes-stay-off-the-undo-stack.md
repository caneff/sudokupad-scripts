# Text Anywhere's notes stay off SudokuPad's undo stack

Status: accepted, 2026-11-10 (Chris, 2026-11-10)

Text Anywhere's notes are not undo steps in SudokuPad. Undo and Redo never touch a note, with one exception that is not a
history: after Restart, the Undo that finds SudokuPad's undo stack empty brings back the notes Restart cleared
(`TextAnywhere_restarted_*`; GLOSSARY.md, Text Anywhere). Inside an open note, Ctrl+Z and Ctrl+Y undo typing (#657), which is the
text box's own history.

Why (Chris's ruling): putting notes on SudokuPad's undo stack would put them in the replay, and a history interleaved with
SudokuPad's must catch every Undo first, which risks digit Undo for a small gain. A bug in the interleaving would damage the
solver's digits, the part of SudokuPad that must not break.

No ticket proposes either direction. The idea "Ctrl+Z undoes note changes, one gesture at a time" is item 19 of
`docs/research/text-anywhere/micro-interaction-polish.md`, and this record is why it is not built.
