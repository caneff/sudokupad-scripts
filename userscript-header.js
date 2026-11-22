'use strict'
// The fields of a userscript's `// ==UserScript==` header, read from the source text: the one reader and parser of `@version`.

function headerField (source, field) {
  const header = new RegExp(`^// @${field}\\s+(.+?)\\s*$`, 'm').exec(source)
  if (header === null) throw new Error(`the script has no @${field} header`)
  return header[1]
}

// The `@version` a script's header declares, read from the source text and not from the script's
// own VERSION, which a settings entry or options dialog shows.
const headerVersion = (source) => headerField(source, 'version')

// The `@version` line when its value is X.Y.Z: the text before the number, the three numbers, and the trailing space.
const VERSION_LINE = /^(\/\/ @version\s+)(\d+)\.(\d+)\.(\d+)(\s*)$/m

// A version's three numbers. Throws on any other shape, so an unreadable version fails a check instead of passing it.
function parseVersion (version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`@version "${version}" is not X.Y.Z`)
  return version.split('.').map(Number)
}

// Positive when `a` is a higher version than `b`, negative when lower, 0 when equal.
function compareVersions (a, b) {
  const [pa, pb] = [parseVersion(a), parseVersion(b)]
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i]
  return 0
}

module.exports = { headerField, headerVersion, VERSION_LINE, compareVersions }
