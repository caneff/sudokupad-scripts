// What counts as a crash in a fuzz run, as pure functions over a snapshot of the page, so they are unit-tested with hand-built snapshots
// (`signals.test.mjs`). Not a check itself.

// The bar the scripts show when they turn a feature off (lib/sudokupad.js: NOTICE_HOST_ID); one `[data-script]` row per script.
export const NOTICE_SELECTOR = '#sudokupad-scripts-notices [data-script]'

// The crash signals in a snapshot `{ errors, notices }`: `errors` are what the page collected (uncaught page errors, `console.error`
// lines and skip lines, `live/page.mjs`), `notices` the text of every row of the notice bar. One readable line each; none means no crash.
export function crashSignals ({ errors = [], notices = [] }) {
  return [
    ...errors.map((e) => `page error or console error: ${e}`),
    ...notices.map((n) => `notice bar: ${n}`)
  ]
}

// The newest `limit` records of the shared error log (the JSON the scripts' guard keeps in localStorage, lib/sudokupad.js), one line each,
// newest first. Raw text that is not the log's JSON is returned as it is, so a corrupt log still shows.
export function newestErrorRecords (raw, limit = 5) {
  if (raw == null) return []
  let records
  try {
    records = JSON.parse(raw)
  } catch {
    return [`unreadable error log: ${String(raw).slice(0, 200)}`]
  }
  if (!Array.isArray(records)) return [`unreadable error log: ${String(raw).slice(0, 200)}`]
  return records.slice(-limit).reverse().map((r) => `${r.script ?? '?'}@${r.version ?? '?'}: ${r.feature ?? '?'}: ${r.name ?? 'Error'}: ${r.message ?? r.missing ?? ''}`.trim())
}
