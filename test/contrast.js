'use strict'

// WCAG contrast ratio of two [r, g, b] colors (0-255 channels), worked out from the published formula and not from a script's own helpers.
function contrastRatio (a, b) {
  const luminance = (rgb) => {
    const [r, g, bl] = rgb.map((c) => c / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [x, y] = [luminance(a) + 0.05, luminance(b) + 0.05]
  return Math.max(x, y) / Math.min(x, y)
}

const hexChannels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

module.exports = { contrastRatio, hexChannels }
