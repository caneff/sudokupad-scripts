'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const { RAW, pictureTags, tagOf } = require('./tag-pictures.js')
const SCRIPT_SUFFIX = '.user.js'
const SITE_DIR = path.join(__dirname, 'site')
// The two places the site is served from; a link to either by its full address breaks on the other.
const SITE_ADDRESS = /^https?:\/\/(caneff\.github\.io\/sudokupad-scripts|[^/]*netlify)/i
const HOME = 'index.html'
const DETAILS = 'pen-tool-extras.html'
const DRAW = 'draw-tool.html'
const CBD = 'color-by-digit.html'
const PAGES = fs.readdirSync(SITE_DIR).filter(f => f.endsWith('.html'))
// Comments are dropped first: a link inside one is not a link on the page.
const read = name => fs.readFileSync(path.join(SITE_DIR, name), 'utf8').replace(/<!--[\s\S]*?-->/g, '')

const plain = html => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
const targets = page => [...page.matchAll(/\b(?:href|src)="([^"]*)"/g)].map(m => m[1])
const scriptLinks = page => targets(page).filter(t => t.endsWith(SCRIPT_SUFFIX))
const screenshots = page => targets(page).filter(t => t.startsWith(RAW) && !t.endsWith(SCRIPT_SUFFIX)).map(t => t.slice(RAW.length).replace(/\?.*$/, ''))
const rootScripts = () => fs.readdirSync(__dirname).filter(f => f.endsWith(SCRIPT_SUFFIX))
// A link into the site itself: not a URL with a scheme and not a fragment. The site is served from a
// subpath on GitHub Pages and from the root on Netlify, so these must be relative.
const siteLinks = page => targets(page).filter(t => !/^([a-z][a-z0-9+.-]*:|#)/i.test(t))

test('every picture of a repo file on every page carries a ?v= tag matching its file', () => {
  for (const name of PAGES) {
    for (const { file, tag } of pictureTags(read(name))) {
      assert.equal(tag, tagOf(file), `site/${name}: ${file} has tag ${tag}, its file hashes to ${tagOf(file)}; run: node tag-pictures.js`)
    }
  }
})

// Chris's ruling on #359: this script is for him only, so it is not on the site.
const NOT_ON_SITE = 'no-tab-letters.user.js'

test(`every *.user.js in the repo root except ${NOT_ON_SITE} has an install link on the homepage, and ${NOT_ON_SITE} has none anywhere on the site`, () => {
  const scripts = rootScripts()
  assert.ok(scripts.includes(NOT_ON_SITE), `${NOT_ON_SITE} is gone, so the exception is stale`)
  const links = scriptLinks(read(HOME))
  for (const s of scripts.filter(f => f !== NOT_ON_SITE)) assert.ok(links.includes(RAW + s), `${s} has no install link on site/${HOME}`)
  for (const name of PAGES) assert.doesNotMatch(read(name), /no-tab-letters|No Tab Letters/i, `site/${name} names No Tab Letters`)
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

  test(`${name} loads no script but the shared slideshow script`, () => {
    const scripts = [...page.matchAll(/<script\b[^>]*>/gi)].map(m => m[0])
    for (const tag of scripts) assert.equal(tag, '<script src="slides.js">')
    assert.doesNotMatch(page, /<script\b[^>]*>\s*[^<\s]/i, 'a script tag holds code')
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

// Each details page: its script's install file and the homepage heading whose entry links to it.
const DETAIL_PAGES = [
  { page: DETAILS, script: 'pen-tool-extras', name: 'Pen Tool Extras' },
  { page: DRAW, script: 'draw-tool', name: 'Draw Tool' },
  { page: CBD, script: 'color-by-digit', name: 'Color by Digit' }
]

for (const { page: file, script, name } of DETAIL_PAGES) {
  test(`the homepage links to the ${name} details page`, () => {
    assert.ok(siteLinks(read(HOME)).includes(file), `site/${HOME} has no relative link to ${file}`)
  })

  test(`${file} links back to the homepage and carries the ${name} install link`, () => {
    const page = read(file)
    assert.ok(siteLinks(page).includes(HOME), `site/${file} has no relative link back to ${HOME}`)
    assert.ok(scriptLinks(page).includes(RAW + script + SCRIPT_SUFFIX), `site/${file} has no ${name} install link`)
    assert.match(page, /<(p|footer)><a href="index\.html">&larr; All SudokuPad scripts<\/a> &middot; <a href="https:\/\/github\.com\/caneff\/sudokupad-scripts">Source on GitHub<\/a><\/(p|footer)>\s*(<script src="slides\.js"><\/script>\s*)?<\/body>/)
  })
}

// The warning sits directly under the page title, so it is read before any install link.
const WARNING = /<\/h1>\s*<p class="warning">([\s\S]*?)<\/p>/
const DETAILS_WARNING = "This script can break at any time. It relies on SudokuPad's internals, which any update can change, and it isn't made or supported by SudokuPad."
const WARNINGS = {
  [HOME]: "These scripts can break at any time, and there are no guarantees. They rely on SudokuPad's internals, which aren't a public API, so any SudokuPad update can break them without notice. They aren't made or supported by SudokuPad.",
  [DETAILS]: DETAILS_WARNING,
  [DRAW]: DETAILS_WARNING,
  [CBD]: DETAILS_WARNING
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

// The details page text is pinned word for word: "What it adds" says what you can do.
const items = html => [...html.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => m[1])
const section = (file, heading) => {
  const m = read(file).match(new RegExp(`<h2>${heading}</h2>\\s*<ul[^>]*>([\\s\\S]*?)</ul>`))
  assert.ok(m, `site/${file} has no <h2>${heading}</h2> followed by a list`)
  return items(m[1]).map(plain)
}
// An item's opening words are its bold lead-in: the first <strong> of the item.
const leadIn = li => (li.match(/^<strong>([^<]*)<\/strong>/) || [])[1]
const leadIns = page => items(page).map(leadIn).filter(Boolean)

test(`${DETAILS} intro says what the script adds`, () => {
  const m = read(DETAILS).match(/<\/p>\s*<p>(Adds to <a href="https:\/\/sudokupad\.app">SudokuPad<\/a>'s pen tool[\s\S]*?)<\/p>/)
  assert.ok(m, `site/${DETAILS} has no intro paragraph starting "Adds to SudokuPad's pen tool", with SudokuPad linked`)
  assert.equal(plain(m[1]), "Adds to SudokuPad's pen tool: customizable pen colors, dashed and arrow lines, and marks on cell edges and grid corners. Turn the pen tool on in SudokuPad's settings first.")
})

test(`${DETAILS} lists what the script adds to drawing, one item per feature`, () => {
  assert.deepEqual(section(DETAILS, 'What it adds'), [
    'Customizable pen colors. Hold a pen color button, or pick a preset in the settings.',
    'Dashed lines and arrow lines. Two more pages of pens.',
    'Marks on cell edges. Click an edge for an X, a circle or an arrow. Right-click goes back.',
    'Marks on grid corners. Click near a corner for an X or a circle.',
    'Erase a whole line. Middle-click a line to remove all of it.',
    'White outlines. An outline keeps lines readable over colored cells.'
  ])
})

test(`${DETAILS} opens each item with its bold lead-in`, () => {
  assert.deepEqual(leadIns(read(DETAILS)), [
    'Customizable pen colors.',
    'Dashed lines and arrow lines.',
    'Marks on cell edges.',
    'Marks on grid corners.',
    'Erase a whole line.',
    'White outlines.'
  ])
})

// The items listed here have one picture inside them; every other item has none (a middle click, for one, does not
// show in a still picture). The pen panel section has its own one picture, tested below. The page has no figure.
const PICTURES = {
  'Customizable pen colors.': 'colors',
  'Dashed lines and arrow lines.': 'lines',
  'Marks on cell edges.': 'edges',
  'Marks on grid corners.': 'corners'
}
const NO_PICTURE = 'Erase a whole line.'
const altOf = img => (img.match(/alt="([^"]*)"/) || [])[1] || ''
const imgs = html => [...html.matchAll(/<img\b[^>]*>/g)].map(m => m[0])
const withoutTag = img => img.replace(/\?v=[0-9a-f]{7}"/, '"')

test(`${DETAILS} puts one picture with alt text on each item in PICTURES`, () => {
  const byLeadIn = new Map(items(read(DETAILS)).map(li => [leadIn(li), li]))
  for (const [leadIn, name] of Object.entries(PICTURES)) {
    const found = imgs(byLeadIn.get(leadIn) || '')
    assert.equal(found.length, 1, `"${leadIn}" has ${found.length} images, not 1`)
    assert.ok(withoutTag(found[0]).includes(`src="${RAW}docs/research/pen-tool-extras-bullet-${name}.png"`), `"${leadIn}" does not show pen-tool-extras-bullet-${name}.png`)
    assert.match(found[0], /\balt="[^"]*[^"\s][^"]*"/, `"${leadIn}" has an image with no alt text`)
  }
})

test(`${DETAILS} has no picture on the erase item and no large example figure`, () => {
  const page = read(DETAILS)
  const erase = items(page).find(li => leadIn(li) === NO_PICTURE)
  assert.ok(erase, `site/${DETAILS} has no "${NO_PICTURE}" item`)
  assert.deepEqual(imgs(erase), [])
  assert.doesNotMatch(page, /<figure\b/)
  assert.equal(imgs(page).length, Object.keys(PICTURES).length + 2, 'the page has the four item pictures, the tour animation and the pen panel picture')
})

test(`${DETAILS} good to know says others need the script to see dashed and arrow lines`, () => {
  assert.deepEqual(section(DETAILS, 'Good to know'), ['Others see your dashed and arrow lines only if they have the script too.'])
})

test(`${HOME} describes Pen Tool Extras by what it adds, not by its sliders`, () => {
  const m = read(HOME).match(/<h2>Pen Tool Extras<\/h2>\s*<p>([\s\S]*?)<\/p>/)
  assert.ok(m, `site/${HOME} has no Pen Tool Extras description`)
  assert.doesNotMatch(m[1], /slider/i)
  assert.equal(m[1], "Makes SudokuPad's pen tool more useful: customizable pen colors, dashed lines and lines with arrows, and marks you can put on cell edges and grid corners.")
})

// One row per script, in this order; Details only where a details page exists.
const ROWS = [
  ['Color by Digit', CBD], ['Pen Tool Extras', DETAILS], ['Draw Tool', DRAW], ['Dark Page', undefined], ['Auto Rules Resizer', undefined]
]
const rowsOf = html => html.split('<section class="row">').slice(1)

test(`${HOME} has one row per script in order, each with an Install button beside its Details link where there is one`, () => {
  const rows = rowsOf(read(HOME))
  assert.deepEqual(rows.map(r => (r.match(/<h2>([^<]*)<\/h2>/) || [])[1]), ROWS.map(([n]) => n))
  rows.forEach((row, i) => {
    const [name, details] = ROWS[i]
    const script = name.toLowerCase().replace(/ /g, '-') + SCRIPT_SUFFIX
    assert.match(row, new RegExp(`<p class="actions"><a class="install" href="${RAW.replace(/\./g, '\\.')}${script}">Install<span class="visually-hidden"> ${name}</span></a>${details ? `<a class="more" href="${details}">Details &rarr;</a>` : ''}</p>`), name)
  })
})

test('the shared Install button is bigger than the old one, in style.css', () => {
  const css = fs.readFileSync(path.join(SITE_DIR, 'style.css'), 'utf8')
  const install = css.match(/\.install \{[^}]*\}/)[0]
  assert.match(install, /font-size: 1\.05rem/)
  assert.match(css, /\.install::before \{[^}]*width: 1\.3em/)
})

// Every slideshow on a page: its pictures and captions pair up, the first of each is current, and each has a caption and a picture file.
const slideshows = html => html.split('<div class="slideshow">').slice(1).map(part => part.split('</section>')[0])

test(`${HOME}'s Draw Tool row is a slideshow of eight slides, each a tagged picture with a caption, the first showing without script`, () => {
  const [show] = slideshows(rowsOf(read(HOME)).find(r => r.includes('<h2>Draw Tool</h2>')))
  const pictures = imgs(show)
  const captions = [...show.matchAll(/<p class="slide-caption( current)?">([^<]*)<\/p>/g)]
  assert.equal(pictures.length, 8)
  assert.deepEqual(captions.map(m => m[2]), [
    'Draw a line', 'Hold Shift for a straight line', 'Size and opacity', 'Shape: rectangle', 'Shape: ellipse', 'Type text, such as a cage sum',
    'Your own colors: hold a color button', 'Erase: right-drag across a line'
  ])
  pictures.forEach((img, i) => {
    assert.match(img, i === 0 ? /class="slide current"/ : /class="slide"/)
    assert.match(img, /src="[^"]*docs\/research\/draw-tool-slide-\d-[a-z]+\.png\?v=[0-9a-f]{7}"/)
    assert.match(img, /\balt="[^"]*[^"\s][^"]*"/)
    assertDeclaredAtFileShape(img, (img.match(/(docs\/research\/[^"?]+)/) || [])[1], `slide ${i + 1}`)
  })
  assert.deepEqual(captions.map(m => Boolean(m[1])), [true, false, false, false, false, false, false, false])
})

test(`${HOME}'s other rows show one picture and no pager`, () => {
  for (const row of rowsOf(read(HOME)).filter(r => !r.includes('<h2>Draw Tool</h2>'))) {
    assert.equal(imgs(row).length, 1)
    assert.doesNotMatch(row, /slide-caption|slideshow/)
  }
})

test('netlify.toml publishes only site/', () => {
  const toml = fs.readFileSync(path.join(__dirname, 'netlify.toml'), 'utf8')
  assert.match(toml, /^\s*publish\s*=\s*"site"\s*$/m)
})

test('the Pages workflow publishes only site/', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '.github', 'workflows', 'pages.yml'), 'utf8')
  assert.match(workflow, /uses:\s*actions\/upload-pages-artifact@\S+\s+with:\s+path:\s*['"]?site\/?['"]?\s*$/m)
})

test(`${DETAILS} shows the pen panel as one annotated picture whose alt text names every label`, () => {
  const m = read(DETAILS).match(/<h2>The pen panel<\/h2>([\s\S]*?)<h2>/)
  assert.ok(m, `site/${DETAILS} has no <h2>The pen panel</h2>`)
  assert.doesNotMatch(m[1], /<li\b/, 'the pen panel section is still a list')
  const found = imgs(m[1])
  assert.equal(found.length, 1, 'the pen panel section is not one picture')
  assert.match(found[0], /pen-tool-extras-panel-annotated\.png/)
  const alt = altOf(found[0])
  for (const label of ['Pen color buttons', 'Line mode button', 'Line type button', 'Settings button', 'Thickness and Opacity sliders']) {
    assert.ok(alt.includes(label), `the picture's alt text does not name "${label}"`)
  }
})

test(`${HOME} names no Digit Color script and links no digit-color file`, () => {
  const page = read(HOME)
  assert.doesNotMatch(page, /Digit Color|digit-color/)
})

// Checks shared by every details page: the header's @description, the intro, one picture per listed lead-in, and a screenshot script per picture.
const SCRIPT_INTRO = /<\/p>\s*<p(?: class="lede")?>(Adds to <a href="https:\/\/sudokupad\.app">SudokuPad<\/a>[\s\S]*?)<\/p>/
// A picture name with no extension is a PNG.
const withExtension = (name) => /\.\w+$/.test(name) ? name : `${name}.png`
const shared = ({ page, script, name, summary, intro, leadIns: leads, pictures, homePicture }) => {
  test(`${script}.user.js's @description is the homepage summary`, () => {
    const head = fs.readFileSync(path.join(__dirname, script + SCRIPT_SUFFIX), 'utf8')
    assert.equal((head.match(/^\/\/ @description\s+(.*)$/m) || [])[1], summary)
  })

  test(`${page} intro says what the script adds, with SudokuPad linked`, () => {
    const m = read(page).match(SCRIPT_INTRO)
    assert.ok(m, `site/${page} has no intro paragraph starting "Adds to SudokuPad", with SudokuPad linked`)
    assert.equal(plain(m[1]), intro)
  })

  test(`${page} puts one picture with alt text on each lead-in that has one, and none on the others`, () => {
    const byLeadIn = new Map(items(read(page)).map(li => [leadIn(li), li]))
    for (const lead of leads) {
      const found = imgs(byLeadIn.get(lead) || '')
      if (!pictures[lead]) { assert.deepEqual(found, [], `"${lead}" has a picture`); continue }
      assert.equal(found.length, 1, `"${lead}" has ${found.length} images, not 1`)
      assert.ok(withoutTag(found[0]).includes(`src="${RAW}docs/research/${withExtension(pictures[lead])}"`), `"${lead}" does not show ${withExtension(pictures[lead])}`)
      assert.match(found[0], /\balt="[^"]*[^"\s][^"]*"/, `"${lead}" has an image with no alt text`)
    }
  })

  // A script in docs/research/ takes a picture when its header names the picture's file.
  test(`every ${name} picture the site links is in the repo and named by a screenshot script in docs/research/`, () => {
    const research = path.join(__dirname, 'docs', 'research')
    const scripts = fs.readdirSync(research).filter(f => f.endsWith('-screenshot.mjs')).map(f => fs.readFileSync(path.join(research, f), 'utf8'))
    const found = [...screenshots(read(page)), ...screenshots(read(HOME)).filter(t => t.endsWith(homePicture))]
    assert.ok(found.length > 0, `no ${name} pictures found`)
    for (const shot of found) {
      assert.ok(fs.existsSync(path.join(__dirname, shot)), `${shot} is not in the repo`)
      assert.ok(scripts.some(text => text.includes(path.basename(shot))), `no screenshot script in docs/research/ names ${shot}`)
    }
  })
}

// Color by Digit's entry and details page.
const CBD_SUMMARY = 'Colors cells, or the digits and marks in them, by digit, with colors you give to groups of digits, and keeps the colors in step as you solve.'
const CBD_LEAD_INS = ['Four modes.', 'Kept in step as you solve.', 'Digit and mark shades.', 'Profiles.', 'The profile menu.', 'Digit: Same as cell.', 'Digit: None.']
// The lead-ins that carry one picture, and the picture each shows.
const CBD_PICTURES = {
  'Digit and mark shades.': 'color-by-digit-details-digit'
}

test(`${HOME} describes Color by Digit in a short summary ending in a Details link, beside a picture of colored digits`, () => {
  const m = read(HOME).match(/<img ([^>]*)>\s*<\/div>\s*<\/div>\s*<div class="row-text">\s*<h2>Color by Digit<\/h2>\s*<p>([\s\S]*?)<\/p>/)
  assert.ok(m, `site/${HOME} has no Color by Digit entry with a picture`)
  assert.equal(m[2], CBD_SUMMARY)
  assert.match(altOf(m[1]), /digits/i)
})

// A picture's pixel size, from its file's header: a PNG's IHDR or a GIF's logical screen.
const pictureSize = (file) => {
  const bytes = fs.readFileSync(path.join(__dirname, file))
  if (bytes.subarray(1, 4).toString() === 'PNG') return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
  assert.equal(bytes.subarray(0, 3).toString(), 'GIF', `${file} is neither a PNG nor a GIF`)
  return [bytes.readUInt16LE(6), bytes.readUInt16LE(8)]
}

// Asserts an <img>'s declared width and height keep the shape of its file; returns the file's size.
const assertDeclaredAtFileShape = (img, file, what) => {
  const [w, h] = ['width', 'height'].map(a => Number((img.match(new RegExp(`${a}="(\\d+)"`)) || [])[1]))
  const [fileW, fileH] = pictureSize(file)
  assert.ok(Math.abs(w * fileH - h * fileW) <= fileW, `${what} is declared ${w} by ${h} but its file is ${fileW} by ${fileH}`)
  return [fileW, fileH]
}

// The homepage and Digit pictures show the same two boxes, 3 rows by 6 columns, so each is twice as wide as tall.
test(`${HOME} and ${CBD} show Color by Digit's example pictures as two boxes, twice as wide as tall, at their files' shape`, () => {
  const examples = [
    ['homepage picture', imgs(read(HOME)).find(t => t.includes('site-color-by-digit.png'))],
    ['Digit picture', imgs(read(CBD)).find(t => t.includes('color-by-digit-details-digit.png'))]
  ]
  for (const [what, img] of examples) {
    assert.ok(img, `no ${what}`)
    const file = (img.match(/src="[^"]*?(docs\/research\/[^"?]+)(?:\?v=[0-9a-f]{7})?"/) || [])[1]
    const [fileW, fileH] = assertDeclaredAtFileShape(img, file, what)
    if (what.endsWith('picture')) {
      assert.match(img, /alt="[^"]*\btwo\b[^"]*\bboxes\b/i, `${what}'s alt text does not say two boxes`)
      assert.ok(Math.abs(fileW - 2 * fileH) <= 2, `${what}'s file is ${fileW} by ${fileH}, not twice as wide as tall`)
    }
  }
})

const itemImg = (page, lead) => imgs(items(read(page)).find(t => leadIn(t) === lead) || '')[0] || ''

test(`${CBD}'s Four modes item is one sentence, and it and the Kept in step and profile menu items have no picture of their own`, () => {
  const four = items(read(CBD)).find(t => leadIn(t) === 'Four modes.')
  assert.equal(plain(four).replace(/^Four modes\.\s*/, ''), 'A press on the button steps the mode Cell → Digit → Both → Off, and the button\'s top strip names it.')
  for (const lead of ['Four modes.', 'Kept in step as you solve.', 'The profile menu.']) assert.equal(itemImg(CBD, lead), '', `"${lead}" has a picture`)
})

test(`${CBD} opens with a tour animation between the install link and What it adds, whose alt text lists the steps in order`, () => {
  const m = read(CBD).match(/<p><a class="install"[^>]*>[^<]*<\/a><\/p>([\s\S]*?)<h2>What it adds<\/h2>/)
  assert.ok(m, `site/${CBD} has no section between the install link and "What it adds"`)
  const found = imgs(m[1])
  assert.equal(found.length, 1, 'the tour is not one picture')
  assert.match(found[0], /src="[^"]*color-by-digit-details-tour\.gif(\?v=[0-9a-f]{7})?"/)
  const alt = altOf(found[0])
  assert.match(alt, /^An animation/)
  const steps = [/digit, 1, is typed/i, /center marks 7 and 9/i, /center mark 2 from another group/i, /Digit, Both, Off and Cell/, /profile menu opens/i, /Modular is picked/i, /recolor/i]
  let at = 0
  for (const step of steps) {
    const found = alt.slice(at).search(step)
    assert.ok(found >= 0, `the alt text does not mention ${step} after position ${at}`)
    at += found
  }
  assertDeclaredAtFileShape(found[0], 'docs/research/color-by-digit-details-tour.gif', 'the tour')
})

// A GIF the site links stays small enough to load on a phone: the budget each animation was given.
const GIF_BUDGETS = [
  [CBD, 'color-by-digit-details-tour.gif', 1000],
  [DETAILS, 'pen-tool-extras-tour.gif', 1000]
]
for (const [page, gif, kb] of GIF_BUDGETS) {
  test(`site/${page}'s ${gif} is under ${kb} KB and loops`, () => {
    assert.ok(read(page).includes(`${RAW}docs/research/${gif}`), `site/${page} does not show ${gif}`)
    const bytes = fs.readFileSync(path.join(__dirname, 'docs', 'research', gif))
    assert.ok(bytes.length < kb * 1000, `${gif} is ${bytes.length} bytes, over ${kb} KB`)
    assert.ok(bytes.includes('NETSCAPE2.0'), `${gif} has no loop extension`)
  })
}

test(`${DETAILS} opens with a tour animation between the install link and What it adds, whose alt text lists the steps in order`, () => {
  const m = read(DETAILS).match(/<p><a class="install"[^>]*>[^<]*<\/a><\/p>([\s\S]*?)<h2>What it adds<\/h2>/)
  assert.ok(m, `site/${DETAILS} has no section between the install link and "What it adds"`)
  const found = imgs(m[1])
  assert.equal(found.length, 1, 'the tour is not one picture')
  assert.match(found[0], /src="[^"]*pen-tool-extras-tour\.gif(\?v=[0-9a-f]{7})?"/)
  const alt = altOf(found[0])
  assert.match(alt, /^An animation/)
  assert.doesNotMatch(alt, /page button/i, 'the tour alt text names the page button')
  const steps = [/hold/i, /recolor/i, /solid line/i, /dashed line/i, /arrow line/i, /cell edge/i, /grid corner/i, /Thickness slider/i, /Opacity slider/i, /White outlines off and then on/i, /middle.click/i, /erase/i]
  let at = 0
  for (const step of steps) {
    const found = alt.slice(at).search(step)
    assert.ok(found >= 0, `the alt text does not mention ${step} after position ${at}`)
    at += found
  }
})

// Chris's ruling on #317: the colors item shows short pen lines in colors SudokuPad's own pen cannot draw.
const colorValues = (text) => [...text.matchAll(/#[0-9a-f]{6}/gi)].map(m => m[0])
const rgb = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
test(`${DETAILS}'s colors item names five pen colors far from SudokuPad's nine and shows a picture wider than tall, as declared`, () => {
  const sudokupad = fs.readFileSync(path.join(__dirname, 'pen-tool-extras.user.js'), 'utf8').match(/const SUDOKUPAD_PEN_COLORS = Object\.freeze\(\{([^}]*)\}\)/)
  assert.ok(sudokupad, 'pen-tool-extras.user.js has no SUDOKUPAD_PEN_COLORS')
  const script = fs.readFileSync(path.join(__dirname, 'docs', 'research', 'pen-tool-extras-recolor.mjs'), 'utf8').match(/export const PICTURE_PEN_COLORS = \[([^\]]*)\]/)
  assert.ok(script, 'pen-tool-extras-recolor.mjs has no PICTURE_PEN_COLORS')
  const ours = colorValues(script[1])
  assert.equal(ours.length, 5)
  for (const color of ours) {
    for (const other of colorValues(sudokupad[1])) {
      const distance = Math.hypot(...rgb(color).map((v, i) => v - rgb(other)[i]))
      assert.ok(distance > 60, `${color} is within ${distance.toFixed(0)} of SudokuPad's ${other}`)
    }
  }
  const img = itemImg(DETAILS, 'Customizable pen colors.')
  const alt = altOf(img)
  for (const name of ['teal', 'navy', 'dark red', 'purple', 'lime']) assert.match(alt, new RegExp(name, 'i'), `the alt text does not name ${name}`)
  assert.match(alt, /short/i)
  assert.doesNotMatch(alt, /pulldown|settings/i, 'the alt text still describes the settings dialog')
  assert.doesNotMatch(alt, /\\/, 'the alt text holds a backslash')
  const [w, h] = ['width', 'height'].map(a => Number((img.match(new RegExp(`${a}="(\\d+)"`)) || [])[1]))
  const [fileW, fileH] = pictureSize('docs/research/pen-tool-extras-bullet-colors.png')
  assert.ok(fileW > fileH, `the colors picture is ${fileW} by ${fileH}, not wider than tall`)
  assert.ok(Math.abs(w * fileH - h * fileW) <= fileW, `the colors picture is declared ${w} by ${h} but its file is ${fileW} by ${fileH}`)
})

test(`${CBD} lists what the script adds, one item per feature`, () => {
  const lines = section(CBD, 'What it adds')
  assert.equal(lines.length, CBD_LEAD_INS.length)
  assert.deepEqual(leadIns(read(CBD)), CBD_LEAD_INS)
  // Chris's ruling on #279: text a reader sees says "center marks".
  assert.doesNotMatch(lines.join(' '), /centre/)
  for (const mode of ['Cell', 'Digit', 'Both', 'Off']) assert.match(lines[0], new RegExp(`\\b${mode}\\b`), mode)
  assert.match(lines[2], /red circle/)
})

test(`${CBD} shows the settings dialog as one annotated picture whose alt text names every label, with its text`, () => {
  const m = read(CBD).match(/<h2>The settings dialog<\/h2>([\s\S]*?)<h2>/)
  assert.ok(m, `site/${CBD} has no <h2>The settings dialog</h2>`)
  const found = imgs(m[1])
  assert.equal(found.length, 1, 'the settings dialog section is not one picture')
  assert.ok(withoutTag(found[0]).includes(`src="${RAW}docs/research/color-by-digit-dialog-annotated.png"`))
  const alt = (found[0].match(/alt="([^"]*)"/) || [])[1] || ''
  for (const label of ['Settings icons', 'Pulldowns', 'Selected profile', 'Profile list', 'Palette and digits', 'Bottom row']) {
    assert.ok(alt.includes(label), `the picture's alt text does not name "${label}"`)
  }
  const text = plain(m[1])
  for (const word of ['profiles', 'groups', 'pulldowns', 'Copy settings', 'Paste settings']) assert.ok(text.includes(word), `the dialog text does not mention ${word}`)
})

test(`${CBD} good to know gives the undo behavior and the Multi-color caveat`, () => {
  assert.deepEqual(section(CBD, 'Good to know'), [
    'A digit or center mark change and its color change are one undo step. Undo, redo and replays never color.',
    "With SudokuPad's Multi-color setting off, a cell holds one color, so a group's color replaces any other color the cell had."
  ])
})

// Draw Tool's entry and details page.
const DRAW_SUMMARY = 'Adds a Draw tool for freehand lines, shapes and typed text, such as cage sums, in colors of its own. Each puzzle keeps its own drawing.'
const DRAW_LEAD_INS = ['Freehand lines', 'Shapes', 'Text', 'Colors of its own', 'Size and opacity', 'Erasing', 'Settings', 'Stays on the cells', 'Kept for each puzzle']

test(`${HOME} describes Draw Tool in a short summary ending in a Details link`, () => {
  const m = read(HOME).match(/<h2>Draw Tool<\/h2>\s*<p>([\s\S]*?)<\/p>/)
  assert.ok(m, `site/${HOME} has no Draw Tool description`)
  assert.equal(m[1], DRAW_SUMMARY)
})

test(`${DRAW} lists what the script adds as a grid of short items, one per feature`, () => {
  assert.deepEqual(section(DRAW, 'What it adds'), [
    'Freehand lines Drag on the puzzle to draw. Hold Shift for a straight line.',
    'Shapes Rectangle or ellipse, drawn in exactly the box you drag.',
    'Text Click without dragging to type, such as a cage sum. Enter or a click elsewhere finishes it, Escape drops it, and a click on text changes it.',
    "Colors of its own Nine colors that belong to Draw Tool, not to SudokuPad's pen. Pick one with a click or the digit keys 1 to 9.",
    'Size and opacity Two sliders. A line, shape or text keeps the size and opacity it was drawn with.',
    'Erasing Drag with the right mouse button across a line, shape or text to erase it. Clear all, in the panel, erases everything.',
    'Settings Color presets, a color picker for each of the nine colors, and Copy and Paste to move them to another browser.',
    'Stays on the cells Drawings stay put, and stay visible when you switch back to entering digits.',
    'Kept for each puzzle A reload keeps the drawing, for the last 50 puzzles you drew on.'
  ])
  const grid = read(DRAW).match(/<ul class="features">([\s\S]*?)<\/ul>/)
  assert.ok(grid, `site/${DRAW} has no <ul class="features">`)
  assert.deepEqual(leadIns(grid[1]), DRAW_LEAD_INS)
})

test(`${DRAW} is in the details layout: a lede and Install, the slideshow before "What it adds", then the panel with numbered steps`, () => {
  const page = read(DRAW)
  assert.match(page, /<body class="details">/)
  const at = marker => { const i = page.indexOf(marker); assert.notEqual(i, -1, `site/${DRAW} lacks ${marker}`); return i }
  const order = [at('<p class="lede">'), at('class="install"'), at('<div class="slideshow">'), at('<h2>What it adds</h2>'), at('<h2>The Draw panel</h2>'), at('<ol class="steps">'), at('<h2>Good to know</h2>')]
  assert.deepEqual(order, [...order].sort((x, y) => x - y))
  assert.match(page, /<script src="slides\.js"><\/script>/)
})

test(`${DRAW}'s slideshow is the homepage's: the same eight slides and captions, the first showing without script`, () => {
  const [onHome] = slideshows(rowsOf(read(HOME)).find(r => r.includes('<h2>Draw Tool</h2>')))
  const [onPage] = slideshows(read(DRAW).replace('</footer>', '</section>').replace(/<h2>What it adds<\/h2>/, '</section>$&'))
  const tidy = html => html.replace(/\s+/g, ' ').trim()
  assert.equal(imgs(onPage).length, 8)
  assert.deepEqual(imgs(onPage), imgs(onHome))
  const captions = html => [...html.matchAll(/<p class="slide-caption( current)?">([^<]*)<\/p>/g)].map(m => m[0])
  assert.deepEqual(captions(onPage), captions(onHome))
  assert.match(tidy(onPage), /<p class="slide-caption current">Draw a line<\/p>/)
})

test('no page links a removed Draw Tool animation', () => {
  for (const name of PAGES) assert.doesNotMatch(read(name), /draw-tool-(details-[a-z]+\.gif|bullet-lines)/, `site/${name} links a removed Draw Tool picture`)
  for (const gone of ['draw-tool-details-shapes.gif', 'draw-tool-details-text.gif', 'draw-tool-details-erasing.gif', 'draw-tool-details-screenshot.mjs']) {
    assert.equal(fs.existsSync(path.join(__dirname, 'docs', 'research', gone)), false, `${gone} is still in docs/research/`)
  }
})

test(`${DRAW} shows the Draw panel as one annotated picture whose alt text names every label`, () => {
  const m = read(DRAW).match(/<h2>The Draw panel<\/h2>([\s\S]*?)<h2>/)
  assert.ok(m, `site/${DRAW} has no <h2>The Draw panel</h2>`)
  const found = imgs(m[1])
  assert.equal(found.length, 1, 'the Draw panel section is not one picture')
  assert.ok(withoutTag(found[0]).includes(`src="${RAW}docs/research/draw-tool-panel-annotated.png"`))
  const alt = altOf(found[0])
  for (const label of ['Color buttons', 'Clear all', 'Shape', 'Settings', 'Size slider', 'Opacity slider']) {
    assert.ok(alt.includes(label), `the picture's alt text does not name "${label}"`)
  }
  assert.match(alt, /press 1 to 9/)
})

test(`${DRAW} good to know says the drawing stays in this browser, and what clears it`, () => {
  assert.deepEqual(section(DRAW, 'Good to know'), ['The drawing is kept in this browser only, so another browser or device does not show it.', 'Restart clears the drawing. If a drawing cannot be saved, a message says so.'])
})

// A script in docs/research/ takes a picture when its header names the picture's file.

test('the README has a Draw Tool row with a Details link, and the Settings sentence names Draw Tool', () => {
  const readme = fs.readFileSync(path.join(__dirname, 'README.md'), 'utf8')
  assert.match(readme, /^\| Draw Tool \| .*\[Details\]\(https:\/\/caneff\.github\.io\/sudokupad-scripts\/draw-tool\.html\).*\[Install\]\(https:\/\/raw\.githubusercontent\.com\/caneff\/sudokupad-scripts\/main\/draw-tool\.user\.js\)/m)
  assert.match(readme, /Each script except No Tab Letters adds an entry to SudokuPad's settings/)
})

test('the README has a Color by Digit row with the short summary and a Details link', () => {
  const readme = fs.readFileSync(path.join(__dirname, 'README.md'), 'utf8')
  const row = readme.match(/^\| Color by Digit \|.*$/m)
  assert.ok(row, 'the README has no Color by Digit row')
  assert.ok(row[0].includes(` ${CBD_SUMMARY[0].toLowerCase()}${CBD_SUMMARY.slice(1)} [Details](https://caneff.github.io/sudokupad-scripts/${CBD}) `), row[0])
  assert.match(row[0], /\[Install\]\(https:\/\/raw\.githubusercontent\.com\/caneff\/sudokupad-scripts\/main\/color-by-digit\.user\.js\)/)
})

shared({
  page: DRAW,
  script: 'draw-tool',
  name: 'Draw Tool',
  summary: DRAW_SUMMARY,
  intro: 'Adds to SudokuPad a Draw tool for freehand lines, shapes and typed text, such as cage sums, in colors of its own.',
  leadIns: DRAW_LEAD_INS,
  pictures: {},
  homePicture: 'draw-tool-slide-1-line.png'
})

shared({
  page: CBD,
  script: 'color-by-digit',
  name: 'Color by Digit',
  summary: CBD_SUMMARY,
  intro: `Adds to SudokuPad a button that ${CBD_SUMMARY[0].toLowerCase()}${CBD_SUMMARY.slice(1)}`,
  leadIns: CBD_LEAD_INS,
  pictures: CBD_PICTURES,
  homePicture: 'site-color-by-digit.png'
})
