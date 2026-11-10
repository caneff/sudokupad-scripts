// Shared by the live checks: a panel slider set with the real mouse. Not a check itself, so `live/**/*.live.mjs` skips it.

// The slider thumb's width in rem, as lib/panel.js's SLIDER_THUMB_REM draws it.
export const SLIDER_THUMB_REM = 1.1

// Presses on `slider`'s track where `value` lies and releases, with real mouse input. The thumb's centre runs from half a thumb in from each end of the track.
// A press on the thumb drags it by the offset it was pressed at and does not jump, so when the thumb is under the target the track is first pressed at its other end.
export async function slideTo (p, slider, value) {
  const { box, min, max, thumb, now } = await p.evaluate(([selector, rem]) => {
    const input = document.querySelector(selector)
    const { x, y, width, height } = input.getBoundingClientRect()
    return { box: { x, y, width, height }, min: Number(input.min), max: Number(input.max), now: Number(input.value), thumb: rem * parseFloat(window.getComputedStyle(document.documentElement).fontSize) }
  }, [slider, SLIDER_THUMB_REM])
  const xOf = (v) => box.x + thumb / 2 + (box.width - thumb) * (v - min) / (max - min)
  const y = box.y + box.height / 2
  if (Math.abs(xOf(now) - xOf(value)) < thumb && now !== value) await p.mouse.click(xOf(value <= (min + max) / 2 ? max : min), y)
  await p.mouse.click(xOf(value), y)
}
