// The middle of the part of `box` ({ x, y, width, height }, as Playwright gives it) that lies inside a window of `[width, height]` pixels: the point a player can press. null when none of the box is in the window.
export function visiblePoint (box, [width, height]) {
  const [left, right] = [Math.max(box.x, 0), Math.min(box.x + box.width, width)]
  const [top, bottom] = [Math.max(box.y, 0), Math.min(box.y + box.height, height)]
  return right > left && bottom > top ? [(left + right) / 2, (top + bottom) / 2] : null
}
