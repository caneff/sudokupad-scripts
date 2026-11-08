// A fake page for the fuzz's unit tests: the env of `actions.mjs` with every call recorded, and optionally a page error planted on an interruption.
// Not a check itself.

// Opens fake targets; each has the `log` of every env and Playwright call it saw. `plantEscapeError` throws a page error when Escape is pressed
// while a mouse button is down, the interruption the live smoke test plants on the real page too; it lands only after the next `wait`, as a
// timer's error lands after the action returned, so the tests need no clock. `withNote` starts the page with a note drawn.
export function fakeTargets ({ plantEscapeError = false, withNote = true } = {}) {
  const targets = []
  const openTarget = async () => {
    const log = []
    const errors = []
    const pending = []
    let down = 0
    let notes = withNote ? 1 : 0
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
          if (plantEscapeError && key === 'Escape' && down > 0) pending.push('Error: planted page error')
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
      undo: rec('undo'),
      redo: rec('redo'),
      clickColorMode: rec('clickColorMode'),
      placeNote: async (...a) => { log.push(['placeNote', ...a]); notes++ },
      extrasDialog: rec('extrasDialog'),
      resize: rec('resize'),
      blurFocus: rec('blurFocus'),
      reload: rec('reload'),
      darkPage: rec('darkPage')
    }
    const target = {
      env,
      log,
      closed: false,
      snapshot: async () => ({ errors: [...errors], notices: [] }),
      wait: async (ms) => { if (ms > 0) errors.push(...pending.splice(0)) },
      errorLog: async () => ['dark-page@1.0.0: saved color: TypeError: planted'],
      close: async () => { target.closed = true }
    }
    targets.push(target)
    return target
  }
  return { openTarget, targets }
}
