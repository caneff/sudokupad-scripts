// A fake page for the fuzz's unit tests (`openTarget(puzzle)` keeps the puzzle it was opened for): the env of `actions.mjs` with every call recorded, and optionally a page error or a broken rule planted on an
// interruption. Not a check itself.

// A snapshot `page` (shape in `rules.mjs`) in which every rule holds: a board with nothing on it, a dark page, rules that fit and a number pad of digits.
export const quietPage = (overrides = {}) => ({
  undoDepth: 3,
  cells: ['', '', ''],
  penState: [],
  penDrawn: [],
  notesSaved: null,
  notesDrawn: [],
  notesSeen: [],
  colorByDigit: { mode: 'Cell', groups: [{ key: '1', digits: ['1', '2'] }], cells: [{ digit: '', given: false, colours: [] }, { digit: '', given: false, colours: [] }, { digit: '', given: false, colours: [] }] },
  pageColor: 'rgb(0, 0, 0)',
  rulesPane: { fontPx: 17.6, ownFontPx: 17.6, scrollHeight: 300, clientHeight: 300 },
  letterMode: false,
  noteBoxes: [],
  ...overrides
})

// Opens fake targets; each has the `log` of every env and Playwright call it saw. `plantEscapeError` (true, or the name of the one puzzle it happens on) throws a page error when Escape is pressed
// while a mouse button is down, the interruption the live smoke test plants on the real page too; it lands only after the next `wait`, as a
// timer's error lands after the action returned, so the tests need no clock. `withNote` starts the page with a note drawn. `whitenOnBlur` turns the page
// white when the window blurs, which breaks the Dark Page rule; `whitenOnWait` makes it so only after the next wait; `lettersOnTab` turns the number pad to letters on Tab, which breaks the Tab rule, and `lettersOnBlur` does it on a blur, which breaks no rule; `lettersOnRedo` does it on a redo, which breaks only the rule that a redo after an undo restores the page (the fake's undo stack is a count: undo takes one off, redo puts one back).
export function fakeTargets ({ plantEscapeError = false, withNote = true, whitenOnBlur = false, whitenOnWait = false, lettersOnTab = false, lettersOnBlur = false, lettersOnRedo = false } = {}) {
  const targets = []
  const openTarget = async (puzzle) => {
    const log = []
    const errors = []
    const pending = []
    let down = 0
    let notes = withNote ? 1 : 0
    let pageColor = 'rgb(0, 0, 0)'
    let letterMode = false
    let undoDepth = 3
    let whitenPending = false
    const rec = (name, result) => async (...args) => { log.push([name, ...args]); return result }
    const page = {
      mouse: {
        move: rec('mouse.move'),
        click: rec('mouse.click'),
        down: async (...a) => { down++; log.push(['mouse.down', ...a]) },
        up: async (...a) => { down = Math.max(0, down - 1); log.push(['mouse.up', ...a]) }
      },
      keyboard: {
        type: rec('keyboard.type'),
        press: async (key) => {
          log.push(['keyboard.press', key])
          if (lettersOnTab && key === 'Tab') letterMode = true
          if ((plantEscapeError === true || plantEscapeError === puzzle?.name) && key === 'Escape' && down > 0) pending.push('Error: planted page error')
        }
      }
    }
    const env = {
      page,
      cellPoint: rec('cellPoint', [100, 100]),
      noteCentre: async () => { log.push(['noteCentre']); return notes ? [200, 200] : null },
      usePen: rec('usePen'),
      useNotes: rec('useNotes'),
      turnPenPage: rec('turnPenPage'),
      undo: async () => { log.push(['undo']); undoDepth = Math.max(0, undoDepth - 1) },
      redo: async () => { log.push(['redo']); undoDepth++; if (lettersOnRedo) letterMode = true },
      undoAll: async () => { log.push(['undoAll']); undoDepth = 0 },
      clickColorMode: rec('clickColorMode'),
      placeNote: async (...a) => { log.push(['placeNote', ...a]); notes++ },
      extrasSettings: rec('extrasSettings'),
      sliderPoint: async (name, fraction) => { log.push(['sliderPoint', name, fraction]); return [100 + fraction * 200, 300] },
      focusSlider: rec('focusSlider'),
      leaveSlider: rec('leaveSlider'),
      noteBoxDialog: rec('noteBoxDialog'),
      setNoteBackground: rec('setNoteBackground'),
      useArrowPen: rec('useArrowPen'),
      resize: rec('resize'),
      blurFocus: async (...a) => { log.push(['blurFocus', ...a]); if (whitenOnBlur) pageColor = 'rgb(255, 255, 255)'; if (whitenOnWait) whitenPending = true; if (lettersOnBlur) letterMode = true },
      reload: rec('reload'),
      darkPage: rec('darkPage')
    }
    const target = {
      env,
      puzzle,
      log,
      closed: false,
      snapshot: async () => ({ errors: [...errors], notices: [], page: quietPage({ pageColor, letterMode, undoDepth }) }),
      wait: async (ms) => {
        if (ms <= 0) return
        errors.push(...pending.splice(0))
        if (whitenPending) pageColor = 'rgb(255, 255, 255)'
      },
      errorLog: async () => ['dark-page@1.0.0: saved color: TypeError: planted'],
      close: async () => { target.closed = true }
    }
    targets.push(target)
    return target
  }
  return { openTarget, targets }
}
