# Does an `@name` change break Tampermonkey's update of Draw Tool? (2026-11-07)

Question (#404): the shown name becomes Text Annotation, the file stays
`draw-tool.user.js` (same `@namespace`, same `@updateURL`). Does an installed
copy update in place, or install as a second script or stop updating?

## What was read

- Tampermonkey issue 2405, "Automatic update overwrote my script"
  (https://github.com/Tampermonkey/tampermonkey/issues/2405): a user changed
  `@namespace`, `@name` and `@version` in their copy, the list showed it as a
  different script, and an update from the original source still overwrote it
  in place. Tampermonkey's maintainer says that was possible only for scripts
  edited before 4.11; since then an edit turns auto-update off. So an update
  belongs to the installed script (its stored identity and update URL), and the
  header's name does not decide which script it replaces.
- Violentmonkey's metadata docs
  (https://violentmonkey.github.io/api/metadata-block/): `@namespace` plus
  `@name` identify a script on a fresh install; that is the install path, not
  the update path.
- Tampermonkey's own documentation (https://www.tampermonkey.net/documentation.php)
  says nothing about a changed `@name` on update.

## Finding

No source states it outright. The evidence says an update replaces the
installed script and takes the new name. A duplicate would need a fresh install
of the file (the homepage Install link), and that one finds the same
`@namespace` and a new `@name`, so it installs as a second script.

Not checked: a real Tampermonkey install. The PR names that as still owed.
Decision: `@name` becomes `SudokuPad Text Annotation`; a person who installs
again from the site, with the old copy still present, ends with two scripts
and removes the old one.
