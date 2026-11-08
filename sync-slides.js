'use strict'
// Run after editing site/slideshows.json: node sync-slides.js
// site/slideshows.json is the one source of every slideshow's pictures, alt text and captions. This rewrites each
// `<!-- slideshow:id -->` ... `<!-- /slideshow:id -->` block in the pages of site/ from it, so the first slide and its caption
// show with scripting off. The picture tags are written here too, so tag-pictures.js has nothing left to do for them.
const fs = require('node:fs')
const path = require('node:path')
const { RAW, tagOf } = require('./tag-pictures.js')

const SITE_DIR = path.join(__dirname, 'site')
const SHOWS = JSON.parse(fs.readFileSync(path.join(SITE_DIR, 'slideshows.json'), 'utf8'))
const BLOCK = /^([ \t]*)<!-- slideshow:([\w-]+) -->\n[\s\S]*?\n[ \t]*<!-- \/slideshow:\2 -->/gm

const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// One slideshow's markup, its outer div indented by `indent` spaces. Each picture's address ends in the tag of its file.
const renderShow = ({ dir, width, height, slides }, indent, hashOf = tagOf) => {
  const at = n => ' '.repeat(indent + n)
  const current = i => i === 0 ? ' current' : ''
  return [
    `${at(0)}<div class="slideshow">`,
    `${at(2)}<div class="slide-frame">`,
    ...slides.map(({ picture, alt }, i) =>
      `${at(4)}<img class="slide${current(i)}" src="${RAW}${dir}${picture}?v=${hashOf(dir + picture)}" alt="${escape(alt)}" width="${width}" height="${height}">`),
    `${at(2)}</div>`,
    `${at(2)}<div class="slide-bar">`,
    `${at(4)}<div class="slide-captions">`,
    ...slides.map(({ caption }, i) => `${at(6)}<p class="slide-caption${current(i)}">${escape(caption)}</p>`),
    `${at(4)}</div>`,
    `${at(2)}</div>`,
    `${at(0)}</div>`
  ].join('\n')
}

// A page with every marked block rewritten from `shows`. A marker naming no slideshow, or with no closing marker, is a problem and its text is left as it was.
const syncText = (text, shows = SHOWS, hashOf = tagOf) => {
  const problems = []
  const out = text.replace(BLOCK, (block, space, id) => {
    if (!shows[id]) { problems.push(`<!-- slideshow:${id} --> names no slideshow in slideshows.json`); return block }
    const closing = `${space}<!-- /slideshow:${id} -->`
    return `${space}<!-- slideshow:${id} -->\n${renderShow(shows[id], space.length, hashOf)}\n${closing}`
  })
  for (const [, id] of text.matchAll(/<!-- slideshow:([\w-]+) -->/g)) {
    if (!text.includes(`<!-- /slideshow:${id} -->`)) problems.push(`<!-- slideshow:${id} --> has no <!-- /slideshow:${id} -->`)
  }
  return { text: out, problems }
}

if (require.main === module) {
  let failed = false
  for (const name of fs.readdirSync(SITE_DIR).filter(f => f.endsWith('.html'))) {
    const page = path.join(SITE_DIR, name)
    const html = fs.readFileSync(page, 'utf8')
    const { text, problems } = syncText(html)
    for (const problem of problems) { console.error(`${name}: ${problem}`); failed = true }
    if (text !== html) fs.writeFileSync(page, text)
  }
  if (failed) process.exitCode = 1
}

module.exports = { renderShow, syncText, SHOWS }
