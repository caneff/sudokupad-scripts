# Tools for randomized UI break-it tests

Read 2026-11-08. The question: which maintained tool, if any, should drive seeded
random sequences of real user actions on sudokupad.app (Playwright, headless
Chromium, every script injected), with shrinking to a minimal sequence and replay
from a seed. Versions and dates below are from the npm registry
(`https://registry.npmjs.org/<name>`) and the GitHub API as of today. Nothing was
installed or run; every claim about behaviour is from the docs named beside it.

## Summary

- fast-check is the only maintained tool read here with a real shrinker for
  action sequences. Its `fc.commands` plus `fc.asyncModelRun` fit async Playwright
  calls. Its docs show no Playwright example, but the author's own UI examples use
  Selenium and a maintainer answer covers Puppeteer-style error checking.
- gremlins.js is seeded but has no shrinker and has not shipped since 2020.
- The Playwright-native monkeys (buttonmash, Mischief, chaosbringer) are new
  (2026), crawl links and buttons by themselves, and take over the run. They suit
  "click everything on a site", not "drive SudokuPad tools with a model".
- A hand-rolled seeded PRNG plus delta debugging is a documented, standard
  approach (Zeller's ddmin, written up in the Fuzzing Book), needs no dependency,
  and is small enough to own.
- Any approach is only as good as replay determinism. Shrinking re-runs the whole
  sequence many times, so a flaky or slow app makes shrinking wrong or slow.

## 1. fast-check

Current version 4.10.2, published 2026-09-19 (npm registry, `fast-check`). One
runtime dependency, `pure-rand ^8.0.0`; unpacked size 1,523,883 bytes; MIT; engines
`node >=12.17.0` (same registry entry). The GitHub repo had a commit on 2026-11-07
and its latest release tag is v4.10.2 (GitHub: `dubzzz/fast-check`). Its README
compatibility table also lists a 5.x line needing Node 22.12 or newer, but npm's
`latest` tag is still 4.10.2 today ("fast-check", https://github.com/dubzzz/fast-check).

Model-based testing ("Turn fast-check into a crazy QA", https://fast-check.dev/docs/advanced/model-based-testing/):

- The page opens by calling model-based testing a form of monkey testing: put the
  system under stress with random inputs. A model is optional.
- A command implements `ICommand`: `check(model)` says whether the action may run
  now, `run(model, real)` does the action and asserts, `toString()` names it for
  reports.
- `fc.commands(allCommands, {size, ...})` generates the scenario. The page says it
  could be mimicked by `array(oneof(...))` but "it can efficiently shrink failing
  scenarios", unlike plain `array`.
- Three runners: `modelRun` (sync), `asyncModelRun` (async commands), and
  `scheduledModelRun` (async commands through the scheduler, for race conditions).
- `asyncModelRun(s, cmds)` takes an initial-state provider and an iterable of
  `AsyncCommand`, returns `Promise<void>`, and throws on inconsistency (API page:
  https://fast-check.dev/docs/api/functions/asyncModelRun/, "Since 1.5.0"). The
  setup function may be async (`ModelRunAsyncSetup` in the same signature), which
  is where a fresh Playwright page per run would be made.

Shrinking and replay for command sequences (same model-based testing page):

- On failure `fc.assert` prints `{ seed, path, endOnFailure }`, the shrunk
  counterexample, and a `replayPath` comment inside it, for example
  `/*replayPath="AAAAABAAE:VF"*/`.
- To replay straight to the minimal case you pass `{ seed, path, endOnFailure: true }`
  to `assert` and `{ replayPath }` to `fc.commands`. "It only replays the minimal
  counterexample."
- The shrinker uses what actually ran: if `[A,B,C,A,A,C]` was generated but only
  `[A,-,C,A,-,-]` executed (the others failed `check`), it shrinks `[A,C,A]`.
  `replayPath` encodes that history so skipped commands are not re-run.
- Runner parameters (seed, path, verbose, `interruptAfterTimeLimit`,
  `check` versus `assert`): https://fast-check.dev/docs/core-blocks/runners/.
  `check` returns a `RunDetails` object (failed, counterexample, path) instead of
  throwing, so the caller can print its own repro line.
- A saved seed and path "can become un-replayable if underlying arbitraries are
  changed": GitHub discussion #6166 (https://github.com/dubzzz/fast-check/discussions/6166)
  gives the pattern of wrapping the test in a function taking `seed`, `path` and
  `replayPath`, and looping over a list of saved examples.

Scheduler (https://fast-check.dev/docs/advanced/race-conditions/): `fc.scheduler()`
makes an object that holds promises and decides in what order they resolve
(`schedule`, `scheduleFunction`, `waitNext`, `waitIdle`, `waitFor`). It targets
race conditions among promises the test wraps; it has an `act` hook (the page's
example is React's `act`). It cannot control uncontrolled sources, and the page
warns that tasks triggered by them make "replay of failures harder". Real browser
rendering and SudokuPad's own timers are exactly that, so the scheduler does not
help here. Plain `asyncModelRun` is the relevant runner.

Browser UI use (documented, but not with Playwright):

- The README lists model-based testing as a way to "test UI, APIs or state
  machines" and links the Criteo article.
- That article, "Detecting the unexpected in (Web) UI", Feb 6 2019
  (https://medium.com/criteo-labs/detecting-the-unexpected-in-web-ui-fuzzing-1f3822c8a3a5),
  fuzzes a Connect Four React app with commands: play a token, undo, redo, new game,
  bookmark a URL, reopen it, refresh. Each command has a precondition, an action,
  and a postcondition. It reports a 27-step failure shrunk to 4 steps. It does not
  name the browser driver in the text; the fast-check issue below says the examples
  use Selenium.
- Issue #253 "Reference some examples of model based tests on selenium, puppeteer,
  cypress" (https://github.com/dubzzz/fast-check/issues/253): the author's two UI
  examples use Selenium, with a "complex model" and a "limited model" variant (the
  limited one asks the driver whether the current state allows the command). He was
  still looking for Cypress examples. No Playwright example was found in the docs.
- Issue #462 "Delay after last command while shrinking"
  (https://github.com/dubzzz/fast-check/issues/462): someone running a model-based
  UI test through puppeteer wanted to assert "no errors were thrown in the app".
  Errors arrived after `asyncModelRun` returned, so shrinking missed them. The
  author's answer: after `await fc.asyncModelRun(s, cmds)` inside the
  `asyncProperty`, sleep (200 ms in the example) and then check the console, so a
  throw there still counts as the property failing and still shrinks. This is the
  closest documented match to "no script error line, no notice bar" invariants.

Cost to expect (inference from the above, not from a doc): every shrink step
re-runs the shortened sequence from a fresh page, so each candidate costs a page
load and Start Puzzle. `numRuns`, a small `size`, and `interruptAfterTimeLimit` keep
this bounded.

## 2. gremlins.js

- What it does: a horde of "gremlin" species (clicker, toucher, formFiller,
  scroller, typer) acts at random on the page, with "mogwais" (alert, fps, gizmo)
  watching for failure. Gizmo stops the run after 10 errors. Actions run at a
  default 10 ms interval, 1000 times (README, https://github.com/marmelab/gremlins.js).
- Seeding: yes. `randomizer: new gremlins.Chance(1234)` makes an attack repeatable
  ("Seeding The Randomizer", same README).
- Shrinking: none. The README documents no reduction or minimization, and the
  species and strategies are the only extension points.
- Playwright: the README has a Playwright section: load `gremlins.min.js` with
  `page.addInitScript`, then `page.evaluate(() => gremlins.createHorde().unleash())`.
  The horde runs inside the page, so it cannot drive our scripts' controls by
  meaning (undo, tool switch, settings Save), only click, type and scroll at random
  positions. It dispatches synthetic events from page JavaScript, not Playwright
  input (inference from "the clicker gremlin ... clicks anywhere on the visible
  area", not stated outright).
- Maintenance: latest npm version 2.2.0, published 2020-07-21, registry entry last
  modified 2022-06-18; dependencies `chance` and `core-js`; unpacked size 922,045
  bytes; MIT (npm registry, `gremlins.js`). The most recent commit the GitHub API
  returned is dated 2023-03-06 and the repo is not archived, with 21 open issues.
  Treat it as unmaintained: no release in over six years.

## 3. Other tools

All dates are npm publish dates from the registry.

Playwright-native monkeys (all new, all TypeScript or ESM, all pulling Playwright):

- **buttonmash** 0.4.0, 2026-11-05, created 2026-05-29. Crawls, clicks, types,
  scrolls, resizes; fails the build on uncaught errors, 500s, crashes, blank
  screens. "Every choice ... flows through a single seeded PRNG, and the in-page
  `Math.random` is seeded identically"; the seed is printed and replaying it "takes
  the same decisions". Dependencies: zod, jiti, axe-core, commander, picocolors,
  playwright. 1.2 MB. MIT. No shrinking mentioned. (https://www.npmjs.com/package/buttonmash)
- **Mischief** 0.2.0, 2026-08-02, five versions in total, created 2026-07-30.
  Every run driven by one integer seed (mulberry32); each step gets its own PRNG
  derived from `(seed, routeIndex, stepNumber)` so a different number of draws in
  one step cannot shift later steps. Mutators include random click, back, invalid
  input, rapid double click, refresh, keyboard spam. One dependency, `playwright-core`.
  No shrinking mentioned. (https://github.com/ca1773130n/Mischief)
- **chaosbringer** 0.15.0, 2026-11-02, created 2026-05-01. Weighted random actions
  by ARIA role and text, declarative invariants, and a `Repro:` line with the seed.
  It is the one that mentions reduction: "trace record / replay / minimize ... delta-debugged
  repros", and `model shrink` for fault plans. Larger: three runtime dependencies
  and Playwright peer dependencies, 2.2 MB, MIT. Aimed at crawling pages and
  injecting network faults. (https://www.npmjs.com/package/chaosbringer)

  None of the three knows SudokuPad's tools, selection, or undo. Their invariants
  are page-level (console error, failed request), so "undo returns state" would be
  our own code regardless. All three are weeks to months old, so their stability is
  unproven. I opened only the npm and GitHub descriptions, not their source.

Other property-based JavaScript libraries:

- **jsverify** 0.8.4, published 2018-10-31; GitHub repo `jsverify/jsverify` last
  pushed 2021-04-05, not archived. Four runtime dependencies. No model-based
  commands were found in what was read. Treat as dormant.
- **testcheck** 1.0.0-rc.2, 2017-04-26 (registry entry modified 2022-06-27).
  A QuickCheck port; dormant.
- **Hypothesis stateful testing** (https://hypothesis.readthedocs.io/en/latest/stateful.html)
  is the model for what fast-check's commands do: rules with preconditions and
  invariants, and the output is "a very short program that will demonstrate the
  problem". It is Python-only, so not usable from Node without a second toolchain.

No Playwright-native model-based or shrinking feature was found in the Playwright
docs; I did not open them, so this is "not found by search", not a proven absence.

## 4. Hand-rolled seeded generator with a delta-debugging shrinker

This is a standard, documented technique, not an invention:

- Delta debugging is Zeller and Hildebrandt's ddmin ("Simplifying and Isolating
  Failure-Inducing Input", IEEE TSE 2002, https://doi.org/10.1109/32.988498). The
  Fuzzing Book chapter "Reducing Failure-Inducing Inputs"
  (https://www.fuzzingbook.org/html/Reducer.html) describes it as "a simple and
  robust reduction algorithm" and gives a short implementation: split the input
  into `n` chunks (start `n = 2`), try each complement (the input minus one chunk);
  if one still fails, keep it; otherwise double `n`; stop when chunks are single
  elements. The result is 1-minimal, meaning every remaining element is needed.
- The same chapter states the prerequisites: the failing test case must be
  "deterministic and runs quickly enough to warrant a number of experiments".
  It also notes that reduction can fail when most reductions produce invalid input
  (its example is syntax). For action sequences the analogue is a removed action
  that a later action depends on; an action list with preconditions checked at run
  time (fast-check's `check`) avoids that.
- A seeded generator needs only a small PRNG. Mischief documents using mulberry32
  and one PRNG stream per step so replay survives a variable number of draws
  (https://github.com/ca1773130n/Mischief). The generator should produce the whole
  action list from the seed up front, as data, so the shrinker removes items from a
  list and replay is "run this list". Do not derive actions from the live page
  during the run, or removing an item changes later choices.
- fast-check's own design is this idea made generic: seeded generation
  (`pure-rand`), `commands` that skip actions whose `check` fails, and a recorded
  `replayPath`.

Judgment (mine, not from a source): a hand-rolled version is perhaps 80 to 150
lines (PRNG, action list builder, ddmin loop, a `replay(list)` entry) and adds no
dependency, which matters because a new dependency needs Chris's ruling. fast-check
buys a tested shrinker that also shrinks action arguments (a smaller cell index or
digit) and the `seed`/`path`/`replayPath` replay line, at the cost of one
dependency with one transitive (`pure-rand`) and 1.5 MB. ddmin as in the Fuzzing
Book only removes whole actions; it does not simplify their parameters.

## Not verified

- No tool was run; the fit with SudokuPad (timing, animation, the injected scripts'
  async startup) is untested.
- fast-check's behaviour with `asyncModelRun` and Playwright in particular is
  inferred from the Selenium and Puppeteer reports, not from a Playwright example.
- The sizes are npm `unpackedSize`, not install size or bundle size.
- The Medium article was read through a text fetcher; the claim that the Criteo
  examples use Selenium comes from fast-check issue #253, not from the article.
