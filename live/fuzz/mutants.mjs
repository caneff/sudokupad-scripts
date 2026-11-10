// Mutants of the scripts (#723): each is one standard mutation operator applied to one place of a script's text, in memory, as a planted bug that no author chose. The families are
// the ones real faults couple to (Just et al., FSE 2014): relational (`<` to `<=`, `===` to `!==`, ...), conditional (a tested condition negated, `&&` and `||` swapped) and statement
// deletion (a call, assignment or update statement dropped). Found on the script's AST with acorn; the files on disk never change. Not a check itself.
import { parse } from 'acorn'
import { SCRIPT_FILES, scriptSource } from '../session.mjs'

export const FAMILIES = ['relational', 'conditional', 'deletion']

const RELATIONAL = { '<': '<=', '<=': '<', '>': '>=', '>=': '>', '===': '!==', '!==': '===', '==': '!=', '!=': '==' }
const LOGICAL = { '&&': '||', '||': '&&' }
const DELETABLE = new Set(['CallExpression', 'AssignmentExpression', 'UpdateExpression', 'AwaitExpression'])
const TESTED = new Set(['IfStatement', 'ConditionalExpression', 'WhileStatement'])

const parseScript = (code) => parse(code, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true, allowHashBang: true, locations: true })

function walk (node, visit) {
  visit(node)
  for (const value of Object.values(node)) {
    for (const child of Array.isArray(value) ? value : [value]) if (child && typeof child.type === 'string') walk(child, visit)
  }
}

// Deleting the call that runs the whole script is no fault of a statement.
const isIife = (expression) => expression.type === 'CallExpression' && /^(?:Arrow)?FunctionExpression$/.test(expression.callee.type)

const snippet = (text) => { const one = text.replace(/\s+/g, ' '); return one.length > 50 ? `${one.slice(0, 47)}...` : one }

// Every mutant of the script `file` whose text is `code`: `{ id, file, family, start, end, original, text, line, description }`, the edit being `code.slice(start, end)` (`original`) replaced
// by `text`. Mutants that do not parse are left out.
export function mutantsOf (file, code) {
  const edits = []
  const add = (family, start, end, text, line) => edits.push({ family, start, end, text, line })
  walk(parseScript(code), (node) => {
    const line = node.loc.start.line
    if (node.type === 'BinaryExpression' && RELATIONAL[node.operator]) {
      const at = code.indexOf(node.operator, node.left.end)
      add('relational', at, at + node.operator.length, RELATIONAL[node.operator], line)
    }
    if (node.type === 'LogicalExpression' && LOGICAL[node.operator]) {
      const at = code.indexOf(node.operator, node.left.end)
      add('conditional', at, at + node.operator.length, LOGICAL[node.operator], line)
    }
    if (TESTED.has(node.type)) add('conditional', node.test.start, node.test.end, `!(${code.slice(node.test.start, node.test.end)})`, line)
    if (node.type === 'ExpressionStatement' && !node.directive && DELETABLE.has(node.expression.type) && !isIife(node.expression)) add('deletion', node.start, node.end, ';', line)
  })
  return edits
    .map((e) => ({ ...e, id: `mutant:${file}:${e.start}-${e.end}:${e.family}`, file, original: code.slice(e.start, e.end), description: `line ${e.line}: ${e.family}, \`${snippet(code.slice(e.start, e.end))}\` becomes \`${snippet(e.text)}\`` }))
    .filter((m) => { try { parseScript(applyMutant(m, code)); return true } catch { return false } })
}

// The script's text with the mutant in it. A text that is no longer the one the mutant was made from is an error: a script that changed under it must not run unmutated.
export function applyMutant (mutant, code) {
  if (code.slice(mutant.start, mutant.end) !== mutant.original) throw new Error(`mutant ${mutant.id}: ${mutant.file} no longer holds ${JSON.stringify(mutant.original)} at ${mutant.start}`)
  return code.slice(0, mutant.start) + mutant.text + code.slice(mutant.end)
}

// A mutant as the planted-bug harness takes it (`plants.mjs`): any failure counts as a catch, since no message belongs to a mutant.
export const mutantPlant = (mutant) => ({ id: mutant.id, file: mutant.file, kind: 'mutant', bug: mutant.description, expect: /[\s\S]*/, apply: (code) => applyMutant(mutant, code), mutant })

// The mutant a printed id names, found again in the script as it is now, so a replay command with `--plant <id>` works.
export function mutantById (id) {
  const [, file] = id.split(':')
  if (!SCRIPT_FILES.includes(file)) throw new Error(`mutant id ${id}: no script ${file}`)
  const found = mutantsOf(file, scriptSource(file)).find((m) => m.id === id)
  if (!found) throw new Error(`no mutant ${id}: the script no longer has it`)
  return found
}

// A generator of numbers in [0, 1) that gives the same ones for the same seed (mulberry32).
export function seededRandom (seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// `count` of `candidates`, the same ones for the same seed: each family in turn gets one, so no family (statement deletions are the most) fills the sample, and a family that
// runs out leaves its share to the others. In the order they were drawn.
export function sampleMutants (candidates, count, seed) {
  const random = seededRandom(seed)
  const queues = FAMILIES.map((family) => {
    const own = candidates.filter((m) => m.family === family)
    for (let i = own.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [own[i], own[j]] = [own[j], own[i]] }
    return own
  })
  const sample = []
  while (sample.length < count && queues.some((q) => q.length)) {
    for (const queue of queues) if (queue.length && sample.length < count) sample.push(queue.shift())
  }
  return sample
}
