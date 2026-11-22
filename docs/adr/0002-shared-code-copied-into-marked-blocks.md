# Shared code is copied into marked blocks, not loaded with `@require`

Status: accepted, 2026-11-07 (Chris, 2026-11-07; spec #334, sync check #500)

Code two scripts need lives once, in `lib/<name>.js`. `node sync-lib.js` copies it into each script between
`// <lib:name>` and `// </lib:name>` markers, and `test/sync-lib.test.js` fails until the copies match. An installed script is
still one `*.user.js` file with no second download. Nobody edits inside a marked block; the change goes in `lib/` and the sync
rewrites every copy and raises the version of every script it changed.

Why not `@require` (`docs/research/tooling/tampermonkey-shared-code.md`, read 2026-11-05):

- No userscript manager fetches a changed library at an unchanged URL. Tampermonkey (since 4.16), Violentmonkey and
  Greasemonkey 4 fetch a required file at install, again when the script itself updates, or when its URL changes. A library
  change would still reach users only through a raised `@version` in each script that uses it, so a library saves no release work.
- The only safe form is a URL pinned to a commit sha. Then every library change edits the `@require` line of every script that uses
  it, a second file must stay up for every install, and every unit test (`require`) and live injection would have to load the
  library first.
- Integrity hashes (`#sha256=`) are a Tampermonkey feature; Violentmonkey and Greasemonkey 4 ignore them.

The first pass of that research (60 duplicated lines, about 30 saved net) recommended staying fully standalone. The inventory
(`docs/research/tooling/shared-code-inventory.md`) then found more shared code than the first count (copy and paste of settings,
the OKLab darken, hold-to-edit pickers, the settings entry and dialog title). Chris ruled on 2026-11-07 for copies kept in sync by
a command and checked by a test, over `@require`. That kept the single-file install and replaced "scripts share no code"
(`CODING_STANDARDS.md` rule 9, before `lib/`) with "a helper two scripts need goes in `lib/`".

Cost accepted: two PRs that both change `lib/` conflict on the scripts' version lines, settled by hand
(`.out-of-scope/version-bumps-at-merge.md`).
