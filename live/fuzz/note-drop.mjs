// Where the fuzz drops a Text Anywhere note it drags off a button (#944, #1060). Pure, so `note-drop.test.mjs` runs it in `npm test`.

// The note's centre when dropped there would leave the point `button` under the note (or its handle, `reach` px past the note's box).
const covers = ([cx, cy], [width, height], reach, button) => Math.abs(cx - button[0]) < width / 2 + reach && Math.abs(cy - button[1]) < height / 2 + reach

const GRID_STEP_PX = 20

// What a player does: the board's middle, unless a note that wide would still cover the button there (a wide note on a small board does, and a drag from the middle to the
// middle moves nothing). Then the first of just left of, just above, just right of and just below the button that clears it and keeps the whole note on the page.
// `reach` is a handle's size, 0 when the note itself covers the button; `page` is the window's size. `avoid` is every button's press point (#1060): a note wide enough to
// cover two buttons at once is dropped clear of all of them, else clearing one puts it back over the other. With no place that does, the one button `at` is cleared as before.
// A note need not stay wholly on the page: the script only keeps its middle inside the window, so the places with the middle on the page come after the wholly-on-page ones,
// as a sweep of the page nearest the board's middle first. With none, the middle: the caller's tries then run out and fail.
export function noteDrop (middle, { size, reach, at: button, avoid = [button] }, page) {
  const [width, height] = size
  const gap = reach + 4
  const clear = (points) => (c) => !points.some((point) => covers(c, size, reach, point))
  const whole = ([cx, cy]) => cx - width / 2 >= 0 && cy - height / 2 >= 0 && cx + width / 2 <= page[0] && cy + height / 2 <= page[1]
  const reachable = ([cx, cy]) => cx >= 0 && cy >= 0 && cx <= page[0] - 1 && cy <= page[1] - 1
  const beside = [
    [button[0] - gap - width / 2, middle[1]],
    [middle[0], button[1] - gap - height / 2],
    [button[0] + gap + width / 2, middle[1]],
    [middle[0], button[1] + gap + height / 2]
  ]
  const sweep = []
  for (let x = 0; x < page[0]; x += GRID_STEP_PX) for (let y = 0; y < page[1]; y += GRID_STEP_PX) sweep.push([x, y])
  const nearest = (a, b) => Math.hypot(a[0] - middle[0], a[1] - middle[1]) - Math.hypot(b[0] - middle[0], b[1] - middle[1])
  sweep.sort(nearest)
  const places = [middle, ...beside, ...sweep]
  for (const points of [avoid, [button]]) {
    const ok = clear(points)
    const found = places.find((c) => whole(c) && ok(c)) ?? places.find((c) => reachable(c) && ok(c))
    if (found) return found
  }
  return middle
}
