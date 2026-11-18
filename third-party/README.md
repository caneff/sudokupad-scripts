# third-party

Userscripts kept here for Chris's own use. They are not published: nothing in `site/`, the root `README.md` or `GLOSSARY.md` names them, and they sit outside the root so `sync-lib.js` and `test/site.test.js` never see them.

## logic-masters-puzzle-preview.user.js

Shows puzzle pictures on the Logic Masters puzzle portal (`logic-masters.de/Raetselportal/`).

The first version was written by someone else (author unknown) and is not Chris's. The version here is that script, improved in a session of Chris's:

- IndexedDB keeps each puzzle page's preview address (rechecked after 7 days, or after 1 day when the page had no preview) and the image itself, because the site sends images with `Pragma: no-cache`. The cache holds at most 600 images, least recently used dropped first.
- Images are stored by address and not rechecked. If the site replaces a picture at the same address, the old picture stays until the cache drops it (Chris accepts this, 2026-11-18).
- Only links on or near the screen are looked up.
- One request at a time, 500 ms apart.
- After a 503 or 429, a 5-minute pause, shared through localStorage.

Its live test (`live/third-party/logic-masters-puzzle-preview.live.mjs`) routes every request itself and serves synthetic pages, so it never reaches logic-masters.de.
