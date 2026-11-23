# What SudokuPad's Streaming Tools and CloneView already send

Ticket #1161, for the co-op room map (#1159). Date 2026-11-23. SudokuPad 0.616.0, read from the recording at
`~/.cache/sudokupad-scripts/live/sudokupad.har` (recorded 2026-11-09). Each claim says how it is known:

- **read**: read in SudokuPad's source, named by file and function.
- **run**: seen with `docs/research/co-op-room/sudokupad-state-probe.mjs`, which opens two pages of the recorded puzzle
  (served from the recording, no userscript, nothing sent off the machine) and passes state between them.
- **web**: from the page cited.

## Verdict

Streaming Tools' CloneView is a host-to-guests mirror over a WebSocket to sudokupad.app's own server, so it reaches across
machines, but it switches on only for puzzle ids under `sudokucon/` and only with a toggle in the collapsed Experimental settings group on. Its
server is Sven's, its keys come from the URL, and nothing in the client says the server will host a room for anyone else. A
co-op room cannot reuse the channel; it can copy its design, which is small and proven: send each `act` string, send a full
replay to catch up, and send a board-relative pointer. Nothing in it collides with a co-op script on an ordinary puzzle link.
SudokuPad has no BroadcastChannel, no `storage` listener and no other WebSocket. It has one more channel: an iframe API over
`postMessage` (Project 9x9), always listening, that a parent page can drive.

## What Streaming Tools and CloneView are, and how they turn on

- **read** `feature-streamtool.js`, `FeatureStreamTool.prototype.handleInit`: adds a toggle **Streaming Tools** (setting name
  `streamtool`) and a button **CloneView Select Puzzle**, both in the Settings dialog's **Experimental** group, which
  `app-settings.js` lists as `closed: true` (collapsed until opened).
- **read** `attachElem`: when the toggle turns on, CloneView starts only if `getPuzzleId()` matches `/^sudokucon\//`. On any
  other puzzle the toggle does nothing (the feature's stylesheet is attached at load either way, `init`). `detachElem` (toggle off) calls `disableCloneview`.
- **read** `enableCloneview`: takes `guestkey`, `hostkey`, `hostname` and `hostcolor` from the page's query string, waits for
  the puzzle to load (`C.waitForPuzzleLoaded`) and opens the socket. A page with a non-empty `hostkey` is the **host**; any
  other is a **guest** (`startCloneview`).
- **web** What it was for: Sven on ShopTalk episode 619 (https://shoptalkshow.com/619/, 2024-06-10) describes a "real-time
  multiplayer sort of system" he built in three days for the SudokuCon 2025 funding livestream, which "transmitted all of the
  moves, including mouse movements, through the server", with a host and clients that "could see the mouse movements off
  the host". That matches this code. No documentation of Streaming Tools or CloneView by Sven was found (searched
  svencodes.com, hackmd.io and the web).
- **read** Other parts of the same file: a `.setting-rulesonly` and a `.setting-streameffects` stylesheet (rules only; board
  layers hidden for overlays), which no dialog sets; only a server `setting` message can (`handleMsgSetting` calls
  `Framework.setSetting`). `testCam` (`?testcam=1`) is a webcam overlay test. `markCell` draws a confetti marker on one cell;
  `feature-aiassistant.js` also calls it.

## Transport and reach

- **read** `getWsUrl`: the socket URL is the page's own URL, hash dropped, `http` turned into `ws` (so
  `wss://sudokupad.app/sudokucon/<id>?hostkey=...`). It goes to the server that served the page: across machines, through
  Sven's server.
- **read** `connect`, `reconnect`, `disconnect`: a 3 s connect timeout, reconnect backoff from 1 s by 1.5x up to 30 s, at most
  100 attempts.
- **read** `sendMsg`: every message is one JSON text frame. `handleWsMessage` parses each incoming frame and `handleMsg`
  switches on `msg.cmd`.
- **read** `runInitMsgs`: a JSON array (or object) in the URL's hash is sent as messages once CloneView is ready, each with
  `includeself: true` added. What `includeself` does is the server's business; the client never reads it.

## The messages

Sent by the client (**read**, functions in `feature-streamtool.js`):

