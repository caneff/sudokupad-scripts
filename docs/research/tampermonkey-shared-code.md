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
