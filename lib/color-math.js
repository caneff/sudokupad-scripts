/* eslint-disable no-unused-vars */
const clamp255 = (x) => Math.max(0, Math.min(255, x))

// The share of its OKLCH lightness a cell color keeps when darkened: low enough to read against cell colors drawn at 60% opacity, high enough that the lightest still show as 5px lines on white and the nine stay apart.
const LIGHTNESS_FACTOR = 0.75
const GAMUT_EDGE = 1e-6
const LIGHT_TEXT = '#dddddd'
const DARK_TEXT = '#222222'

const COLOR_FUNCTION = /^(rgb|hsl)a?\(([^)]*)\)$/
const HEX_DIGITS = /^#([0-9a-f]{3}|[0-9a-f]{6})$/
const HEX_ALPHA = /^#[0-9a-f]{3}([0-9a-f])$|^#[0-9a-f]{6}([0-9a-f]{2})$/

// An alpha written as a number or a percentage, as a number from 0 to 1 (NaN for other text).
const alphaOf = (text) => text.endsWith('%') ? Number(text.slice(0, -1)) / 100 : Number(text)

// The kind (rgb or hsl), first three arguments and alpha of a color function with comma, space or slash separators, or null for any other text.
function colorFunction (value) {
  const fn = COLOR_FUNCTION.exec(value)
  if (!fn) return null
  const parts = fn[2].split(/[,/\s]+/).filter(Boolean)
  return { kind: fn[1], args: parts.slice(0, 3), alpha: parts.length > 3 ? alphaOf(parts[3]) : undefined }
}

// A page lists `transparent`, or a color with alpha 0, to leave a slot empty (key 0 of each default page).
function isTransparent (text) {
  if (typeof text !== 'string') return false
  const value = text.trim().toLowerCase()
  if (value === 'transparent') return true
  const hex = HEX_ALPHA.exec(value)
  if (hex) return parseInt(hex[1] ?? hex[2], 16) === 0
  const fn = colorFunction(value)
  return Boolean(fn && fn.alpha <= 0)
}

// A color's [r, g, b] channels, from #rgb, #rrggbb, rgb() or rgba() text (its alpha a number or a percentage), or null for a transparent or unreadable one.
// SudokuPad's own cell color 3 is `rgb(-36, -36, -36)`, which clamps to black.
function parseColor (text) {
  if (typeof text !== 'string' || isTransparent(text)) return null
  const value = text.trim().toLowerCase()
  const hex = HEX_DIGITS.exec(value)
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1]
    return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16))
  }
  const fn = colorFunction(value)
  if (!fn || fn.kind !== 'rgb' || fn.args.length < 3) return null
  const channels = fn.args.map(Number)
  return channels.some(Number.isNaN) ? null : channels.map((x) => Math.round(clamp255(x)))
}

const toHex = (rgb) => '#' + rgb.map((x) => Math.round(clamp255(x)).toString(16).padStart(2, '0')).join('')

const toLinear = (c) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
const fromLinear = (x) => 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055)

// Ottosson's published matrices. The way back returns the unclamped linear channels, so a caller can tell an out-of-gamut color.
function toOklab ([r, g, b]) {
  const [lr, lg, lb] = [r, g, b].map(toLinear)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ]
}

function fromOklabLinear ([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ]
}

const inGamut = (linear) => linear.every((x) => x >= -GAMUT_EDGE && x <= 1 + GAMUT_EDGE)

// Lowering lightness at fixed chroma can leave sRGB, so chroma is reduced just far enough to fit (a bisection), which keeps the hue.
function darkenColor (rgb) {
  const [L, a, b] = toOklab(rgb.map(clamp255))
  const target = L * LIGHTNESS_FACTOR
  let low = 1
  if (!inGamut(fromOklabLinear([target, a, b]))) {
    low = 0
    let high = 1
    for (let i = 0; i < 30; i++) {
      const mid = (low + high) / 2
      if (inGamut(fromOklabLinear([target, a * mid, b * mid]))) low = mid
      else high = mid
    }
  }
  const out = fromOklabLinear([target, a * low, b * low])
  return toHex(out.map((x) => fromLinear(Math.max(0, Math.min(1, x)))))
}

// WCAG relative luminance of [r, g, b] channels.
function wcagLuminance (rgb) {
  const [r, g, b] = rgb.map((c) => {
    const x = c / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// LIGHT_TEXT or DARK_TEXT, whichever contrasts more with the background color (any parseColor text).
function textColorFor (background) {
  const rgb = parseColor(background)
  if (!rgb) throw new RangeError(`color-math: ${background} is not a color`)
  const page = wcagLuminance(rgb) + 0.05
  const contrast = (text) => { const t = wcagLuminance(parseColor(text)) + 0.05; return Math.max(page, t) / Math.min(page, t) }
  return contrast(LIGHT_TEXT) >= contrast(DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT
}
