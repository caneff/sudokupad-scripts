import { test } from 'node:test'
import assert from 'node:assert/strict'
import { errors } from 'playwright'
import { crxZip, installScript } from './tampermonkey.mjs'

// A CRX3 file: `Cr24`, a version, a header length, that many header bytes, then the zip.
const crx = ({ magic = 'Cr24', version = 3, header = Buffer.from('signed-header'), zip = Buffer.from('PK\x03\x04zip-bytes') } = {}) => {
  const fixed = Buffer.alloc(12)
  fixed.write(magic, 0, 'latin1')
  fixed.writeUInt32LE(version, 4)
  fixed.writeUInt32LE(header.length, 8)
  return Buffer.concat([fixed, header, zip])
}

test('crxZip returns the bytes after the CRX3 header', () => {
  assert.equal(crxZip(crx()).toString('latin1'), 'PK\x03\x04zip-bytes')
})

test('crxZip skips a header of any length', () => {
  assert.equal(crxZip(crx({ header: Buffer.alloc(300, 7) })).toString('latin1'), 'PK\x03\x04zip-bytes')
})

test('crxZip throws on a file with no Cr24 magic, such as an HTML error page', () => {
  assert.throws(() => crxZip(Buffer.from('<html>quota exceeded</html>')), /no Cr24 magic/)
})

test('crxZip throws on a CRX2 file', () => {
  assert.throws(() => crxZip(crx({ version: 2 })), /CRX version 2, expected 3/)
})

test('crxZip throws when the header length runs past the file', () => {
  const bytes = crx()
  bytes.writeUInt32LE(10000, 8)
  assert.throws(() => crxZip(bytes), /runs past the end/)
})

// A fake context whose wait for the install page fails with `error`; the opener page does nothing.
const failingContext = (error) => ({
  waitForEvent: () => Promise.reject(error),
  newPage: async () => ({ goto: async () => {}, isClosed: () => false, close: async () => {} })
})

test('installScript throws a non-timeout error from the install wait', async () => {
  await assert.rejects(installScript({ context: failingContext(new TypeError('boom')), id: 'x' }, 'http://x/s.user.js'), TypeError)
})

test('installScript retries a timed-out wait and then says no install page showed', async () => {
  await assert.rejects(installScript({ context: failingContext(new errors.TimeoutError('t')), id: 'x' }, 'http://x/s.user.js'), /showed no install page/)
})
