# The halo as a `text-shadow` ring (#423)

Chris, 2026-11-07: the halo "looks funky on some letters, like capital A".

- **Cause.** The halo was `-webkit-text-stroke` with `paint-order: stroke fill`. `-webkit-text-stroke` joins with miters, and
  `stroke-linejoin: round` does not apply to it, so sharp corners (A's apex, V, W, M, 4) grew long page-colored spikes. An SVG
  `feMorphology` dilate has a square kernel and gives blocky corners.
- **Fix.** Sixteen zero-blur `text-shadow`s on a circle of the halo's reach, in em so they follow the note's font size
  (`haloShadow` in `draw-tool.user.js`). Reach is a share of the text size: Thinner 0.07, Thicker 0.14 (the old halo; ids `thin` and `medium`).
  Off drops the shadows, as does a note with a background box. A third, thicker choice (0.24) was dropped by Chris.
- **Blur check.** `halo-ring-blur-check.png` draws "AVWMk4" at Thinner and Thicker with a 0px and a 1px blur on a red backdrop
  (the same ring, `haloShadow(outline, '#fff')` with `0` or `1px` for the blur). At desktop sizes the hard ring shows faint
  facets at the largest sizes; a 1px blur smooths them but also softens the Thinner edge, and sixteen blurred shadows cost more to
  draw per note. Kept **no blur**.
- **The check.** `live/text-anywhere/text-anywhere-outline.live.mjs` draws "AVWMk4" as letters and as the ring alone, and counts ring
  pixels more than 1.5px past the radius from any letter pixel, the radius being the outline's reach typed into the test: none
  at Thinner or Thicker. It applies the note's computed `text-shadow` to an overlay it builds, so it checks the ring, not
  the note's other CSS; `live/text-anywhere/text-anywhere-text.live.mjs` checks the note has no `-webkit-text-stroke`. A ring with
  every fourth shadow three times too far out fails it (Thinner: 2142 pixels past the radius).
