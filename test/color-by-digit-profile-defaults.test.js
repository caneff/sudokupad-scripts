'use strict'
// Color by Digit's Low/5/High preload and its conversion of the old groups, never overriding saved profiles, at the `npm test` seam.
const test = require('node:test')
const assert = require('node:assert/strict')
const { join } = require('node:path')
const { fakeStore, quietly } = require('./fake-store.js')

const colorByDigit = require(join(__dirname, '..', 'color-by-digit.user.js'))

const PROFILES_KEY = 'ColorByDigit_profiles'
const LEGACY_KEY = 'ColorByDigit_groups'
const lowFiveHigh = (low, high) => [{ key: low, digits: ['0', '1', '2', '3', '4'] }, { key: '5', digits: ['5'] }, { key: high, digits: ['6', '7', '8', '9'] }]
const loaded = (stored) => quietly(() => colorByDigit.stateFromStored(fakeStore(stored))).result

test('Color by Digit\'s Low/5/High preloads keys 6, 5 and q; the old 1, 5, 9 groups convert to it with no Custom profile; saved profiles are kept', () => {
  const { PRELOADS, activeGroups } = colorByDigit
  assert.deepEqual(PRELOADS['Low/5/High'], lowFiveHigh('6', 'q'))
  const fresh = loaded({})
  assert.deepEqual(activeGroups(fresh), lowFiveHigh('6', 'q'))
  const converted = loaded({ [LEGACY_KEY]: lowFiveHigh('1', '9') })
  assert.deepEqual(converted.profiles.map((profile) => profile.name), fresh.profiles.map((profile) => profile.name))
  assert.deepEqual(activeGroups(converted), lowFiveHigh('6', 'q'))
  const saved = { profiles: [{ name: 'Low/5/High', groups: lowFiveHigh('1', '9') }], active: 0 }
  assert.deepEqual(activeGroups(loaded({ [PROFILES_KEY]: structuredClone(saved) })), lowFiveHigh('1', '9'))
})
