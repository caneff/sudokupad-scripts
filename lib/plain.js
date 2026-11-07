/* eslint-disable no-unused-vars */
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const rem = (value) => Math.round(value * 100) / 100
