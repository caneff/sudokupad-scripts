# Can the userscripts share code? (2026-11-05)

Question: is "scripts share no code" (CODING_STANDARDS rule 9) forced by
Tampermonkey, or could the scripts load a common library?

## What Tampermonkey offers

Read: https://www.tampermonkey.net/documentation.php?q=externals

- `@require <url>` "Points to a JavaScript file that is loaded and executed
  before the script itself starts running." Multiple `@require` lines are
  allowed, and a URL may carry an integrity hash: `#sha256=...`.
- `@resource <name> <url>` preloads a file that the script reads with
  `GM_getResourceText` / `GM_getResourceURL`.

So a common library is possible: each script would carry, for example,
`// @require https://raw.githubusercontent.com/caneff/sudokupad-scripts/<sha>/lib/common.js`.

## Not stated in the docs

The documentation and FAQ (https://www.tampermonkey.net/faq.php) do not say
when a required file is fetched again. Pinning the URL to a commit sha or tag
makes the question moot: a change to the library ships only when a script's
`@require` line changes, so it rides that script's `@version` raise.
Tampermonkey's changelog and issue tracker do say when; see "When a required
file is fetched" below.

## Calling another installed script

Tampermonkey has no API for one script to call another. All five scripts run
with `@grant none`, so they run in the page's own context. One could put a
global on `window` that another reads, but nothing orders the scripts against
each other, and a user may install only one of them.

## Costs for this repo

- The library becomes a second file every user downloads, from a URL that has
  to stay up.
- The node tests `require` each `*.user.js` directly, and the live tests inject
  one file after Start Puzzle. Both would have to load the library first.
- The rule today is the repo's choice, stated in AGENTS.md ("one `*.user.js`
  file with no build step and no ties to any other repo") and CODING_STANDARDS
  rule 9, not a Tampermonkey limit. No commit records a reason beyond that.

## Should they share code? (second pass, 2026-11-05)

The question for this pass: should the five scripts load a common library
with `@require`, or stay one standalone `*.user.js` each? It measures the
duplication, reads what the three managers do with a required file, reads the
host rules, and weighs what a library would do to this repo.

### Sources read

Each was read once, in full unless noted.

- Tampermonkey, "Documentation", by Jan Biniok (tampermonkey.net), no date
  shown. The entries were read through their `q=` URLs, which serve one
  entry each without the page's script:
  [@require](https://www.tampermonkey.net/documentation.php?q=meta:require&locale=en),
  [Subresource Integrity](https://www.tampermonkey.net/documentation.php?q=api:Subresource_Integrity&locale=en),
  [@version](https://www.tampermonkey.net/documentation.php?q=meta:version&locale=en),
  [@updateURL / @downloadURL](https://www.tampermonkey.net/documentation.php?q=meta:updateURL&locale=en),
  [@grant](https://www.tampermonkey.net/documentation.php?q=meta:grant&locale=en).
- Tampermonkey, "Changes", by Jan Biniok, the full changelog with each release
  dated: https://www.tampermonkey.net/changelog.php?locale=en&more=true&old=&show=dhdg
  (the full text was searched for `@require`, `externals`, `SRI`,
  `integrity` and `cache`).
- Tampermonkey issue #1697, "Auto updating script libraries are not updating",
  opened by NuroC 2023-01-31, answered by derjanb (the author) 2023-02-19:
  https://github.com/Tampermonkey/tampermonkey/issues/1697. Found with
  `gh search issues --repo Tampermonkey/tampermonkey` for "require cache",
  "@require update", "require not updated", "require cached", "externals
  update", "@require refresh" and "require old version" (title and body
  match); only "externals update" turned up a relevant issue. Also #1310,
  "@resource doesn't check REMOTE_CSS url for possible changes", Kurdz2
  2021-08-16: https://github.com/Tampermonkey/tampermonkey/issues/1310.
- Violentmonkey, "Metadata Block" (violentmonkey.github.io), no date shown:
  https://violentmonkey.github.io/api/metadata-block/
- Violentmonkey source, `violentmonkey/violentmonkey` at commit
  `4d992ada5cf8cd87e3917e666e5cac00aa9d798c` (2026-11-05):
  [db.js `fetchResource`](https://github.com/violentmonkey/violentmonkey/blob/4d992ada5cf8cd87e3917e666e5cac00aa9d798c/src/background/utils/db.js#L756-L828),
  [update.js `checkUpdate` / `doCheckUpdate`](https://github.com/violentmonkey/violentmonkey/blob/4d992ada5cf8cd87e3917e666e5cac00aa9d798c/src/background/utils/update.js#L40-L127),
  [preinject-prepare.js, how a required file is joined to the script](https://github.com/violentmonkey/violentmonkey/blob/4d992ada5cf8cd87e3917e666e5cac00aa9d798c/src/background/utils/preinject-prepare.js#L211-L238).
- Violentmonkey issues #1558, "[Feature] Integrity Checks / Cryptographic
  Verification", hendursaga 2022-08-30, still open:
  https://github.com/violentmonkey/violentmonkey/issues/1558; #1998,
  "[Feature] Subresource Integrity (SRI)", 2024-01-03, closed as a duplicate
  of #1558: https://github.com/violentmonkey/violentmonkey/issues/1998; #2097,
  "[BUG] disable cache of @require", viocha 2024-05-09:
  https://github.com/violentmonkey/violentmonkey/issues/2097.
- Greasespot Wiki, "Metadata Block", last edited 3 March 2025:
  https://wiki.greasespot.net/Metadata_Block (https://wiki.greasespot.net/@require
  is an empty page).
- Greasemonkey 4 source, `greasemonkey/greasemonkey` at commit
  `6080f9161d8f87780a1fc652e8418f9fd4627974` (2026-06-02):
  [downloader.js](https://github.com/greasemonkey/greasemonkey/blob/6080f9161d8f87780a1fc652e8418f9fd4627974/src/downloader.js#L179-L187),
  [bg/updater.js](https://github.com/greasemonkey/greasemonkey/blob/6080f9161d8f87780a1fc652e8418f9fd4627974/src/bg/updater.js#L24).
- Greasy Fork, "Greasy Fork's rules for posted scripts", no date shown:
  https://greasyfork.org/en/help/code-rules; "Greasy Fork's policy on
  external scripts": https://greasyfork.org/en/help/external-scripts;
  "Allowed CDNs": https://greasyfork.org/en/help/cdns (the whole list read).
- OpenUserJS, "Terms of Service", no date shown:
  https://openuserjs.org/about/Terms-of-Service (full text searched for
  `require`, `external`, `remote`, `minif`, `obfusc`).
- raw.githubusercontent.com's response headers, read with `curl -sI` on
  2026-11-05 for a `main` URL and a sha URL of this repo.

### Duplication measured

Two passes over the five `*.user.js` at `8001e06`.

**Verbatim lines.** A throwaway node script read each file, dropped the
header block, trimmed every line, dropped blank, comment-only and
bracket-only lines, and counted lines that occur in two or more scripts: 68
distinct lines, 189 occurrences. Most are syntax that no library removes
(`(function () {`, `'use strict'`, `event.preventDefault()`, the
`module.exports` guard, `try {`).

**Helpers, read by hand.** Each candidate the audit and the verbatim pass
named was read in every script that has it:

| Helper | Where (line) | Same behavior? | Lines a library removes |
|---|---|---|---|
| Settings entry: `Framework.addSetting({ tag, name, group, content, handler })` whose handler closes the open dialog, then opens the script's own on the next tick | digit-color 289-297 (9), dark-page 327-335 (9), color-by-digit 1000-1011 (11), pen-tool-extras 2464-2473 (10) | yes; pen-tool-extras closes with its own `closeDialogKeepingGrid` | 39 become 4 calls: **35** |
| `SETTINGS_GROUP = 'experimental'` and its comment | 22-23 in three, 24-25 in pen-tool-extras | yes | **8** |
| Get-or-create a `<style id>` and set its text | digit-color 135-140, pen-tool-extras 1721-1726 (6 each); dark-page 232-235 creates once (4) | yes | **13** |
| `esc` (HTML-escape) | color-by-digit 393, digit-color 230 | yes, identical | **2** |
| Reading the color tool's palette (`Framework.app.tools.colour`, `tool.palette`) | color-by-digit 560-561, pen-tool-extras 1367-1368 | the two lines, yes; what follows differs | **2** |
| Exact subtotal | | | **60** |
| Settings dialog shell: `showDialog` with a title part carrying `v${VERSION}`, an editor part, Save and Cancel | digit-color 245-263, dark-page 280-306, color-by-digit 863-875, pen-tool-extras 1829-1854 | no: color-by-digit puts Cancel first and restyles the row; pen-tool-extras has a third button and its own Cancel handler | about 8 a script, **about 32** (estimate) |
| Frame-coalesced `MutationObserver` (one `requestAnimationFrame` however many changes) | digit-color 219-225, dark-page 259-271 | no: different record filters | **about 6** (estimate) |
| Near-duplicate total | | | **about 98** |
| Not removable: `VERSION` and its comment, the `module.exports` guard, the `Framework` guard | every script | each script needs its own | 0 |
| Not counted: color parsing (`inkFor`, `isVisibleColor` in color-by-digit; `luminance` in dark-page; `isTransparent`, `parseColor`, `toLinear` in pen-tool-extras) | | no: `#rgb` accepted in one and not another, clamping in one, WCAG thresholds 0.03928 against 0.04045, YIQ text contrast against WCAG | sharing changes behavior |
| Not counted: dialog button look (color-by-digit `styleDialogButtons` inline; pen-tool-extras `DIALOG_CSS` stylesheet) | | same values, two mechanisms | needs a rewrite first |
| Not counted: `normalizeColors` | digit-color 59-70, pen-tool-extras 215-226 | no: digit-color keeps a saved `null` | |

So a library would take **60 lines** with no behavior change (about 98 if
the dialog shell and observer were merged too) out of 4,225. The library
itself would hold about 25 lines for the exact set (about 50 for the
larger one), and each of four scripts gains an `@require` line. Net: **about
30 lines** (about 45), under 1% of the code. No Tab Letters shares
nothing worth extracting.

The sweep's duplication audit
(`~/.cache/all-audits/run-20261104-144940/collection/duplication/findings.jsonl`)
holds 6 cross-script findings, all `keep` under rule 9: `esc`; dark-page and
digit-color's Save button and `setTimeout(openDialog, 0)`; dark-page and
pen-tool-extras's `removeData` on the default; dark-page and digit-color's
input lookup; digit-color and pen-tool-extras's `style.textContent = ...`.
Each falls in a row above.

### When a required file is fetched

**Tampermonkey.**

- Since 4.16 (2022-04-07): "External @require and @resource content is not
  updated by default anymore unless the script was updated" (changelog).
- derjanb on #1697 (2023-02-19): "This was intentionally changed in 4.16 to
  prevent 'silent' userscript updates", and the user's own fix is to "simply
  update the userscript". Settings > Externals > Update Interval (default
  "never" per a commenter there; Always / day / week / month / never per
  #1310) can make it refresh on a timer, but that is the user's setting, not
  the script's.
- 4.0 (2016-03-26): "Reload @externals when a script is updated, but use the
  browser cache", and "Request meta data and externals with the no-cache
  option set". raw.githubusercontent.com answers `cache-control: max-age=300`
  (checked 2026-11-05), so a re-fetch within five minutes of an earlier one
  may get the browser's copy.
- So: fetched at install, then again only when the script itself updates
  (a raised `@version`) or its `@require` URL changes. A changed file at
  an unchanged URL does not reach the user by itself.

**Violentmonkey.** The metadata-block page says only "The required script
will be downloaded along with installation and execute before the script."
The source says more:

- `fetchResource` (db.js L812-L828) downloads a URL when it is not remote,
  when the call carries `src.update`, or when nothing is stored for it.
- A script update (`doCheckUpdate` → `parseScript` with `update: {...}`,
  update.js L98-L127) carries `update`, and `checkUpdate` passes
  `cache: 'no-cache'`, so **every** `@require` is fetched again, fresh, on
  every script update.
- When the check finds no new version, `fetchResources(script, opts)` runs
  without `update` and fetches only files that are missing.
- A file that failed to download is injected as a comment,
  `/* Violentmonkey is missing @require ... */` (preinject-prepare.js L226),
  so the script runs with its library absent.
- The required files and the script are joined into one function
  (preinject-prepare.js L211-L238), with `define`, `module` and `exports`
  shadowed as parameters, so a library's top-level names are in the script's
  scope, and `typeof module` is `'undefined'` there.

**Greasemonkey 4.** The wiki: "Each @require is downloaded once, when the
script is installed", and since 0.9.0 a changed `@require` value is
re-downloaded. The source agrees and adds the update case: the updater
builds a fresh `UserScriptDownloader` (updater.js L24) and never calls
`setKnownRequires` (only the editor and backup import do), so the downloader
(downloader.js L179-L187) downloads every `@require` again on each script
update.

Across all three: a required file is fetched at install and again when the
script updates or its URL changes; never because the file at the URL changed.

### Integrity (SRI)

- **Tampermonkey**: a URL fragment, `#sha256=<hex>`, `#sha256-<base64>`,
  or several hashes joined by `,` or `;` ("the last currently supported one
  is used"). SHA-256 and MD5 are native; SHA-1/384/512 "depend on
  window.crypto". On a mismatch "Tampermonkey will refuse to load the
  resource". Changelog: SRI since 4.0 (2016-03-26), Base64 since 4.1
  (2016-07-15), native SHA-256 since 4.9 (2019-11-15), and 5.5.1
  (2026-10-01) "Fixed SRI enforce mode of @require".
- **Violentmonkey**: none. The docs page does not mention it, the source at
  `4d992ad` has no `integrity`, `sha256` or `crypto.subtle` under `src/`,
  and #1558 asking for it is open. The fragment is never sent to the server,
  so a Tampermonkey-format URL still loads, unchecked.
- **Greasemonkey 4**: none. The wiki's Metadata Block page has no hash
  syntax, and the source at `6080f91` has no `integrity`, `sha256` or
  `digest` under `src/`.

### Host rules (only if the scripts are posted there)

Users install from raw.githubusercontent.com today (README, `site/`). These
rules matter only if a script is ever posted to Greasy Fork or OpenUserJS.

- Greasy Fork's external-scripts policy allows external executable code in
  four cases: a recognized CDN; "@require and @resource with URLs with
  subresource integrity in the Tampermonkey format"; a Greasy Fork library
  (which "can additionally be set to sync from an external URL, like a
  GitHub repository"); or same-origin injection.
- raw.githubusercontent.com is **not** on the Allowed CDNs list (whole list
  read). jsDelivr's commit-pinned form is,
  `cdn.jsdelivr.net/gh/<user>/<repo>@<40-hex sha>`.
- So a raw GitHub `@require` is allowed there only with a Tampermonkey SRI
  hash.
- The code rules add: "The primary functionality of a script must be within
  the code on Greasy Fork", and code "must not be obfuscated or minified".
  A small helper library meets both.
- OpenUserJS's Terms of Service say nothing on `@require` hosts (full text
  searched). The only rules there are on obfuscation (prohibited), on
  minification (allowed "within moderation") and on libraries' licensing and
  `@exclude *`.

### What a library would do to this repo

- **Unit tests.** `node --test` does `require('./x.user.js')`. The helpers
  above live past the `Framework` guard, except `esc`, which
  color-by-digit's exported `renderProfiles`, `renderMenu` and
  `renderEditor` call. Moved to a library, `esc` is a free name in node
  unless every test loads the library first and makes it a global. The
  scripts' `module.exports` blocks would have to reach the library too.
- **Live tests.** 28 `addScriptTag({ content: script })` calls across
  `live/*.live.mjs` inject one file. Each would inject the library first, at
  all three injection times in `live/startup.live.mjs`. The recording in
  `live/cache.mjs` would also have to serve, or skip, the library URL.
- **Site and README install links.** These are unchanged (`main/<name>.user.js`),
  but the installed script then pulls a second URL that has to stay up. A
  user who saves the file and installs it locally gets a script whose relative
  or raw `@require` still needs the network.
- **Version raise.** Tampermonkey: `@version` "needs to be increased at
  every update"; it drives the update check. The repo's own written rule is
  only the unit test that `VERSION` equals `@version`; no raise rule was
  found in the repo's docs or under `~/.agents/skills` (full-text `rg` for
  `@version`). Because no manager re-fetches a changed file at a fixed URL,
  a library change reaches a user only through a script update. So every
  library change means editing the `@require` line (sha-pinned) and raising
  `@version` in every script that uses it: the same four edits a duplicated
  fix needs today.
- **One bad library push.**
  - *Pinned to a sha*: nothing happens until a script's header moves to the
    new sha, and then only that script breaks. That is the same blast radius
    as today.
  - *On `main`*: a script's next update brings the bad file to Violentmonkey
    and Greasemonkey users at once (both re-fetch every `@require` on
    update). Tampermonkey users get it on that update, or never, depending
    on install time and the browser cache. Every script breaks at its own
    next release, and two users on the same `@version` can run different
    library code.
  - *On `main` with an SRI hash*: every library push breaks new Tampermonkey
    installs of every script until each hash is raised. Violentmonkey and
    Greasemonkey ignore the hash.

### Recommendation

**Stay standalone; keep rule 9.**

What decides it:

1. The saving is small: 60 lines with no behavior change (about 98 at most),
   about 30 net after the library's own lines, out of 4,225.
2. No manager re-fetches a changed library at a fixed URL. The library is
   fetched at install, on a script update, or on a URL change (Tampermonkey
   4.16 changelog and #1697; Violentmonkey `fetchResource`; Greasemonkey
   updater). So a library saves no release work: each fix still edits and
   raises every script that uses it.
3. The only safe form is a sha-pinned URL. With it, the library is a
   second file per install, a header edit per release, and test plumbing in
   node and in 28 live injections, all to save about 30 lines.
4. Integrity is a Tampermonkey feature only. Violentmonkey (#1558 open) and
   Greasemonkey 4 have no SRI, so a hash protects only part of the users.

What staying standalone costs:

- The 60 lines stay in two to four copies that can drift: the settings entry
  (×4), the settings group (×4), get-or-create style (×3), `esc` (×2), and
  the color tool read (×2).
- A SudokuPad change to `addSetting` or `showDialog` has to be fixed in four
  files and four versions raised. A library would need the same four
  raises, so the extra cost is only the four copies of the fix itself.

If drift becomes a real failure: a unit test that asserts the duplicated
snippets match across files catches it, needs no new dependency, and leaves
the single-file install alone. This pass found no such drift; the audit's
six findings are identical copies.

What the library option would cost, if chosen anyway:

- A `lib/` file, served sha-pinned from raw GitHub, or from jsDelivr's
  `gh/...@<sha>` if Greasy Fork is ever a target.
- An `@require` line, kept in step, in four headers.
- Library loading in every unit and live test, plus a case in
  `site.test.js` or a check that the pinned sha exists.
- An AGENTS.md and rule 9 rewrite: "one `*.user.js` file with no ties"
  would no longer hold.

Not verified:

- Tampermonkey's source is closed, so its fetch behavior is read from its
  changelog and its author's issue reply, not from code.
- The default of "Externals > Update Interval" comes from a user comment on
  #1697 and was not checked in a Tampermonkey install.
- No `@require` was tried in a real manager.
