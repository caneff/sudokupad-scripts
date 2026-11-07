'use strict'
// Run after editing lib/: node sync-lib.js
// Each lib/<name>.js is copied into every *.user.js between `// <lib:name>` and `// </lib:name>`, because an installed script is one file.
const fs = require('node:fs')
const path = require('node:path')

const OPEN = /^(\s*)\/\/ <lib:([a-z][a-z0-9-]*)>\s*$/
const CLOSE = /^\s*\/\/ <\/lib:([a-z][a-z0-9-]*)>\s*$/
const MARKER_WORD = /<\/?lib:/
const RUN = 'node sync-lib.js'
const SCRIPT_VERSION = /^(\/\/ @version\s+)(\d+)\.(\d+)\.(\d+)(\s*)$/m
const CONST_VERSION = /^(\s*const VERSION = ')(\d+)\.(\d+)\.(\d+)(')$/m

// A lib file's first line may silence the linter for names only the scripts use. A script may use only part of a module, so the copy
// keeps the silence, scoped to the block.
const LINT_HEADER = /^\/\* eslint-disable no-unused-vars \*\/\n/

const generatedLine = (name) => `// Generated from lib/${name}.js; edit that file and run ${RUN}.`

const blockLines = (name, module, indent) => {
  const silenced = LINT_HEADER.test(module)
  return [
    `${indent}// <lib:${name}>`,
    `${indent}${generatedLine(name)}`,
    ...(silenced ? [`${indent}/* eslint-disable no-unused-vars */`] : []),
    ...module.replace(LINT_HEADER, '').replace(/\n$/, '').split('\n').map((line) => line === '' ? '' : indent + line),
    ...(silenced ? [`${indent}/* eslint-enable no-unused-vars */`] : []),
    `${indent}// </lib:${name}>`
  ]
}

const ANY_CONST_VERSION = /^\s*const VERSION =/m

// Raises the patch of @version, and of `const VERSION` where the script has one; null when either is not a plain X.Y.Z it can raise.
function bumpPatch (source) {
  if (!SCRIPT_VERSION.test(source) || (ANY_CONST_VERSION.test(source) && !CONST_VERSION.test(source))) return null
  return [SCRIPT_VERSION, CONST_VERSION].reduce(
    (text, pattern) => text.replace(pattern, (_, head, major, minor, patch, tail) => `${head}${major}.${minor}.${Number(patch) + 1}${tail}`),
    source)
}

// Rewrites every lib block of one script from readModule(name) (undefined for a missing module).
// Returns the new text, the names of the blocks that changed, and the problems found; a script with a problem is left as it was.
function syncText (source, readModule) {
  const lines = source.split('\n')
  const out = []
  const changed = []
  const problems = []
  for (let i = 0; i < lines.length; i++) {
    const open = OPEN.exec(lines[i])
    if (open === null) {
      if (MARKER_WORD.test(lines[i]) && !CLOSE.test(lines[i])) problems.push(`line ${i + 1}: malformed lib marker`)
      else if (CLOSE.test(lines[i])) problems.push(`line ${i + 1}: closing marker with no opening marker`)
      out.push(lines[i])
      continue
    }
    const [, indent, name] = open
    let end = i + 1
    while (end < lines.length && !CLOSE.test(lines[end]) && !OPEN.test(lines[end])) end++
    const close = end < lines.length ? CLOSE.exec(lines[end]) : null
    if (close === null || close[1] !== name) {
      problems.push(`line ${i + 1}: lib:${name} block is never closed`)
      out.push(lines[i])
      continue
    }
    const module = readModule(name)
    if (module === undefined) {
      problems.push(`line ${i + 1}: no module lib/${name}.js`)
      out.push(...lines.slice(i, end + 1))
    } else {
      const block = blockLines(name, module, indent)
      if (block.join('\n') !== lines.slice(i, end + 1).join('\n')) changed.push(name)
      out.push(...block)
    }
    i = end
  }
  if (problems.length > 0) return { text: source, changed: [], problems }
  const text = out.join('\n')
  if (changed.length === 0) return { text, changed, problems }
  const raised = bumpPatch(text)
  if (raised === null) return { text: source, changed: [], problems: ['@version or const VERSION is not X.Y.Z, so the version cannot be raised'] }
  return { text: raised, changed, problems }
}

const LIB_DIR = path.join(__dirname, 'lib')
const readLib = (name) => {
  const file = path.join(LIB_DIR, `${name}.js`)
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined
}
const scriptFiles = () => fs.readdirSync(__dirname).filter((f) => f.endsWith('.user.js')).sort()

if (require.main === module) {
  let failed = false
  for (const file of scriptFiles()) {
    const page = path.join(__dirname, file)
    const { text, changed, problems } = syncText(fs.readFileSync(page, 'utf8'), readLib)
    for (const problem of problems) { console.error(`${file}: ${problem}`); failed = true }
    if (changed.length === 0) continue
    fs.writeFileSync(page, text)
    console.log(`${file}: rewrote ${changed.join(', ')} and raised the version`)
  }
  if (failed) process.exit(1)
}

module.exports = { syncText, readLib, scriptFiles, generatedLine, RUN }
