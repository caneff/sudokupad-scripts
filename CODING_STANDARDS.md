# Coding standards

The rules a reviewer or agent reads off the diff, because no test or tool catches
them. `AGENTS.md` holds the rest: one file per script, no build step, and the
seam. These come from `twitch-rules-scroller` and
`sudokumaker-custom-constraints`, kept where they apply to a userscript.

## SudokuPad

1. **A SudokuPad call that can do nothing in silence is proven on a live page.**
   The `Framework` API gives no error when a call has no effect, and the seam
   cannot see it. A button added after `Start Puzzle` looked installed and ignored
   every click until `refreshControls` ran
   (`docs/research/color-by-digit-live-check/README.md`). Name what was run, and
   name what stays owed.

## Failure

2. **Never turn an exception into a "no" or an empty answer.** A swallowed failure
   reads as a real answer. Catch only to add context and rethrow, or to report a
   distinct failed state; a best-effort cleanup that swallows says so in a comment.

## Tests

3. **A test asserts an observable outcome and goes red when its bug is planted.**
   A test that only proves the code ran reads as coverage. Plant the bug once
   before trusting the test.
4. **No verdict rides on a wall-clock sleep; wait on a promise or a condition.** A
   fixed sleep passes on an idle box and flakes on a loaded one. A sleep is allowed
   only for a "nothing happened in N ms" check, and says so.
5. **Assert equality with `assert.equal` or `assert.deepEqual`, never
   `assert.ok(a === b)`.** `assert.ok` prints only `false`, so a red test does not
   say what it got.

## Comments and docs

6. **Comments describe what the code does and why, never its callers or its
   history.** "Called by X" goes false when a second caller lands, and "used to"
   belongs in git.
7. **A change fixes every comment, test title and doc line it makes false, in the
   same diff.** A stale claim fails no gate, and the next reader acts on it. Search
   for the old wording before calling the diff done.
8. **A comment or test name claims no more than the code delivers.** A test named
   for a case it never builds tells the reviewer the gap is covered.

## Style

9. **Reuse the existing helper; never write a second copy.** Two copies drift when
   a fix lands in one. This holds inside one script; scripts share no code.
10. **Name a magic number or key once.** A bare value copied to a second place
    diverges when the first changes.
11. **No parameter, flag or function that nothing calls.** An unused option is a
    promise nobody tests.
12. **Name things with `GLOSSARY.md`'s terms.** A synonym splits one concept in two.
