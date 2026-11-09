# Can a test install the scripts into a real Tampermonkey? (2026-11-07)

Question: can an automated test install each `*.user.js` into a real
Tampermonkey inside Playwright's Chromium, the way a user does (open the install
URL, click Install), then load sudokupad.app and confirm the script ran? That
would replace the "real Tampermonkey install" check each PR lists as owed.

## Verdict

- Locally: feasible. Run end to end here (see "What was run").
- On GitHub Actions ubuntu runners: very likely feasible, not run there. The one
  run here was headless with no X server, which is what a runner has, so xvfb
  is not needed. Unverified on a runner: that Google's CRX endpoint serves the
  runner's IP (it did serve this machine).
- Not covered even then: Chrome Web Store install, the browser's own toolbar and
  permission prompts, and Tampermonkey's scheduled auto-update.

## Recipe (what the probe did)

1. Get the extension: `curl -L 'https://clients2.google.com/service/update2/crx?response=redirect&prodversion=140.0.0.0&acceptformat=crx2,crx3&x=id%3Ddhdgffkkebhmkfjojejmpbldmpobfkfo%26uc' -o tm.crx`
   (Tampermonkey's store id `dhdgffkkebhmkfjojejmpbldmpobfkfo`). Returned a
   1.7 MB CRX3 (`Cr24`, version 3), Tampermonkey 5.5.1, manifest v3.
2. Unpack: skip the CRX3 header (12 bytes + header length at bytes 8..12), the
   rest is a zip. About 10 lines of Python or node, no dependency.
3. `chromium.launchPersistentContext(tmpdir, { channel: 'chromium', headless: true, args: ['--disable-extensions-except=DIR', '--load-extension=DIR'] })`.
4. Enable the userScripts API with no clicking: open a page at
   `chrome://extensions/` and run
   `chrome.developerPrivate.updateExtensionConfiguration({ extensionId, userScriptsAccess: true })`.
   `extensionId` comes from the service worker URL (`context.serviceWorkers()[0]`);
   an unpacked extension's id is derived from its path, so it is not the store id.
5. Wait about 5 s after startup. An install attempted straight away did not
   bring up the install page.
6. Open the install URL in a new page (`page.goto(url)`; a failed goto is
   expected because the tab is redirected). A tab at
   `chrome-extension://<id>/ask.html?aid=...` appears
   (`context.waitForEvent('page', { predicate: p => p.url().includes('/ask.html') })`).
   Wait for `input[value="Install"]` (it reads "Update" or "Reinstall" for a
   known script) and click it.
7. Open a SudokuPad puzzle page and look for what the script adds (for Pen Tool
   Extras, `#pen-tool-extras-style` and a global `ToolPen`).
8. To read what is installed, open `chrome-extension://<id>/options.html#nav=dashboard`
   and read the `tr.scripttr` rows (name, version).

## What was run (probes in `.scratch/tm-probe/`, untracked)

Machine: WSL2 Linux, Playwright 1.64.1, its Chromium "Chrome for Testing"
156.0.8078.4, Tampermonkey 5.5.1.

- `probe1.mjs`: extension loading by mode. Old headless (`headless: true`, no
  channel, the headless shell): no service worker, the extension does not load.
  `channel: 'chromium'` with `headless: true`: service worker present. Headed
  under `xvfb-run`: present.
- `probe2.mjs`: before the `developerPrivate` call, `chrome.userScripts` was
  undefined in Tampermonkey's service worker; after it, `getScripts()` worked.
  This ran in new headless with no developer-mode preference seeded.
- `probe3.mjs`: a local http server on 127.0.0.1 serving the `.user.js` as
  `text/plain`. Tampermonkey took over the tab (via
  `www.tampermonkey.net/script_installation.php#url=...`) and opened `ask.html`
  with Install and Cancel buttons. Needed the 5 s wait; the first attempt did not.
- `probe4.mjs`: clicked Install on Pen Tool Extras, loaded the puzzle in
  `live/puzzle-url.txt` on the real sudokupad.app: `#pen-tool-extras-style`
  present and `typeof ToolPen === 'object'`. The dashboard listed the script,
  1.27.7. The script injects only when Tampermonkey runs it here, because this
  profile has no other injector.
- Update path, same probe, a served modified copy:
  - Same `@name` and `@namespace`, `@version` raised: the page said "Userscript
    update" with an "INSTALLED VERSION" row; the dashboard showed one row at the
    new version.
  - `@name` changed, `@namespace` unchanged: the page said "Userscript
    installation" (not update); the dashboard showed two rows, the old script
    still there and the renamed one beside it. A manual install of a renamed
    script therefore duplicates it, as Draw Tool -> Text Annotation -> Text
    Anywhere would for anyone who installs by hand. Not tested: what Tampermonkey's
    own scheduled update (via `@updateURL`/`@downloadURL`) does when the name at
    that URL changed. That needs its update-check trigger driven.
- `probe5.mjs`: the real raw URL
  `https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/pen-tool-extras.user.js`
  gave the same install page, with that URL shown, and one installed row.

Not run: Actions, other four scripts, `file://` URLs, a seeded Preferences file,
Violentmonkey, the Edge or Firefox builds. Each of the other four scripts has an
`@match` the same way, so the same loop should apply, unchecked.

## What was only read

- Playwright, Chrome extensions: https://playwright.dev/docs/chrome-extensions .
  Extensions need a persistent context; Chrome and Edge removed the side-load
  flags, so use Playwright's bundled Chromium; "the `chromium` channel ... allows
  to run extensions in headless mode"; headed also works. MV3 service workers
  suspend after about 30 s and the Playwright handle survives.
- Chrome userScripts API: https://developer.chrome.com/docs/extensions/reference/api/userScripts
  (page last updated 2026-10-29). From Chrome 138 the per-extension "Allow User
  Scripts" toggle applies; before, Developer mode. Availability check is a
  `getScripts()` call that throws when off (the probe used the same check).
- Tampermonkey FAQ Q209 https://www.tampermonkey.net/faq.php?q=Q209 : version
  5.3+ in Chrome needs either the "Allow User Scripts" toggle (Chrome 138+) or
  Developer mode. Q407 https://www.tampermonkey.net/faq.php?q=Q407 : install from
  a CRX by dragging it to chrome://extensions (that route needs the page, so
  `--load-extension` of the unpacked files is the test route). Q406 lists the
  official ids (Chrome `dhdgffkkebhmkfjojejmpbldmpobfkfo`, MV3).
