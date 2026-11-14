/* eslint-disable no-unused-vars */
const wrapIndex = (index, delta, count) => (((index + delta) % count) + count) % count
