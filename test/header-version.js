'use strict'

// The value of a script's `// @<field>` header line, read from the source text. Throws when there is no such header.
function headerField (source, field) {
  const header = new RegExp(`^// @${field}\\s+(.+?)\\s*$`, 'm').exec(source)
  if (header === null) throw new Error(`the script has no @${field} header`)
  return header[1]
}

// The `@version` a script's header declares, read from the source text and not from the script's
// own VERSION, which a settings entry or options dialog shows.
const headerVersion = (source) => headerField(source, 'version')

module.exports = { headerField, headerVersion }
