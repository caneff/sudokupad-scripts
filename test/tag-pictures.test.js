'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { tagPictures, pictureTags, RAW } = require('../tag-pictures.js')

const hashOf = file => ({ 'docs/research/a.png': 'aaaaaaa', 'docs/research/b.gif': 'bbbbbbb' })[file]
const SAMPLE = [
  '<p>Hello <a href="x.html">x</a></p>',
  `<img src="${RAW}docs/research/a.png" alt="A, with ?v= inside" width="1">`,
  `<img class="wide" src="${RAW}docs/research/b.gif?v=0000000" alt="B">`,
  '<img src="https://example.com/c.png" alt="C">',
  `<img src="${RAW}docs/research/a.png?w=2" alt="D">`,
  `<a href="${RAW}tool.user.js">Install</a>`,
  `<!-- <img src="${RAW}docs/research/gone.png"> -->`
].join('\n')

test('tagPictures adds a 7-character tag to an untagged repo picture and replaces a stale one', () => {
  const out = tagPictures(SAMPLE, hashOf)
  assert.equal(out, SAMPLE
    .replace('a.png"', 'a.png?v=aaaaaaa"')
    .replace('b.gif?v=0000000', 'b.gif?v=bbbbbbb')
    .replace('a.png?w=2', 'a.png?v=aaaaaaa'))
})

test('tagPictures changes nothing when every tag is current', () => {
  const once = tagPictures(SAMPLE, hashOf)
  assert.equal(tagPictures(once, hashOf), once)
})

test('pictureTags lists each repo picture with its tag, undefined for a missing or foreign query, and skips comments', () => {
  assert.deepEqual(pictureTags(SAMPLE), [
    { file: 'docs/research/a.png', tag: undefined },
    { file: 'docs/research/b.gif', tag: '0000000' },
    { file: 'docs/research/a.png', tag: undefined }
  ])
})

const ANIMATED = [
  '<picture>',
  `<source media="(prefers-reduced-motion: no-preference)" srcset="${RAW}docs/research/a.png">`,
  `<img class="slide" src="${RAW}docs/research/b.gif" alt="B">`,
  '</picture>'
].join('\n')

test('a picture\'s source srcset is tagged and listed like an image src', () => {
  assert.equal(tagPictures(ANIMATED, hashOf), ANIMATED.replace('a.png"', 'a.png?v=aaaaaaa"').replace('b.gif"', 'b.gif?v=bbbbbbb"'))
  assert.deepEqual(pictureTags(ANIMATED), [{ file: 'docs/research/a.png', tag: undefined }, { file: 'docs/research/b.gif', tag: undefined }])
})
