# Every script stays at the root, and the old install address is a frozen handover

Status: accepted, 2026-11-10 (Chris, 2026-11-10; #711, #800)

Every `*.user.js` stays at the repo root. Each script's `@updateURL` and `@downloadURL` name its raw address on `main`, and every
installed copy checks that address for updates; moving a file would strand every install of it.

Text Anywhere was installed from `draw-tool.user.js`. #711 moved its install address to
`text-anywhere.user.js`. `draw-tool.user.js` stays as the **handover**: frozen at 0.45.1, with `@updateURL` and `@downloadURL` naming
`text-anywhere.user.js`, so a copy installed from the old address updates to the handover and then on to the new file. It keeps the
same `@name` and `@namespace`. `npm run test:tampermonkey` installs the old copy and checks that it reaches the new address.

#800 found the file had drifted: it differed from `text-anywhere.user.js` only in its two version lines, because each Text
Anywhere ticket was rewriting it too. Nobody installs from it, so it is frozen (Chris, 2026-11-10): restored to its 0.45.1 content, and
`test/text-anywhere.test.js` fails when its bytes change. A change to Text Anywhere never touches it. A finding raised inside it is
acted on in `text-anywhere.user.js` or `lib/`, never in the handover.

The shown `@name` does not decide which installed script an update replaces (`docs/research/text-anywhere/tampermonkey-name-change.md`:
an update belongs to the installed script's stored identity and update URL). Not checked in a real Tampermonkey install beyond
`npm run test:tampermonkey`'s old-copy case.
