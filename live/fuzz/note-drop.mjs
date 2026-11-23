// Where the fuzz drops a Text Anywhere note it drags off a button (#944, #1060). Pure, so `note-drop.test.mjs` runs it in `npm test`.

// The note's centre when dropped there would leave the point `button` under the note (or its handle, `reach` px past the note's box).
const covers = ([cx, cy], [width, height], reach, button) => Math.abs(cx - button[0]) < width / 2 + reach && Math.abs(cy - button[1]) < height / 2 + reach

// A sweep of the page in steps of this many px, the nearest the board's middle first; its centres stay this far inside the window's edge.
const GRID_STEP_PX = 20

// The board's middle unless the note would still cover a button there (a wide note on a small board does, and a drag from the middle to the middle moves nothing). Then the sweep point
// nearest the middle that clears every point of `avoid`, the press points of all buttons (a note wide enough for two buttons uncovers one by covering the other), preferring a note
// wholly on the page: the script only keeps a note's middle in the window, so a note may hang off the edge. `reach` is a handle's size, 0 when the note itself covers the button at `at`.
// With no place that clears `avoid`, one that clears `at`; with none of those, the middle: the caller's tries then run out and fail.
export function noteDrop (middle, { size, reach, at: button, avoid = [button] }, page) {
  const [width, height] = size
  const sweep = []
  for (let x = GRID_STEP_PX; x < page[0]; x += GRID_STEP_PX) for (let y = GRID_STEP_PX; y < page[1]; y += GRID_STEP_PX) sweep.push([x, y])
  sweep.sort((a, b) => Math.hypot(a[0] - middle[0], a[1] - middle[1]) - Math.hypot(b[0] - middle[0], b[1] - middle[1]))
  const whole = ([cx, cy]) => cx - width / 2 >= 0 && cy - height / 2 >= 0 && cx + width / 2 <= page[0] && cy + height / 2 <= page[1]
  const places = [middle, ...sweep]
  for (const points of [avoid, [button]]) {
    const clear = (c) => !points.some((point) => covers(c, size, reach, point))
    const found = places.find((c) => whole(c) && clear(c)) ?? places.find(clear)
    if (found) return found
  }
  return middle
}
