# Pen Tool Extras: what each feature costs in lines (2026-11-05)

Question: Pen Tool Extras is the biggest script. Which user-facing features cost the most lines, counting the script, its
unit tests and its live tests, so each can be kept, shrunk or dropped on its cost?

Read at `main` 410c1f0 (just after spec #130). Nothing in the code was changed.

## Where "4,225" came from

4,225 is the line count of **all five userscripts** at 49c3405, from `docs/research/tampermonkey-shared-code.md`. Pen
Tool Extras was 2,492 of it. Today the five come to 4,163, and Pen Tool Extras to 2,406.

Pen Tool Extras today, by `wc -l`:

| Part | Files | Lines |
|---|---|---|
| Script | `pen-tool-extras.user.js` | 2,406 |
| Unit tests | `pen-tool-extras.test.js` | 2,051 |
| Live tests | `live/pen-tool-extras*.live.mjs` (10 files) | 4,109 |
| **Total** | | **8,566** |

Not counted: the shared live helpers (`live/pen.mjs` 98, `live/settings.mjs` 50, `live/page.mjs` 89, `live/settle.mjs` 96),
which other scripts' live tests use too. Of the script's 2,406 lines, 175 are blank and 514 are comment only, which leaves
1,717 lines of code. Line 5, the `@description`, is one line of about 1,500 characters.

## Features

The list comes from the details page (`site/pen-tool-extras.html`), the settings dialog (`renderEditor`) and the
`FEATURE_LABELS` the failsafe names. Names follow `GLOSSARY.md`.

| Key | Feature | What the user sees |
|---|---|---|
| edge | **Edge marks** | the edge circle and direction arrows added to SudokuPad's edge X; the edge cycle; the Edge row of the Marks table |
| arrows | **Arrow lines** (page 3) | nine pens that draw a line with arrows the way it was dragged; Arrow spacing slider |
| fail | **Failsafe** | a feature whose SudokuPad internals changed turns off alone, and the dialog names it |
| derived | **Derived colors** | with nothing saved, the pen colors are the current cell color page, darkened; the missing-color note |
| pages | **Pen pages** | the page button, Tab and the wheel over the page button; the selected pen saved under `PenColor_pen` |
| colors | **Pen colors** | the dialog's 3 by 3 color pickers, the saved set, the SudokuPad colors button |
| erase | **Middle click erase** | a middle click erases a whole line, and its dialog box |
| panel | **Pen panel sliders** | Thickness and Opacity in the pen panel, and the "Slider in panel" boxes |
| outline | **White outline** | the white outline on the pen layer, and the Outline width slider |
| corner | **Grid-corner marks** | the X and circle in a corner zone; the Corner row of the Marks table |
| thick | **Thickness** | the thickness setting (stroke widths and mark growth), and its dialog slider |
| dash | **Dashed lines** (page 2) | nine pens that draw dashes or dots; Dash length slider |
| hold | **Edit mode** | a hold on a pen color button puts a color picker over each button |
| opac | **Opacity** | the opacity setting on the whole pen layer, its dialog slider, and the hint layer that keeps the drag highlight unfaded |
| styles | **Line styles** | the Enable boxes for dashed and arrow lines, which take a page out of the rotation |
| right | **Right click goes backwards** | a right click steps the edge and corner cycles back; the browser menu stays shut over them |
| gear | **Settings gear** | the gear on the pen tool button |
| linemode | **Line mode** | SudokuPad's line mode pulldown hidden and moved into the dialog, so the panel's last row is free |
| layer | **Marks layer** | every mark drawn above every line |
| core | **Shared core** | settings table, dialog shell, startup, style writer, test scaffolding |

## Attribution rules

1. Each line belongs to exactly one feature. A top-level block goes to the feature that is the only reason it exists.
2. A function that serves several features is split line by line where the lines are plainly one feature's. Examples:
   `renderEditor`'s Marks table, `openDialog`'s change handler, `applyStyle`, `buildPagesCss`, `renderPageIcon`,
   `wrapRenderPen`, `wrapClickCell`, `installEdgeMarks`, the startup block. Its skeleton goes to shared core.
3. Code that two features both need, and that either would keep if the other went, goes to shared core: `LINE_PATHS`,
   `LINE_VALUES`, `linePoints` (arrow lines and middle click erase), `CELL_UNITS`, `wrapIndex`, `inRange`, `layerIn`,
   `trackButton`, and the dialog-release swallowing.
4. When feature B only extends feature A, the code they share goes to A. Edge marks own the mark-cycle machinery that
   grid-corner marks and right click use (`stepType`, `planCycleClick`, `planActs`, `queuedActs`, the Marks table, the
   `clickCell` wrapper). Pen pages own the page machinery that dashed and arrow lines both use (`PEN_PAGES`, the swatch
   mask, `setPadPage`, the page button).
5. A `features.attempt(...)` or `isOff` call stays with the feature it guards. Failsafe holds only its own machinery. The
   script has 55 such call sites, so failsafe's real cost is above its row.
6. `module.exports` (99 lines) and the `Framework` guard go to shared core.
7. Tests: each `test(` / `it(` goes to the feature it checks. A helper sits with the tests that use it. A file's preamble
   (imports, constants, `boot`) goes to the file's feature. In a mixed file the preamble goes to the main feature:
   `pen-tool-extras-marks.live.mjs` 1-153 to edge marks, `pen-tool-extras.live.mjs` 1-122 to pen colors. This overstates
   those two and understates the features that share the files (corner, right click, opacity, thickness, edit mode).
8. Backward-cycle tests go to right click, the mark growth and `SOLVER_REACH` tests to thickness, and the
   release-after-dialog tests to shared core.

The line map is in this note's appendix. A check script (the reconciliation below) confirms that every line of every
file is in exactly one range.

## Cost per feature

Sorted by total.

| Feature | Script | Unit | Live | Total |
|---|---:|---:|---:|---:|
| Shared core | 493 | 235 | 277 | 1,005 |
| Edge marks | 230 | 238 | 406 | 874 |
| Arrow lines | 182 | 279 | 384 | 845 |
| Failsafe | 132 | 167 | 305 | 604 |
| Derived colors | 194 | 190 | 213 | 597 |
| Pen pages | 238 | 56 | 236 | 530 |
| Pen colors | 111 | 108 | 283 | 502 |
| Middle click erase | 123 | 131 | 238 | 492 |
| Pen panel sliders | 77 | 52 | 295 | 424 |
| White outline | 61 | 56 | 289 | 406 |
| Grid-corner marks | 85 | 137 | 109 | 331 |
| Thickness | 52 | 93 | 180 | 325 |
| Dashed lines | 61 | 143 | 95 | 299 |
| Edit mode | 96 | 4 | 196 | 296 |
| Opacity | 48 | 32 | 177 | 257 |
| Line styles | 50 | 67 | 124 | 241 |
| Right click goes backwards | 23 | 51 | 113 | 187 |
| Settings gear | 41 | 0 | 99 | 140 |
| Line mode | 87 | 6 | 37 | 130 |
| Marks layer | 22 | 6 | 53 | 81 |
| **Total** | **2,406** | **2,051** | **4,109** | **8,566** |

### Reconciliation

- Script: the column sums to 2,406, which is `wc -l pen-tool-extras.user.js`.
- Unit: the column sums to 2,051, which is `wc -l pen-tool-extras.test.js`.
- Live: the column sums to 4,109, the sum of the ten files: arrow-lines 384, dialog 118, erase 238, failsafe 245, gear 99,
  marks 1,112, outline 289, pages 505, panel 361, `pen-tool-extras.live.mjs` 758.
- Total: 2,406 + 2,051 + 4,109 = 8,566.

Shared core's 493 script lines are: the header and wrapper 24; `module.exports` and the `Framework` guard 107; the
settings table machinery 77; the dialog-release swallowing and `trackButton` 44; and about 241 more for the dialog shell,
`applyStyle`, the startup block and shared constants.

Across all features, the live tests are 48% of the lines and the script is 28%.

## What removing each feature also removes, and what holds it in

- **Edge marks (874).** Removes `EDGE_X`, `ADDED`, `SHAPES`, the cycle machinery, `queuedActs`, the `clickCell` wrapper,
  `redrawMarks`, `MARK_PICTURES` and the Marks table. Coupling: grid-corner marks and right click run on its cycle
  machinery and its `clickCell` wrapper, so dropping edge marks drops both of them or moves the machinery to them.
  `buildThicknessCss` and `MARK_VALUES` list its values. Puzzles already shared with `h`-`s` edge marks would draw them as
  nothing. Shrink option: drop the direction arrows and keep the circle. That saves little, since the cycle machinery
  stays.
- **Arrow lines (845).** Removes page 3, `ARROW_LINE`, `arrowLine`, `lineSegment`, `splitLineActs`, `installArrowDrags`,
  `renderArrowLine`, `redrawArrowLines`, the Arrow spacing row of the settings table, the arrow swatch, the page button's
  arrow sample and the whole arrow-lines live file. Coupling: `lineIdentityOf` in erase would shrink to the identity.
  `LINE_PATHS` and `linePoints` (core) stay for erase. `wrapRenderPen` stays for the marks. Lines already drawn in `j`-`z`
  or `0` would lose their color rule and draw invisibly. Line styles drops to one box.
- **Failsafe (604).** Removes `createFeatures`, `StockFailure`, `inStock`, `lackingInternals`, `FEATURE_LABELS`,
  `FEATURE_NEEDS`, `offNote`, `featuresChanged`, `checkFeatures`, the failsafe live file and the "internal missing" groups.
  Coupling: this is the hardest one to take out. Its 55 `attempt`/`isOff`/`inStock` call sites are threaded through
  every wrapper, and each would need editing. The behavior it protects is SudokuPad updates breaking the page. Shrink
  option: one top-level try/catch per install instead of per-feature tracking.
- **Derived colors (597).** Removes the color parsing, the OKLab conversion, `darkenColor`, `derivedPenColors`, the color
  tool wait and `missingNote`. Coupling: low. Restore defaults would fall back to `SUDOKUPAD_PEN_COLORS`, and the
  SudokuPad colors button would then do the same as Restore defaults, so its 30-odd lines could go too.
- **Pen pages (530).** This is the base of dashed and arrow lines, so dropping it drops both (530 + 299 + 845 + 241 for
  line styles = 1,915). It also removes the `setSelectedColor`, `handleToolEnter`, `handleToolExit` and `handleKeydown`
  wraps, `PenColor_pen`, Tab and the wheel. The panel row would then hold only the sliders.
- **Pen colors (502).** Removes the dialog color grid, the saved set and the SudokuPad colors button. Coupling: edit mode
  and derived colors both write through `adoptColors` and `buildCss`. Without pen colors, those two lose their purpose.
- **Middle click erase (492).** Removes `segmentNear`, `connectedLine`, `eraseLineActs`, `lineSegmentsOf`,
  `installMiddleClickErase` and the middle branch of `clickCell`. Coupling: low. It shares `trackButton` with right click
  and `LINE_PATHS` with arrow lines.
- **Pen panel sliders (424).** Thickness and opacity stay settable in the dialog. This removes `renderPanelSliders`,
  `installPenPanel`, the "Slider in panel" boxes and most of the panel live file. Coupling: the panel row it shares with
  the page button is line mode's.
- **White outline (406).** Removes the filter and its two settings rows. Coupling: low. The hint layer (counted under
  opacity) would still be needed for opacity.
- **Grid-corner marks (331).** Removes `cornerAt`, `cornerStorage`, `cornerPoint`, `CORNER_VALUES`, `clickCorner` and the
  Corner row. Coupling: it runs on edge marks' machinery, and `MARK_VALUES` and the thickness CSS list its values.
- **Thickness (325).** Fixes widths at SudokuPad's 5. Coupling: dashed lines, arrow lines and mark growth all scale by
  it. `effectiveThickness` is read in four places.
- **Dashed lines (299).** Removes `dashPattern`, the dash swatch, the Dash length row and page 2. Coupling: pages and line
  styles shrink to arrow lines only.
- **Edit mode (296).** Self-contained (`installHoldToEdit` and the picker CSS). Two thirds of its cost is the live
  "holding a pen color button" group.
- **Opacity (257).** Coupling: it includes the hint layer, which white outline also needs.
- **Line styles (241).** Removes `enabledPages`, `stepEnabledPage`, `pageAfterSave` and the Enable boxes. Coupling: it is
  only meaningful while both extra pages exist.
- **Right click goes backwards (187).** Removes `steppingBackwards`, `markUnderPointer` and `suppressMarkMenu`. Coupling:
  low.
- **Settings gear (140).** Self-contained. The dialog still opens from SudokuPad's settings.
- **Line mode (130).** Without it, the panel's last row is not free, so the panel sliders and the page button would need
  another home.
- **Marks layer (81).** Self-contained.

## Not attributed confidently

- The line-by-line split inside `renderEditor`, `openDialog`, `applyStyle`, `wrapRenderPen`, `wrapClickCell` and the
  startup block is a judgement per line. A different reader would move a few lines either way.
- The preambles of the two mixed live files (153 lines to edge marks, 122 to pen colors) serve the other groups in those
  files too (rule 7).
- The hint layer (about 25 script lines and a 29-line live test) is under opacity but exists for white outline as well.
- `LINE_PATHS`, `LINE_VALUES` and `linePoints` (about 35 lines) are shared core. Dropping both arrow lines and middle
  click erase frees them.
- The swatch mask helpers are under pen pages. Dashed and arrow lines each use them.
- Failsafe's call sites are not in its row (rule 5).

## Appendix: the line map

Script (`pen-tool-extras.user.js`), as `first-last key`:
1-24 core, 25-26 colors, 27-29 panel, 30 core, 31-32 panel, 33-37 linemode, 38 edge, 39-41 core, 42-44 opac, 45-48 layer,
49 core, 50 erase, 51 right, 52 core, 53-62 pages, 63 dash, 64 arrows, 65-72 pages, 73-86 colors, 87-94 derived,
95-104 thick, 105-106 dash, 107-108 arrows, 109-111 dash, 112-115 opac, 116-134 outline, 135-139 thick, 140-144 core,
145-146 dash, 147-162 edge, 163-167 corner, 168-170 edge, 171-182 corner, 183-184 layer, 185-187 edge, 188-189 derived,
190-192 hold, 193-194 core, 195 colors, 196 core, 197-224 colors, 225-229 linemode, 230-252 pages, 253-272 styles,
273-307 core, 308 thick, 309 opac, 310 dash, 311 arrows, 312-313 outline, 314 erase, 315 styles, 316 panel, 317-358 core,
359-403 edge, 404-444 corner, 445-474 edge, 475-491 core, 492-563 arrows, 564-566 erase, 567-572 core, 573-645 erase,
646-680 arrows, 681-792 derived, 793-801 colors, 802-827 thick, 828-838 opac, 839-862 outline, 863-891 dash,
892-897 pages, 898-899 arrows, 900-907 dash, 908-914 pages, 915 dash, 916-920 pages, 921-922 arrows, 923 pages,
924 arrows, 925-929 dash, 930-933 pages, 934-948 hold, 949-951 linemode, 952-953 core, 954-956 linemode, 957-959 pages,
960-963 panel, 964-976 gear, 977-978 linemode, 979-982 panel, 983-984 pages, 985-986 linemode, 987-1006 panel,
1007-1014 pages, 1015-1017 arrows, 1018-1023 pages, 1024-1029 arrows, 1030-1036 dash, 1037-1046 pages, 1047-1057 edge,
1058-1063 fail, 1064-1069 derived, 1070-1072 core, 1073-1081 linemode, 1082-1087 core, 1088 styles, 1089-1097 core,
1098 colors, 1099 linemode, 1100-1108 core, 1109-1116 colors, 1117-1121 edge, 1122-1128 core, 1129-1132 styles,
1133 fail, 1134-1136 core, 1137-1141 edge, 1142 corner, 1143 edge, 1144 dash, 1145 arrows, 1146-1150 core, 1151 derived,
1152 panel, 1153 thick, 1154 opac, 1155-1156 styles, 1157 dash, 1158 arrows, 1159 styles, 1160 edge, 1161-1163 core,
1164-1165 outline, 1166 erase, 1167 linemode, 1168-1169 core, 1170-1238 fail, 1239-1253 edge, 1254-1256 corner,
1257-1258 edge, 1259-1265 arrows, 1266-1285 edge, 1286-1292 erase, 1293-1325 fail, 1326-1432 core, 1433-1438 fail,
1439-1443 colors, 1444-1445 core, 1446 edge, 1447 core, 1448-1493 derived, 1494-1508 arrows, 1509-1518 layer,
1519-1524 core, 1525-1529 edge, 1530 core, 1531-1533 arrows, 1534 edge, 1535 layer, 1536-1539 core, 1540-1556 edge,
1557-1600 core, 1601-1621 corner, 1622-1647 erase, 1648-1655 edge, 1656-1657 corner, 1658-1670 edge, 1671-1675 erase,
1676-1683 edge, 1684-1704 right, 1705-1711 edge, 1712-1723 arrows, 1724-1730 core, 1731 arrows, 1732-1734 core,
1735 erase, 1736 edge, 1737 right, 1738-1739 edge, 1740 arrows, 1741-1742 core, 1743-1744 thick, 1745-1746 opac,
1747-1756 core, 1757 colors, 1758 thick, 1759 opac, 1760 outline, 1761 pages, 1762 hold, 1763 core, 1764 gear,
1765 linemode, 1766-1768 core, 1769-1778 fail, 1779-1793 linemode, 1794-1813 core, 1814 colors, 1815 derived,
1816-1820 colors, 1821 edge, 1822 linemode, 1823-1828 core, 1829-1834 derived, 1835-1836 colors, 1837-1853 core,
1854-1858 colors, 1859-1860 edge, 1861 core, 1862 linemode, 1863-1888 core, 1889-1897 colors, 1898 core,
1899-1903 linemode, 1904-1909 outline, 1910-1914 erase, 1915-1920 styles, 1921-1925 panel, 1926-1930 edge,
1931-1936 colors, 1937-1939 core, 1940-1948 colors, 1949-1954 thick, 1955-1959 opac, 1960-1966 outline,
1967-1979 styles, 1980-1985 panel, 1986-1993 core, 1994-2000 panel, 2001-2029 linemode, 2030-2034 panel, 2035 pages,
2036-2037 linemode, 2038-2063 gear, 2064-2067 pages, 2068-2070 panel, 2071-2072 linemode, 2073-2087 panel,
2088-2162 pages, 2163-2164 styles, 2165 pages, 2166-2179 core, 2180-2184 layer, 2185-2190 opac, 2191-2252 pages,
2253-2265 opac, 2266-2280 arrows, 2281-2356 hold, 2357-2362 fail, 2363 core, 2364 fail, 2365-2366 core, 2367 hold,
2368 panel, 2369 gear, 2370 core, 2371 edge, 2372-2384 core, 2385 pages, 2386 opac, 2387 arrows, 2388-2392 colors,
2393-2404 derived, 2405-2406 core.

Unit tests (`pen-tool-extras.test.js`):
1-21 core, 22-23 edge, 24-84 colors, 85-274 derived, 275-303 colors, 304-367 thick, 368-373 layer, 374-402 thick,
403-427 opac, 428-439 panel, 440-446 opac, 447-450 hold, 451-525 edge, 526-569 right, 570-665 edge, 666-775 corner,
776-782 right, 783-809 corner, 810-842 pages, 843-850 core, 851-917 dash, 918-940 pages, 941-946 linemode, 947-1022 dash,
1023-1046 panel, 1047-1064 core, 1065-1082 colors, 1083-1093 styles, 1094-1109 panel, 1110-1128 core, 1129-1149 styles,
1150-1171 edge, 1172-1185 outline, 1186-1191 erase, 1192-1202 core, 1203-1459 arrows, 1460-1501 outline,
1502-1507 arrows, 1508-1512 erase, 1513-1520 styles, 1521-1526 arrows, 1527-1553 styles, 1554-1666 erase, 1667-1762 fail,
1763-1895 core, 1896-1915 edge, 1916-1925 arrows, 1926-1948 edge, 1949-1955 erase, 1956-2026 fail, 2027-2051 core.

Live tests (`live/`):
- `pen-tool-extras-arrow-lines.live.mjs` 1-384 arrows
- `pen-tool-extras-dialog.live.mjs` 1-45 core, 46-56 colors, 57-71 core, 72-86 styles, 87-118 core
- `pen-tool-extras-erase.live.mjs` 1-238 erase
- `pen-tool-extras-failsafe.live.mjs` 1-245 fail
- `pen-tool-extras-gear.live.mjs` 1-99 gear
- `pen-tool-extras-marks.live.mjs` 1-153 edge, 154-216 right, 217-225 edge, 226-244 corner, 245-258 right,
  259-290 corner, 291-326 right, 327-358 corner, 359-438 thick, 439-491 layer, 492-636 edge, 637-662 corner,
  663-722 edge, 723-870 opac, 871-1013 core, 1014-1052 edge, 1053-1112 fail
- `pen-tool-extras-outline.live.mjs` 1-289 outline
- `pen-tool-extras-pages.live.mjs` 1-120 pages, 121-207 dash, 208-220 pages, 221-228 dash, 229-275 colors,
  276-302 pages, 303-411 styles, 412-429 hold, 430-505 pages
- `pen-tool-extras-panel.live.mjs` 1-97 panel, 98-134 linemode, 135-164 panel, 165-193 opac, 194-361 panel
- `pen-tool-extras.live.mjs` 1-122 colors, 123-133 derived, 134-226 colors, 227-349 derived, 350-359 colors,
  360-443 thick, 444-469 core, 470-485 thick, 486-663 hold, 664-679 core, 680-758 derived
