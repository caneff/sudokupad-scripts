'use strict'
// The one walk over the pages of site/ that node sync-slides.js and node tag-pictures.js share.
const fs = require('node:fs')
const path = require('node:path')

const SITE_DIR = path.join(__dirname, 'site')

// `rewrite(html)` returns `{ text, problems }`. A page whose text changed is written back; each problem is named by its page.
const rewritePages = (dir, rewrite) => fs.readdirSync(dir).filter(f => f.endsWith('.html')).flatMap(name => {
  const page = path.join(dir, name)
  const html = fs.readFileSync(page, 'utf8')
  const { text, problems } = rewrite(html)
  if (text !== html) fs.writeFileSync(page, text)
  return problems.map(problem => `${name}: ${problem}`)
})

// The command line of both tools: rewrite site/, print every problem, and exit 1 when there was one.
const runOnSite = (rewrite) => {
  const problems = rewritePages(SITE_DIR, rewrite)
  for (const problem of problems) console.error(problem)
  if (problems.length) process.exitCode = 1
}

module.exports = { SITE_DIR, rewritePages, runOnSite }
