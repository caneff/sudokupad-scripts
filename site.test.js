'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const RAW = 'https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/'
const SCRIPT_SUFFIX = '.user.js'
// Comments are dropped first: a link inside one is not a link on the page.
const page = fs.readFileSync(path.join(__dirname, 'site', 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '')

// Every href and src on the page, whatever its form.
const targets = () => [...page.matchAll(/\b(?:href|src)="([^"]*)"/g)].map(m => m[1])
const scriptLinks = () => targets().filter(t => t.endsWith(SCRIPT_SUFFIX))
const screenshots = () => targets().filter(t => t.startsWith(RAW) && !t.endsWith(SCRIPT_SUFFIX)).map(t => t.slice(RAW.length))
const rootScripts = () => fs.readdirSync(__dirname).filter(f => f.endsWith(SCRIPT_SUFFIX))

test('every *.user.js in the repo root has an install link on the page', () => {
  const scripts = rootScripts()
  assert.ok(scripts.length > 0, 'no userscripts found')
  for (const s of scripts) assert.ok(scriptLinks().includes(RAW + s), `${s} has no install link on site/index.html`)
})

test('every script link on the page is a raw install link to a script that exists', () => {
  const links = scriptLinks()
  assert.ok(links.length >= rootScripts().length, `only ${links.length} script links found`)
  for (const l of links) {
    assert.ok(l.startsWith(RAW), `${l} is not a raw install link`)
    assert.equal(fs.existsSync(path.join(__dirname, l.slice(RAW.length))), true, `site/index.html links missing script ${l}`)
  }
})

test('every screenshot the page loads from raw GitHub is tracked by git', () => {
  const shots = screenshots()
  assert.ok(shots.length > 0, 'no screenshots found')
  const tracked = execFileSync('git', ['ls-files', '--', ...shots], { cwd: __dirname, encoding: 'utf8' }).split('\n')
  for (const f of shots) assert.ok(tracked.includes(f), `site/index.html loads ${f}, which git does not track`)
})

test('the page loads no script', () => {
  assert.doesNotMatch(page, /<script\b/i)
})

test('netlify.toml publishes only site/', () => {
  const toml = fs.readFileSync(path.join(__dirname, 'netlify.toml'), 'utf8')
  assert.match(toml, /^\s*publish\s*=\s*"site"\s*$/m)
})

test('netlify.toml sends a Content-Security-Policy that stops the Netlify badge', () => {
  const toml = fs.readFileSync(path.join(__dirname, 'netlify.toml'), 'utf8')
  const block = toml.match(/\[\[headers\]\]([\s\S]*?)(?=\n\[|$)/)
  assert.ok(block, 'netlify.toml has a [[headers]] block')
  assert.match(block[1], /^\s*for\s*=\s*"\/\*"\s*$/m)
  const csp = block[1].match(/Content-Security-Policy\s*=\s*"([^"]*)"/)
  assert.ok(csp, 'the block sets Content-Security-Policy')
  const directives = csp[1].split(';').map(d => d.trim()).filter(Boolean)
  // script-src without 'unsafe-inline' is what keeps the badge's inline frame from rendering
  assert.deepEqual(directives.filter(d => d.startsWith('script-src')), ["script-src 'self'"])
  // images (raw.githubusercontent.com screenshots) and inline styles stay unrestricted
  assert.deepEqual(directives.filter(d => !d.startsWith('script-src')), [])
})
