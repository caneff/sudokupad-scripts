# Raising the fuzz's hit rate

Read 2026-11-09. The question: which changes to the fuzz (`live/fuzz/`, fast-check 4.10.2 driving real SudokuPad in Playwright Chromium with the six scripts
injected) raise the rate at which it finds bugs, ranked by expected gain per unit of effort. Builds on `docs/research/ui-fuzz-tools.md` (tool survey, the #592
proof) and `docs/research/fuzz-planted-bugs.md` (9 of 10 hand plants caught, the miss an action gap). Already done or filed, so not proposed again: hunting on after a
failure (#676), self-check rules (#677), planted bugs (#678), many puzzles per run (#679), slider actions (#713). Nothing was run for this note: no fuzz, no live
test. The fast-check facts marked "source" were read from `node_modules/fast-check/lib/fast-check.js` (4.10.2) in this checkout.

## Verdict

- **The cheapest real gain is swarm testing**: per action list, draw a random subset of the action kinds and generate only from those. It is a few lines in
  `actionList` of `actions.mjs`, it has the strongest outside evidence of anything here (42% more distinct compiler crashes in the same week, Groce et al. 2012),
  and Hypothesis ships it in its own stateful testing. The current vocabulary is 33 kinds with weights from 1 to 8, so a rare pair (two pen-page turns, then a line)
  is very rare in a 10-step list.
  **Measured 2026-11-13 (#728), not borne out**: swarm caught 26 of 60 planted-bug hunts against 37 for the plain fuzz and 41 for the busy start
  (`fuzz-planted-bugs.md` § Fourth run).
- **The next is to see what the actions never reach**: V8 coverage of the six scripts during a fuzz run. The one missed plant (`redraw-typo`) sat in code no action
  reached; a coverage report names every such function at once, with no plant written. The scripts are injected as inline `<script>` text with no URL, so they need a
  `//# sourceURL=` tag to show up in Playwright's coverage (the repo already does this in `live/redraw-probe.mjs`).
- **Then longer lists** (20 to about 40 or 50 steps) and **parallel hunts** on the 4-core runner: both buy more state per night for little code.
- **The plant harness cannot measure any of this yet.** With one seed per plant and 9 of 10 caught in under 2 minutes, it is saturated: a change that doubles the hit
  rate would show as "still 9 of 10". Measure with several seeds, a short budget, and catch fraction plus median time to catch, A against B on the same seeds.
- **Not worth it now**: coverage-guided generation (fast-check has none and its author says so; building it is large), fast-check's scheduler (it orders promises the
  test wraps; SudokuPad's timers and events are outside it), and full Stryker runs (thousands of mutants, each a multi-minute fuzz, and its mutant switch does not
  reach a browser page without a hand-made bridge).

## Ranked changes

Effort: S is under a day and no new dependency, M a few days or a workflow change, L a week or a new dependency (which needs Chris's ruling). "Gain" is my
estimate from the evidence, not a measurement; the last column says how to measure it.

| # | change | targets | evidence | effort | expected gain | how to measure with the plant harness |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | Make the plant harness able to see a difference: K seeds (say 5) per plant, a short budget (say 60 s), report catch fraction and median time to catch, A and B on the same seeds | measurement, prerequisite to every row below | saturation is visible in `fuzz-planted-bugs.md` (most catches under 15 s on one seed) | S | none by itself; without it no other row can be judged | it is the measure |
| 1 | Swarm testing: each list draws a non-empty random subset of the kinds (or of the three groups plus kinds), then generates only from it | rare combinations of kinds; kinds that suppress others (undo all, reload wipe what a later step needs) | Groce et al. 2012: 42% more distinct crashes in a week of compiler testing; stack example from 1 in 370,000 to 1 in 16 tests. Hypothesis's `FeatureFlags` applies it to stateful rules | S | high for multi-step plants (`page-three-line-not-drawn` took 49 s, `dark-page-saves-light` 91 s); none for one-step plants | paired seeds, row 0; watch the two slow catches' time to catch |
| 2 | V8 coverage of the six scripts over a fuzz run (sourceURL tag + `page.coverage`), a list of functions with count 0, per night or per plants run | action gaps (the one miss) | Playwright `Coverage`; CDP `Profiler.takePreciseCoverage` | S to M | indirect but sure: every unreached function is a bug class no rule can catch; it would have pointed at `adoptThickness` / `adoptArrowSpacing` before #678 | count of never-run functions before and after an action is added; a plant in a function the report says is reached should then be caught |
| 3 | Longer lists: `maxCommands` 20 to 40 or 50, and no empty list (`fc.commands` draws the length uniformly from 0, so 1 list in 21 is empty today) | deeper states (busy board, long undo stacks, many notes) | Arcuri 2010 ("Longer is better"): longer sequences make hard stateful targets easy; source: command list length is uniform in [0, maxCommands] | S | medium; per-list page start (about 1.1 s) is spread over more steps, about +35% steps per second by my arithmetic below; shrinks get longer | steps per second from the run's own counts; row 0 on the slow plants |
| 4 | Parallel hunts in the nightly: 3 or 4 independent `fc.check` loops on fresh seeds, one browser, each list its own context as now | throughput | GitHub's public-repo `ubuntu-latest` is 4 CPUs, 16 GB; fast-check's fuzzing page says to use several processes for long runs | M (nightly bookkeeping: two failures at once, one issue per title) | about 2 to 3 times the lists per night, if the runner is not CPU-bound (not measured) | lists per night in the Actions log; plants per seed caught at a fixed wall-clock budget |
| 5 | Timing as a generated argument: per action a settle of 0, 40 or 300 ms (and a key `delay`), and per list a CPU throttle of 1x or 4x (CDP `Emulation.setCPUThrottlingRate`) | races between a script's observers, timers and frames and the next input | Node.fz (EuroSys 2017): perturbing the event-loop schedule exposed known bugs much more often and found new ones; Romano et al. ICSE 2021: 45% of flaky UI tests come from async waits | S to M | uncertain: real for race bugs, but none of the 10 plants is a race; adds flaky failures and makes replay less exact | write one race plant (a redraw on a 50 ms timer that reads stale state); compare catch fraction; count failures that do not replay |
| 6 | Busy starting states: puzzle variants that open with many digits, marks, pen strokes, colors and notes (from a replay or `puzzleData`), as Hypothesis's `@initialize` does | code that only runs on a full board; the "board too empty" miss reason | Arcuri 2010 (state reach needs long prefixes, a seeded state is a free prefix); Hypothesis stateful docs (initialize rules) | M | medium for rules over many strokes or cells; also cuts the steps a list spends building state | a plant that needs 10 or more strokes or notes; row 0 |
| 7 | Mutants as the yardstick: sample 30 to 50 mutants of the operators real faults couple to (relational, conditional, statement deletion), only in code row 2 says is reached, run each through `plants-run.mjs` | measurement bias of hand plants (written by the rule author) | Just et al. FSE 2014: mutant detection correlates with real fault detection; 73% of real faults coupled to mutants | M (own generator over `espree`/`acorn`, already in `node_modules` through StandardJS, but a direct dependency needs a ruling) or L (Stryker) | none by itself; a fairer measure for rows 1 to 6 | it replaces the hand plants as the score |
| 8 | PR-time fuzz: 5 to 10 minutes on PRs that touch a `*.user.js` | finding a regression before merge, not more bugs | ClusterFuzzLite's PR workflow defaults to `fuzz-seconds: 600` in `code-change` mode | S to M | earlier, not more, findings | none needed |
| 9 | Coverage-guided generation (keep lists that reach new code, mutate them) | deep, rare paths | fast-check is "not coverage-based" (author, discussion #2769); Jazzer.js is Node-only | L | unknown; not proposed now | row 0 and row 7 |

Arithmetic behind row 3 (mine, from `fuzz-planted-bugs.md`): `redraw-typo` ran 90 lists in 240 s, 2.7 s a list. With a mean of 10 steps and about 1.1 s to open a page
(`ui-fuzz-tools.md`), a step costs about 0.16 s. At a mean of 25 steps a list is about 5.1 s and the run does about 4.9 steps a second instead of 3.7.

## 1. fast-check: commands, bias, runs, shrinking

What the engine does now (`engine.mjs`, `actions.mjs`): `fc.check` with `endOnFailure` and `interruptAfterTimeLimit`; the property draws a puzzle with
`fc.constantFrom`, then `fc.commands([actionArbitrary], { maxCommands: 20, size: 'max', replayPath })`; each command waits `ACTION_SETTLE_MS = 40` and reads a
snapshot; a failure is replayed by index and shrunk for at most 10 minutes.

- **Options of `fc.commands`** (source, `CommandsContraints` in `lib/cjs/fast-check.d.ts`): `maxCommands`, `size`, `disableReplayLog`, `replayPath`. Nothing else: no
  per-command weights beyond what `fc.oneof` gives, no feature switching. The docs page "Turn fast-check into a crazy QA" (fast-check, no date shown,
  https://fast-check.dev/docs/advanced/model-based-testing/) says `commands` is "like an enhanced version of the `array`" that "can efficiently shrink failing
  scenarios", and that it "takes into account the commands that have really been executed": a skipped command (failed `check`) is not shrunk or replayed.
- **The length of a list is uniform** (source): `CommandsArbitrary.generate` draws `lengthArb.generate(mrng, undefined)` with `lengthArb` an `integer({min: 0, max})`,
  and draws each command with `oneCommandArb.generate(mrng, undefined)`. A bias factor of `undefined` makes `IntegerArbitrary.generate` take `mrng.nextInt(min, max)`
  straight. So command lists ignore fast-check's bias entirely (the runner's `runIdToFrequency` bias reaches the puzzle draw only, and `constantFrom` ignores it too).
  Two consequences: the `unbiased` plugin and bias tuning change nothing here, and 1 list in 21 is empty (length 0), a page start that tests only the load.
- **`size` and `maxCommands`** ("Size explained", https://fast-check.dev/docs/configuration/larger-entries-by-default/): `size: "max"` means "generate entities
  having up-to `maxLength` items"; the default `small` caps a length at 10 when the minimum is 0. The engine's `size: 'max'` is therefore what makes 20 the real cap;
  raising `maxCommands` is the whole change in row 3. `ui-fuzz-tools.md` already saw the default size miss a 3-digit plant that `size: 'max'` found.
- **Shrinking cost** (source, `CommandsArbitrary.shrink`): it first tries the empty list, then, for each kept prefix length, shorter suffixes, then shrinks each
  command's arguments in place. Every candidate is a fresh page here, so shrink time grows with list length; the 10-minute cap (`DEFAULT_SHRINK_MINUTES`) bounds it.
- **Time, not run count, is the right budget.** "Turn fast-check into a fuzzer" (https://fast-check.dev/docs/advanced/fuzzing/) runs with `numRuns` set to
  infinity or 1,000,000 and says that properties run without end "may" need "multiple processes" since JavaScript is single-threaded. The engine's
  `UNBOUNDED` plus `interruptAfterTimeLimit` is that pattern. Minor: in 4.10.2 the `interruptAfterTimeLimit` parameter is marked `@deprecated`, "Prefer the
  `interruptAfterTimeLimit` plugin" (source, `Parameters` in the `.d.ts`); it still works.
- **The scheduler does not fit.** "Easily detect race conditions" (https://fast-check.dev/docs/advanced/race-conditions/): `fc.scheduler` reorders promises that the
  test wraps (`schedule`, `scheduleFunction`, `scheduleSequence`); `waitIdle` "Cannot await tasks triggered by uncontrolled sources", and timers need fake timers
  driven through `act` (the page's example is Jest's). SudokuPad's and the scripts' events, observers and timers run in Chromium, outside any promise the property
  holds. `scheduledModelRun` would only reorder the property's own Playwright calls, which the page already serializes. Timing is better varied as a generated
  argument (section 5).

## 2. Coverage in the browser

- **Playwright** ("Coverage", https://playwright.dev/docs/api/class-coverage): `page.coverage.startJSCoverage({ resetOnNavigation, reportAnonymousScripts })` /
  `stopJSCoverage()`, Chromium only, returns per script `url`, `source` and `functions[].ranges[]` with a `count` ("V8-specific coverage format"); the example
  converts it with `v8-to-istanbul`. "JavaScript Coverage doesn't include anonymous scripts by default. However, scripts with sourceURLs are reported."
  `resetOnNavigation` defaults to `true`, and `false` "does not guarantee that coverage persists through navigations"; a `reload` step would cut a list's coverage
  unless it is collected before the reload.
- **CDP** ("Profiler domain", https://chromedevtools.github.io/devtools-protocol/tot/Profiler/): `startPreciseCoverage({ callCount, detailed })` "resets execution
  counters" and prevents optimized code; `takePreciseCoverage` "Collect[s] coverage data ... and resets execution counters", so a per-action delta is possible
  through a CDP session, which Playwright's wrapper does not expose.
- **What it takes here**: `installAtIdle` (`live/session.mjs`) inserts each script as an inline `<script>` element with no URL, which the coverage API treats as anonymous.
  Appending `\n//# sourceURL=<file>.user.js` to the injected text (as `tagged` in `live/redraw-probe.mjs` already does) names it. Then collect coverage per list in
  `openTarget`/`close`, merge by function name and offset over the night, and print the functions of each script with a count of 0. A plant would no longer be
  needed to find an action gap. The offsets refer to the injected text, which is the file on disk plus the tag, so mapping back to lines is direct.
- **Coverage-guided fuzzing for JS**: Jazzer.js (Code Intelligence, https://github.com/CodeIntelligenceTesting/jazzer.js, last commit 2026-11-02 as shown) is "a
  coverage-guided, in-process fuzzer for the Node.js platform", based on libFuzzer; its README lists Node.js platforms only, nothing for a browser page. fast-check's
  author, asked about fuzzing (GitHub discussion #2769, dubzzz/fast-check, March 2022, https://github.com/dubzzz/fast-check/discussions/2769): "it will not be
  coverage-based (generated values, except for shrink case, are fully independent from each others)". So guidance would be ours to build (keep lists that reached new
  ranges, replay them through `examples`, mutate them), and replay by seed and path would no longer describe a list on its own. Large, unproven here; row 9.

## 3. Mutation testing as the yardstick

- **Stryker JS fits poorly as a runner.** Configuration page (Stryker Mutator, https://stryker-mutator.io/docs/stryker-js/configuration/; latest release v10.1.1,
  2026-10-23 per the GitHub releases API): the default `testRunner` is `command`, which "runs a configurable bash/cmd command and bases the result on the exit code"
  and "comes with a performance penalty, as Stryker cannot do any optimizations and just runs all tests for all mutants"; `coverageAnalysis` is not supported by the
  command runner. `mutate` takes any glob and line ranges (`"src/app.js:1-11"`), so the root `*.user.js` can be named; no option to sample mutants was found on that
  page. `timeoutMS`/`timeoutFactor` would have to cover a multi-minute fuzz per mutant.
- **The mutant switch does not reach the page.** Stryker puts all mutants in the code and picks one at run time. PR #2345 (stryker-mutator/stryker-js, merged
  2020-08-03, https://github.com/stryker-mutator/stryker-js/pull/2345): the command runner passes `__STRYKER_ACTIVE_MUTANT__` as an environment variable, which "only
  works if the command you configure allows for this environment variable to flow through to the test environment". Issue #6238 (opened 2026-10-01, open,
  https://github.com/stryker-mutator/stryker-js/issues/6238): the instrumented code "looks for the active mutant in `globalThis.__stryker__.activeMutant` or
  `process.env.__STRYKER_ACTIVE_MUTANT__`", the global's name and shape are not documented as stable, and in a realm Stryker does not see every mutant survives. A
  browser bridge (an init script setting `window.__stryker__ = { activeMutant }` and a `window.process` stub from the env var) is the pattern of
  igomezal/stryker-web-test-runner (https://github.com/igomezal/stryker-web-test-runner, 2021); not tried here.
- **Size**: the six scripts are 13,557 lines (`wc -l`). At even one mutant per few lines that is thousands of mutants, each a fuzz of a minute or more. Only a sample
  is affordable, which Stryker does not offer, hence row 7's own small generator (relational, equality, logical, boolean and statement deletion over an AST from
  `espree` or `acorn`, both present in `node_modules` through StandardJS but not direct dependencies) feeding `plants-run.mjs`'s existing `find`/`replace` shape.
- **Operators** ("Supported mutators", https://stryker-mutator.io/docs/mutation-testing-elements/supported-mutators/): arithmetic, array declaration, assignment,
  block statement (BlockRemoval), boolean literal, conditional expression, equality operator, logical operator, method expression, object literal, optional chaining,
  regex, string literal, unary, update.
- **Are mutants a valid proxy?** Just, Jalali, Inozemtseva, Ernst, Holmes, Fraser, "Are Mutants a Valid Substitute for Real Faults in Software Testing?", FSE 2014
  (https://homes.cs.washington.edu/~rjust/publ/mutants_real_faults_fse_2014.pdf; highlights also in the ACM copy, https://dl.acm.org/doi/pdf/10.1145/2635868.2635929):
  357 real faults in 5 Java programs; "a statistically significant correlation between mutant detection and real fault detection, independently of code coverage";
  "73% of real faults are coupled to the mutants generated by commonly used mutation operators"; 17% "are not coupled to any mutants"; conditional operator
  replacement, relational operator replacement and statement deletion couple to real faults more often than other operators.
- **Verdict for here**: a sampled mutant set is a better yardstick than hand plants, for the reason `fuzz-planted-bugs.md` gives itself (plants by the rule author favor
  the rules). It is not a hit-rate change, and it should be sampled only in reached code (section 2): a mutant in unreached code is a known action gap and costs a fuzz
  run to rediscover. Real bugs the fuzz found (#668, #681) reverted into plants stay the best single test.

## 4. Swarm testing

- Groce, Zhang, Eide, Chen, Regehr, "Swarm Testing", ISSTA 2012 (author copy, https://users.cs.utah.edu/~regehr/papers/swarm12.pdf). Each test is generated from
  a random configuration that "omits some features", configurations getting equal resources. Two mechanisms: "some features actively prevent the system from
  executing interesting behaviors" (pops keep a stack from overflowing), and "test features compete for space in each test". Results: "in a week of testing it found
  42% more distinct ways to crash a collection of C compilers than did the heavily hand-tuned default configuration"; in the stack example, uniform push/pop hits a
  32-element overflow bug about 1 in 370,000 tests, swarm about 1 in 16. "it is low cost: ... existing random test case generators already support or can be easily
  adapted to support feature omission."
- Hypothesis builds it into stateful testing: `FeatureFlags` (HypothesisWorks/hypothesis, `hypothesis/src/hypothesis/strategies/_internal/featureflags.py`, last
  changed 2026-05-23, https://github.com/HypothesisWorks/hypothesis/blob/master/hypothesis/src/hypothesis/strategies/_internal/featureflags.py) cites the paper,
  draws one disable probability per test case (so all-on and nearly-all-off both occur), keeps at least one rule on, and "shrink[s] open" so a shrunk case may use
  rules that were off. `stateful.py` filters rules with `self._feature_flags.is_enabled(r.function.__name__)`.
- **Here**: the vocabulary has the suppressors the paper names. `undo back to the start` and `reload` reset what earlier steps built; Escape and the tool-key
  interruptions end gestures. Weights (my sum from `actions.mjs`): 33 kinds, total weight 62, with `pen page`, `pen settings`, `tab`, `undo all` and every
  interruption at 1. `page-three-line-not-drawn` needs two `pen page` turns and then a stroke: at 1/62 per step and about 10 steps a list, two turns in one list is
  about a 1% event. With half the kinds off in a list that keeps `pen page`, its per-step chance roughly doubles and the pair's chance roughly quadruples.
- **Implementation sketch**: in `actionList`, chain after the puzzle draw an `fc.subarray(KINDS, { minLength: 1 })` (or a per-list disable probability as Hypothesis
  does), and build `fc.oneof` from the enabled kinds only. The subset is part of the drawn value, so `seed`/`path`/`replayPath` still replay it; shrinking keeps the
  subset and shrinks the list (fast-check's `chain` does not "shrink open"). `type digit`'s `check` needs a selection, so a subset without `click cell` or
  `enter digit` only skips it, which `fc.commands` already handles.

## 5. Timing variation

- Every action now waits a fixed 40 ms before its snapshot, and Playwright's input calls default to no delay (`keyboard.press`: "`delay` Time to wait between `keydown`
  and `keyup` in milliseconds. Defaults to 0", https://playwright.dev/docs/api/class-keyboard). So every list runs one timing profile: fast input, then a short settle.
- **Evidence that timing matters in event-driven JS**: Davis, Thekumparampil, Lee, "Node.fz: Fuzzing the Server-Side Event-Driven Architecture", EuroSys 2017
  (https://davisjam.github.io/files/publications/DavisThekumparampilLee-NodeFz-EuroSys17.pdf): event-driven programs have atomicity and order violations;
  Node.fz "randomly perturbs the execution" and "can expose known bugs much more frequently than vanilla Node.js, and ... can uncover new bugs". It is server side
  (libuv), so its mechanism does not carry over; the finding that perturbing the schedule finds order bugs does. Romano, Song, Grandhi, Yang, Wang, "An Empirical
  Analysis of UI-based Flaky Tests", ICSE 2021 (https://arxiv.org/abs/2103.02669): 105 of 235 flaky UI tests (45.1%) come from async waits, 52.0% in web projects.
  That is about test flakiness, not app bugs, but it says web UI behavior is timing-sensitive, which cuts both ways here: more bugs reachable, more false alarms.
- **Tools that can vary timing in this harness**: a per-action settle drawn by fast-check (0, 40 or 300 ms) and a key or click `delay`, both part of the command so replay
  draws the same values; CDP `Emulation.setCPUThrottlingRate` ("Throttling rate as a slowdown factor (1 is no throttle, 2 is 2x slowdown, etc)",
  https://chromedevtools.github.io/devtools-protocol/tot/Emulation/) per list, through `context.newCDPSession(page)`; Playwright's clock
  (https://playwright.dev/docs/clock) overrides `setTimeout`, `requestAnimationFrame`, `performance` and more and can `runFor` a set time, which would make timing
  deterministic but would also freeze SudokuPad's own timers, so it is not a first step.
- **Cost**: a 0 ms settle blames a late error on the next action (the reason for the 40 ms, `engine.mjs`), and a failure that depends on timing may not replay. The
  nightly would need to say "did not repeat on replay" rather than drop such a failure. None of the 10 plants is a race, so row 5 needs a race plant before it can be
  judged.

## 6. Starting states and sequence length

- Arcuri, "Longer is Better: On the Role of Test Sequence Length in Software Testing", ICST 2010 (https://doi.org/10.1109/ICST.2010.16; author copy
  http://crest.cs.ucl.ac.uk/fileadmin/crest/sebasepaper/Arcuri09e.pdf): on container classes, "on 'difficult' software testing benchmarks longer test sequences make
  their testing trivial"; for TreeMap's hardest branch random search went from about 106 thousand evaluations at length 7 to under ten at long lengths, because "the
  ratio of global optima increases with the increment of the sequence length"; a found sequence is then shortened by removing calls, which is what fast-check's
  shrinker does. The paper also gives conditions under which longer is worse and does not claim it holds for all software.
- Hypothesis "Stateful tests" (https://hypothesis.readthedocs.io/en/latest/stateful.html): `@initialize` rules "are guaranteed to be run exactly once before any normal
  rule is called"; the docs show trading examples for length (`max_examples=50, stateful_step_count=100`, "doubles the number of steps each program runs and
  halves the number of test cases").
- **Here**: a page start is about 1.1 s and a step about 0.16 s (arithmetic under the table), so the per-list fixed cost argues for longer lists; the shrink cap
  bounds the downside. A busy start (row 6) is an `@initialize`: a puzzle variant whose page opens with many entries, marks, strokes and notes, so short lists act on
  a full board. The nearly solved 9x9 is the only full board in the set today, and it has givens, not user entries, strokes or notes.
- **Not read**: John Hughes's QuickCheck state-machine papers. I found no figure on length versus hit rate from them in what I opened, so none is cited.

## 7. Parallel runs and PR-time fuzzing

- **Runner** ("GitHub-hosted runners reference", GitHub Docs, https://docs.github.com/en/actions/reference/runners/github-hosted-runners): standard Linux x64 runners
  for public repositories have 4 CPUs, 16 GB RAM, 14 GB SSD; private repositories get 2 CPUs, 8 GB. This repository is public (`gh repo view`), so `fuzz.yml`'s
  `ubuntu-latest` job has 4 CPUs. Today it runs one list at a time.
- **Shape**: fast-check runs one property sequentially, and its fuzzing page advises several processes for long runs (section 1). Several `runFuzz` loops in one Node
  process, each with its own seed and sharing one `browser`, also work, since each list already gets its own context and Node mostly awaits Chromium. The pages are
  served from the recording (`live/page.mjs`), so parallel lists add no load on sudokupad.app. CPU contention changes timing (a mild row 5 for free, and a source of
  flaky failures). `nightly.mjs` would need to merge results and keep "one issue per title" with two failures arriving together.
- **PR-time practice** (ClusterFuzzLite, "GitHub Actions", Google, https://google.github.io/clusterfuzzlite/running-clusterfuzzlite/github-actions/): the default PR
  workflow runs `fuzz-seconds: 600` in `mode: 'code-change'`, with batch fuzzing `fuzz-seconds: 3600` on a cron (every sixth hour in the example) and continuous builds
  used so that PR fuzzing reports only crashes "newly introduced". The analogue here: a 10-minute fuzz on PRs that touch a `*.user.js`, and a failure that also fails
  on `main` reported as "not from this PR". It finds the same bugs sooner; it does not raise the nightly's hit rate.
- Locally, `fuzz:plants` already takes about 45 minutes per configuration on one core (2 h 08 min for three, `fuzz-planted-bugs.md`'s third run); parallel plants on the shared machine fall under the machine-load rule and are not proposed here.

## Not checked

- Nothing was run: no fuzz, no plants, no coverage collection, no Stryker. Every "expected gain" is an estimate. The step and page costs come from one line of
  `fuzz-planted-bugs.md` (90 lists in 240 s) and the 1.1 s page start measured in #592, not from a new measurement.
- Whether Stryker's instrumented code runs in a browser page once `window.__stryker__` and a `window.process` stub are set was not tried; the claim rests on issue #6238
  and the 2021 web-test-runner example. No Stryker option for sampling mutants was found on the configuration page; other Stryker pages were not searched for one.
- The Groce et al. and Just et al. papers were read through a text fetcher (the abstract, introduction and the Just et al. highlights and conclusion); their method
  sections were not read. Node.fz and Romano et al. were read from their abstracts and finding tables only.
- Hughes's QuickCheck papers were not opened (section 6). ClusterFuzzLite's JavaScript support and its "affected fuzzers" logic were not checked; only its GitHub Actions
  page was read.
- Whether 3 or 4 Chromium contexts at once fit the 4-CPU runner without timeouts, and how much `page.coverage` slows a list, were not measured.
- fast-check's `chain` shrinking behavior for the swarm subset was inferred from the source's general shape, not traced line by line or tested.

## The first never-run list (#729)

`npm run test:fuzz -- --coverage` (`live/fuzz/coverage.mjs`) is row 2 built: each injected script carries `//# sourceURL=<file>`, `page.coverage.startJSCoverage({ resetOnNavigation: false })` runs on every page,
a page's coverage is read before its reload and at its end, and the functions with a count of 0 on every page of the run are printed per script. V8 names the script by the `sourceURL` text as given, so the six scripts
match by file name. A function inside a never-run one is not listed (V8 never compiles it), so the counts below are a floor.

First run, 2026-11-10: `--seed 729 --minutes 4 --config busy-start`, 43 action lists over the 12 puzzles, passed. Functions that never ran, of all the script has:

| script | never ran | functions |
| --- | --- | --- |
| `color-by-digit.user.js` | 164 | 424 |
| `text-anywhere.user.js` | 178 | 684 |
| `auto-rules-resizer.user.js` | 88 | 174 |
| `dark-page.user.js` | 51 | 147 |
| `pen-tool-extras.user.js` | 86 | 561 |
| `ui-tweaks.user.js` | 54 | 98 |

What the lists show, by whether an action could reach it:

- **Action gaps, one ticket each** (the names are the ticket's evidence): Color by Digit's profile editor, menu and Restart (#814); Text Anywhere's resize, rectangle select, nudge and clear (#815); Pen Tool Extras' line modes and
  pen color editing (#816); the settings dialogs of UI Tweaks and Dark Page, with Copy, Paste and Restore defaults (#817); Auto Rules Resizer's rules box drag and limits (#818).
- **The shared error log and notice** (`readErrorLog`, `formatErrorLog`, `renderErrorLogRow`, `noticeHost`, `dismissButton`, `recordFeatureOff`, `skip`, `fallback`, `onSkip`, in every script) run only when a feature fails,
  which is what the fuzz looks for, so no action reaches them and none is proposed (the live suite plants skip lines itself, `expectedSkips` of `live/session.mjs`).
- **The shared settings-dialog scaffolding** (`copiedSettings`, `pastedSettings`, `pasteReport`, `wireCopyPaste`, `setDialogStatus`, `closeDialogKeepingGrid`) is repeated in each script, so every dialog gap in the tickets counts six times in the totals.
- **`redraw-typo`'s functions ran**: `redrawCells`, `redrawArrowLines`, `adoptThickness` and `adoptArrowSpacing` are not in the list, so the slider actions of #713 close the gap that plant found.

**The cost.** The same seed and minutes without `--coverage` gave 35 action lists in 4 minutes against 43 with it (42 on a rerun after the review fixes), so the tag and the coverage cost nothing the run-to-run spread
does not hide. The plant table is the same with and without (`fuzz-planted-bugs.md` § Coverage and mutants), so the nightly passes `--coverage`: `parseFuzzOutput` reads only the lines of a verdict and ignores the list
printed after it (`nightly.test.mjs` checks it).

### After #814 (Color by Digit's profile editor, pad menu and Restart)

Three kinds: `profile editor` (opens the dialog from the settings or from the pad menu's Edit profiles…, makes up to four edits of new, rename, delete, move, select, paint a digit, cell profile, digit profile, then Save or Cancel),
`profile switch` (the pad menu) and `restart`; the rule `digit-cells-colored` now also reads every cell when the groups change. Rerun 2026-11-13, same seed, minutes and config (`--seed 729 --minutes 4 --config busy-start --coverage`), 38 lists, passed:
`color-by-digit.user.js` 99 of 528 never ran (164 of 424 before; the script grew). Of #814's names, all left the list but `restoreBeforeRestart`, which runs on an Undo right after a Restart. The `restart` kind draws an Undo straight after the Restart half the time ("restart the puzzle then undo"); a final rerun with that (same seed, 38 lists, passed, 100 of 528) still did not reach it in 38 lists, so it needs a longer run.

### After #815 (Text Anywhere's resize, rectangle select, nudge, clear and rich notes)

Eight kinds: `rich note` (a list, a check box, a code block, a 12-line note), `note resize` (a corner handle dragged), `note wheel`, `note rectangle` (with or without Shift), `note nudge` (taps, or an arrow held past the repeat delay), `clear notes` (OK or Cancel; with a note selected it deletes just that one),
`tick check box` and `reopen note` (a double-click, which takes the caret to the click); `restart` now also names Text Anywhere, since it clears the notes. Rerun 2026-11-13, same seed, minutes and config (`--seed 729 --minutes 4 --config busy-start --coverage`), 43 lists, passed:
`text-anywhere.user.js` 137 of 701 never ran (178 of 684 before). Of #815's names, all left the list but `tickCheck`; that run was made before the tick action placed a check box note of its own when the board has none, which the live smoke test checks (the rerun after the review fixes is below).
The first rerun failed on the rule `notes-saved-match-drawn`, which compared a saved note's raw text with its drawn text; a saved note with markup that finds no drawn twin as typed is now matched to one with the same letters and digits (`rules.mjs`), so a plain note is compared as before and only a note with markup is compared more loosely.

Final rerun after the review fixes (same seed, minutes and config, 40 lists, passed): `text-anywhere.user.js` 135 of 704 never ran, and none of #815's 19 names is on the list, `tickCheck` included.

### After #816 (Pen Tool Extras' line modes, marks, pen color editing and presets)

Four kinds: `pen line mode` (the panel's line mode button pressed one to three times, then a pen line), `pen mark` (ticks some of the eight mark boxes in the dialog and saves, then clicks an edge or a corner of a cell with the pen),
`pen color edit` (holds a pen color until the pickers show, then recolors one, or ends edit mode with Escape, a click on a cell, a tool key or a page turn) and `pen colors dialog` (picks a color preset or presses Restore defaults, then Save or Cancel);
the first three kinds can be in a busy start, `pen color edit` cannot (a hold is a gesture). Rerun 2026-11-13, same seed, minutes and config (`--seed 729 --minutes 4 --config busy-start --coverage`), 31 lists, passed:
`pen-tool-extras.user.js` 64 of 575 never ran. Of #816's 11 names, 8 left the list: `nextLineMode`, `applyLineMode`, `cornerPoint`, `edgeMidpoint`, `tickedCorner`, `savePenColor`, `pickPreset`, `restoreDefaults`.
Three stay, none for want of an action:
- `palettePages` has no caller in `pen-tool-extras.user.js` (`rg palettePages` finds only its definition), so no action can reach it; a follow-up for the script, not for the fuzz.
- `putStockPenBack` runs only when the pen pages step switches itself off (`steps.pages` `onSkip`), which takes a broken SudokuPad internal, not a player's action.
- `endPenEditMode` is the name of the stand-in `let endPenEditMode = () => {}` (line 1258), which `installPenPickers` replaces at startup with the installed `endEditMode`; coverage lists the stand-in, which runs only on a page change before that or with the colors step off. No player action reaches it, so a longer run will not either. The `pen color edit` page-turn ending still runs the installed `endEditMode` through `setSelectedColor`.

### After #817 (the settings dialogs of UI Tweaks and Dark Page)

Four kinds, all page use and all in busy starts: `ui tweaks dialog` (sets the Hide the Toggle Selection button and Wrap buttons boxes, clicks the Tab box off and on again, may press Restore defaults, then Save or Cancel), `ui tweaks settings text` and `dark page settings text` (Copy settings, drawn about 3 times in 11, or one text from `UI_TWEAKS_TEXTS` / `DARK_PAGE_TEXTS` pasted with Paste settings, then Save or Cancel) and `dark page defaults` (picks a color, presses Restore defaults, then Save or Cancel).
No text and no click leaves the Tab option off (the rule `tab-not-letters`), and no valid text gives Dark Page a color that is not dark. The run's browser context now grants the clipboard.
Rerun 2026-11-13, same seed, minutes and config (`--seed 729 --minutes 4 --config busy-start --coverage`), 27 lists, passed: `ui-tweaks.user.js` 28 of 144 never ran (30 of 142 before) and `dark-page.user.js` 38 of 152 (38 of 147 before). Every name of the ticket left the list but one: `darkenColor`, whose Oklab helpers (`toOklab`, `fromOklabLinear`, `inGamut`, `toHex`, `toLinear`, `fromLinear`, `clamp255`) are the same `color-math` lib block's copy, and nothing in `dark-page.user.js` calls `darkenColor` (`rg darkenColor dark-page.user.js` finds only its definition and its own body), so no action can reach it. `pen-tool-extras.user.js` uses it for its palette presets.
Two earlier reruns of the same config showed the run is chancy for a kind of weight 1: with the four kinds left out of busy starts (29 lists) the paste actions (`pastedSettings`, `apply`) of both scripts did not run, and with Copy settings one text of nine (28 lists) UI Tweaks' `copiedSettings` and `copied` did not.
Lists per run held at 27 to 29 in all three, so the dialogs do not slow the run; the drop from 43 lists came with the earlier dialog kinds.

### After #818 (Auto Rules Resizer's rules box)

Three kinds, all page use and all in busy starts: `rules drag` (hovers the rules box, presses the top-right or bottom-left corner and moves it up to 500 px each way, which takes the box past the window and down to its floor), `rules font` (f+ or f- one to three times) and `rules dialog` (types a Max auto width and height from `''`, `200`, `400`, `700`, `2000`, `0` and `-5`, may press Restore defaults, then Save or Cancel; a number box takes no letters, so `0` and `-5` are the numbers that are no size). On a puzzle with no rules text the first two do nothing.
Two runs (`--config busy-start --coverage`, 4 minutes) did not finish, each on a failure found, so each counts the lists run up to it:
- Seed 729 (the ticket's) failed after 338 s on the 4x4 puzzle with three steps of Text Anywhere and Color by Digit: `(start) turn the Text Anywhere Background button off`, `pick profile 1 from the pad menu`, `note "15" with a box at r1c2` (the note's own text box covers the toolbar button the next click needs). None of the three is a rules-box step, and the same three steps fail the same way on `origin/main` (checked with `fuzzScripted` on a `main` worktree). Not fixed here; filed as #829.
- Seed 730 failed after 251 s on the 16x16 puzzle, with one step: `press f+ on the rules box 1 time`. The rule `rules-fit-pane` reads "the rules need 698px in a pane of 688px at 16px, above the smallest font 12.32px". The script's `autoPaneFit` gives f+ a font above the one that fits, at the widest width the window allows, so the rules scroll above the floor; the rule says that does not happen. Which one is wrong is for the owner: the script (f+ should stop where the rules stop fitting) or the rule (a font a player asked for may scroll); filed as #828.
In the seed 730 run `auto-rules-resizer.user.js` had 55 of 218 functions never ran (88 of 174 before). Every name of the ticket left the list but two: `onFontOffset` is the default `() => {}` of a parameter `fitPage` always passes, so no page reaches it (the unit test of `fitRulesPane` does), and `readSizing` runs only when a page loads with a saved sizing, which takes a drag then a reload in one list. `fuzz.smoke.mjs` runs that pair (and reads the box back), so the read is proven on a real page; a 4-minute run draws it by chance.
