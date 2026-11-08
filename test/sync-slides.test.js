'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { renderShow, syncText } = require('../sync-slides.js')

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
  assert.match(syncText(open, { x: show }, hashOf).problems[0], /slideshow:x/)
})
