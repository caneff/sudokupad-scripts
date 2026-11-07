# SudokuPad's dialogs slide in (read 2026-11-07, #441)

SudokuPad 0.611.0 opens a dialog with two CSS animations: `dialog-slide-down` (0.2 s) on `.dialog` and `dialog-fade-in` on
its `.dialog-overlay`. Both are running (`document.getAnimations()`) when the dialog's content is first visible.

- Over the 0.2 s the dialog moves from `translateY(-100%)` to its rest: for Color by Digit's editor at 1280 × 720, a
  profile row's handle went from y = 237 to y = 486, eased out, settling in the last few frames.
- A point read during the slide is stale by up to the dialog's height. On the first nightly watch run on GitHub Actions
  a touch drag measured right after the dialog opened started away from its handle and moved nothing; a drag read
  400 ms later landed (scratch probe, not kept).
- `live/settings.mjs`'s `openScriptDialog` therefore waits on both animations' `finished` promises before it returns,
  and `live/settings.live.mjs` checks it.