- Web Store listing https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo :
  version 5.5.1, updated 2026-10-04, 12M users; it carries no licence text. The
  listing says Tampermonkey sends anonymous statistics and requests to its own
  servers (blacklist and update checks); the install flow also went through
  `tampermonkey.net` in the probe, so the test needs that site reachable.
  Tampermonkey is closed-source freeware (the repo's `docs/research/tampermonkey-shared-code.md`
  and the listing give no redistribution grant). I did not find terms that allow
  or forbid a CI download; the safe stance is to download it at run time from
  Google's endpoint for the test and never commit or publish the files.

## Notes for building it

- Cache: key an Actions cache on the CRX's version (from the unpacked
  `manifest.json`), or just re-download each run (1.7 MB). The update endpoint
  takes `prodversion`, which must be at least the extension's
  `minimum_chrome_version` (120). Never commit the CRX.
- Fragility: the version of Tampermonkey floats, so its install page could
  change (selector `input[value="Install"]`, the `ask.html` URL, the 5 s warm-up).
  Keep the test out of `npm test`, like the live suite; a nightly or on-demand
  workflow fits, with a pinned Tampermonkey version possible by saving the CRX
  in the Actions cache.
- SudokuPad can be served from the recording the live harness already has
  (`live/cache.mjs` `routeSudokuPad(context)`); the probe used the real site.
- Opening the extension adds a "welcome" tab at `tampermonkey.net` on a fresh
  profile; ignore pages whose URL does not match.
- Do not trust the first `ask.html` text: read it after the Install button
  shows.

## Fallback: Violentmonkey (not tried)

Open source (MIT), https://github.com/violentmonkey/violentmonkey , so the
files can be built or downloaded from releases without a licence worry. It
would catch a script that breaks under any MV3 userscript manager (injection
timing, `@grant none` and the page world, `@match`), but it would miss
Tampermonkey's own behaviour: its install page and update/rename matching, its
`@run-at document-idle` timing, its `GM_info` absence handling. Since the
question here is "does it work in Tampermonkey", it is a weaker stand-in; use
it only if Tampermonkey's CRX proves unreachable from Actions.

## Built (2026-11-07, #480)

`npm run test:tampermonkey` (`live/tampermonkey/`) follows the recipe. What building it added:

- Actions: run 42439298762 (`workflow_dispatch` on the `implement-480` branch, ubuntu-latest) fetched the CRX from
  Google's endpoint and passed 15 of 15. The endpoint serves a runner's IP.
- Warm-up: no ready signal was found, so the test reopens the install URL every 5 s until `ask.html` shows. The first
  attempt after launch usually misses; the second shows it.
- Install page buttons, all `input[type=button].install`, the action first: a new script shows "Install" and "Cancel";
  a known one "Update", "Cancel" and "Disable Updates". The page closes itself after the action is clicked.
- Dashboard: `tr.scripttr` rows include a header row and a `<New userscript>` row; a script's row is one whose
  `td.script_version` has text, with its name in `td.script_name`.
- A local `http.Server` serving the scripts must `closeAllConnections()` before `close()` resolves: Tampermonkey keeps
  its connection open.
- With all six installed, each script's representative action from `live/scripts.mjs` works on its own page.

## Driving an update check (2026-11-09, #711)

What a probe found (Tampermonkey 5.5.1, Playwright's Chromium, headless), building the test of Text Anywhere's move from
`draw-tool.user.js` to `text-anywhere.user.js`:

- Trigger: the dashboard's "last updated" time for a script is
  `tr.scripttr span.script_update .clickable[title="Check for updates"]`; a click checks that script's `@updateURL` at once.
- An update whose `@updateURL` changed opens `ask.html` with an "Update" button and the line "The update url has changed
  from: '<old>' to: '<new>'". Nothing installs until the button is clicked.
- An update that keeps its `@updateURL` installs with no page: the dashboard just shows the new version.
- After the handover installed, the next check fetched the new `@updateURL` and updated the same row (same `@name` and
  `@namespace`): one row throughout, old version, then the handover's, then the new file's.
- What the test runs: it clicks "Check for updates" on the dashboard, then clicks "Update" on the page a changed
  `@updateURL` opens, as a user would. It proves the move only when someone accepts that page.
- Not run, and not known: what Tampermonkey's own scheduled check does with a changed `@updateURL`. It may open the same
  page, which a user must accept and may close instead, or install with no page. Until one open in a real Tampermonkey
  settles it (the spec's closing check owes that), a copy is not known to move to the new address by itself.
