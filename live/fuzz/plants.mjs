// The bugs the fuzz is measured against (#678): each is a find-and-replace on the text of one `*.user.js`, applied when the fuzz injects the script, so the files on
// disk never hold a bug. `kind` is how the bug should show: a broken rule (`rules.mjs`) or a crash signal (`signals.mjs`); `expect` matches the failure message that
// counts as catching it, so a failure the real scripts already have is not scored as a catch. Not a check itself; `plants.test.mjs` checks every find text still matches.

export const PLANTS = [
  {
    id: 'tab-turns-pad-to-letters',
    file: 'ui-tweaks.user.js',
    kind: 'rule',
    bug: 'UI Tweaks leaves Tab\'s own handler in place, so Tab turns the number pad to letters',
    find: '{ ...entry, handler: inert }',
    replace: '{ ...entry }',
    expect: /tab-not-letters/
  },
  {
    id: 'tab-handler-typo',
    file: 'ui-tweaks.user.js',
    kind: 'crash',
    bug: 'UI Tweaks\' Tab handler calls a misspelled method, a page error on every Tab',
    find: 'function ignoreKey (event) {\n    event.preventDefault()',
    replace: 'function ignoreKey (event) {\n    event.preventDefalt()',
    expect: /crash signal/
  },
  {
    id: 'digit-five-wrong-group',
    file: 'color-by-digit.user.js',
    kind: 'rule',
    bug: 'Color by Digit gives a 5 the color of a 4',
    find: ': keyOfDigit[placed]\n',
    replace: ': keyOfDigit[placed === \'5\' ? \'4\' : placed]\n',
    expect: /digit-cells-colored/
  },
  {
    id: 'mode-not-saved',
    file: 'color-by-digit.user.js',
    kind: 'rule',
    bug: 'Color by Digit saves Cell as its mode whichever mode was picked, so a reload changes the mode',
    find: 'writeData(MODE_KEY, next)',
    replace: 'writeData(MODE_KEY, \'cell\')',
    expect: /reload-changes-nothing/
  },
  {
    id: 'note-dropped-on-load',
    file: 'draw-tool.user.js',
    kind: 'rule',
    bug: 'Text Anywhere drops the first saved note when it loads them',
    find: 'drawing = items\n      keptEntries = kept',
    replace: 'drawing = items.slice(1)\n      keptEntries = kept',
    expect: /notes-survive-reload|notes-saved-match-drawn/
  },
  {
    id: 'load-logs-console-error',
    file: 'draw-tool.user.js',
    kind: 'crash',
    bug: 'Text Anywhere logs a console.error every time it loads the saved notes',
    find: '    forgetRestarted()\n    if (!storage.off) {',
    replace: '    forgetRestarted()\n    console.error(\'draw-tool: restart cache not cleared\')\n    if (!storage.off) {',
    expect: /crash signal/
  },
  {
    id: 'dark-page-saves-light',
    file: 'dark-page.user.js',
    kind: 'rule',
    bug: 'Dark Page paints a saved color as a light gray',
    find: '    pageColor = color\n    style.textContent = buildCss(pageColor)\n  }\n\n  const CLASS_PREFIX',
    replace: '    pageColor = color === DEFAULT_COLOR ? color : \'#f4f4f4\'\n    style.textContent = buildCss(pageColor)\n  }\n\n  const CLASS_PREFIX',
    expect: /page-stays-dark/
  },
  {
    id: 'rules-always-fit',
    file: 'auto-rules-resizer.user.js',
    kind: 'rule',
    bug: 'Auto Rules Resizer counts a size as fitting when the rules overflow by up to 200 px, so the text is left too large',
    find: 'rules.scrollHeight <= Math.min(room, rules.clientHeight)',
    replace: 'rules.scrollHeight <= Math.min(room, rules.clientHeight) + 200',
    expect: /rules-fit-pane/
  },
  {
    id: 'page-three-line-not-drawn',
    file: 'pen-tool-extras.user.js',
    kind: 'rule',
    bug: 'Pen Tool Extras draws nothing for a page 3 line, though the state holds it',
    find: 'return forward === null ? stock(opts) : renderArrowLine(this, opts, forward)',
    replace: 'return forward === null ? stock(opts) : undefined',
    expect: /pen-lines-drawn/
  },
  {
    id: 'redraw-typo',
    file: 'pen-tool-extras.user.js',
    kind: 'crash',
    bug: 'Pen Tool Extras\' redraw of the pen cells calls a method that does not exist, a page error whenever it redraws',
    find: 'cell.renderContent(true)',
    replace: 'cell.renderContents(true)',
    expect: /crash signal/
  }
]

export function plantById (id) {
  const plant = PLANTS.find((p) => p.id === id)
  if (!plant) throw new Error(`no plant "${id}"; known: ${PLANTS.map((p) => p.id).join(', ')}`)
  return plant
}

// The script's text with the bug in it. A find text that matches anywhere but once is an error: a script that changed under the plant must not run unplanted.
export function applyPlant (plant, code) {
  const matches = code.split(plant.find).length - 1
  if (matches !== 1) throw new Error(`plant ${plant.id}: the text to find (${JSON.stringify(plant.find)}) in ${plant.file} matches ${matches} times, not once`)
  return code.replace(plant.find, () => plant.replace)
}

// What `installAll` takes: every script as it is, the plant's script with the bug.
export const plantPatch = (plant) => (file, code) => (file === plant.file ? applyPlant(plant, code) : code)
