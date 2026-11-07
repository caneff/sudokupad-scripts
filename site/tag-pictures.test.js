'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { tagPictures, RAW } = require('./tag-pictures.js')

const hashOf = file => ({ 'docs/research/a.png': 'aaaaaaa1234', 'docs/research/b.gif': 'bbbbbbb5678' })[file]
const SAMPLE = [
  '<p>Hello <a href="x.html">x</a></p>',
  `<img src="${RAW}docs/research/a.png" alt="A, with ?v= inside" width="1">`,
  `<img class="wide" src="${RAW}docs/research/b.gif?v=0000000" alt="B">`,
  '<img src="https://example.com/c.png" alt="C">',
  `<a href="${RAW}tool.user.js">Install</a>`
].join('\n')

test('tagPictures adds a 7-character tag to an untagged repo picture and replaces a stale one', () => {
  const out = tagPictures(SAMPLE, hashOf)
  assert.equal(out, SAMPLE
    .replace('a.png"', 'a.png?v=aaaaaaa"')
    .replace('b.gif?v=0000000', 'b.gif?v=bbbbbbb'))
})

test('tagPictures changes nothing when every tag is current', () => {
  const once = tagPictures(SAMPLE, hashOf)
  assert.equal(tagPictures(once, hashOf), once)
})
