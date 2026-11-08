'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const { RAW, pictureTags, tagOf } = require('../tag-pictures.js')
const SCRIPT_SUFFIX = '.user.js'
const ROOT = path.join(__dirname, '..')
const SITE_DIR = path.join(ROOT, 'site')
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
const rootScripts = () => fs.readdirSync(ROOT).filter(f => f.endsWith(SCRIPT_SUFFIX))
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

// #342: docs/research/ has one folder per script, and site/ for pictures of a whole page.
const RESEARCH_FOLDERS = [...rootScripts().map(f => f.slice(0, -SCRIPT_SUFFIX.length)), 'site']

test('every picture the site loads is in a script folder of docs/research/ or in docs/research/site/, and one named for a script is in its folder', () => {
  for (const name of PAGES) {
    for (const shot of screenshots(read(name))) {
      const m = shot.match(/^docs\/research\/([^/]+)\/([^/]+)$/)
      assert.ok(m && RESEARCH_FOLDERS.includes(m[1]), `site/${name} loads ${shot}, which is not in a folder of docs/research/`)
      const script = RESEARCH_FOLDERS.find(f => f !== 'site' && (m[2].startsWith(f + '-') || m[2].startsWith(f + '.')))
      if (script) assert.equal(m[1], script, `site/${name} loads ${shot}, which is named for ${script}`)
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
      assert.equal(fs.existsSync(path.join(ROOT, l.slice(RAW.length))), true, `site/${name} links missing script ${l}`)
    }
  })

  test(`every screenshot ${name} loads from raw GitHub is tracked by git`, () => {
    const shots = screenshots(page)
    assert.ok(shots.length > 0, `no screenshots found on ${name}`)
    const tracked = execFileSync('git', ['ls-files', '--', ...shots], { cwd: ROOT, encoding: 'utf8' }).split('\n')
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
  { page: DRAW, script: 'draw-tool', name: 'Text Anywhere' },
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
  const m = read(DETAILS).match(/<\/p>\s*<p class="lede">(Adds to <a href="https:\/\/sudokupad\.app">SudokuPad<\/a>'s pen tool[\s\S]*?)<\/p>/)
  assert.ok(m, `site/${DETAILS} has no intro paragraph starting "Adds to SudokuPad's pen tool", with SudokuPad linked`)
  assert.equal(plain(m[1]), "Adds to SudokuPad's pen tool: customizable pen colors, dashed and arrow lines, and marks on cell edges and grid corners. Turn the pen tool on in SudokuPad's settings first.")
})

const DETAILS_LEAD_INS = ['Customizable pen colors', 'Dashed and arrow lines', 'Marks on cell edges', 'Marks on grid corners', 'Erase a whole line', 'White outlines']

test(`${DETAILS} lists what the script adds as a grid of short items, one per feature, and never mentions the middle button`, () => {
  assert.deepEqual(section(DETAILS, 'What it adds'), [
    'Customizable pen colors Hold a pen color button, or pick a preset in the settings.',
    'Dashed and arrow lines Two more pages of pens.',
    'Marks on cell edges Click an edge for an X, a circle or an arrow.',
    'Marks on grid corners Click near a corner for an X or a circle.',
    'Erase a whole line Right-click a line to remove all of it, or a mark to remove that.',
    'White outlines An outline keeps lines readable over colored cells.'
  ])
  const grid = read(DETAILS).match(/<ul class="features">([\s\S]*?)<\/ul>/)
  assert.ok(grid, `site/${DETAILS} has no <ul class="features">`)
  assert.deepEqual(leadIns(grid[1]), DETAILS_LEAD_INS)
  assert.doesNotMatch(read(DETAILS), /middle/i, `site/${DETAILS} mentions the middle button`)
})

const altOf = img => (img.match(/alt="([^"]*)"/) || [])[1] || ''
const imgs = html => [...html.matchAll(/<img\b[^>]*>/g)].map(m => m[0])
const withoutTag = img => img.replace(/\?v=[0-9a-f]{7}"/, '"')

test(`${DETAILS} has no picture inside its feature grid, and no figure but the pen panel`, () => {
  const page = read(DETAILS)
  for (const li of items(page)) assert.deepEqual(imgs(li), [], `"${leadIn(li)}" has a picture`)
  assert.doesNotMatch(page, /<figure\b/)
  assert.equal(imgs(page).length, PEN_SLIDES.length + 1, 'the page has the slides and the pen panel picture')
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

// One row per script, in this order; Details only where a details page exists; a script whose file name is not its shown name gives the file name third.
const ROWS = [
  ['Pen Tool Extras', DETAILS], ['Text Anywhere', DRAW, 'draw-tool'], ['Color by Digit', CBD], ['Dark Page', undefined], ['Auto Rules Resizer', undefined]
]
const rowsOf = html => html.split('<section class="row">').slice(1)

test(`${HOME} has one row per script in order, each with an Install button beside its Details link where there is one`, () => {
  const rows = rowsOf(read(HOME))
  assert.deepEqual(rows.map(r => (r.match(/<h2>([^<]*)<\/h2>/) || [])[1]), ROWS.map(([n]) => n))
  rows.forEach((row, i) => {
    const [name, details, file] = ROWS[i]
    const script = (file || name.toLowerCase().replace(/ /g, '-')) + SCRIPT_SUFFIX
    assert.match(row, new RegExp(`<p class="actions"><a class="install" href="${RAW.replace(/\./g, '\\.')}${script}">Install<span class="visually-hidden"> ${name}</span></a>${details ? `<a class="more" href="${details}">Details &rarr;</a>` : ''}</p>`), name)
  })
})

test("the shared Install button's text size and icon size are set in style.css", () => {
  const css = fs.readFileSync(path.join(SITE_DIR, 'style.css'), 'utf8')
  const install = css.match(/\.install \{[^}]*\}/)[0]
  assert.match(install, /font-size: 1\.05rem/)
  assert.match(css, /\.install::before \{[^}]*width: 1\.3em/)
})

test(`${HOME}'s other rows show one picture and no pager`, () => {
  for (const row of rowsOf(read(HOME)).filter(r => !r.includes('<h2>Text Anywhere</h2>') && !r.includes('<h2>Pen Tool Extras</h2>') && !r.includes('<h2>Color by Digit</h2>'))) {
    assert.equal(imgs(row).length, 1)
    assert.doesNotMatch(row, /slide-caption|slideshow/)
  }
})

// Each slideshow: its picture file's name (after the script's prefix) and its caption, in order.
const CBD_SLIDES = [
  ['1-start', 'Start'], ['2-type', 'Type a 1'], ['3-marks', 'Center marks 7 and 9'], ['4-add', 'Add a center mark 2'], ['5-digit', 'Digit'], ['6-both', 'Both'],
  ['7-off', 'Off'], ['8-menu', 'Open the profile menu'], ['9-modular', 'Pick Modular'], ['10-split', 'Cells from one profile, digits from another']
]
const PEN_SLIDES = [
  ['1-line', 'Draw a line'], ['2-hold', 'Hold a color button'], ['3-color', 'Pick a color'], ['4-solid', 'A solid line'], ['5-dashed', 'A dashed line'], ['6-arrow', 'An arrow line'],
  ['7-edges', 'Marks on cell edges: click for an X, again for a circle, again for an arrow, again to turn it round'], ['8-corner', 'Marks on grid corners: click for an X, again for a circle'], ['9-thickness', 'Thickness'], ['10-opacity', 'Opacity'],
  ['11-outline-off', 'White outlines off'], ['12-outline-on', 'White outlines on'], ['13-erase', 'Right-click a line to delete it'], ['14-erased', 'The whole line is gone']
]
const DRAW_SLIDES = [
  ['1-type', 'Left click to type a note'], ['3-background', 'Background: a box behind the next note'],
  ['6-select', 'Select: drag a box round notes, then change them together'], ['9-long', 'Long notes scroll; drag any corner to resize'], ['7-erase', 'Erase: right-click a note']
]
const SHOWS = [
  { heading: 'Color by Digit', page: CBD, prefix: 'color-by-digit/color-by-digit-slide-', slides: CBD_SLIDES },
  { heading: 'Pen Tool Extras', page: DETAILS, prefix: 'pen-tool-extras/pen-tool-extras-slide-', slides: PEN_SLIDES },
  { heading: 'Text Anywhere', page: DRAW, prefix: 'draw-tool/draw-tool-slide-', slides: DRAW_SLIDES }
]

// A slideshow's own markup, from a homepage row or a details page (where it ends at "What it adds").
const showOf = html => html.split('<div class="slideshow">')[1].split(/<h2>What it adds<\/h2>|<\/section>/)[0]
const captionsOf = html => [...html.matchAll(/<p class="slide-caption( current)?">([^<]*)<\/p>/g)].map(m => ({ current: Boolean(m[1]), text: m[2] }))
const homeShow = heading => showOf(rowsOf(read(HOME)).find(r => r.includes(`<h2>${heading}</h2>`)))

for (const { heading, page: file, prefix, slides } of SHOWS) {
  test(`${HOME}'s ${heading} row is a slideshow of ${slides.length} slides, each a tagged picture of its own file with a caption, the first showing without script`, () => {
    const show = homeShow(heading)
    const pictures = imgs(show)
    const captions = captionsOf(show)
    assert.deepEqual(captions.map(c => c.text), slides.map(([, caption]) => caption))
    assert.equal(pictures.length, slides.length)
    pictures.forEach((img, i) => {
      assert.match(img, i === 0 ? /class="slide current"/ : /class="slide"/)
      assert.match(img, new RegExp(`src="${RAW.replace(/\./g, '\\.')}docs/research/${prefix}${slides[i][0]}\\.png\\?v=[0-9a-f]{7}"`))
      assert.match(img, /\balt="[^"]*[^"\s][^"]*"/)
      assertDeclaredAtFileShape(img, `docs/research/${prefix}${slides[i][0]}.png`, `slide ${i + 1}`)
    })
    assert.deepEqual(captions.map(c => c.current), slides.map((_, i) => i === 0))
    assert.doesNotMatch(plain(show), /middle/i)
  })

  test(`${file} opens with the homepage's ${heading} slideshow, picture for picture and caption for caption`, () => {
    const onPage = showOf(read(file))
    assert.deepEqual(imgs(onPage), imgs(homeShow(heading)))
    assert.deepEqual(captionsOf(onPage), captionsOf(homeShow(heading)))
    assert.equal(imgs(onPage).length, slides.length)
  })
}

// Each details page's sections, in order: the page lays out the lede and Install, the slideshow, "What it adds", then its own sections.
const assertSectionsInOrder = (file, markers) => {
  const page = read(file)
  assert.match(page, /<body class="details">/)
  assert.match(page, /<script src="slides\.js"><\/script>/)
  const order = markers.map(marker => { const i = page.indexOf(marker); assert.notEqual(i, -1, `site/${file} lacks ${marker}`); return i })
  assert.deepEqual(order, [...order].sort((a, b) => a - b))
}

test(`${DETAILS} has the slideshow between the install link and "What it adds", then the pen panel and Good to know`, () => {
  assertSectionsInOrder(DETAILS, ['<p class="lede">', 'class="install"', '<div class="slideshow">', '<h2>What it adds</h2>', '<h2>The pen panel</h2>', '<h2>Good to know</h2>'])
})

test('netlify.toml publishes only site/', () => {
  const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8')
  assert.match(toml, /^\s*publish\s*=\s*"site"\s*$/m)
})

test('the Pages workflow publishes only site/', () => {
  const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'pages.yml'), 'utf8')
  assert.match(workflow, /uses:\s*actions\/upload-pages-artifact@\S+\s+with:\s+path:\s*['"]?site\/?['"]?\s*$/m)
})

test(`${DETAILS} shows the pen panel as one annotated picture whose alt text names every label`, () => {
  const m = read(DETAILS).match(/<h2>The pen panel<\/h2>([\s\S]*?)<h2>/)
  assert.ok(m, `site/${DETAILS} has no <h2>The pen panel</h2>`)
  assert.doesNotMatch(m[1], /<ol\b|<li\b/, 'the pen panel section is the intro and the picture only')
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

// Checks shared by the Text Anywhere and Color by Digit details pages: the header's @description, the intro, no picture in the feature grid, and a screenshot script per picture.
const SCRIPT_INTRO = /<\/p>\s*<p(?: class="lede")?>(Adds (?:a button )?to <a href="https:\/\/sudokupad\.app">SudokuPad<\/a>[\s\S]*?)<\/p>/
const shared = ({ page, script, name, summary, intro, homePicture }) => {
  test(`${script}.user.js's @description is the homepage summary`, () => {
    const head = fs.readFileSync(path.join(ROOT, script + SCRIPT_SUFFIX), 'utf8')
    assert.equal((head.match(/^\/\/ @description\s+(.*)$/m) || [])[1], summary)
  })

  test(`${page} intro says what the script adds, with SudokuPad linked`, () => {
    const m = read(page).match(SCRIPT_INTRO)
    assert.ok(m, `site/${page} has no intro paragraph starting "Adds to SudokuPad" or "Adds a button to SudokuPad", with SudokuPad linked`)
    assert.equal(plain(m[1]), intro)
  })

  test(`${page} has no picture inside its feature grid`, () => {
    const grid = read(page).match(/<ul class="features">([\s\S]*?)<\/ul>/)
    assert.ok(grid, `site/${page} has no <ul class="features">`)
    assert.deepEqual(imgs(grid[1]), [])
  })

  // A script in docs/research/ takes a picture when its header names the picture's file.
  test(`every ${name} picture the site links is in the repo and named by a screenshot script in docs/research/`, () => {
    const research = path.join(ROOT, 'docs', 'research')
    const scripts = fs.readdirSync(research, { recursive: true }).filter(f => f.endsWith('-screenshot.mjs')).map(f => fs.readFileSync(path.join(research, f), 'utf8'))
    const found = [...screenshots(read(page)), ...screenshots(read(HOME)).filter(t => t.endsWith(homePicture))]
    assert.ok(found.length > 0, `no ${name} pictures found`)
    for (const shot of found) {
      assert.ok(fs.existsSync(path.join(ROOT, shot)), `${shot} is not in the repo`)
      assert.ok(scripts.some(text => text.includes(path.basename(shot))), `no screenshot script in docs/research/ names ${shot}`)
    }
  })
}

// Color by Digit's entry and details page.
const CBD_SUMMARY = 'Colors cells, or the digits and marks in them, by digit, with colors you give to groups of digits, and keeps the colors in step as you solve.'
const CBD_LEAD_INS = ['Four modes', 'Updates as you solve', 'Colored digits', 'Profiles', 'Quick switching', 'A separate digit profile']

test(`${HOME} describes Color by Digit in a short summary ending in a Details link, beside its slideshow`, () => {
  const m = read(HOME).match(/<\/div>\s*<div class="row-text">\s*<h2>Color by Digit<\/h2>\s*<p>([\s\S]*?)<\/p>/)
  assert.ok(m, `site/${HOME} has no Color by Digit entry`)
  assert.equal(m[1], CBD_SUMMARY)
})

// A picture's pixel size, from its file's header: a PNG's IHDR or a GIF's logical screen.
const pictureSize = (file) => {
  const bytes = fs.readFileSync(path.join(ROOT, file))
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

test(`${CBD} has the slideshow between the install link and "What it adds", then the settings dialog`, () => {
  assertSectionsInOrder(CBD, ['<p class="lede">', 'class="install"', '<div class="slideshow">', '<h2>What it adds</h2>', '<h2>The settings dialog</h2>', '<h2>Good to know</h2>'])
})

test("Color by Digit's slide 5 shows the three marks that repeat the given 2, and its last slide splits the cell and digit profiles", () => {
  const alts = homeShow('Color by Digit').match(/\balt="[^"]*"/g)
  assert.match(alts[4], /three marks that repeat the given 2/)
  assert.match(alts[9], /cells filled in the first profile's .*digits and marks shaded in Modular's/)
})

// Chris's ruling on #317: the slides' pen colors are far from SudokuPad's nine, so they show colors its own pen cannot draw.
const colorValues = (text) => [...text.matchAll(/#[0-9a-f]{6}/gi)].map(m => m[0])
const rgb = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
test("the slides' five pen colors are far from SudokuPad's nine", () => {
  const sudokupad = fs.readFileSync(path.join(ROOT, 'pen-tool-extras.user.js'), 'utf8').match(/const SUDOKUPAD_PEN_COLORS = Object\.freeze\(\{([^}]*)\}\)/)
  assert.ok(sudokupad, 'pen-tool-extras.user.js has no SUDOKUPAD_PEN_COLORS')
  const script = fs.readFileSync(path.join(ROOT, 'docs', 'research', 'pen-tool-extras', 'pen-tool-extras-recolor.mjs'), 'utf8').match(/export const PICTURE_PEN_COLORS = \[([^\]]*)\]/)
  assert.ok(script, 'pen-tool-extras-recolor.mjs has no PICTURE_PEN_COLORS')
  const ours = colorValues(script[1])
  assert.equal(ours.length, 5)
  for (const color of ours) {
    for (const other of colorValues(sudokupad[1])) {
      const distance = Math.hypot(...rgb(color).map((v, i) => v - rgb(other)[i]))
      assert.ok(distance > 60, `${color} is within ${distance.toFixed(0)} of SudokuPad's ${other}`)
    }
  }
})

test(`${CBD} lists what the script adds, one item per feature`, () => {
  const lines = section(CBD, 'What it adds')
  assert.deepEqual(lines, [
    'Four modes Each press of the button moves to the next mode: Cell, Digit, Both, Off. The chips on the button preview the mode.',
    'Updates as you solve A cell takes its group\'s color when its digit, or every one of its center marks, is in that group. The color goes when that stops being true.',
    'Colored digits In Digit and Both, digits and marks take a darker shade of their group\'s color. A mark that conflicts gets a red circle.',
    'Profiles A profile splits the digits into groups and gives each a color. Five come built in (Low/5/High, Odd/Even, Entropic, Modular and Each digit), and you can keep up to six.',
    'Quick switching Click the arrow on the button, or right-click or hold the button, to open the profile list. A pick applies at once.',
    'A separate digit profile Digits can follow the cell profile, use another profile, or go uncolored.'
  ])
  const grid = read(CBD).match(/<ul class="features">([\s\S]*?)<\/ul>/)
  assert.ok(grid, `site/${CBD} has no <ul class="features">`)
  assert.deepEqual(leadIns(grid[1]), CBD_LEAD_INS)
})

test(`${CBD} shows the settings dialog as one annotated picture whose alt text names every label, with its intro and one sentence`, () => {
  const m = read(CBD).match(/<h2>The settings dialog<\/h2>([\s\S]*?)<h2>/)
  assert.ok(m, `site/${CBD} has no <h2>The settings dialog</h2>`)
  const found = imgs(m[1])
  assert.equal(found.length, 1, 'the settings dialog section is not one picture')
  assert.ok(withoutTag(found[0]).includes(`src="${RAW}docs/research/color-by-digit/color-by-digit-dialog-annotated.png"`))
  const alt = (found[0].match(/alt="([^"]*)"/) || [])[1] || ''
  for (const label of ['Settings icons', 'Pulldowns', 'Selected profile', 'Profile list', 'Palette and digits', 'Bottom row']) {
    assert.ok(alt.includes(label), `the picture's alt text does not name "${label}"`)
  }
  assert.equal(plain(m[1]).trim(), 'Edit profiles, in the profile menu, opens it. A click on a digit already in the chosen color clears it.')
})

test(`${CBD} good to know gives the undo behavior, the Multi-color caveat and where the button is`, () => {
  assert.deepEqual(section(CBD, 'Good to know'), [
    'A digit or center mark change and its color change are one undo step. Undo, redo and replays never color.',
    "With SudokuPad's Multi-color setting off, a cell holds one color, so a group's color replaces any other color the cell had.",
    'The button sits in the bottom row with Undo, Redo, Check and Select. That row holds five buttons, and any more, from this script or another, wrap onto a second row under it.'
  ])
})

// Text Anywhere's entry and details page.
const DRAW_SUMMARY = 'Adds a Text Anywhere tool for typed notes on the board or beside it, such as cage sums, in colors of its own. Each puzzle keeps its own notes.'
const DRAW_LEAD_INS = ['Typed notes anywhere', 'Formatting', 'Long notes', 'Readable over digits', 'Colors, size and transparency', 'Select and move', 'Erase', 'Kept per puzzle', 'Settings']

test(`${HOME} describes Text Anywhere in a short summary ending in a Details link`, () => {
  const m = read(HOME).match(/<h2>Text Anywhere<\/h2>\s*<p>([\s\S]*?)<\/p>/)
  assert.ok(m, `site/${HOME} has no Text Anywhere description`)
  assert.equal(m[1], DRAW_SUMMARY)
})

test(`${DRAW} lists what the script adds as a grid of short items, one per feature`, () => {
  assert.deepEqual(section(DRAW, 'What it adds'), [
    'Typed notes anywhere Click the board, or beside it, to type. Enter starts a new line; a double-click edits a note.',
    'Formatting **bold**, *italic*, ~~strikethrough~~, and lines starting - become bullets.',
    'Long notes A long note wraps and scrolls; drag a corner to resize it.',
    'Readable over digits A white outline round the letters, and an optional box behind the note.',
    'Colors, size and transparency Nine colors of its own (keys 1-9), and Size and Transparency sliders.',
    'Select and move Click a note or drag a box round several; drag to move, arrow keys to nudge.',
    'Erase Right-click a note, or press Delete.',
    'Kept per puzzle Notes survive a reload, for your last 50 puzzles.',
    'Settings Color presets, the box color, the outline, a frame round boxes, and Copy and Paste to another browser.'
  ])
  const grid = read(DRAW).match(/<ul class="features">([\s\S]*?)<\/ul>/)
  assert.ok(grid, `site/${DRAW} has no <ul class="features">`)
  assert.deepEqual(leadIns(grid[1]), DRAW_LEAD_INS)
})

test(`${DRAW} has the slideshow between the install link and "What it adds", then the panel`, () => {
  assertSectionsInOrder(DRAW, ['<p class="lede">', 'class="install"', '<div class="slideshow">', '<h2>What it adds</h2>', '<h2>The Text Anywhere panel</h2>', '<h2>Good to know</h2>'])
})

test(`${DRAW} shows the Text Anywhere panel as an intro and one annotated picture whose alt text names every label`, () => {
  const m = read(DRAW).match(/<h2>The Text Anywhere panel<\/h2>([\s\S]*?)<h2>/)
  assert.ok(m, `site/${DRAW} has no <h2>The Text Anywhere panel</h2>`)
  const found = imgs(m[1])
  assert.equal(found.length, 1, 'the Text Anywhere panel section is not one picture')
  assert.doesNotMatch(m[1], /<ol\b|<li\b/, 'the Text Anywhere panel section is the intro and the picture only')
  assert.ok(withoutTag(found[0]).includes(`src="${RAW}docs/research/draw-tool/draw-tool-panel-annotated.png"`))
  const alt = altOf(found[0])
  for (const label of ['Color buttons', 'Background', 'Clear all', 'Settings', 'Size', 'Transparency']) {
    assert.ok(alt.includes(label), `the picture's alt text does not name "${label}"`)
  }
  assert.match(alt, /press 1 to 9/)
})

const DRAW_WORD_LIMIT = 320
test(`${DRAW} stays short: its text is under ${DRAW_WORD_LIMIT} words`, () => {
  const words = plain(read(DRAW).replace(/<(script|footer)[\s\S]*?<\/\1>/g, '')).split(' ').length
  assert.ok(words < DRAW_WORD_LIMIT, `site/${DRAW} has ${words} words`)
})

test(`${DRAW} good to know says the notes stay in this browser, and what clears them`, () => {
  assert.deepEqual(section(DRAW, 'Good to know'), ['The notes are kept in this browser only, so another browser or device does not show them.', 'Restart clears the notes. If the notes cannot be saved, a message says so.'])
})

// A script in docs/research/ takes a picture when its header names the picture's file.

test('the README has a Text Anywhere row with a Details link, and the Settings sentence is kept', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8')
  assert.match(readme, /^\| Text Anywhere \| .*\[Details\]\(https:\/\/caneff\.github\.io\/sudokupad-scripts\/draw-tool\.html\).*\[Install\]\(https:\/\/raw\.githubusercontent\.com\/caneff\/sudokupad-scripts\/main\/draw-tool\.user\.js\)/m)
  assert.match(readme, /Each script except No Tab Letters adds an entry to SudokuPad's settings/)
})

test('the README has a Color by Digit row with the short summary and a Details link', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8')
  const row = readme.match(/^\| Color by Digit \|.*$/m)
  assert.ok(row, 'the README has no Color by Digit row')
  assert.ok(row[0].includes(` ${CBD_SUMMARY[0].toLowerCase()}${CBD_SUMMARY.slice(1)} [Details](https://caneff.github.io/sudokupad-scripts/${CBD}) `), row[0])
  assert.match(row[0], /\[Install\]\(https:\/\/raw\.githubusercontent\.com\/caneff\/sudokupad-scripts\/main\/color-by-digit\.user\.js\)/)
})

shared({
  page: DRAW,
  script: 'draw-tool',
  name: 'Text Anywhere',
  summary: DRAW_SUMMARY,
  intro: 'Adds to SudokuPad a Text Anywhere tool for typed notes on the board or beside it, such as cage sums, in colors of its own.',
  homePicture: 'draw-tool-slide-1-type.png'
})

shared({
  page: CBD,
  script: 'color-by-digit',
  name: 'Color by Digit',
  summary: CBD_SUMMARY,
  intro: 'Adds a button to SudokuPad that colors cells, or the digits in them, by which group each digit is in, and keeps the colors up to date as you solve.',
  homePicture: 'color-by-digit-slide-1-start.png'
})

// The details-page frame is as tall as its tallest slide, so a slideshow whose slides differ in shape leaves empty bands; the live test checks the fit itself.
for (const { heading, page: file } of SHOWS) {
  test(`${file}'s ${heading} slides all declare one width and height`, () => {
    const sizes = new Set([...showOf(read(file)).matchAll(/<img class="slide[^>]*? width="(\d+)" height="(\d+)"/g)].map(m => `${m[1]}x${m[2]}`))
    assert.equal(sizes.size, 1, `slide sizes: ${[...sizes].join(', ')}`)
  })
}
