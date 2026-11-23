// ==UserScript==
// @name         Logic Masters Puzzle Preview
// @namespace    http://tampermonkey.net/
// @version      1.3.3
// @description  Show puzzle preview images inline on Logic Masters portal pages, cached between visits
// @author       juggler (first version); caching and request limits by ChinStrap
// @match        https://logic-masters.de/Raetselportal/*
// @exclude      https://logic-masters.de/Raetselportal/Raetsel/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/chinstrap45/sudokupad-scripts/main/logic-masters-puzzle-preview.user.js
// @downloadURL  https://raw.githubusercontent.com/chinstrap45/sudokupad-scripts/main/logic-masters-puzzle-preview.user.js
// ==/UserScript==

/* eslint-env browser */

(function () {
  'use strict'

  // What is kept between visits, in this site's IndexedDB:
  // - pages:  puzzle page address -> its preview image address, so the puzzle page is not fetched again.
  // - images: image address -> the image itself, because the site sends images with "no-cache" and the
  //   browser would download every one again on each visit.
  // Images are stored by address and not rechecked: if the site replaces a picture at the same address, the
  // old picture stays until the cache drops it. The page mapping is checked again after PAGE_TTL.
  const DB_NAME = 'lm-puzzle-preview'
  const PAGE_TTL = 7 * 24 * 3600 * 1000 // a puzzle page is looked at again after a week
  const MISS_TTL = 24 * 3600 * 1000 // a page with no image is looked at again after a day
  const MAX_IMAGES = 600 // about 25 MB at the usual 40-50 KB a picture; the oldest go first
  const NEAR_SCREEN_PX = 400 // links this near the viewport are looked up before the rest
  const PRUNE_DELAY_MS = 5000 // the image cache is trimmed once the page has settled
  const REQUEST_GAP_MS = 200 // from the end of one network request to the start of the next
  const LINKS = 'a[href*="zeigen.php"]' // candidates: the portal's menu has more links that match, and isPuzzleLink sorts them out
  const REQUEST_TIMEOUT_MS = 20 * 1000 // a request that never answers would hold the queue and leave its box at Loading...

  // ---- storage ----
  const dbReady = new Promise((resolve) => {
    const open = indexedDB.open(DB_NAME, 1)
    open.onupgradeneeded = () => {
      open.result.createObjectStore('pages')
      open.result.createObjectStore('images')
    }
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => resolve(null) // private window or storage blocked: work without a cache
  })

  async function dbGet (store, key) {
    const db = await dbReady
    if (!db) return undefined
    return new Promise((resolve) => {
      const req = db.transaction(store).objectStore(store).get(key)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(undefined) // a failed read counts as a miss: the lookup is made again and saved
    })
  }

  async function dbPut (store, key, value) {
    const db = await dbReady
    if (!db) return
    db.transaction(store, 'readwrite').objectStore(store).put(value, key)
  }

  // Drop the least recently used images once there are more than MAX_IMAGES.
  async function pruneImages () {
    const db = await dbReady
    if (!db) return
    const store = db.transaction('images', 'readwrite').objectStore('images')
    const entries = []
    store.openCursor().onsuccess = (e) => {
      const cursor = e.target.result
      if (cursor) {
        entries.push([cursor.key, cursor.value.used])
        cursor.continue()
        return
      }
      if (entries.length <= MAX_IMAGES) return
      entries.sort((a, b) => a[1] - b[1])
      for (const [key] of entries.slice(0, entries.length - MAX_IMAGES)) store.delete(key)
    }
  }

  // ---- network: one request at a time, a gap after each, and a pause when the server answers busy ----
  // LMD answers 503 or 429 when it is loaded or throttling. That lookup alone fails, nothing is asked for BUSY_PAUSE_MS,
  // and it is not saved, so a later visit tries again. After MAX_BUSY_IN_A_ROW busy answers in a row the page asks no more.
  const BUSY_PAUSE_MS = 30 * 1000
  const MAX_BUSY_IN_A_ROW = 3
  class BusyError extends Error {}
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const waiting = []
  let running = false
  let busyInARow = 0
  let stopped = false

  // The lookup with the lowest rank goes next; a lower rank is nearer the screen, then earlier in the page.
  function takeNext () {
    let best = 0
    waiting.forEach((entry, i) => { if (entry.rank < waiting[best].rank) best = i })
    return waiting.splice(best, 1)[0]
  }

  async function runQueue () {
    running = true
    await sleep(REQUEST_GAP_MS) // cache reads of a page's links finish within this, so the nearest links are queued before the first request
    while (waiting.length > 0) {
      const { job, resolve, reject } = takeNext()
      let busy = false
      try {
        const response = await job()
        busy = response.status === 503 || response.status === 429
        if (busy) reject(new BusyError('server busy'))
        else resolve(response)
      } catch (error) {
        reject(error)
      }
      busyInARow = busy ? busyInARow + 1 : 0
      if (busyInARow >= MAX_BUSY_IN_A_ROW) {
        stopped = true
        for (const entry of waiting.splice(0)) entry.reject(new BusyError('server busy, stopped'))
      }
      await sleep(busy ? BUSY_PAUSE_MS : REQUEST_GAP_MS)
    }
    running = false
  }

  function politely (job, rank) {
    return new Promise((resolve, reject) => {
      if (stopped) return reject(new BusyError('server busy, stopped'))
      waiting.push({ job, rank, resolve, reject })
      if (!running) runQueue()
    })
  }

  // The first bild.php image on a puzzle page, read from the page text without building a document.
  async function fetchImageAddress (pageUrl, rank) {
    const response = await politely(() => fetch(pageUrl, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }), rank)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const html = await response.text()
    const match = html.match(/<img[^>]+src="([^"]*bild\.php[^"]*)"/i)
    return match ? new URL(match[1].replace(/&amp;/g, '&'), pageUrl).href : null
  }

  // ---- lookups, each asked once per page view even when two links point at one puzzle ----
  const pending = new Map()
  function once (key, make) {
    if (!pending.has(key)) pending.set(key, make())
    return pending.get(key)
  }

  function imageAddressFor (pageUrl, rank) {
    return once('page:' + pageUrl, async () => {
      const saved = await dbGet('pages', pageUrl)
      const ttl = saved && saved.src ? PAGE_TTL : MISS_TTL
      if (saved && Date.now() - saved.checked < ttl) return saved.src
      try {
        const src = await fetchImageAddress(pageUrl, rank)
        dbPut('pages', pageUrl, { src, checked: Date.now() })
        return src
      } catch (error) {
        // Offline, busy or an error: use what was saved. With nothing saved the error stands and nothing is saved, so a later visit tries again.
        if (saved) return saved.src
        throw error
      }
    })
  }

  // An object URL for the image, from the cache when it is there.
  function imageUrlFor (src, rank) {
    return once('image:' + src, async () => {
      const saved = await dbGet('images', src)
      if (saved) {
        dbPut('images', src, { blob: saved.blob, used: Date.now() })
        return URL.createObjectURL(saved.blob)
      }
      const response = await politely(() => fetch(src, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }), rank)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const blob = await response.blob()
      dbPut('images', src, { blob, used: Date.now() })
      return URL.createObjectURL(blob)
    })
  }

  // ---- the preview box ----
  function showFailure (label, text) {
    label.textContent = text
    label.style.color = '#999'
  }

  function insertPreview (link) {
    const parent = link.parentElement
    if (!parent || parent.querySelector('.puzzle-preview')) return null

    const box = document.createElement('div')
    box.className = 'puzzle-preview'
    box.style.cssText = 'float: left; margin-right: 10px; margin-bottom: 5px; max-width: 100px;'

    const label = document.createElement('div')
    label.textContent = 'Loading...'
    label.style.cssText = 'font-size: 10px; text-align: center; color: #666; font-style: italic;'

    const img = document.createElement('img')
    img.decoding = 'async'
    img.style.cssText = 'max-width: 100px; height: auto; display: block; border-radius: 2px;'
    img.onload = () => label.remove()
    img.onerror = () => showFailure(label, 'No preview')

    box.append(label, img)
    parent.insertBefore(box, parent.firstChild)
    if (parent.style.overflow !== 'hidden') parent.style.overflow = 'auto'
    return { box, img, label }
  }

  // `rank` orders the lookups in the queue, and an image's lookup keeps its link's rank.
  async function showPreview (link, preview, rank) {
    try {
      const src = await imageAddressFor(link.href, rank)
      if (!src) {
        preview.box.remove()
        return
      }
      preview.img.src = await imageUrlFor(src, rank)
    } catch (error) {
      // No direct load of the address: it would skip the queue, the gap and the pause after a 503, and ask the busy server again.
      showFailure(preview.label, error instanceof BusyError ? 'Busy, try later' : 'No preview')
    }
  }

  // ---- every link is looked up, those on or near the screen first, then the rest in page order ----
  const FAR_RANK = 1e9 // added to the rank of a link away from the screen
  const seen = new WeakSet()
  let linksSeen = 0

  // A puzzle's page is /Raetsel/zeigen.php with an id; the menu's "Rätsel anzeigen" has none, and kommentarezeigen.php and loeserzeigen.php are other pages.
  function isPuzzleLink (link) {
    const url = new URL(link.href, location.href)
    return url.pathname.endsWith('/Raetsel/zeigen.php') && Boolean(url.searchParams.get('id'))
  }

  function isNearScreen (link) {
    const rect = link.getBoundingClientRect()
    return rect.bottom > -NEAR_SCREEN_PX && rect.top < window.innerHeight + NEAR_SCREEN_PX
  }

  function watch (root) {
    const links = root.matches && root.matches(LINKS) ? [root] : root.querySelectorAll(LINKS)
    for (const link of links) {
      if (seen.has(link)) continue
      seen.add(link)
      if (!isPuzzleLink(link)) continue
      const preview = insertPreview(link)
      if (preview) showPreview(link, preview, linksSeen++ + (isNearScreen(link) ? 0 : FAR_RANK))
    }
  }

  function init () {
    watch(document)
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) watch(node)
        }
      }
    }).observe(document.body, { childList: true, subtree: true })
    setTimeout(pruneImages, PRUNE_DELAY_MS)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
  else init()
})()
