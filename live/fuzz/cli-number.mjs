// A value that is not a number stops the run: NaN would switch a limit off.
export function numberOption (values, name, fallback, { integer = false, positive = false } = {}) {
  if (values[name] == null) return fallback
  const n = Number(values[name])
  if (Number.isNaN(n) || (integer && !Number.isInteger(n)) || (positive && n <= 0)) {
    throw new Error(`--${name} needs ${positive ? 'a positive ' : 'a '}${integer ? 'whole number' : 'number'}, got "${values[name]}"`)
  }
  return n
}
