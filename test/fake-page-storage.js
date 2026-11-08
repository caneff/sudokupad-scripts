'use strict'
// The guard records every feature it turns off in the page's localStorage under the page's URL (lib/sudokupad.js), so a test that starts
// a whole script needs both. Requiring this file gives the process an empty storage and a URL.
const held = new Map()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  writable: true,
  value: { getItem: (key) => (held.has(key) ? held.get(key) : null), setItem: (key, value) => { held.set(key, String(value)) }, removeItem: (key) => { held.delete(key) } }
})
globalThis.location = { href: 'https://sudokupad.app/test' }
