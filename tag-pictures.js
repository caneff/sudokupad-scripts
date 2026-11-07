'use strict'
// Run after retaking a picture: node tag-pictures.js
// Browsers keep showing a picture whose address has not changed, so each repo picture's address ends in ?v=<tag>.
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const RAW = 'https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/'
const TAG_LENGTH = 7
const SITE_DIR = path.join(__dirname, 'site')
const COMMENT = /(<!--[\s\S]*?-->)/
// A repo picture's src: RAW, the file's path, then whatever query follows (the tag, or a stale or foreign one).
const PICTURE_SRC = new RegExp(`(<img\\b[^>]*?\\bsrc=")${RAW.replace(/\./g, '\\.')}([^"?]+)(\\?[^"]*)?"`, 'g')
const TAG_QUERY = /^\?v=([0-9a-f]{7})$/

const tagOf = file => execFileSync('git', ['hash-object', file], { cwd: __dirname, encoding: 'utf8' }).trim().slice(0, TAG_LENGTH)

// Every repo picture in the page's markup, with the tag its address carries (undefined when it carries none or another query).
const pictureTags = html => html.split(COMMENT).filter((_, i) => i % 2 === 0).flatMap(part =>
  [...part.matchAll(PICTURE_SRC)].map(m => ({ file: m[2], tag: (TAG_QUERY.exec(m[3] || '') || [])[1] })))

// Comments are left alone: a commented-out picture may name a file that no longer exists.
const tagPictures = (html, hashOf = tagOf) => html.split(COMMENT).map((part, i) =>
  i % 2 ? part : part.replace(PICTURE_SRC, (_, head, file) => `${head}${RAW}${file}?v=${hashOf(file)}"`)).join('')

if (require.main === module) {
  for (const name of fs.readdirSync(SITE_DIR).filter(f => f.endsWith('.html'))) {
    const page = path.join(SITE_DIR, name)
    const html = fs.readFileSync(page, 'utf8')
    const tagged = tagPictures(html)
    if (tagged !== html) fs.writeFileSync(page, tagged)
  }
}

module.exports = { tagPictures, pictureTags, tagOf, RAW, TAG_QUERY }
