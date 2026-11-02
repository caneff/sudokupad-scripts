'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { planColoring, assignDigit, normalizeGroups, PRELOADS, DEFAULT_GROUPS } = require('./color-by-digit.user.js');

const groups = [{ key: 'a', digits: ['1', '2'] }, { key: 'b', digits: ['3'] }];
const plan = (cells, g = groups) => planColoring(cells, g);

test('givens and entered digits both get their group key', () => {
  assert.deepEqual(plan([{ given: '1' }, { value: '3' }]), [
    { index: 0, key: 'a' },
    { index: 1, key: 'b' },
  ]);
});

test('pencil marks and empty cells are never touched', () => {
  const cells = [{ pencilMarks: ['1', '2'] }, {}, { value: '' }, { centre: ['3'] }];
  assert.deepEqual(plan(cells), []);
});

test('digits in no group are skipped', () => {
  assert.deepEqual(plan([{ value: '7' }, { given: '9' }]), []);
});

test('values other than digits 0 to 9 are ignored', () => {
  const g = [{ key: 'a', digits: ['1', '2'] }];
  assert.deepEqual(plan([{ value: '12' }, { value: 'x' }, { value: '-1' }], g), []);
});

test('a cell already holding its key is skipped', () => {
  assert.deepEqual(plan([{ value: '1', colours: ['a'] }, { value: '1', colours: ['b', 'a'] }]), []);
});

test('a cell holding another color still gets its key', () => {
  assert.deepEqual(plan([{ value: '1', colours: ['b'] }]), [{ index: 0, key: 'a' }]);
});

test('an empty list of groups plans nothing', () => {
  assert.deepEqual(plan([{ value: '1' }], []), []);
});

const allDigits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => ({ value: String(d) }));
const byDigit = (g) => plan(allDigits, g).map((p) => p.key).join('');

test('Low/5/High maps 0-4 to slot 9, 5 to slot 1, 6-9 to slot 6', () => {
  assert.equal(byDigit(PRELOADS['Low/5/High']), '9999916666');
});

test('Odd/Even maps odd to slot 6, even and 0 to slot 9', () => {
  assert.equal(byDigit(PRELOADS['Odd/Even']), '9696969696');
});

test('a fresh install starts with Odd/Even', () => {
  assert.deepEqual(DEFAULT_GROUPS, PRELOADS['Odd/Even']);
});

test('assigning a digit to a group takes it out of the other group', () => {
  const g = [{ key: 'a', digits: ['1', '2'] }, { key: 'b', digits: ['3'] }];
  assert.deepEqual(assignDigit(g, 1, '2'), [
    { key: 'a', digits: ['1'] },
    { key: 'b', digits: ['2', '3'] },
  ]);
});

test('assigning a digit its group already holds removes it', () => {
  const g = [{ key: 'a', digits: ['1', '2'] }];
  assert.deepEqual(assignDigit(g, 0, '1'), [{ key: 'a', digits: ['2'] }]);
});

test('assignDigit does not change the list it was given', () => {
  const g = [{ key: 'a', digits: ['1'] }, { key: 'b', digits: [] }];
  assignDigit(g, 1, '1');
  assert.deepEqual(g, [{ key: 'a', digits: ['1'] }, { key: 'b', digits: [] }]);
});

test('normalizeGroups rejects malformed saved data and keeps an empty list', () => {
  assert.equal(normalizeGroups(null), null);
  assert.equal(normalizeGroups({}), null);
  assert.equal(normalizeGroups([{ key: 1, digits: [] }]), null);
  assert.deepEqual(normalizeGroups([]), []);
  assert.deepEqual(normalizeGroups([{ key: 'a', digits: ['1', '1', 'x', '2'] }]), [{ key: 'a', digits: ['1', '2'] }]);
});