| `cmd` | Sent by | When | Carries |
| --- | --- | --- | --- |
| `cloneview` | host and guest | on socket open (`startCloneview`) | `guestkey`, `hostkey`, `hostname`, `hostcolor` from the URL |
| `act` | host | every `puzzle` `act` event, unless a replay is playing (`handleHostAct`) | `seq` (then `seq++`), `act` (the action string) |
| `pointer` | host | `mousemove` on the document, throttled to 25-50 ms (`handleHostMousemove`) | `x`, `y` in board SVG units (`toBoardRelative`) |
| `sync` | host or guest that is ahead | after `setPuzzle`, or when an incoming `act` or `sync` has a lower `seq` (`sendSync`) | `puzzleid`, `seq`, `actionCount`, and `replay` (`app.getReplay()`) when there are actions |
| `closedialog` | host | `Framework` `closedialog` event | nothing |
| `puzzlesolved` | host | `app` `dialognoerrors` event (`handleDialogNoErrors`) | `message`: "<title> by <author> was solved in <time>" |

Handled on arrival (**read**, `handleMsg`): `pointer` (draws a `.cloneview-pointer` labelled with `msg.host.name` in
`msg.host.color`, `handleMsgPointer`), `act`, `sync`, `updatepuzzles`, `selectpuzzle`, `setpuzzle` (no handler is defined in
0.616.0: `handleMsgSetpuzzle` is missing, so that case would throw), `markcell`, `setting`, `closedialog`. The `host` field on a
pointer message is never sent by the client, so the server adds it.

What state it carries:

- **Actions**: the `act` string from `Puzzle.prototype.act` (`script.js`), the same strings a replay holds. **run**: one digit,
  one corner mark on two cells and one color gave `sl:r1c1`, `vl:5`, `ds`, `sl:r1c2r1c3`, `cd:3`, `ds`, `sl:r2c2`, `co:4`, `ds`.
  Selection is in the stream as `sl`/`ds` actions, so a guest sees the host's selection too. No time suffix when the action
  had none.
- **Full state for catch-up**: the whole replay (`App.prototype.getReplay`, `Replay.encode`), not a grid snapshot.
- **Cursor**: one host pointer, board-relative, at most every 25 ms.
- **Not carried**: anything a guest does. Only the host listens to `act` and `mousemove` (`startCloneview`); a guest's own
  actions are never sent. It is a one-way mirror with one writer.

## How a receiving page applies state

- **read** `handleMsgAct`: `Framework.app.act(msg.act)`, with the host's own `act` listener taken off around the call so it does
  not echo. `App.prototype.act` (`script.js`) accepts an action string and goes through the normal path: it is executed, logged
  to the undo and replay stacks, and triggers `act` again. A co-op script that applies a remote action this way must do the
  same off/on dance or it loops.
- **run** Feeding the nine `act` strings above to a second page with `Framework.app.act` gave an identical grid.
- **read** `unthrottledHandleMsgSync`: if `puzzleid` differs, `loadPuzzle` (`PuzzleLoader.fetchPuzzle`, `parsePuzzleData`,
  `app.loadCTCPuzzle`); then `app.loadReplay(msg.replay, {speed: -1})`; then any `msg.acts` through `puzzle.act`.
  `App.prototype.loadReplay` skips when the replay already matches (`Replay.compare`) and loads another puzzle first when the
  replay's `puzzleId` differs.
- **run** `getReplay()` on page A (nine actions, 107 characters) and `loadReplay(replay, {speed: -1})` on a restarted page B
  gave an identical grid, and B's undo and replay stacks then held 9 entries: the catch-up is undoable on B.
- **The whole-grid setter**: `Puzzle.prototype.applyState(state)` (`script.js`), with `createState()` to make the payload
  (`{id, time, actions, cells: cells.map(cell => cell.serialize())}`) and `serializeState`/`deserializeState` as JSON wrappers.
  **read**: it calls `clearPuzzle()` then `cell.deserialize(data)` for each cell; it does not touch the undo or replay stack.
  SudokuPad uses it internally for undo checkpoints (`logUndoAct` pushes a state every `Puzzle.ActionsPerState` (100) actions;
  `execUndo` rebuilds from the last one). Nothing calls `serializeState` or `deserializeState` in 0.616.0.
- **run** `createState()` on A was 283 bytes for 81 cells; `applyState` on B gave an identical grid with B's undo and replay
  stacks still empty. B then entered a 7 in an empty cell and pressed Undo twice: the applied corner mark and color were gone
  and B's own 7 was still there, because `execUndo` clears the grid and re-executes B's own undo stack. So `applyState` suits
  a one-time join snapshot only if the room never relies on Undo afterwards; for a live room it is the wrong tool, and
  `app.act` with action strings (or `loadReplay`) is the right one.
- **read** `applyState`'s guard compares `this.id` with `state.puzzleId`, while `createState` writes `id`, not `puzzleId`.
  **run**: on the recorded puzzle `puzzle.id`, `puzzle.puzzleId` and `state.id` were all undefined, so the guard never fired.
  Whether it guards anything on a puzzle with an id was not tried.

## Other places SudokuPad sends or receives solve state

