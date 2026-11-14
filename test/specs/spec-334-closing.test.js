'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync, existsSync } = require('node:fs')
const { join } = require('node:path')
const ROOT = join(__dirname, '..', '..')

const read = (file) => readFileSync(join(ROOT, file), 'utf8')
const { syncText, readLib, libNamesOnDisk, RUN, withoutLibBlocks } = require('../../sync-lib.js')
// Color by Digit and Pen Tool Extras export their copy of lib/color-math.js; the sync check below holds every copy to the module.
const COLOR_EXPORTERS = ['color-by-digit', 'pen-tool-extras'].map((script) => require(`../../${script}.user.js`))

// Typed out as the independent source: which script carries which shared module, from spec #334's Implementation Decisions.
const SETTINGS_SCRIPTS = ['auto-rules-resizer', 'color-by-digit', 'dark-page', 'pen-tool-extras', 'text-anywhere']
const CARRIES = {
  'color-math': ['color-by-digit', 'dark-page', 'pen-tool-extras', 'text-anywhere'],
  palette: ['color-by-digit', 'pen-tool-extras', 'text-anywhere'],
  'color-picker': ['color-by-digit', 'pen-tool-extras', 'text-anywhere'],
  'settings-dialog': SETTINGS_SCRIPTS,
  'settings-transfer': SETTINGS_SCRIPTS,
  panel: ['pen-tool-extras', 'text-anywhere']
}
// Names a module provides, which no script may define again outside its blocks.
const MODULE_NAMES = ['parseColor', 'darkenColor', 'toHex', 'isTransparent', 'GAMUT_EDGE', 'LIGHTNESS_FACTOR', 'pastedSettings', 'pasteReport',
  'SUDOKUPAD_PEN_COLORS', 'PEN_COLOR_NUMBERS', 'darkerPageColors', 'isPlainObject', 'rem', 'installSliderGuards']

// Spec 334's acceptance as one pass at `npm test`: the six modules in lib/, each copied whole into exactly the scripts the spec
// names and in step with lib/ (the sync check, naming its command), no script keeping its own copy of a module's names, one
// parseColor for every color format, each script still one file with no @require, sync-lib.js at the root and out of site/,
// and the rules that state the scheme. This seam is blind to real SudokuPad: the shared picker's hold and palette modes, the
// dialogs' title rows and Copy/Paste icons, the sliders' drag and the panels' look are `npm run test:live`'s, and a real
// Tampermonkey install is `npm run test:tampermonkey`'s.
test('spec 334: shared lib/ modules copied into each script, kept in sync by node sync-lib.js', () => {
  // Every module exists, with its own test.
  for (const name of Object.keys(CARRIES)) {
    assert.ok(existsSync(join(ROOT, 'lib', `${name}.js`)), `lib/${name}.js`)
    assert.ok(existsSync(join(ROOT, 'lib', `${name}.test.js`)), `lib/${name}.test.js`)
  }

  for (const script of SETTINGS_SCRIPTS) {
    const file = `${script}.user.js`
    const source = read(file)
    // Each script carries exactly the modules the spec gives it, once each.
    for (const [name, scripts] of Object.entries(CARRIES)) {
      const blocks = source.split('\n').filter((line) => line.trim() === `// <lib:${name}>`).length
      assert.equal(blocks, scripts.includes(script) ? 1 : 0, `${file}: <lib:${name}> blocks`)
    }
    // Every block is what node sync-lib.js would write.
    const synced = syncText(source, readLib, libNamesOnDisk())
    assert.deepEqual(synced.problems, [], `${file}: ${RUN}`)
    assert.deepEqual(synced.changed, [], `${file}: blocks out of date; run ${RUN}`)
    // No module name is defined again outside the blocks.
    const own = withoutLibBlocks(source)
    for (const name of MODULE_NAMES) {
      assert.doesNotMatch(own, new RegExp(`^\\s*(?:function\\s+${name}\\b|(?:const|let|var)\\s+${name}\\b)`, 'm'), `${file} defines ${name} outside lib/`)
    }
    // Still one file: no @require and no build step for users.
    assert.doesNotMatch(source.split('// ==/UserScript==')[0], /@require/, `${file} @require`)
  }

  // One parseColor: every format any script accepted, clamped to 0-255, transparent read as none.
  for (const { parseColor } of COLOR_EXPORTERS) {
    assert.deepEqual(['#abc', '#a1b2c3', 'rgb(1, 2, 3)', 'rgb(1 2 3)', 'rgb(1 2 3 / .5)', 'rgba(300, 2, 3, 0.5)'].map((text) => parseColor(text)),
      [[170, 187, 204], [161, 178, 195], [1, 2, 3], [1, 2, 3], [1, 2, 3], [255, 2, 3]])
    assert.equal(parseColor('transparent'), null)
  }

  // The command sits at the root, where Pages does not publish it.
  assert.ok(existsSync(join(ROOT, 'sync-lib.js')))
  assert.ok(!existsSync(join(ROOT, 'site', 'sync-lib.js')))

  // The rules state the scheme, and the linter covers lib/.
  assert.match(read('AGENTS.md'), /node sync-lib\.js/)
  assert.doesNotMatch(read('AGENTS.md'), /no ties to any other repo/)
  assert.doesNotMatch(read('CODING_STANDARDS.md'), /scripts share no code/)
  assert.match(read('CODING_STANDARDS.md'), /lib\//)
  const ignored = JSON.parse(read('package.json')).standard.ignore || []
  assert.ok(!ignored.some((glob) => glob.startsWith('lib')), 'standard ignores lib/')
})
