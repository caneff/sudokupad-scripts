/* eslint-disable no-unused-vars */
// Reads PEN_COLOR_NUMBERS from palette.
/* global PEN_COLOR_NUMBERS */
// SudokuPad's color tool holds its cell color buttons for the same 1000 ms (HoldToEditDelayMs).
const HOLD_TO_EDIT_MS = 1000
// One swatch's side and the gap between swatches; a caller lining its own keys up with the grid uses the same two.
const SWATCH_PX = 34
const SWATCH_GAP_PX = 4
// The pickers over the panel's buttons, in the size SudokuPad's color tool uses for the same job.
const PICKER_INPUT_REM = 2.4
const PICKER_COLUMNS = 3
// The pickers fade in from this scale over this long. They are rare, and ending edit mode takes them away at once.
const PICKER_ENTRY_SCALE = 0.95
const PICKER_ENTRY_MS = 150
// Percent-encoded; its inner quotes are single, so the url("...") wrapper's double quotes hold it.
const CHOICE_ARROW = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M0 0l5 6 5-6z\' fill=\'%236b4fa0\'/%3E%3C/svg%3E")'

const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

const fillWithOpacity = (color, opacity) => opacity < 1 ? `color-mix(in srgb, ${color} ${opacity * 100}%, transparent)` : color

// The dialog's color block: a pulldown above a grid of swatches, three to a row.
// Free mode (no `picked`) makes each swatch a color input; palette mode makes each a button, `picked` the pressed one, and a null swatch an empty cell.
// `options` are `{ value, label, selected, disabled }`; `beside` goes in the grid's row, after it.
// A `fillOpacity` under 1 draws the palette swatches that strong over what is behind them; the border and the pressed ring stay whole.
function renderColorBlock ({ prefix, label, options, swatches, picked, beside = '', fillOpacity = 1 }) {
  const palette = picked !== undefined
  const option = ({ value, label, selected, disabled }) =>
    `<option value="${escapeHtml(value)}"${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}>${escapeHtml(label)}</option>`
  const named = (swatch) => `aria-label="${escapeHtml(swatch.label)}" title="${escapeHtml(swatch.label)}"`
  const swatch = (s) => {
    const head = `class="${prefix}swatch" data-role="swatch"`
    if (!s) return `<span ${head} data-empty="slot"></span>`
    if (!palette) return `<input type="color" ${head} data-key="${escapeHtml(s.key)}" value="${escapeHtml(s.value)}" ${named(s)}>`
    return `<button type="button" ${head} data-key="${escapeHtml(s.key)}" aria-pressed="${s.key === picked}" ${named(s)} style="background:${fillWithOpacity(escapeHtml(s.value), fillOpacity)}"></button>`
  }
  return `<div class="${prefix}color-block">` +
    `<select class="${prefix}color-choice" data-role="color-choice" aria-label="${escapeHtml(label)}">${options.map(option).join('')}</select>` +
    `<div class="${prefix}color-row"><div class="${prefix}swatches">${swatches.map(swatch).join('')}</div>${beside}</div></div>`
}

// `scope` is the dialog's own element (`#id`), so SudokuPad's rules for its dialogs' selects and buttons are outranked without !important.
function colorBlockCss (prefix, scope) {
  const at = (selector) => `${scope} .${prefix}${selector}`
  return [
    `${at('color-block')} { display: grid; justify-items: start; gap: 6px; margin: 6px 0; }`,
    // As wide as the block, whatever its longest option: a select is otherwise as wide as that, and would widen the dialog's column.
    `${at('color-choice')} { box-sizing: border-box; width: 0; min-width: 100%; margin: 0; font-size: 1rem; padding: 4px 28px 4px 10px; border: 1px solid #b9b0c9; border-radius: 6px; appearance: none; color: #222; background: #fff ${CHOICE_ARROW} no-repeat right 10px center; }`,
    `${at('color-row')} { display: flex; align-items: flex-start; gap: 12px; }`,
    `${at('swatches')} { display: grid; grid-template-columns: repeat(${PICKER_COLUMNS}, ${SWATCH_PX}px); gap: ${SWATCH_GAP_PX}px; }`,
    `${at('swatch')} { box-sizing: border-box; display: block; width: ${SWATCH_PX}px; height: ${SWATCH_PX}px; margin: 0; padding: 0; border: 1px solid rgb(0 0 0 / .25); border-radius: 6px; background: none; cursor: pointer; -webkit-appearance: none; appearance: none; }`,
    `${at('swatch')}[data-empty] { border: none; cursor: default; }`,
    `${at('swatch')}[aria-pressed="true"] { border: 2px solid #fff; outline: 3px solid #000; }`,
    `${at('swatch')}::-webkit-color-swatch-wrapper { padding: 0; }`,
    `${at('swatch')}::-webkit-color-swatch { border: none; border-radius: 5px; }`,
    `${at('swatch')}::-moz-color-swatch { border: none; border-radius: 5px; }`
  ].join('\n')
}

