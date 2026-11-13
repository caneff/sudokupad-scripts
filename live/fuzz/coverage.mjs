// V8 coverage of the scripts over a fuzz run (#729): which functions of each script no action of the run made run. Pure, so `coverage.test.mjs` tests it. An entry is what
// Playwright's `page.coverage.stopJSCoverage()` returns, `[{ url, source, functions: [{ functionName, ranges: [{ startOffset, endOffset, count }] }] }]`, a function's own range
// first and the blocks inside it after. Not a check itself.

// An inline script has no URL, which V8 leaves out of coverage; a `sourceURL` tag names it. The tag goes at the end, so every offset still points into the file's own text.
export const tagSource = (file, code) => `${code}\n//# sourceURL=${file}\n`

const lineAndColumn = (source, offset) => {
  const before = source.slice(0, offset).split('\n')
  return { line: before.length, column: before[before.length - 1].length + 1 }
}

// The coverage of the scripts named in `files`, merged over every page `add` hears: code that ran on any page ran, and the same function of two pages is one. Only a flag per character of
// each script is kept, so a run of thousands of pages holds one array per script, not one per page.
export function createCoverage (files) {
  const scripts = new Map()
  return {
    add (entries) {
      for (const entry of entries.filter((e) => files.includes(e.url))) {
        if (!scripts.has(entry.url)) scripts.set(entry.url, { source: entry.source, functions: new Map(), ran: new Uint8Array(entry.source.length) })
        const script = scripts.get(entry.url)
        const page = new Uint8Array(entry.source.length)
        // A range V8 reports has the count of the range around it left out when they are equal, so a page's answer for an offset is the smallest range that holds it: paint the
        // ranges from the largest to the smallest, and a nested one overwrites its parent. Ranges of two pages are never compared: one page's count for a branch it skipped must not hide
        // that another page ran it.
        const ranges = entry.functions.flatMap((fn) => fn.ranges).sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset)
        for (const r of ranges) page.fill(r.count > 0 ? 1 : 0, r.startOffset, r.endOffset)
        script.ran.forEach((flag, i) => { if (page[i] && !flag) script.ran[i] = 1 })
        for (const fn of entry.functions) {
          const [own] = fn.ranges
          // The script's own top level starts at 0 and is no function of the script.
          if (own.startOffset === 0) continue
          const key = `${own.startOffset}:${own.endOffset}:${fn.functionName}`
          const seen = script.functions.get(key)
          if (seen) seen.count = Math.max(seen.count, own.count)
          else script.functions.set(key, { name: fn.functionName || '(anonymous)', offset: own.startOffset, count: own.count })
        }
      }
    },
    // The functions of each script that never ran, and how many it has: `{ [file]: { total, never: [{ name, line, column }] } }`. A function inside a never-run one is not
    // listed, since V8 never compiles it.
    neverRun () {
      return Object.fromEntries([...scripts].map(([url, { source, functions }]) => [url, {
        total: functions.size,
        never: [...functions.values()].filter((f) => f.count === 0).sort((a, b) => a.offset - b.offset).map((f) => ({ name: f.name, ...lineAndColumn(source, f.offset) }))
      }]))
    },
    // Whether the code at `offset` of `file` ran on any page; null when no page of `file` was heard, which says nothing about the code.
    ranAt (file, offset) {
      const script = scripts.get(file)
      return script ? script.ran[offset] === 1 : null
    }
  }
}

// The lines a coverage run prints: per script the never-run count, then each function.
export function neverRunReport (never) {
  return Object.entries(never).flatMap(([file, { total, never: list }]) => [
    `${file}: ${list.length} of ${total} functions never ran`,
    ...list.map((f) => `  ${f.name} (line ${f.line}, column ${f.column})`)
  ])
}

// `open` (a fuzz's `openTarget`) with every target it gives tracked until its `close` has finished. The fuzz's time limit returns while the list it was running still goes on, and that
// page's coverage is read by its `close`: `allClosed` resolves once every page opened so far has been read.
export function trackClosing (open) {
  const closing = []
  return {
    async open (...args) {
      const target = await open(...args)
      closing.push(new Promise((resolve) => {
        const close = target.close
        target.close = async () => {
          try {
            await close()
          } finally {
            resolve()
          }
        }
      }))
      return target
    },
    allClosed: () => Promise.all(closing)
  }
}
