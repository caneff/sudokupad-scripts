# The consistency survey

Rule 14 in `CODING_STANDARDS.md` catches a mismatch when a change is reviewed. This survey catches what the rule misses: a twin
added later, or two old features that drifted apart. No test, audit or fuzz rule compares two features' behavior, so nothing
else finds these (the first survey, 2026-11-09, found 12: #754–#763).

**When**: after a drain run that merged a change to what a script shows, and at least once a month. The controller runs it
as one read-only Opus subagent with the prompt below, then puts the findings to Chris before anything is filed.

## The prompt

> Find user-facing behavior inconsistencies in the six SudokuPad userscripts in /home/caneff/src/sudokupad-scripts
> (read-only; change nothing, file nothing, commit nothing). Work on `main` as it is now (`git log -1` to note the sha).
>
> What counts: two places where a solver would expect the same rule but gets different behavior. For example:
> - within one script: the same kind of control behaving differently (panel vs settings dialog, slider vs keyboard key,
>   open note vs selected notes vs next note, click vs drag, Save vs live apply, what goes on SudokuPad's undo stack and
>   what does not, what is saved and what is not, what Escape does in each state);
> - across scripts: Text Anywhere vs Pen Tool Extras especially (both have a panel with colors and sliders, a right-click
>   erase, an edit mode by holding a color button, a settings dialog with Copy/Paste/Restore defaults); also Color by
>   Digit, Dark Page, UI Tweaks, Auto Rules Resizer's dialogs and buttons;
> - a setting that persists per puzzle in one script and globally in another for no stated reason;
> - a feature with a preview, fade, cursor or confirm in one script but not its twin.
>
> Already decided, do not report: anything an open or closed issue already covers (search
> `gh issue list --repo caneff/sudokupad-scripts --state all --search "<words>"` before reporting), `.audit-ignore.md`
> entries, and any difference a comment or doc says is deliberate. Phones/tablets and SudokuPad's own dark mode are
> unsupported (AGENTS.md); ignore them.
>
> Sources, in this order: GLOSSARY.md (it states behavior precisely), site/*.html and docs/*.md (what users are told),
> then the scripts themselves (text-anywhere.user.js is Text Anywhere, pen-tool-extras.user.js, color-by-digit.user.js,
> dark-page.user.js, ui-tweaks.user.js, auto-rules-resizer.user.js) to confirm each finding in code. Every finding must
> be confirmed in code with file:line, not only from the glossary. Do not run live tests or the fuzz.
>
> Report, as your final message only (no file): a numbered list, best first, at most 12 items. Each item: one line saying
> the inconsistency in plain words as a solver would meet it; the two behaviors with file:line for each; and a one-line
> suggested fix with your recommendation of which side should win. Then one line naming anything you looked at and
> found consistent, so the scope is clear.
