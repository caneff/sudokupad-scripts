'use strict'
// Run after retaking a picture: node site/tag-pictures.js
// Browsers keep showing a picture whose address has not changed, so each repo picture's address ends in ?v=<tag>.
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const RAW = 'https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/'
const TAG_LENGTH = 7
const ROOT = path.join(__dirname, '..')
// A repo picture's src: RAW, the file's path, then an optional tag.
const PICTURE_SRC = new RegExp(`(<img\\b[^>]*?\\bsrc=")${RAW.replace(/[.]/g, '\\.')}([^"?]+)(?:\\?v=[^"]*)?"`, 'g')

const tagOf = file => execFileSync('git', ['hash-object', file], { cwd: ROOT, encoding: 'utf8' }).trim().slice(0, TAG_LENGTH)

const tagPictures = (html, hashOf = tagOf) => html.replace(PICTURE_SRC, (_, head, file) => `${head}${RAW}${file}?v=${hashOf(file).slice(0, TAG_LENGTH)}"`)

if (require.main === module) {
  for (const name of fs.readdirSync(__dirname).filter(f => f.endsWith('.html'))) {
    const page = path.join(__dirname, name)
    const html = fs.readFileSync(page, 'utf8')
    const tagged = tagPictures(html)
    if (tagged !== html) fs.writeFileSync(page, tagged)
  }
}

module.exports = { tagPictures, tagOf, RAW }
