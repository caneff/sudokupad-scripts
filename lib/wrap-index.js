/* eslint-disable no-unused-vars */
// The index `delta` steps from `index` in a list of `count`, going round past either end.
const wrapIndex = (index, delta, count) => (((index + delta) % count) + count) % count
