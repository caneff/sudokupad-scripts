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
// A block: an opening marker on its own line, then up to its own closing marker.
const BLOCK = /^([ \t]*)<!-- slideshow:([\w-]+) -->\n[\s\S]*?\n[ \t]*<!-- \/slideshow:\2 -->/gm
const OPENING = /<!-- slideshow:([\w-]+) -->/g

const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// One slideshow's markup, its outer div indented by `indent` spaces; each picture's address ends in the tag of its file.
const renderShow = ({ dir, width, height, slides }, indent, hashOf = tagOf) => {
  const at = n => ' '.repeat(indent + n)
  const current = i => i === 0 ? ' current' : ''
  return [
    `${at(0)}<div class="slideshow">`,
    `${at(2)}<div class="slide-frame">`,
    ...slides.flatMap(({ picture, animation, alt }, i) => {
      const still = indent => `${' '.repeat(indent)}<img class="slide${current(i)}" src="${RAW}${dir}${picture}?v=${hashOf(dir + picture)}" alt="${escape(alt)}" width="${width}" height="${height}">`
      // A visitor who prefers reduced motion gets the still picture alone; the animation is only a <source> for everyone else.
      return animation
        ? [`${at(4)}<picture>`, `${at(6)}<source media="(prefers-reduced-motion: no-preference)" srcset="${RAW}${dir}${animation}?v=${hashOf(dir + animation)}">`, still(indent + 6), `${at(4)}</picture>`]
        : [still(indent + 4)]
    }),
    `${at(2)}</div>`,
    `${at(2)}<div class="slide-bar">`,
    `${at(4)}<div class="slide-captions">`,
    ...slides.map(({ caption }, i) => `${at(6)}<p class="slide-caption${current(i)}">${escape(caption)}</p>`),
    `${at(4)}</div>`,
    `${at(2)}</div>`,
    `${at(0)}</div>`
  ].join('\n')
}

// Every marked block rewritten from `shows`. Any marker that is not part of a block this can rewrite (unknown id, no closing marker, not on its own line)
// or a page with Windows line endings is a problem, and then the text comes back as it was.
const syncText = (text, shows = SHOWS, hashOf = tagOf) => {
  const problems = []
  if (text.includes('\r')) return { text, problems: ['has Windows line endings, which the slideshow blocks do not match'] }
  let blocks = 0
  const out = text.replace(BLOCK, (block, space, id) => {
    if (!shows[id]) { problems.push(`<!-- slideshow:${id} --> names no slideshow in slideshows.json`); return block }
    blocks++
    return `${space}<!-- slideshow:${id} -->\n${renderShow(shows[id], space.length, hashOf)}\n${space}<!-- /slideshow:${id} -->`
  })
  const openings = [...text.matchAll(OPENING)].length
  if (openings !== blocks + problems.length) problems.push(`${openings - blocks - problems.length} <!-- slideshow:id --> marker(s) with no closing marker, or not on a line of their own`)
  return { text: problems.length ? text : out, problems }
}

// Rewrites each page of `dir`; returns the problems, each beginning with the page's name.
const syncDir = (dir, shows = SHOWS, hashOf = tagOf) => fs.readdirSync(dir).filter(f => f.endsWith('.html')).flatMap(name => {
  const page = path.join(dir, name)
  const html = fs.readFileSync(page, 'utf8')
  const { text, problems } = syncText(html, shows, hashOf)
  if (text !== html) fs.writeFileSync(page, text)
  return problems.map(problem => `${name}: ${problem}`)
})

if (require.main === module) {
  const problems = syncDir(SITE_DIR)
  for (const problem of problems) console.error(problem)
  if (problems.length) process.exitCode = 1
}

module.exports = { renderShow, syncText, syncDir, SHOWS }
