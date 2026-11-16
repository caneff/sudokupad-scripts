# Reload rules read the saved pen and note settings (#935)

`reload-changes-nothing` now also compares `penTool` (selected pen and line mode, read only while the pen tool is current), `penColors` (`--puzzle-pencolor-1..9`),
`noteLooks` (the marked color key and the Background button, read only while Text Anywhere's tool is current with no note selected or open) and `noteColors`
(`--text-anywhere-color-1..9`). The tool is kept across a reload (probed), so a side that shows no panel is left out of the comparison.

Measured with `measure.mjs run --sample sample-direct.json --only <id>`, 3 seeds (1000 to 1002), 3 mutants at once, files `runs-935-<config>-<budget>.jsonl`.

| mutant | current 30 s | current 300 s | busy-start 30 s | busy-start 300 s |
|---|---|---|---|---|
| `text-anywhere:2574` `setData(COLORS_KEY, ...)` | 0/3 | 3/3 (33 to 72 s, `noteColors`) | 0/3 | 1/3 (142 s, `noteColors`) + 2 harness catches |
| `pen-tool-extras:1557` `setData(COLORS_KEY, ...)` | 0/3 | 1/3 (291 s, `penColors`) | 0/3 | 0/3 + 1 harness catch |
| `pen-tool-extras:1790` `setData(PEN_KEY, pen)` | 0/3 | 0/3 | 0/3 | 0/3 + 1 harness catch |

A "harness catch" is `digit is still covered by a note after 4 drags off it` (seed 1001, 214 to 228 s, all three mutants): a crash signal of the engine, not of the new rule.

- Text Anywhere's colors went from 0/3 to 3/3 at 300 s. Pen colors went to 1/3: 1 to 3 lists per hunt had a reload after the save, too few.
- The pen save stays missed: the pen is read only while the pen tool is current, and a reload before the pen tool is opened (or with another tool current) shows nothing. The selected pen
  cannot be read otherwise: `ToolPen.tool.selectedColor` is undefined until the tool first opens. Reaching it needs an action that reloads with the pen tool current, not a wider read.
- The 30 s budget catches none; the rule needs a reload after the save, which 30 s rarely runs.
