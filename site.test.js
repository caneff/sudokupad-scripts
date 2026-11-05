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
const PAGES = fs.readdirSync(SITE_DIR).filter(f => f.endsWith('.html'))
// Comments are dropped first: a link inside one is not a link on the page.
const read = name => fs.readFileSync(path.join(SITE_DIR, name), 'utf8').replace(/<!--[\s\S]*?-->/g, '')

const plain = html => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
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

// The warning sits directly under the page title, so it is read before any install link.
const WARNING = /<\/h1>\s*<p class="warning">([\s\S]*?)<\/p>/
const WARNINGS = {
  [HOME]: "These scripts can break at any time, and there are no guarantees. They rely on SudokuPad's internals, which aren't a public API, so any SudokuPad update can break them without notice. They aren't made or supported by SudokuPad.",
  [DETAILS]: "This script can break at any time. It relies on SudokuPad's internals, which any update can change, and it isn't made or supported by SudokuPad."
}

for (const [name, text] of Object.entries(WARNINGS)) {
  test(`${name} has its warning directly under the title, above the first install link`, () => {
    const page = read(name)
    const m = page.match(WARNING)
    assert.ok(m, `site/${name} has no <p class="warning"> directly after its <h1>`)
    assert.equal(plain(m[1]), text)
    // Install links are found as the rest of this file finds them: by the script they point at.
    const firstInstall = page.search(/href="[^"]*\.user\.js"/)
    assert.notEqual(firstInstall, -1, `site/${name} has no install link`)
    assert.ok(m.index < firstInstall, `site/${name} has an install link above its warning`)
  })
}

// The details page text is pinned word for word: each feature says what you can do, not which control the script adds.
const items = html => [...html.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => m[1])
const section = (page, heading) => {
  const m = page.match(new RegExp(`<h2>${heading}</h2>\\s*<ul>([\\s\\S]*?)</ul>`))
  assert.ok(m, `site/${DETAILS} has no <h2>${heading}</h2> followed by a list`)
  return items(m[1]).map(plain)
}
// An item's opening words are its bold lead-in: the first <strong> of the item.
const leadIn = li => (li.match(/^<strong>([^<]*)<\/strong>/) || [])[1]
const leadIns = page => items(page).map(leadIn).filter(Boolean)

test(`${DETAILS} intro says what the script adds`, () => {
  const m = read(DETAILS).match(/<\/p>\s*<p>(Adds to <a href="https:\/\/sudokupad\.app">SudokuPad<\/a>'s pen tool[\s\S]*?)<\/p>/)
  assert.ok(m, `site/${DETAILS} has no intro paragraph starting "Adds to SudokuPad's pen tool", with SudokuPad linked`)
  assert.equal(plain(m[1]), "Adds to SudokuPad's pen tool: pen colors that match your cell colors, dashed and arrow lines, and marks on cell edges and grid corners. Turn the pen tool on in SudokuPad's settings first.")
})

test(`${DETAILS} lists what the script adds, one item per feature`, () => {
  assert.deepEqual(section(read(DETAILS), 'What it adds'), [
    'Pen colors that match your cell colors. Darker versions of your cell colors. Hold a pen color button to change one.',
    'Dashed lines and arrow lines. Two more pages of pens. Switch with the page button.',
    'Marks on cell edges. Click an edge for an X, a circle or an arrow. Right-click goes back.',
    'Marks on grid corners. Click near a corner for an X or a circle.',
    'Erase a whole line. Middle-click a line to remove all of it.',
    'Thicker, fainter or outlined lines. Sliders in the pen panel. A white outline keeps lines readable over colored cells.',
    'A settings gear. On the pen tool button.'
  ])
})

test(`${DETAILS} opens each feature with its bold lead-in`, () => {
  assert.deepEqual(leadIns(read(DETAILS)).slice(0, 7), [
    'Pen colors that match your cell colors.',
    'Dashed lines and arrow lines.',
    'Marks on cell edges.',
    'Marks on grid corners.',
    'Erase a whole line.',
    'Thicker, fainter or outlined lines.',
    'A settings gear.'
  ])
})

// Each feature a still picture can show has one picture inside its item; the erase item has none, since a
// middle click does not show in a still picture. The page has no figure.
const PICTURES = {
  'Pen colors that match your cell colors.': 'colors',
  'Dashed lines and arrow lines.': 'lines',
  'Marks on cell edges.': 'edges',
  'Marks on grid corners.': 'corners',
  'Thicker, fainter or outlined lines.': 'sliders',
  'A settings gear.': 'gear'
}
const NO_PICTURE = 'Erase a whole line.'
const imgs = html => [...html.matchAll(/<img\b[^>]*>/g)].map(m => m[0])

test(`${DETAILS} puts one picture with alt text on each feature a picture can show`, () => {
  const byLeadIn = new Map(items(read(DETAILS)).map(li => [leadIn(li), li]))
  for (const [leadIn, name] of Object.entries(PICTURES)) {
    const found = imgs(byLeadIn.get(leadIn) || '')
    assert.equal(found.length, 1, `"${leadIn}" has ${found.length} images, not 1`)
    assert.ok(found[0].includes(`src="${RAW}docs/research/pen-tool-extras-bullet-${name}.png"`), `"${leadIn}" does not show pen-tool-extras-bullet-${name}.png`)
    assert.match(found[0], /\balt="[^"]*[^"\s][^"]*"/, `"${leadIn}" has an image with no alt text`)
  }
})

test(`${DETAILS} has no picture on the erase item and no large example figure`, () => {
  const page = read(DETAILS)
  const erase = items(page).find(li => leadIn(li) === NO_PICTURE)
  assert.ok(erase, `site/${DETAILS} has no "${NO_PICTURE}" item`)
  assert.deepEqual(imgs(erase), [])
  assert.doesNotMatch(page, /<figure\b/)
  assert.equal(imgs(page).length, Object.keys(PICTURES).length)
})

test(`${DETAILS} good to know names the dashed and arrow pages`, () => {
  assert.deepEqual(section(read(DETAILS), 'Good to know'), ["Others see your dashed and arrow lines only if they have the script too."])
})

test(`${HOME} describes Pen Tool Extras by what it adds, not by its sliders`, () => {
  const m = read(HOME).match(/<h2>Pen Tool Extras<\/h2>\s*<p>([\s\S]*?)<\/p>/)
  assert.ok(m, `site/${HOME} has no Pen Tool Extras description`)
  assert.doesNotMatch(m[1], /slider/i)
})

test('netlify.toml publishes only site/', () => {
  const toml = fs.readFileSync(path.join(__dirname, 'netlify.toml'), 'utf8')
  assert.match(toml, /^\s*publish\s*=\s*"site"\s*$/m)
})

test('the Pages workflow publishes only site/', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '.github', 'workflows', 'pages.yml'), 'utf8')
  assert.match(workflow, /uses:\s*actions\/upload-pages-artifact@\S+\s+with:\s+path:\s*['"]?site\/?['"]?\s*$/m)
})
