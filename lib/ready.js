/* eslint-disable no-unused-vars */
// Resolves with what `check()` first returns that is not null, undefined or false, polling every `pollMs`. Rejects with `<what> not ready after <ms> ms` once `timeoutMs`
// passes, so a wait for SudokuPad always ends and says what it was waiting for. A `check` that throws rejects with that error.
function whenReady (check, { timeoutMs, what, pollMs = 100 }) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs
    const poll = () => {
      let value
      try {
        value = check()
      } catch (error) {
        reject(error)
        return
      }
      if (value !== null && value !== undefined && value !== false) resolve(value)
      else if (Date.now() >= deadline) reject(new Error(`${what} not ready after ${timeoutMs} ms`))
      else setTimeout(poll, pollMs)
    }
    poll()
  })
}
