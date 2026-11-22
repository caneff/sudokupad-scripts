# Each feature switches off alone under the guard

Status: accepted, 2026-11-07 (spec #449; notice wording Chris, 2026-11-07)

Every script reaches into SudokuPad's own code (`Framework.app`, `app.act`, `app.select` and about 50 more, counted 2026-11-07), and
SudokuPad updates without notice. A rename or removal there must cost the solver one feature, not the script and not a click.

`lib/sudokupad.js` is the shared guard (copied into each script, ADR 0002). A script declares its **features**, each with a label and
the SudokuPad internals it needs:

- At startup a feature whose internal is missing is turned off, and the rest of the script keeps working.
- Every call from a feature into SudokuPad runs through the guard. A throw from the script's own code turns that feature off and
  falls back to SudokuPad's own behavior; a throw from SudokuPad's code passes through as SudokuPad's own, so a broken script never
  eats a click.
- A feature is turned off only for a missing internal or a throw, never for any other reason.
- The solver sees a dismissible **notice bar** in the script's purple naming the script and feature, with a Report link to a new
  issue already filled in with the script, the feature, the missing internal and SudokuPad's version. Several features off at once
  share one bar. A dismissal is saved per SudokuPad version, so a new version shows it again.
- The **error log** keeps a permanent record of every feature turned off.

The model was Pen Tool Extras' own step guard, which the module generalizes; Pen Tool Extras moved onto it first, unchanged in
behavior. Before it, only Pen Tool Extras guarded; the others had between none and three `try` blocks.

A feature's saved settings go through the guard's store (ADR 0008). Coupling two features to save a shared observer or record is
declined, since it would tie their failure isolation together.
