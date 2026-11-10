// V8 coverage of the scripts over a fuzz run (#729): which functions of each script no action of the run made run. Pure, so `coverage.test.mjs` tests it; `fuzz.mjs` feeds it what
// Playwright's `page.coverage.stopJSCoverage()` returns, `[{ url, source, functions: [{ functionName, ranges: [{ startOffset, endOffset, count }] }] }]`, a function's own range
// first and the blocks inside it after. Not a check itself.

// An inline script has no URL, which V8 leaves out of coverage; a `sourceURL` tag names it. The tag goes at the end, so every offset still points into the file's own text.
export const tagSource = (file, code) => `${code}\n//# sourceURL=${file}\n`

const lineAndColumn = (source, offset) => {
  const before = source.slice(0, offset).split('\n')
  return { line: before.length, column: before[before.length - 1].length + 1 }
}

// The coverage of the scripts named in `files`, merged over every page `add` hears: a range that ran on any page ran, and the same function of two pages is one. Only the
// ranges are kept, so a run of thousands of pages holds one entry per range of each script, not one per page.
export function createCoverage (files) {
  const scripts = new Map()
  const scriptOf = (url, source) => {
    if (!scripts.has(url)) scripts.set(url, { source, functions: new Map(), ranges: new Map() })
    return scripts.get(url)
  }
  const raise = (map, key, value) => {
    const seen = map.get(key)
    if (seen) seen.count = Math.max(seen.count, value.count)
    else map.set(key, value)
  }
  return {
    add (entries) {
      for (const entry of entries.filter((e) => files.includes(e.url))) {
        const script = scriptOf(entry.url, entry.source)
        for (const fn of entry.functions) {
          const [own] = fn.ranges
          // The script's own top level starts at 0 and is no function of the script.
          if (own.startOffset > 0) raise(script.functions, `${own.startOffset}:${own.endOffset}:${fn.functionName}`, { name: fn.functionName || '(anonymous)', offset: own.startOffset, count: own.count })
          for (const r of fn.ranges) raise(script.ranges, `${r.startOffset}:${r.endOffset}`, { startOffset: r.startOffset, endOffset: r.endOffset, count: r.count })
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
    // Whether the code at `offset` of `file` ran: the count of the smallest range that holds it. A script nothing was heard of did not run.
    ranAt (file, offset) {
      let best = null
      for (const r of scripts.get(file)?.ranges.values() ?? []) {
        if (r.startOffset > offset || r.endOffset <= offset) continue
        if (best === null || r.endOffset - r.startOffset <= best.endOffset - best.startOffset) best = r
      }
      return best !== null && best.count > 0
    }
  }
}

// The lines `npm run test:fuzz -- --coverage` prints: per script the never-run count, then each function.
export function neverRunReport (never) {
  return Object.entries(never).flatMap(([file, { total, never: list }]) => [
    `${file}: ${list.length} of ${total} functions never ran`,
    ...list.map((f) => `  ${f.name} (line ${f.line}, column ${f.column})`)
  ])
}
