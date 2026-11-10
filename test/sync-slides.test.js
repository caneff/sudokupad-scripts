'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { renderShow, syncText, syncDir } = require('../sync-slides.js')

const show = { dir: 'docs/research/x/', width: 10, height: 5, slides: [{ picture: 'a.png', alt: 'A "one" & <more>', caption: 'First' }, { picture: 'b.png', alt: 'Two', caption: 'Second' }] }
const hashOf = file => file === 'docs/research/x/a.png' ? 'aaaaaaa' : 'bbbbbbb'
const RAW = 'https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/'

test('a rendered show makes the first slide and caption current, tags each picture and escapes text', () => {
  const html = renderShow(show, 2, hashOf)
  assert.equal(html, [
    '  <div class="slideshow">',
    '    <div class="slide-frame">',
    `      <img class="slide current" src="${RAW}docs/research/x/a.png?v=aaaaaaa" alt="A &quot;one&quot; &amp; &lt;more&gt;" width="10" height="5">`,
    `      <img class="slide" src="${RAW}docs/research/x/b.png?v=bbbbbbb" alt="Two" width="10" height="5">`,
    '    </div>',
    '    <div class="slide-bar">',
    '      <div class="slide-captions">',
    '        <p class="slide-caption current">First</p>',
    '        <p class="slide-caption">Second</p>',
    '      </div>',
    '    </div>',
    '  </div>'
  ].join('\n'))
})

const animated = { ...show, slides: [{ ...show.slides[0], animation: 'a.webp' }, show.slides[1]] }
const hashOfAnimated = file => file === 'docs/research/x/a.webp' ? 'ccccccc' : hashOf(file)

test('a slide with an animation is a picture: the WebP for motion, the still PNG as the slide image, each tagged', () => {
  const lines = renderShow(animated, 2, hashOfAnimated).split('\n')
  assert.deepEqual(lines.slice(2, 7), [
    '      <picture>',
    `        <source media="(prefers-reduced-motion: no-preference)" srcset="${RAW}docs/research/x/a.webp?v=ccccccc">`,
    `        <img class="slide current" src="${RAW}docs/research/x/a.png?v=aaaaaaa" alt="A &quot;one&quot; &amp; &lt;more&gt;" width="10" height="5">`,
    '      </picture>',
    `      <img class="slide" src="${RAW}docs/research/x/b.png?v=bbbbbbb" alt="Two" width="10" height="5">`
  ])
})

const page = body => `<body>\n  <!-- slideshow:x -->\n${body}\n  <!-- /slideshow:x -->\n</body>`

test('a stale block is rewritten from the source and a current one is left alone', () => {
  const stale = syncText(page('  <div class="slideshow">old</div>'), { x: show }, hashOf)
  assert.deepEqual(stale.problems, [])
  assert.equal(stale.text, page(renderShow(show, 2, hashOf)))
  assert.equal(syncText(stale.text, { x: show }, hashOf).text, stale.text)
})

test('a marker naming no slideshow, or opened and never closed, is a problem and changes nothing', () => {
  const unknown = page('x')
  assert.match(syncText(unknown, {}, hashOf).problems[0], /slideshow:x/)
  assert.equal(syncText(unknown, {}, hashOf).text, unknown)
  const open = '<!-- slideshow:x -->\nbody'
  assert.match(syncText(open, { x: show }, hashOf).problems[0], /no closing marker/)
  assert.equal(syncText(open, { x: show }, hashOf).text, open)
})

test('an opening marker never closed does not let the next block swallow what lies between them', () => {
  const doubled = `<!-- slideshow:x -->\nkeep me\n${page('  <div class="slideshow">old</div>')}`
  const result = syncText(doubled, { x: show }, hashOf)
  assert.equal(result.problems.length, 1)
  assert.equal(result.text, doubled)
})

test('a page with Windows line endings is a problem, not a page already in sync', () => {
  const crlf = page('  old').replace(/\n/g, '\r\n')
  assert.match(syncText(crlf, { x: show }, hashOf).problems[0], /line endings/)
  assert.equal(syncText(crlf, { x: show }, hashOf).text, crlf)
})

test('syncDir rewrites each page and names the page of every problem', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-slides-'))
  try {
    fs.writeFileSync(path.join(dir, 'a.html'), page('old'))
    fs.writeFileSync(path.join(dir, 'b.html'), '<!-- slideshow:y -->\nbody')
    assert.deepEqual(syncDir(dir, { x: show }, hashOf).map(p => p.slice(0, 7)), ['b.html:'])
    assert.equal(fs.readFileSync(path.join(dir, 'a.html'), 'utf8'), page(renderShow(show, 2, hashOf)))
  } finally { fs.rmSync(dir, { recursive: true }) }
})
