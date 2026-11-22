// Auto Rules Resizer's selectors, shared by its live checks and the fuzz. Not a check itself, so `live/**/*.live.mjs` skips it.
import { AUTO_RULES_RESIZER_STYLE } from '../scripts.mjs'

export const STYLE = AUTO_RULES_RESIZER_STYLE
export const RULES_PANE = '.puzzle-rules'
// The f+ and f- bar and the two drag corners (`ur` and `dl`) show only while the pointer is over the pane.
export const FONT_BAR = '#auto-rules-resizer-font'
export const CORNER = (corner) => `#auto-rules-resizer-drag-${corner}`
export const MAX_WIDTH_INPUT = '#auto-rules-resizer-max-width'
export const MAX_HEIGHT_INPUT = '#auto-rules-resizer-max-height'
