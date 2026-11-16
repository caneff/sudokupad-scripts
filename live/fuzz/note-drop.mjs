// Where the fuzz drops a Text Anywhere note it drags off a button (#944). Pure, so `note-drop.test.mjs` runs it in `npm test`.

// The note's centre when dropped there would leave the point `button` under the note (or its handle, `reach` px past the note's box).
const covers = ([cx, cy], [width, height], reach, button) => Math.abs(cx - button[0]) < width / 2 + reach && Math.abs(cy - button[1]) < height / 2 + reach

// What a player does: the board's middle, unless a note that wide would still cover the button there (a wide note on a small board does, and a drag from the middle to the
// middle moves nothing). Then the first of just left of, just above, just right of and just below the button that clears it and keeps the whole note on the page.
// `reach` is a handle's size, 0 when the note itself covers the button; `page` is the window's size. With none, the middle: the caller's tries then run out and fail.
export function noteDrop (middle, { size, reach, at: button }, page) {
  if (!covers(middle, size, reach, button)) return middle
  const [width, height] = size
  const gap = reach + 4
  const candidates = [
    [button[0] - gap - width / 2, middle[1]],
    [middle[0], button[1] - gap - height / 2],
    [button[0] + gap + width / 2, middle[1]],
    [middle[0], button[1] + gap + height / 2]
  ]
  const onPage = ([cx, cy]) => cx - width / 2 >= 0 && cy - height / 2 >= 0 && cx + width / 2 <= page[0] && cy + height / 2 <= page[1]
  return candidates.find((c) => onPage(c) && !covers(c, size, reach, button)) ?? middle
}
