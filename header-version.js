'use strict'

// The `@version` a script's header declares, read from the source text and not from the script's
// own VERSION, which is what the settings entry shows. Throws when there is no such header.
function headerVersion (source) {
  const header = /^\/\/ @version\s+(\S+)\s*$/m.exec(source)
  if (header === null) throw new Error('the script has no @version header')
  return header[1]
}

module.exports = { headerVersion }
