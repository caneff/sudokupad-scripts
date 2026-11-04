# PROTOTYPE, throwaway: Pen Tool Extras settings dialog redesign

Question: what should the Pen Tool Extras settings dialog look like? `mock.mjs` loads sudokupad.app with the
v1.12.0 script and rearranges the live dialog's DOM into the agreed look; `before.png` is v1.12.0's dialog, `after.png` the
look Chris approved on 2026-11-04 (the slider row below "Dashed lines" says "Dash length" in the build, not "Dash width").
Run from the repo root of a main checkout: `node prototype/pte-dialog/mock.mjs` (paths in it are relative to the repo root
and expect `.scratch/pte-dialog/`; it is a record, not a tool).
