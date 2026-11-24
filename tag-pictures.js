'use strict'
// Run after retaking a picture: node tag-pictures.js
// Each repo picture's address is RAW + pictures/<tag>/<file>, <tag> being the file's blob hash. raw.githubusercontent.com ignores a
// query when it caches a path for five minutes, so a ?v= tag showed the old bytes under a new address; a path no one has asked for
// yet cannot be stale. pictures/ holds one copy of each picture under its tag (git stores the bytes once).
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { SITE_DIR, runOnSite } = require('./site-pages.js')

const RAW = 'https://raw.githubusercontent.com/chinstrap45/sudokupad-scripts/main/'
const PICTURES = 'pictures/'
const TAG_LENGTH = 7
const COMMENT = /(<!--[\s\S]*?-->)/
const PICTURE_SRC = new RegExp(`(<(?:img|source)\\b[^>]*?\\b(?:src|srcset)="|<meta property="og:image" content=")${RAW.replace(/\./g, '\\.')}(?:${PICTURES}([0-9a-f]{${TAG_LENGTH}})/)?([^"?]+)(?:\\?[^"]*)?"`, 'g')
const TAGGED_PATH = new RegExp(`^${PICTURES}[0-9a-f]{${TAG_LENGTH}}/`)

const tagOf = (file, root = __dirname) => execFileSync('git', ['hash-object', file], { cwd: root, encoding: 'utf8' }).trim().slice(0, TAG_LENGTH)
const pictureAddress = (file, hashOf = tagOf) => `${RAW}${PICTURES}${hashOf(file)}/${file}`
// The repo file a picture's address names.
const pictureFile = url => url.slice(RAW.length).replace(TAGGED_PATH, '')

const pictureTags = html => html.split(COMMENT).filter((_, i) => i % 2 === 0).flatMap(part =>
  [...part.matchAll(PICTURE_SRC)].map(m => ({ file: m[3], tag: m[2] })))

// Comments are left alone: a commented-out picture may name a file that no longer exists.
const tagPictures = (html, hashOf = tagOf) => html.split(COMMENT).map((part, i) =>
  i % 2 ? part : part.replace(PICTURE_SRC, (_, head, tag, file) => `${head}${pictureAddress(file, hashOf)}"`)).join('')

const filesUnder = dir => fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).map(f => path.join(dir, f)).filter(f => fs.statSync(f).isFile()) : []

// Leaves pictures/ holding exactly <tag>/<file> for each of `files`: a retake's old copy goes, its new one comes.
const copyPictures = (root, files, hashOf = file => tagOf(file, root)) => {
  const dir = path.join(root, PICTURES)
  const wanted = new Map([...new Set(files)].map(file => [path.join(dir, hashOf(file), file), file]))
  for (const copy of filesUnder(dir)) if (!wanted.has(copy)) fs.rmSync(copy)
  for (const [copy, file] of wanted) {
    fs.mkdirSync(path.dirname(copy), { recursive: true })
    fs.copyFileSync(path.join(root, file), copy)
  }
  // Deepest paths first, so a folder is empty by the time it is looked at.
  for (const entry of fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).sort().reverse() : []) {
    const folder = path.join(dir, entry)
    if (fs.statSync(folder).isDirectory() && !fs.readdirSync(folder).length) fs.rmdirSync(folder)
  }
}

// Every repo picture any page of site/ shows, comments left out.
const sitePictures = () => fs.readdirSync(SITE_DIR).filter(f => f.endsWith('.html'))
  .flatMap(name => pictureTags(fs.readFileSync(path.join(SITE_DIR, name), 'utf8')).map(({ file }) => file))

// Makes pictures/ match what the pages now show.
const syncPictureCopies = () => copyPictures(__dirname, sitePictures())

if (require.main === module) {
  runOnSite(html => ({ text: tagPictures(html), problems: [] }))
  syncPictureCopies()
}

module.exports = { TAG_LENGTH, TAGGED_PATH, tagPictures, pictureTags, pictureAddress, pictureFile, copyPictures, syncPictureCopies, tagOf, RAW, PICTURES }
