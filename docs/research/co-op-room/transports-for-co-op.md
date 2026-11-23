# Co-op room: what can carry actions between browsers, and what each costs (2026-11-23, #1162)

Question (#1162, under the map #1159): what can carry small action messages between browsers for a public co-op room (two or
more people on different machines, one shared grid, live cursors), from a Tampermonkey userscript on sudokupad.app or from a
hosted page of its own (form decided in #1175)? For each transport: free tier, cost at 10, 100 and 1,000 rooms a day, what the
operator runs, what data passes through or is stored, and what abuse controls exist. Facts only: the choice is a later ticket.

Every page below was read on 2026-11-23 unless another date is given. Prices are as the page showed them that day.

## Verdict (facts, no pick)

- **Nothing on sudokupad.app blocks a connection.** The document response sends no `Content-Security-Policy`, no
  `X-Frame-Options` and no `frame-ancestors`, so a script in the page context may open a WebSocket or an `RTCPeerConnection` to
  any host, and another site may frame the page.
- **Tampermonkey and Violentmonkey add nothing for WebSockets.** Neither documents a `GM_webSocket`; `@connect` governs only
  `GM_xmlhttpRequest`. With `@grant none` (every script in this repo) the script uses the page's own `WebSocket` and
  `RTCPeerConnection`.
- **Ruled out by the facts:** hosted PartyKit (shut down on 2026-10-23); Supabase Realtime, Firebase RTDB and Ably on their free
  tiers past a few rooms a day (message or user caps); Liveblocks and Supabase at 1,000 rooms a day on cost (about $8,100 and
  $2,040 a month, against single dollars for an owner-run relay); WebRTC without TURN as the only path (Trystero's own docs put
  failed direct connections at about 10–15%).
- **Cheapest that fit 1,000 rooms a day:** an owner-run relay on Cloudflare Durable Objects with the hibernation API (about $7
  a month on Workers Paid, free up to roughly 100–200 rooms a day), or a single Fly.io machine (about $4–5 a month, estimate).
  WebRTC with public Nostr signalling costs nothing to run but needs TURN for some pairs and depends on relays no one here runs.

## The workload assumed

One room: 3 people (2 to 4), 45 minutes, 3,000 small messages sent by each person (range 2,000–5,000), about 100–200 bytes
each on the wire. So one room is 9,000 messages sent and 18,000 deliveries (each message reaches 2 others), 135
person-minutes, and about 3.6 MB delivered. Worst case (4 people, 5,000 each): 20,000 sent, 60,000 deliveries. A month is 30
days: 10 rooms a day is 300 rooms, 100 is 3,000, 1,000 is 30,000. Concurrency is not given; at 1,000 rooms a day the average is
about 31 rooms (94 sockets) open at once, and peaks are higher. These are assumptions of this note, not measured.

## What the page and the script manager allow

### sudokupad.app's headers

- The HAR `~/.cache/sudokupad-scripts/live/sudokupad.har` (recorded 2026-11-09, SudokuPad 0.616.0) has the puzzle document's
  response with 9 headers: `Connection`, `access-control-allow-headers`, `access-control-allow-methods`,
  `access-control-allow-origin: http://localhost:9012`, `cache-control`, `content-encoding`, `content-length`, `content-type`,
  `date`. No `Content-Security-Policy`, no `Content-Security-Policy-Report-Only`, no `X-Frame-Options`. The HTML has no
  `<meta http-equiv>` either. Of 89 entries, only `js/script.manual.js` sends a `permissions-policy: interest-cohort=()`; the
  Google font files send a report-only CSP of their own, which does not apply to the page.
- Confirmed with `curl -D - https://sudokupad.app/` on 2026-11-23: the same set of headers (`cache-control: max-age=600` this
  time), still no CSP and no `X-Frame-Options`.
- What a CSP would have governed: CSP Level 3 (W3C Editor's Draft of 11 November 2026, https://w3c.github.io/webappsec-csp/,
  § `connect-src`) says the directive controls `fetch()`, XHR, EventSource, Beacon "and also controls WebSocket connections";
  § 6.2.1 defines a `webrtc` directive whose pre-connect check blocks unless its value is `'allow'`. With no policy at all,
  neither applies.

### Tampermonkey (https://www.tampermonkey.net/documentation.php, "Documentation | Tampermonkey")

- `@grant` (`?q=grant`): "In case `@grant` is followed by `none` the sandbox is disabled. In this mode no `GM_*` function but
  the `GM_info` property will be available."
- `@sandbox` (`?q=sandbox`, 4.18+): `raw` "always needs to run in page context, the `MAIN_WORLD`. At the moment this mode is the
  default if `@sandbox` is omitted." A script in the page context uses the page's own `WebSocket` and `RTCPeerConnection`, under
  the page's CSP (none here).
- `@connect` (`?q=connect`): "defines the domains ... which are allowed to be retrieved by GM_xmlhttpRequest". An unlisted
  domain brings up a confirmation dialog; `@connect *` lets the user choose "Always allow all domains".
- `GM_xmlhttpRequest` (`?q=GM_xmlhttpRequest`): an HTTP request "dispatched by Tampermonkey's background context";
  `responseType` may be `stream`. No WebSocket option.
- `GM_webSocket`: not in the documentation's table of contents. Tampermonkey's issue "Websocket support"
  (https://github.com/Tampermonkey/tampermonkey/issues/1483) is open with the `enhancement` label, last updated 2024-01-21
  (`gh issue view`); a commenter streamed server-to-client data over `GM_xmlhttpRequest`'s `stream`, and wrote it "only works
  when sending data from backend to client".

### Violentmonkey

- "Metadata Block" (https://violentmonkey.github.io/api/metadata-block/): `@grant none`: "Sandbox is disabled in this mode".
  `@inject-into auto` (default) tries the page context and, "If blocked by CSP rules, inject as a content script". No
  `@connect` key is documented.
- "Privileged APIs" (https://violentmonkey.github.io/api/gm/): `GM_xmlhttpRequest` "Makes a request like XMLHttpRequest ...
  not restricted by same-origin policy". No WebSocket API on the page.

### This repo

`grep -n '@grant\|@connect' *.user.js` on 2026-11-23: all 8 scripts (`dark-page.user.js`, `logic-masters-puzzle-preview.user.js`,
`auto-rules-resizer.user.js`, `color-by-digit.user.js`, `ui-tweaks.user.js`, `draw-tool.user.js`, `pen-tool-extras.user.js`,
`text-anywhere.user.js`) have `// @grant        none` and none has `@connect`. No script here makes a network request today.

## The options

### 1. A WebSocket relay the owner runs

**Cloudflare Workers + Durable Objects** ("Pricing", https://developers.cloudflare.com/durable-objects/platform/pricing/, and
"Pricing", https://developers.cloudflare.com/workers/platform/pricing/)

- Free plan: 100,000 Durable Object requests a day and 13,000 GB-s of duration a day; "If you exceed any one of the free tier
  limits, further operations of that type will fail with an error." Workers Free: 100,000 requests a day. SQLite storage only.
- Paid: $5 a month minimum; DO requests 1 million a month then $0.15 a million; duration 400,000 GB-s then $12.50 a million
  GB-s. Incoming WebSocket messages are billed at 20:1 ("100 WebSocket incoming messages would be charged as 5 requests");
  outgoing messages are free. Duration is wall-clock at 128 MB while the object is active; with the WebSocket Hibernation API an
  object idle between messages is not billed. "WebSocket messages routed through a Worker do not count as requests."
- Per room: 3 connection requests + 9,000 / 20 = 453 billed requests. With hibernation and Cloudflare's own example figure of
  10 ms per message: 90 s × 0.128 GB = 11.5 GB-s. Without hibernation: 2,700 s × 0.128 = 346 GB-s.
- Free plan holds about 220 rooms a day on requests (about 99 in the worst case) and about 1,100 on duration with hibernation
  (about 37 without). So 10 and 100 rooms a day fit the free plan; 1,000 does not.
- Paid at 1,000 rooms a day: 13.6 million requests, billed 13 million × $0.15 = $1.95; duration 345,600 GB-s is inside the
  400,000 included; total about **$7 a month**. Worst case about $22; without hibernation about $130.
- Operator runs: one Worker and one Durable Object class, deployed with `wrangler`; Cloudflare runs the machines.
- Data: every message passes through the object; nothing is stored unless the code stores it.
- Abuse controls: whatever the code does (per-socket rate limits, room caps, origin check); a Durable Objects spending limit
  ("Set a Durable Objects spending limit for requests, duration, and storage operations after included usage"); the free plan
  fails closed at its limits.
- PartyKit's successor, PartyServer, is this same thing: "a plain Cloudflare Worker with Durable Objects in your own Cloudflare
  account" ("Migrate to PartyServer", https://docs.partykit.io/guides/migrate-to-partyserver/).

**Fly.io** ("Pricing", https://fly.io/docs/about/pricing/)

- Smallest machine `shared-cpu-1x` 256 MB: $2.19 per 30 days, billed by the second while running. Outbound data $0.02/GB in
  North America and Europe; inbound free. Free plan: "$1 of credit with no credit card, and $5 of usage every month once you add
  a card", up to 3 machines.
- At 3.6 MB a room: 1 GB a month at 10 rooms a day, 11 GB at 100, 108 GB at 1,000 ($2.16). One always-on machine: about $2.20,
  $2.40 and **$4.35 a month**, inside the $5 allowance with a card. Whether one 256 MB machine carries the peak of 1,000 rooms a
  day was not tested.
- Operator runs: the relay server program (own code, or for example Trystero's `ws-relay` server), its deploys and updates.
- Data: everything passes through; stored only if the code stores it. Abuse controls: own code only.

**A small VPS: Hetzner Cloud** ("Regular Performance", https://www.hetzner.com/cloud/regular-performance)

- Cheapest listed: CPX02 from €5.49 a month excl. VAT in the EU with 20 TB traffic included; in the US, CPX11 €17.99 with 1 TB.
  "Your server's bill will never exceed its monthly price cap." Every plan on the page read "This product is currently
  unavailable" that day.
- Flat cost at all three volumes (the traffic is far under the included amount). Operator runs the whole machine: OS updates,
  TLS certificate, the relay process, restarts.

### 2. WebRTC data channels with a signalling service

- Signalling still needs a channel: any option in this note, or the public relays of option 4. Once connected, data goes
  browser to browser.
- TURN: Trystero's "NAT Traversal, TURN Servers & Troubleshooting"
  (https://github.com/dmotz/trystero/blob/main/docs/troubleshooting.md, last commit 2026-11-09) says "roughly 10–15% of
  real-world internet connections ... block direct UDP hole-punching altogether", and without `turnConfig` such a pair gets
  `peer-connect-failed`. Trystero ships Google and Cloudflare STUN only, no TURN. That 10–15% is Trystero's figure; no
  measurement was found to check it.
- Cloudflare Realtime TURN ("TURN Service", https://developers.cloudflare.com/realtime/turn/): "$0.05/real-time GB outbound
  from Cloudflare to the TURN client" (free when used with the Realtime SFU). If 15% of rooms relay their 3.6 MB: about $0.01,
  $0.08 and $0.81 a month at 10, 100 and 1,000 rooms a day.
- Metered ("WebRTC TURN Server Service Provider", https://www.metered.ca/stun-turn): free 500 MB a month of TURN with 100
  connections and 100,000 signalling messages a month, hard-capped; Growth $99 a month for 150 GB.
- Operator runs: a signalling channel, and a small endpoint that mints short-lived TURN credentials (Trystero: "Don't hardcode
  long-lived TURN credentials in public frontend code ... mint short-lived TURN credentials from a tiny serverless function").
- Data: actions go peer to peer, DTLS-encrypted; TURN forwards encrypted packets. Each peer learns the others' IP addresses
  unless the connection is forced through TURN (Trystero: "force TURN-only mode for IP privacy").
- Abuse controls: none central; a peer can only be ignored or banned by the others (Trystero's `roles()` and `ban`, below).
- A room of 4 is a full mesh of 6 connections; each action is sent once per peer.

### 3. Hosted realtime services

**Supabase Realtime** ("Pricing", https://supabase.com/pricing; "Pricing" for Realtime, https://supabase.com/docs/guides/realtime/pricing;
"Manage Realtime Messages usage", https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages, updated 2026-11-18)

- Free: 200 peak connections, 2 million messages a month, 256 KB a message; "Free projects are paused after 1 week of
  inactivity." Pro: $25 a month, 500 peak connections then $10 per 1,000, 5 million messages then $2.50 per million (billed in
  whole millions); spend cap on by default.
- Counting: "Each broadcast message counts as one message sent plus one message per subscribed client that receives it." So a
  room is 9,000 + 18,000 = 27,000 messages.
- Monthly: 8.1 million at 10 rooms a day (free fits about 74 rooms a month), 81 million at 100, 810 million at 1,000. Pro: about
  **$35, $215 and $2,040 a month**.
- Operator runs: nothing but the project settings; the publishable key sits in the script.
- Data: passes through Supabase; the pages read do not say whether Broadcast is kept.
- Abuse controls: spend cap, quotas with a grace period on Free, Realtime authorization (not read here).

**Ably** ("Pricing", https://ably.com/pricing; "Pricing overview", https://ably.com/docs/platform/pricing; "Limits",
https://ably.com/docs/platform/pricing/limits)

- Priced on monthly active users (unique `clientId`s). Free: 500 MAUs, 500 concurrent connections, 500 channels, 6 million
  messages a month, 50 messages a second per connection. Pro (annual / monthly billing): 1,000 MAUs $29 / $35, 5,000 $129 / $155,
  10,000 $249 / $300, 50,000 $1,149 / $1,380; above 50,000 "contact us"; extra MAUs $0.05 each.
- At most 3 users a room: up to 900, 9,000 and 90,000 MAUs a month at 10, 100 and 1,000 rooms a day (fewer if people return).
  So about $35 (or free if under 500 distinct people), about $300, and a sales contract at 1,000 a day. The Free package's 6
  million messages hold about 220 rooms a month if deliveries count as Supabase's do; Ably's "how messages are counted" page was
  not read.
- Operator runs: an endpoint to issue tokens is the documented pattern ("Embed the clientId in the token that your auth server
  issues"); anonymous users need a random `clientId`.
- Data: passes through; message history TTL 24 hours by default on Free.
- Abuse controls: package rate limits, connections per `clientId` (10), billing alerts; Pro and Business are "never blocked or
  throttled for exceeding your MAU allowance".

**Pusher Channels** ("Our pricing plans", https://pusher.com/channels/pricing/)

- Sandbox free: 200,000 messages a day, 100 concurrent connections. Startup $49 a month (1 million a day, 500), Pro $99 (4
  million, 2,000), Business $299 (10 million, 5,000), Growth $699 (40 million, 15,000).
- Counting: "if you publish one message to 50 subscribers, that's 51 messages." A room is 27,000 a day's worth: 270,000 a day at
  10 rooms (Startup, **$49**), 2.7 million at 100 (Pro, **$99**), 27 million at 1,000 (Growth, **$699**).
- Not read: whether clients may publish without a server (Pusher client events), so the operator's part is unverified.

**Firebase Realtime Database** ("Firebase Pricing", https://firebase.google.com/pricing)

- Spark (no cost): 100 simultaneous connections, 1 GB stored, 10 GB downloaded a month. Blaze: 200,000 connections per database,
  $5/GB stored past 1 GB, $1/GB downloaded past 360 MB a day.
- At 3.6 MB delivered a room: 1 GB, 11 GB and 108 GB a month. Spark holds 10 rooms a day; 100 is just past the download allowance
  (about $1 on Blaze); 1,000 is about **$100 a month** on Blaze and passes 100 connections at peaks. Firebase's own overhead per
  message was not read, so these are low estimates.
- Data: written to the database and kept until deleted. Abuse controls: security rules (Trystero's signalling doc shows a rule
  set), a Google Cloud budget.

**Liveblocks** ("Pricing", https://liveblocks.io/pricing; "Pricing FAQs", https://liveblocks.io/docs/pricing/faqs, read through
a search result)

- Free: 3,000 realtime collaboration minutes a month, 1,000 monthly active rooms, hard caps ("that feature pauses until the
  next billing cycle"). Pro: $30 a month (or $25 billed annually) including $30 of credits; minutes $0.002 each.
- "Each connected user-minute counts." A room is 135 minutes; Free holds 22 rooms a month. Pro: about **$81, $810 and $8,100 a
  month**.
- Data: presence and storage pass through; storage is persisted (version history 24 hours on Free).

**PartyKit** ("What is PartyKit", https://docs.partykit.io/): "The hosted PartyKit platform is shutting down. Deploys stop on 16
October and the platform shuts down on 23 October 2026." Ruled out; its successor is option 1 on Cloudflare.

### 4. No operator at all: Trystero and public relays

("Trystero", https://github.com/dmotz/trystero, last commit 2026-11-13; "Signaling & Relays",
https://github.com/dmotz/trystero/blob/main/docs/signaling.md)

- Default signalling: "the decentralized Nostr relay network ... connect to multiple public relays in parallel", default
  redundancy 5; also public MQTT brokers (4) and public WebTorrent trackers (3), or Supabase, Firebase or a self-hosted
  `ws-relay`.
- Data: "Signaling relays only ever see hashed room topics and encrypted SDP/ICE handshakes"; a room `password` derives the
  key with PBKDF2 so "outsiders and relay operators can't read handshakes or join the room". Actions then go peer to peer
  (option 2's TURN gap applies).
- Abuse controls: room password, `maxUsers`, and a `roles()` plugin with verified admins and `ban`.
- Dependability: the docs say the pool exists "so if one public relay is having a bad day, the others still introduce your
  peers", back off rate-limited relays, and report `relay-failed` only "if every configured relay fails initial bootstrap".
  No uptime figure for the public relays was found. They are run by third parties with no agreement with this repo.
- Cost: none to run. Brotli bundle about 46 KB for the Nostr build. A userscript would load it with `@require` or copy it in:
  a new dependency, which the map (#1159) says is put to Chris before it is designed around.

## Comparison

| Option | Free tier | 10 / 100 / 1,000 rooms a day (per month) | Operator runs | Data through operator | Abuse controls |
| --- | --- | --- | --- | --- | --- |
| Cloudflare DO relay (hibernation) | 100k req, 13k GB-s a day | $0 / $0 / ~$7 | a Worker + DO class | all messages | own code, spend limit |
| Fly.io relay | $5 a month with card | ~$2.20 / ~$2.40 / ~$4.35 | relay program | all messages | own code |
| Hetzner VPS relay | none | €5.49+ flat (EU) | whole server | all messages | own code |
| WebRTC + TURN (Cloudflare) | none for TURN | ~$0.01 / ~$0.08 / ~$0.81 + signalling | signalling + credential endpoint | none (TURN forwards encrypted) | none central |
| Supabase Realtime | 2M msgs, 200 conns | ~$35 / ~$215 / ~$2,040 | settings | all messages | spend cap, auth |
| Ably | 500 MAU, 6M msgs | ~$35 / ~$300 / sales | token endpoint | all messages | rate limits |
| Pusher Channels | 200k msgs a day | $49 / $99 / $699 | unverified | all messages | not read |
| Firebase RTDB | 100 conns, 10 GB | $0 / ~$1 / ~$100 | settings, rules | stored | security rules |
| Liveblocks | 3,000 minutes | ~$81 / ~$810 / ~$8,100 | settings | all, persisted | hard caps on Free |
| PartyKit hosted | gone (2026-10-23) | n/a | n/a | n/a | n/a |
| Trystero on public Nostr | free | $0 (+ TURN if added) | nothing | encrypted handshakes only | password, maxUsers, ban |

## A hosted page of its own (asked by the coordinator for #1175)

### Can sudokupad.app be framed, and can the framing page talk to it?

- Framing: the document sends neither `X-Frame-Options` nor a CSP (above), so nothing forbids another site framing it. MDN's
  "Same-origin policy" (https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy) says iframes are
  embeddable cross-origin unless the site sends `X-Frame-Options`, that a cross-origin frame gives "very limited access" to its
  `Window`, and "To communicate between documents from different origins, use `window.postMessage`." A framing page cannot
  reach `Framework` or the grid directly.
- A `postMessage` listener exists, seen in passing in `feature-project9x9.js?v=0.616.0` (from the HAR). `initMessaging` adds
  `window.addEventListener('message', this.handleMessage)` and posts `{type: 'event', name: 'ready'}`; `handleMessage` returns
  only if `event.origin === document.location.origin`, so it accepts other origins; replies go to
  `window.parent.postMessage(msg, '*')`. Actions: `init`, `loadpuzzle`, `restartpuzzle`, `createthumbnail`, `setdigit`,
  `puzzlestatus`, `pause`, `unpause`, `showpausedialog`, `closedialog`, plus `listen` and `unlisten` marked "testing".
  `setdigit` presses one digit in one cell; nothing for marks, colours or pen was seen. Layouts are named `project9x9-1` to
  `project9x9-8r` and `thumbnail`, chosen by `?layout=`. Not traced: whether `initMessaging` runs on every page or only with a
  layout; no live test sent a message.
- Also in passing: SudokuPad's stream tool (`feature-streamtool.js`) itself opens `new WebSocket(url)`; #1161 reads that file.

### SudokuPad's licence or terms on embedding

None found for the web app. Looked at: the puzzle page's HTML (its links are Steam, Patreon, Ko-fi, YouTube,
`svencodes.com/thanks/` and `patreon.svencodes.com`; `<meta name="copyright" content="Sven Neumann, sven@svencodes.com">`);
"Sven Codes" (https://svencodes.com, no terms link); a web search for SudokuPad terms and embedding. What exists: the Steam app's
"Sven's SudokuPad EULA" (https://store.steampowered.com/eula/1706870_eula_0): "The game, all code and related assets belong to
Sven Neumann. This license grants you the right to play the game. That's it." That is for the Steam app; a privacy policy for
the app exists at https://svencodes.com/sudokupad/sudokupad-privacy-policy.html (seen in a search result, not read). Paths
`/terms`, `/privacy`, `/about` and `/license` on sudokupad.app all answered 200, but their bodies were not read (probably the
app shell). Whose puzzles may be loaded elsewhere (the setters') was not researched.

### Each transport from a hosted page

The browser APIs are the same: `WebSocket` and `RTCPeerConnection` work the same from a page the operator hosts, under a CSP the
operator writes. Differences: no Tampermonkey install, so anyone with the link can join; the page's origin is the operator's,
so a relay checking `Origin` sees that instead of `https://sudokupad.app`; keys and tokens sit in the page instead of the script.

| Option | From a hosted page | What the hosted page adds |
| --- | --- | --- |
| Owner-run relay (any) | same | static hosting; on Cloudflare, "Requests to static assets are free and unlimited" (Workers pricing page) |
| WebRTC + TURN | same | static hosting |
| Supabase, Ably, Pusher, Firebase, Liveblocks | same | static hosting |
| Trystero on public relays | same, no `@require` needed | static hosting |

Static hosting alone on this repo's Netlify draws on the same 300 credits a month as `site/` (see
`docs/research/tooling/netlify-credits.md`). A hosted page still needs the grid: framing sudokupad.app gives only the
`postMessage` actions above; anything else means drawing the grid itself.

## Not verified

- Ably's message counting and Fair Usage Policy; Pusher client events and whether they need a server; Firebase's per-message
  overhead; Supabase Broadcast retention and Realtime authorization; Liveblocks' Pro monthly active room cap (the table was
  ambiguous); Cloudflare TURN credential issuance.
- Per-message handler time (the 10 ms is Cloudflare's example), message size, people per room and peak concurrency: all
  assumed, none measured.
- Whether a 256 MB Fly machine or the cheapest VPS carries the peak of 1,000 rooms a day.
- Uptime of the public Nostr, MQTT and WebTorrent relays; the 10–15% TURN figure beyond Trystero's statement.
- Whether a WebSocket opened from Tampermonkey's isolated or userscript world (not `@grant none`) behaves differently; moot while
  the page has no CSP.
- Whether SudokuPad's `postMessage` listener is live on an ordinary puzzle page; no message was sent.
- Requests to sudokupad.app: the brief allowed one; five were made (`/` and the four terms-like paths), each a single GET.
