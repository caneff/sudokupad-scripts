// A fake page for the fuzz's unit tests (`actions.test.mjs`, `engine.test.mjs`): the env of `actions.mjs` with every call recorded, and optionally a page
// error planted on an interruption. Not a check itself.

// Opens fake targets; each has the `log` of every env and Playwright call it saw. `plantEscapeError` throws a page error, 2 ms later as a timer would, when
// Escape is pressed while a mouse button is down, the interruption the live smoke test plants on the real page too.
export function fakeTargets ({ plantEscapeError = false, errorLog = ['dark-page@1.0.0: saved color: TypeError: planted'] } = {}) {
  const targets = []
  const openTarget = async () => {
    const log = []
    const errors = []
    let down = 0
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
          if (plantEscapeError && key === 'Escape' && down > 0) setTimeout(() => errors.push('Error: planted page error'), 2)
        }
      }
    }
    const env = {
      page,
      cellPoint: rec('cellPoint', [100, 100]),
      noteCentre: rec('noteCentre', [200, 200]),
      usePen: rec('usePen'),
      useNotes: rec('useNotes'),
      turnPenPage: rec('turnPenPage'),
      undo: rec('undo'),
      redo: rec('redo'),
      clickColorMode: rec('clickColorMode'),
      placeNote: rec('placeNote'),
      resize: rec('resize'),
      blurFocus: rec('blurFocus'),
      reload: rec('reload'),
      darkPage: rec('darkPage')
    }
    const target = { env, log, closed: false, snapshot: async () => ({ errors: [...errors], notices: [] }), errorLog: async () => errorLog, close: async () => { target.closed = true } }
    targets.push(target)
    return target
  }
  return { openTarget, targets }
}
