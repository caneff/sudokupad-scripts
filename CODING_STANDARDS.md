# Coding standards

The rules a reviewer or agent reads off the diff, because no test or tool catches
them. `AGENTS.md` holds the rest: one file per script, no build step for users, and the
seam. These come from `twitch-rules-scroller` and
`sudokumaker-custom-constraints`, kept where they apply to a userscript.

## SudokuPad

1. **A SudokuPad call that can do nothing in silence is proven on a live page.**
   The `Framework` API gives no error when a call has no effect, and the seam
   cannot see it. A button added after `Start Puzzle` looked installed and ignored
   every click until `refreshControls` ran
   (`docs/research/color-by-digit/color-by-digit-live-check/README.md`). Name what was run, and
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

6. **A comment states only what the code cannot show: a fact about SudokuPad's
   internals, or the reason for a choice. One line where one line can say it.**
   A comment that restates a function's inputs, outputs or branches goes false
   when the code changes and adds nothing while it is true. Where a comment
   explains a name, give the code a clearer name. Never name its callers or its
   history: "Called by X" goes false when a second caller lands, and "used to"
   belongs in git.
7. **A change fixes every comment, test title and doc line it makes false, in the
   same diff.** A stale claim fails no gate, and the next reader acts on it. Search
   for the old wording before calling the diff done.
8. **A comment or test name claims no more than the code delivers.** A test named
   for a case it never builds tells the reviewer the gap is covered.

## Style

9. **Reuse the existing helper; never write a second copy.** Two copies drift when
   a fix lands in one. This holds across scripts too: a helper two scripts need goes in `lib/` and `node sync-lib.js` copies it in. Never edit a copy inside a `// <lib:name>` block.
10. **Name a magic number or key once.** A bare value copied to a second place
    diverges when the first changes.
11. **No parameter, flag or function that nothing calls.** An unused option is a
    promise nobody tests.
12. **Name things with `GLOSSARY.md`'s terms.** A synonym splits one concept in two.

## Release

13. **A diff that changes what a `*.user.js` does raises its `@version`, and its
    `VERSION` where it has one.** Tampermonkey's update check reads `@version`;
    `test/version-bump.test.js` fails a changed script whose `@version` is not above `origin/main`'s, and the tests check the two match.

## Behavior

14. **A feature with a twin in another script, or in another part of its own
    script, behaves like its twin, or a comment or doc says why not.** Text
    Anywhere and Pen Tool Extras both have a panel with colors and sliders, a
    right-click erase, an edit mode and a settings dialog. Each was built from its
    own ticket, so 12 mismatches shipped that every test passed (#754–#763). A
    reviewer names the twin and checks the diff against it.
