'use strict'

// Framework's getData, setData and removeData over `saved` itself, so a test reads what was written there; getData reads null for a missing key, as Framework does.
function fakeStore (saved = {}) {
  const data = saved
  return {
    data,
    getData: (key) => (key in data ? data[key] : null),
    setData: (key, value) => { data[key] = value },
    removeData: (key) => { delete data[key] }
  }
}

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
