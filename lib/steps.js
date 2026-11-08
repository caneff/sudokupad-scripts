/* eslint-disable no-unused-vars */
/* global Framework */
// A script installs in steps, each in its own guard, so a SudokuPad change switches off only the step it breaks. Every skip is one console
// line `<script>: <step> skipped: <reason>`, which the live tests match on.

// A step stays off once skipped, so its error is warned once and not on every event.
function createStep (script, label, skipped, onSkip = () => {}) {
  const off = (reason, ...detail) => {
    step.off = true
    skipped.push(label)
    console.warn(`${script}: ${label} skipped: ${reason}`, ...detail)
  }
  const step = {
    label,
    off: false,
    // Before the step was installed: nothing of it is there to undo.
    lack (member) {
      if (!step.off) off(`SudokuPad has no ${member}`)
    },
    skip (why) {
      if (step.off) return
      off('SudokuPad changed:', why)
      try {
        onSkip()
      } catch (error) {
        // Best effort: the step is off already, and what it left behind stays until the page reloads.
        console.warn(`${script}: could not undo ${label}:`, error)
      }
    },
    run (fn, fallback = () => {}) {
      if (step.off) return fallback()
      try {
        return fn()
      } catch (error) {
        step.skip(error)
        return fallback()
      }
    },
    // SudokuPad's code runs only through `stock` or `stock.sudokupad`, so a throw from it passes through as SudokuPad's own. After the
    // body's own throw, the original runs only if nothing was sent for this event: a click half sent must not be sent again. A call
    // that sends nothing (`stock.sudokupad(fn, false)`) leaves the original to run.
    wrap (owner, name, body) {
      const original = owner[name]
      owner[name] = function (...args) {
        if (step.off) return original.apply(this, args)
        let reached = false
        let result
        let failure = null
        const sudokupad = (fn, sends = true) => {
          if (sends) reached = true
          try {
            return fn()
          } catch (error) {
            failure = { error }
            throw error
          }
        }
        const stock = (...stockArgs) => sudokupad(() => { result = original.apply(this, stockArgs); return result })
        stock.sudokupad = sudokupad
        try {
          return body.call(this, stock, ...args)
        } catch (error) {
          if (failure && failure.error === error) throw error
          step.skip(error)
          return reached ? result : original.apply(this, args)
        }
      }
    }
  }
  return step
}

// `requirements` is [key, [[member, present], ...]] for each step, the key the step itself or its name; the answer maps the key of each step that lacks a member to the first it lacks.
function lackingInternals (requirements) {
  const lacking = new Map()
  requirements.forEach(([step, needs]) => {
    const missing = needs.find(([, present]) => !present)
    if (missing) lacking.set(step, missing[0])
  })
  return lacking
}

// A page with no Framework is not SudokuPad, and is left alone without a word; a Framework without `getApp` is one no script can hook,
// which is reported. `requires(app)` and `steps(app)` are read once the app is ready, `steps` as [step, install(app)] in install order.
// An install that returns a promise is not waited for by the steps after it.
function start (script, { requires, steps }) {
  if (typeof Framework === 'undefined') return
  if (!Framework.getApp) {
    console.warn(`${script}: SudokuPad's Framework has no getApp, so nothing was changed`)
    return
  }
  return Framework.getApp().then(() => {
    const app = Framework.app
    lackingInternals(requires(app)).forEach((member, step) => step.lack(member))
    const pending = []
    steps(app).forEach(([step, install]) => {
      const result = step.run(() => install(app))
      if (result && typeof result.then === 'function') pending.push(result.catch((error) => step.skip(error)))
    })
    return Promise.all(pending)
  }).catch((error) => console.error(`${script}: startup failed:`, error))
}
