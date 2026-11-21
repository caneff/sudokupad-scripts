// Shared by the live checks: a panel slider set with the real mouse, and attack 17 (a slider drag with a tool hotkey mid-drag). Not a check itself, so `live/**/*.live.mjs` skips it.

import assert from 'node:assert/strict'
import { savedState, savedValue } from './settings.mjs'
import { stable } from './settle.mjs'
import { OTHER_TOOL, OTHER_TOOL_KEY } from './attacks.mjs'

// The slider thumb's width in rem, as lib/panel.js's SLIDER_THUMB_REM draws it.
const SLIDER_THUMB_REM = 1.1

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

// Attack 17, for any script's panel slider.
// Drags `slider` across its track, presses a tool hotkey mid-drag and releases elsewhere. The drag ends: the new tool stays current, the saved value
// under `key` is the one the slider shows, and once `returnToTool()` brings the script's tool back the slider answers a click and keeps no focus.
export async function assertSliderDragEndsOnHotkey (p, { slider, key, tool, returnToTool, errors, sliders }) {
  const valueOf = () => p.evaluate((s) => Number(document.querySelector(s).value), slider)
  const before = await valueOf()
  const box = await p.locator(slider).boundingBox()
  const y = box.y + box.height / 2
  await p.mouse.move(box.x + box.width * 0.1, y)
  await p.mouse.down()
  await p.mouse.move(box.x + box.width * 0.9, y, { steps: 12 })
  assert.notEqual(await stable(valueOf), before, 'the drag moved the slider')
  await p.keyboard.press(OTHER_TOOL_KEY)
  assert.equal(await tool(), OTHER_TOOL, 'the hotkey switched the tool')
  await p.mouse.move(box.x + box.width * 0.3, y, { steps: 4 })
  await p.mouse.up()
  assert.equal(await tool(), OTHER_TOOL, 'the release kept the new tool')
  await returnToTool()
  const saved = await savedValue(p, key)
  assert.notEqual(saved, null, `${key} is saved`)
  assert.equal(Number(savedState(saved)), await valueOf(), 'the saved value is the one the slider shows')
  const resting = await valueOf()
  const { min, max } = await p.evaluate((s) => ({ min: Number(document.querySelector(s).min), max: Number(document.querySelector(s).max) }), slider)
  // The end of the track farther from the resting value, so a click cannot land on the value the drag left.
  await slideTo(p, slider, resting - min > max - resting ? min : max)
  assert.notEqual(await stable(valueOf), resting, 'the slider answers a click again')
  assert.equal(await p.evaluate((s) => document.activeElement?.matches(`${s} input`) === true, sliders), false, 'no slider keeps the focus')
  assert.deepEqual(errors, [], 'the page shows no error')
}
