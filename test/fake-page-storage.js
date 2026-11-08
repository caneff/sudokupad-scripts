'use strict'
// The guard records every feature it turns off in the page's localStorage, with the page's URL inside each record (lib/sudokupad.js), so a
// test that starts a whole script needs both. Requiring this file gives the process an empty storage and a URL; `memoryStorage` makes
// another storage with the same methods.
const memoryStorage = () => {
  const held = new Map()
  return {
    getItem: (key) => (held.has(key) ? held.get(key) : null),
    setItem: (key, value) => { held.set(key, String(value)) },
    removeItem: (key) => { held.delete(key) }
  }
}
Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: memoryStorage() })
globalThis.location = { href: 'https://sudokupad.app/test' }

module.exports = { memoryStorage }
