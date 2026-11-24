'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { tagPictures, pictureTags, pictureAddress, pictureFile, copyPictures, RAW } = require('../tag-pictures.js')

const hashOf = file => ({ 'docs/research/a.png': 'aaaaaaa', 'docs/research/b.gif': 'bbbbbbb' })[file]
const at = (file, tag) => `${RAW}pictures/${tag}/${file}`
// raw.githubusercontent.com ignores a query when it caches, so the tag is a folder of the path (#1183).
const SAMPLE = [
  '<p>Hello <a href="x.html">x</a></p>',
  `<img src="${RAW}docs/research/a.png" alt="A, with ?v= inside" width="1">`,
  `<img class="wide" src="${at('docs/research/b.gif', '0000000')}" alt="B">`,
  '<img src="https://example.com/c.png" alt="C">',
  `<img src="${RAW}docs/research/a.png?v=1234567" alt="D">`,
  `<a href="${RAW}tool.user.js">Install</a>`,
  `<!-- <img src="${RAW}docs/research/gone.png"> -->`
].join('\n')

test('tagPictures puts a 7-character tag folder before an untagged repo picture\'s path, replaces a stale one and drops an old ?v= query', () => {
  const out = tagPictures(SAMPLE, hashOf)
  assert.equal(out, [
    '<p>Hello <a href="x.html">x</a></p>',
    `<img src="${at('docs/research/a.png', 'aaaaaaa')}" alt="A, with ?v= inside" width="1">`,
    `<img class="wide" src="${at('docs/research/b.gif', 'bbbbbbb')}" alt="B">`,
    '<img src="https://example.com/c.png" alt="C">',
    `<img src="${at('docs/research/a.png', 'aaaaaaa')}" alt="D">`,
    `<a href="${RAW}tool.user.js">Install</a>`,
    `<!-- <img src="${RAW}docs/research/gone.png"> -->`
  ].join('\n'))
})

test('tagPictures changes nothing when every tag is current', () => {
  const once = tagPictures(SAMPLE, hashOf)
  assert.equal(tagPictures(once, hashOf), once)
})

test('pictureTags lists each repo picture\'s file and tag, undefined for an untagged one, and skips comments', () => {
  assert.deepEqual(pictureTags(SAMPLE), [
    { file: 'docs/research/a.png', tag: undefined },
    { file: 'docs/research/b.gif', tag: '0000000' },
    { file: 'docs/research/a.png', tag: undefined }
  ])
})

test('pictureFile gives back the file a pictureAddress was made from, and reads an untagged address too', () => {
  const address = pictureAddress('docs/research/a.png', hashOf)
  assert.equal(address, at('docs/research/a.png', 'aaaaaaa'))
  assert.equal(pictureFile(address), 'docs/research/a.png')
  assert.equal(pictureFile(`${RAW}docs/research/a.png`), 'docs/research/a.png')
})

const ANIMATED = [
  '<picture>',
  `<source media="(prefers-reduced-motion: no-preference)" srcset="${RAW}docs/research/a.png">`,
  `<img class="slide" src="${RAW}docs/research/b.gif" alt="B">`,
  '</picture>'
].join('\n')

test('a picture\'s source srcset is tagged and listed like an image src', () => {
  assert.equal(tagPictures(ANIMATED, hashOf), ANIMATED.replace(`${RAW}docs/research/a.png`, at('docs/research/a.png', 'aaaaaaa')).replace(`${RAW}docs/research/b.gif`, at('docs/research/b.gif', 'bbbbbbb')))
  assert.deepEqual(pictureTags(ANIMATED), [{ file: 'docs/research/a.png', tag: undefined }, { file: 'docs/research/b.gif', tag: undefined }])
})

// A link preview's picture (#1107) is a repo picture too, so a retake must retag it like a slide's.
const PREVIEW = `<meta property="og:image" content="${at('docs/research/a.png', '0000000')}">`

test('a link preview\'s og:image is tagged and listed like an image src', () => {
  assert.equal(tagPictures(PREVIEW, hashOf), PREVIEW.replace('/0000000/', '/aaaaaaa/'))
  assert.deepEqual(pictureTags(PREVIEW), [{ file: 'docs/research/a.png', tag: '0000000' }])
})

const withRoot = (files, run) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pictures-'))
  try {
    for (const [file, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
      fs.writeFileSync(path.join(root, file), text)
    }
    return run(root)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
}
const listing = dir => fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).filter(f => fs.statSync(path.join(dir, f)).isFile()).sort() : []

test('copyPictures writes each picture to pictures/<tag>/<file> with its bytes, and removes every copy no address names', () => {
  withRoot({ 'docs/research/a.png': 'new A', 'docs/research/b.gif': 'B', 'pictures/old0000/docs/research/a.png': 'old A', 'pictures/old0000/docs/research/gone.png': 'gone' }, root => {
    copyPictures(root, ['docs/research/a.png', 'docs/research/b.gif', 'docs/research/a.png'], hashOf)
    const dir = path.join(root, 'pictures')
    assert.deepEqual(listing(dir).map(f => f.split(path.sep).join('/')), ['aaaaaaa/docs/research/a.png', 'bbbbbbb/docs/research/b.gif'])
    assert.equal(fs.readFileSync(path.join(dir, 'aaaaaaa/docs/research/a.png'), 'utf8'), 'new A')
    assert.equal(fs.existsSync(path.join(dir, 'old0000')), false, 'an emptied tag folder is removed')
  })
})