// Edit mode's looks, for SudokuPad's tool `tool` (its panel carries `tool-<tool>`): each picker fills the grid cell of its button, whose own picture is hidden under it.
// A picker is out of the flow, so it takes no cell from the buttons the panel places itself.
function pickerCss (prefix, tool) {
  const panel = `.tool-${tool} .controls-input`
  const picker = (n) => `${panel} .${prefix}picker[data-key="${n}"]`
  const rows = PEN_COLOR_NUMBERS.length / PICKER_COLUMNS
  return [
    `.${prefix}editing .controls-input button[data-key]::after { opacity: 0; }`,
    // The button held to open edit mode is still pressed, and the panel's press shrink (lib/panel.js) would leave it a different size from the rest.
    `.tool-${tool}.${prefix}editing .controls-input button[data-key]:active { transform: none; transition: none; }`,
    `.${prefix}editing .${prefix}picker { position: absolute; inset: 0; z-index: 10; animation: ${prefix}picker-in ${PICKER_ENTRY_MS}ms ease-out; }`,
    `@keyframes ${prefix}picker-in { from { opacity: 0; transform: scale(${PICKER_ENTRY_SCALE}); } }`,
    `@media (prefers-reduced-motion: reduce) { .${prefix}editing .${prefix}picker { animation: none; } }`,
    `.${prefix}editing .${prefix}picker input { position: absolute; inset: 0; margin: auto; width: ${PICKER_INPUT_REM}rem; height: ${PICKER_INPUT_REM}rem; padding: 0; pointer-events: all; }`,
    ...PEN_COLOR_NUMBERS.map((n) => `${picker(n)} { grid-row: ${Math.ceil(n / PICKER_COLUMNS)} / span 1; grid-column: ${(n - 1) % PICKER_COLUMNS + 1} / span 1; }`),
    // SudokuPad's Keypad Flipped swaps the first and third rows of buttons, so each picker follows its button.
    ...[[[1, 2, 3], rows], [[7, 8, 9], 1]].flatMap(([keys, row]) => keys.map((n) => `.setting-flipkeypad ${picker(n)} { grid-row: ${row} / span 1; }`))
  ].join('\n')
}

// Every open picker shows the color `colorOf(n)` gives now.
function refreshPickers (prefix, colorOf) {
  document.querySelectorAll(`.${prefix}picker input`).forEach((input) => { input.value = colorOf(input.dataset.key) })
}

// A hold of HOLD_TO_EDIT_MS on one of the tool's nine color buttons, with either mouse button, puts a color picker over each; a picker's input calls `save(n, value)` at once.
// A second hold, or the panel leaving the tool, ends edit mode. `guard` runs each toggle, so a caller can report a failure its own way.
function installHoldToEdit ({ prefix, tool, colorOf, save, guard = (toggle) => toggle() }) {
  const toolClass = `tool-${tool}`
  const editing = `${prefix}editing`
  const pickerClass = `${prefix}picker`
  // A right-click hold ends over a picker in edit mode, and Windows opens the context menu on release, so it is suppressed over the pickers as well as the buttons.
  const targets = `.${toolClass} .controls-input button[data-key], .${toolClass} .${pickerClass} input`
  // SudokuPad keeps one panel element and swaps its `tool-<name>` class for the next tool's, so a class watcher ends edit mode when the panel stops being this tool's.
  let leaveWatch = null

  function exit (panel) {
    if (leaveWatch) leaveWatch.disconnect()
    leaveWatch = null
    panel.classList.remove(editing)
    panel.querySelectorAll(`.${pickerClass}`).forEach((el) => el.remove())
  }

  function enter (panel) {
    // Every button is found before anything changes, so a missing one leaves no half edit mode.
    const buttons = PEN_COLOR_NUMBERS.map((n) => {
      const button = panel.querySelector(`.controls-input button[data-key="${n}"]`)
      if (!button) throw new Error(`${prefix}color-picker: the ${tool} tool has no button for color ${n}`)
      return button
    })
    panel.classList.add(editing)
    buttons.forEach((button, i) => {
      const n = PEN_COLOR_NUMBERS[i]
      button.insertAdjacentHTML('beforebegin', `<div class="${pickerClass}" data-key="${n}"><input type="color" data-key="${n}" value="${escapeHtml(colorOf(String(n)))}"></div>`)
    })
    leaveWatch = new window.MutationObserver(() => {
      if (!panel.classList.contains(toolClass)) exit(panel)
    })
    leaveWatch.observe(panel, { attributes: true, attributeFilter: ['class'] })
  }

  let timer
  let holdDone = false
  const cancel = () => { clearTimeout(timer); timer = undefined }
  // Pointer events carry a mouse button of either kind.
  document.addEventListener('pointerdown', (event) => {
    cancel()
    holdDone = false
    const target = event.target.closest(targets)
    if (!target) return
    const panel = target.closest(`.${toolClass}`)
    timer = setTimeout(() => {
      timer = undefined
      holdDone = true
      if (!panel.classList.contains(toolClass)) return
      guard(() => panel.classList.contains(editing) ? exit(panel) : enter(panel))
    }, HOLD_TO_EDIT_MS)
  }, true)
  window.addEventListener('pointerup', cancel, true)
  window.addEventListener('pointercancel', cancel, true)
  // The browser's menu would open over the picker during a right-click hold: when the press is still going (Linux opens it on press),
  // or after the hold has run its course (Windows opens it on release, over the picker that appeared under the pointer).
  // A quick right-click on a button, released before the delay, keeps its menu on Windows.
  document.addEventListener('contextmenu', (event) => {
    if ((timer !== undefined || holdDone) && event.target.closest(targets)) event.preventDefault()
  }, true)
  document.addEventListener('input', (event) => {
    const input = event.target
    if (input.matches(`.${pickerClass} input`)) save(input.dataset.key, input.value)
  })
}
