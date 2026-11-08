'use strict'

// Framework's getData, setData and removeData over a plain object; getData reads null for a missing key, as Framework does.
function fakeStore (saved = {}) {
  const data = { ...saved }
  return {
    data,
    getData: (key) => (key in data ? data[key] : null),
    setData: (key, value) => { data[key] = value },
    removeData: (key) => { delete data[key] }
  }
}

// Runs `run` with console.warn caught, so a test can read what an unreadable value logged.
function quietly (run) {
  const warn = console.warn
  const warnings = []
  console.warn = (...args) => warnings.push(args.join(' '))
  try {
    return { result: run(), warnings }
  } finally {
    console.warn = warn
  }
}

module.exports = { fakeStore, quietly }
