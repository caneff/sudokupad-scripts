'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const RAW = 'https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/'
const page = fs.readFileSync(path.join(__dirname, 'site', 'index.html'), 'utf8')

const rawLinks = () => [...page.matchAll(/(?:href|src)="(https:\/\/raw\.githubusercontent\.com\/caneff\/sudokupad-scripts\/main\/[^"]+)"/g)]
  .map(m => m[1].slice(RAW.length))

test('every *.user.js in the repo root has an install link on the page', () => {
  const scripts = fs.readdirSync(__dirname).filter(f => f.endsWith('.user.js'))
  assert.ok(scripts.length > 0, 'no userscripts found')
  const linked = rawLinks()
  for (const s of scripts) assert.ok(linked.includes(s), `${s} has no install link on site/index.html`)
})

test('the page links no userscript that does not exist', () => {
  for (const f of rawLinks().filter(f => f.endsWith('.user.js'))) {
    assert.equal(fs.existsSync(path.join(__dirname, f)), true, `site/index.html links missing script ${f}`)
  }
})

test('every raw screenshot the page loads is a tracked file', () => {
  for (const f of rawLinks().filter(f => !f.endsWith('.user.js'))) {
    assert.equal(fs.existsSync(path.join(__dirname, f)), true, `site/index.html loads missing file ${f}`)
  }
})

test('the page loads no script', () => {
  assert.equal(/<script\b/i.test(page), false)
})

test('netlify.toml publishes only site/', () => {
  const toml = fs.readFileSync(path.join(__dirname, 'netlify.toml'), 'utf8')
  assert.match(toml, /^\s*publish\s*=\s*"site"\s*$/m)
})
