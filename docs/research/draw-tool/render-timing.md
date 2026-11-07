# Text Annotation: work per pointer move, before and after #426

Measured 2026-11-07 by `live/draw-tool/draw-tool-render.live.mjs` (headless Chromium on the WSL box, the recorded puzzle, 1200x900),
with 30 notes planted over the first eight rows. Each pointer move is dispatched from the page; its work is the dispatch's time plus the
time from a frame callback asked for before it to one asked for after it, which forces style and layout. One move per frame.

| Case | 0.21.2 (before) | 0.21.3 (after) |
| --- | --- | --- |
| Drag of 2 selected notes, 40 moves | median 1.40 ms, 90th 1.90 ms, max 2.10 ms | median 0.50-0.60 ms, 90th 0.70 ms, max 0.90 ms |
| Another tool current, 40 moves over the notes | median 0.20 ms, max 0.70 ms; 1065 `getBoundingClientRect` calls on notes | median 0.20 ms, max 0.40 ms; 0 calls |
| Board resize | every note removed and drawn again | one style write, to the on-board box |
| Class change on the board's box, board not moved | every note removed and drawn again | nothing written |

Both versions stay well under a 16 ms frame on this box with one move per frame. The before cost grows with every move the mouse sends
in a frame (each one redrew all 30 notes); the after code does a frame's moves once. Chris's report of a jerky drag was on his own
Windows browser and mouse, which this run does not reproduce: it is still owed a check there.

Text crispness at a fractional board scale (0.953, viewport 1037x811), the on-board notes drawn under the board's transform after
#426: `render-crisp-0.21.2.png` (before) and `render-crisp-0.21.3.png` (after) show the same sharpness.
