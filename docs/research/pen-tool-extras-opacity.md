# Pen mark opacity (SudokuPad, 2026-11-03)

Read from `tool-pen.css` and from the computed style on sudokupad.app.

- Every pen mark (`.cell-pen`) is drawn with `opacity: 0.8`, so pen marks are already slightly see-through.
  The drag hints (`.penhint` 0.6, `.pencolor-erase` 0.5) are not marks. The Pen Tool Extras opacity slider's
  default is 80 and it sets `opacity` through `:root:root .cell-pen`.
- A free line is not one element. A drag makes one `<path>` per segment (pen values `d`, `e`, `2` for the
  diagonals and joints in the probe), all siblings in one `<g>`. Opacity applies to each path alone, so
  where segments meet or cross they composite, today and at any slider value.
- Measured with `pen-tool-extras-opacity-screenshot.mjs` (pen color 4, rgb(113, 159, 23), on white),
  red channel: one segment, then the middle of a cell where the segments of two crossing strokes meet:

  | opacity | one segment | where segments meet |
  | --- | --- | --- |
  | 80 (today) | 141 | 112 |
  | 100 | 113 | 113 |
  | 30 | 212 | 147 |

  A self-crossing stroke reads the same as two strokes crossing. So the overlap darkening is no more than
  today's in relative terms, but at 30 a joint covers about 0.76 of the color against 0.30 on the segment,
  which shows more than 0.99 against 0.80 does today.
