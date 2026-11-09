# Text Annotation: work per pointer move, before and after #426

Measured 2026-11-07 by `live/text-anywhere/text-anywhere-render.live.mjs` (headless Chromium on the WSL box, the recorded puzzle, 1200x900),
with 30 notes planted over the first eight rows. The pointer moves are dispatched from the page, four to a frame, as a mouse sends several moves
a frame. A frame's work is its four dispatches plus the time from a frame callback asked for before them to one asked for after them, which
forces style and layout. Two runs each.

| Case | 0.21.2 (before) | 0.21.3 (after) |
| --- | --- | --- |
| Drag of 2 selected notes, 10 frames of 4 moves | median 4.80-5.40 ms, max 5.10-5.90 ms a frame | median 1.00-1.10 ms, max 1.40 ms a frame |
| Another tool current, 10 frames of 4 moves over the notes | median 0.50-0.60 ms, max 0.80-0.90 ms; 1065 `getBoundingClientRect` calls on notes over 40 moves (one move a frame) | median 0.30 ms, max 0.40-0.50 ms; 0 calls |
| Redraw that changes only the selection | every note removed, drawn and measured again | no note measured |
| Board resize | every note removed and drawn again | one style write, to the on-board group |
| Class change on the board's box, board not moved | every note removed and drawn again | nothing written, no redraw |

Both versions stay under a 16 ms frame on this box, so the under-a-frame check passes on either: what tells them apart is the work per frame, which
grew with every move the mouse sent (each one redrew all 30 notes) and is now one update a frame. Chris's report of a jerky drag was on his own
Windows browser and mouse, which this run does not reproduce: a check there is still owed.

Text crispness at a fractional board scale (0.953, viewport 1037x811), the on-board notes drawn under the board's transform after
#426: `render-crisp-0.21.2.png` (before) and `render-crisp-0.21.3.png` (after) show the same sharpness.