- **Project 9x9 iframe API** (`feature-project9x9.js`). **read** `handleInit` always runs `initMessaging`, on every page: it posts
  `{type: 'event', name: 'ready'}` and, on each `loaded`, `{type: 'event', name: 'loaded'}` to `window.parent` with target
  `'*'`, and listens for `message`. `handleMessage` ignores messages from the page's own origin and otherwise switches on
  `data.action`: `init`, `loadpuzzle` (`shortid`), `restartpuzzle`, `createthumbnail`, `setdigit` (`rcv`; selects the cell and
  calls `app.doPressDigit`), `puzzlestatus` (returns `completed`, `errorsVisible`, `paused` and `replay`), `pause`, `unpause`,
  `showpausedialog`, `closedialog`, and `listen`/`unlisten` (`{target: 'app' | 'puzzle', name}`, which forwards any event as
  `{type: 'event', name, args}`, `args` being the first argument only, so `listen` on `puzzle` `act` streams the act strings).
  On `dialognoerrors` it posts `{type: 'event', name: 'completed', replay}` once `beginMessaging` was called (nothing calls it in
  0.616.0). So a page on another origin that frames SudokuPad can watch every action and set digits, but has no way in to
  apply an arbitrary action string, a mark, a color or a replay.
- **run** At the top level `window.parent` is the page itself, so SudokuPad's `ready` and `loaded` posts arrive on its own
  window (origin `https://sudokupad.app`). A co-op script that listens to `message` on the page sees them and must ignore
  them; a script's own same-origin `postMessage` is ignored by Project 9x9.
- **read** The recorded page response (HAR headers of the puzzle page) has no `X-Frame-Options` and no
  `Content-Security-Policy`, so framing was not blocked on 2026-11-09. Not tried in a frame.
- **Progress in localStorage** (`script.js`, `Puzzle.prototype.handleSaveProgress`/`getProgress`/`loadProgress`): key
  `progress_<puzzleId>`, value `{puzzleId, time, replay, shortid}`, saved throttled after each non-selection action. Same
  browser only. **read** No file adds a `storage` event listener, so two tabs of one puzzle do not follow each other.
- **Solved counter** (`feature-solvedcounter.js`): `solvedCounterInc` GETs `https://api.sudokupad.com/counter/<author-title>/inc`
  with the time and puzzle id on a solve; `replayTest` may POST the progress (with replay) to `/admin/createlink` as a
  `replay/...` short id when `/assets/replaytest.config.json` names the puzzle and date. One-way, on solve.
- **Short URLs and gifting** (`feature-shorturl.js` `apiCreateShortId`, `feature-gifting.js` `C.apiCreateShortId`): POST the
  puzzle (not progress) to `/admin/createlink`.
- **Replay files** (`feature-replaysave.js`): download and file drop only (`replay_v1.0` JSON with `puzzle` and `replay`),
  loaded through `puzzle.loadProgress({replay})`. See `docs/research/sudokupad-replay-tool.md` and
  `docs/research/sudokupad-replay-files.md`.
- **Analytics** (`script.manual.js`, `lazygtmloader.js`): page events, no solve state.
- **read** No `BroadcastChannel`, `EventSource`, `RTCPeerConnection` or `sendBeacon` in any loaded file; the only WebSocket is
  Streaming Tools'.

## What a co-op room takes from this

- **Reuse**: none of the channels. CloneView's server is Sven's, scoped to `sudokucon/` ids, with keys whose checking happens
  server-side and is unknown; using it for a public script would be borrowing his server.
- **Collision**: none on an ordinary puzzle link. On a `sudokucon/` link with Streaming Tools on, both would hook `act`; a co-op
  script should then stand down or say so. Every page's own `message` posts (above) must be filtered.
- **Copy**: CloneView's shape fits a co-op relay with the one-writer rule removed: act strings with a sequence number, a
  replay for join and for repair when sequence numbers disagree, a board-relative pointer per person, and the listener taken off
  while a remote act is applied.

## Not determined

- The server side: how it pairs host and guests (by URL path, by key or both), whether it checks keys, whether it is still
  running, what `includeself` and `puzzlesolved` do there, and whether it relays a guest's `sync`. No request was made to it.
- Whether the toggle, when already on in saved settings, starts CloneView on a page load: `Framework.setSetting` calls
  `onToggle` only when the value changes, and how saved settings are first applied was not traced.
- Whether `applyState`'s puzzle guard fires on a puzzle that has an id.
- How two writers' concurrent acts interleave: CloneView never has two, so its `seq` rule (the side that is ahead re-sends a full
  `sync`) is untested for co-op.
- Whether SudokuPad works in a cross-origin iframe in practice (third-party storage, the Project 9x9 layouts).
