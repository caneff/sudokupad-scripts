# The ChinStrap theme mockup (2026-11-10)

The site restyled in the look of Chris's Twitch stream (ChinStrap, twitch.tv/chinstrap45), as Chris approved it in round 14 of a mockup loop, with round 15's left alignment of the title sticker.
Its colors, fonts and sticker style come from the stream layout in `twitch-rules-scroller` (`layout/make-sticker.py`'s `TOKENS` and `GROUND`,
`docs/obs-layout.md`: Fredoka 600, banner `#5f519e`).

- `theme.css`: the mockup's CSS, layered over `site/style.css` and each page's own `<style>`, in rounds; a later rule overrides an earlier one.
  It is the spec, not the code to ship: the build folds it into `site/style.css` (and the homepage's `<style>`) as plain rules.
- `index.html`, `text-anywhere.html`: copies of the two pages whose markup the mockup changes: the homepage's title and intro in one
  `<header class="banner">` above the warning, and Text Anywhere's "One note, every style" figure as a two-slide slideshow (before, then after).
- `Fredoka.ttf`, `Nunito.ttf`: the fonts, under the SIL Open Font License (`OFL-Fredoka.txt`, `OFL-Nunito.txt`), copied from the stream repo.

To view it, copy `site/` and this folder's files into one directory and open `index.html` there (the pages link `theme.css` by name).
