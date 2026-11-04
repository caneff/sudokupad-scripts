'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const RAW = 'https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/'
const SCRIPT_SUFFIX = '.user.js'
const SITE_DIR = path.join(__dirname, 'site')
// The two places the site is served from; a link to either by its full address breaks on the other.
const SITE_ADDRESS = /^https?:\/\/(caneff\.github\.io\/sudokupad-scripts|[^/]*netlify)/i
const HOME = 'index.html'
const DETAILS = 'pen-tool-extras.html'
// Every page of the site, so a page added later is held to the same checks.
const PAGES = fs.readdirSync(SITE_DIR).filter(f => f.endsWith('.html'))
// Comments are dropped first: a link inside one is not a link on the page.
const read = name => fs.readFileSync(path.join(SITE_DIR, name), 'utf8').replace(/<!--[\s\S]*?-->/g, '')

// Every href and src on a page, whatever its form.
const targets = page => [...page.matchAll(/\b(?:href|src)="([^"]*)"/g)].map(m => m[1])
const scriptLinks = page => targets(page).filter(t => t.endsWith(SCRIPT_SUFFIX))
const screenshots = page => targets(page).filter(t => t.startsWith(RAW) && !t.endsWith(SCRIPT_SUFFIX)).map(t => t.slice(RAW.length))
const rootScripts = () => fs.readdirSync(__dirname).filter(f => f.endsWith(SCRIPT_SUFFIX))
// A link into the site itself: not a URL with a scheme and not a fragment. The site is served from a
// subpath on GitHub Pages and from the root on Netlify, so these must be relative.
const siteLinks = page => targets(page).filter(t => !/^([a-z][a-z0-9+.-]*:|#)/i.test(t))

test('every *.user.js in the repo root has an install link on the homepage', () => {
  const scripts = rootScripts()
  assert.ok(scripts.length > 0, 'no userscripts found')
  const links = scriptLinks(read(HOME))
  for (const s of scripts) assert.ok(links.includes(RAW + s), `${s} has no install link on site/${HOME}`)
})

for (const name of PAGES) {
  const page = read(name)

  test(`every script link on ${name} is a raw install link to a script that exists`, () => {
    const links = scriptLinks(page)
    assert.ok(links.length > 0, `no script links found on ${name}`)
    for (const l of links) {
      assert.ok(l.startsWith(RAW), `${l} is not a raw install link`)
      assert.equal(fs.existsSync(path.join(__dirname, l.slice(RAW.length))), true, `site/${name} links missing script ${l}`)
    }
  })

  test(`every screenshot ${name} loads from raw GitHub is tracked by git`, () => {
    const shots = screenshots(page)
    assert.ok(shots.length > 0, `no screenshots found on ${name}`)
    const tracked = execFileSync('git', ['ls-files', '--', ...shots], { cwd: __dirname, encoding: 'utf8' }).split('\n')
    for (const f of shots) assert.ok(tracked.includes(f), `site/${name} loads ${f}, which git does not track`)
  })

  test(`${name} loads no script`, () => {
    assert.doesNotMatch(page, /<script\b/i)
  })

  test(`every link from ${name} into the site is relative and names a file in site/`, () => {
    for (const t of siteLinks(page)) {
      assert.match(t, /^[^/#?]/, `site/${name} links ${JSON.stringify(t)}, which is empty or not relative`)
      const file = path.resolve(SITE_DIR, t.split(/[?#]/)[0])
      assert.equal(file.startsWith(SITE_DIR + path.sep) && fs.existsSync(file), true, `site/${name} links ${t}, which is not a file in site/`)
    }
  })

  test(`${name} links no page of the site by its absolute address`, () => {
    for (const t of targets(page)) assert.doesNotMatch(t, SITE_ADDRESS, `site/${name} links ${t} by its absolute address`)
  })
}

test('the homepage links to the Pen Tool Extras details page', () => {
  assert.ok(siteLinks(read(HOME)).includes(DETAILS), `site/${HOME} has no relative link to ${DETAILS}`)
})

test('the details page links back to the homepage and carries the Pen Tool Extras install link', () => {
  const page = read(DETAILS)
  assert.ok(siteLinks(page).includes(HOME), `site/${DETAILS} has no relative link back to ${HOME}`)
  assert.ok(scriptLinks(page).includes(RAW + 'pen-tool-extras.user.js'), `site/${DETAILS} has no Pen Tool Extras install link`)
})

test('netlify.toml publishes only site/', () => {
  const toml = fs.readFileSync(path.join(__dirname, 'netlify.toml'), 'utf8')
  assert.match(toml, /^\s*publish\s*=\s*"site"\s*$/m)
})

test('the Pages workflow publishes only site/', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '.github', 'workflows', 'pages.yml'), 'utf8')
  assert.match(workflow, /uses:\s*actions\/upload-pages-artifact@\S+\s+with:\s+path:\s*['"]?site\/?['"]?\s*$/m)
})
