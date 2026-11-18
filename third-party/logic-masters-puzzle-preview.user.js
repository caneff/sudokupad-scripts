// ==UserScript==
// @name         Logic Masters Puzzle Preview
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Show puzzle preview images inline on Logic Masters portal pages, cached between visits
// @author       You
// @match        https://logic-masters.de/Raetselportal/*
// @exclude      https://logic-masters.de/Raetselportal/Raetsel/*
// @grant        none
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
  const GAP_MS = 500 // pause between two network requests, to be gentle on the server
  const LINKS = 'a[href*="zeigen.php"]'

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
      req.onerror = () => resolve(undefined)
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

  // ---- network: one request at a time, a gap between them, and a long pause when the server is busy ----
  // LMD answers 503 when it is loaded or throttling. Then nothing more is asked of it for BUSY_PAUSE_MS,
  // and the failed lookup is not saved, so a later visit tries again.
  const BUSY_PAUSE_MS = 5 * 60 * 1000
  const BUSY_KEY = 'lm-puzzle-preview-busy-until' // kept in localStorage so every open page and the next visit wait too
  const busyUntil = () => Number(localStorage.getItem(BUSY_KEY)) || 0
  let queue = Promise.resolve()
  function politely (job) {
    const run = queue.then(async () => {
      if (Date.now() < busyUntil()) throw new Error('server busy, waiting')
      const response = await job()
      if (response.status === 503 || response.status === 429) localStorage.setItem(BUSY_KEY, String(Date.now() + BUSY_PAUSE_MS))
      return response
    })
    queue = run.catch(() => {}).then(() => new Promise((resolve) => setTimeout(resolve, GAP_MS)))
    return run
  }

  // The first bild.php image on a puzzle page, read from the page text without building a document.
  async function fetchImageAddress (pageUrl) {
    const response = await politely(() => fetch(pageUrl))
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

  function imageAddressFor (pageUrl) {
    return once('page:' + pageUrl, async () => {
      const saved = await dbGet('pages', pageUrl)
      const ttl = saved && saved.src ? PAGE_TTL : MISS_TTL
      if (saved && Date.now() - saved.checked < ttl) return saved.src
      try {
        const src = await fetchImageAddress(pageUrl)
        dbPut('pages', pageUrl, { src, checked: Date.now() })
        return src
      } catch {
        return saved ? saved.src : null // offline or an error: fall back to what we had
      }
    })
  }

  // An object URL for the image, from the cache when it is there.
  function imageUrlFor (src) {
    return once('image:' + src, async () => {
      const saved = await dbGet('images', src)
      if (saved) {
        dbPut('images', src, { blob: saved.blob, used: Date.now() })
        return URL.createObjectURL(saved.blob)
      }
      const response = await politely(() => fetch(src))
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const blob = await response.blob()
      dbPut('images', src, { blob, used: Date.now() })
      return URL.createObjectURL(blob)
    })
  }

  // ---- the preview box, as before ----
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
    img.onerror = () => { label.textContent = 'No preview'; label.style.color = '#999' }

    box.append(label, img)
    parent.insertBefore(box, parent.firstChild)
    if (parent.style.overflow !== 'hidden') parent.style.overflow = 'auto'
    return { box, img, label }
  }

  async function showPreview (link) {
    const pageUrl = link.href
    const src = await imageAddressFor(pageUrl)
    if (!src) return
    const preview = insertPreview(link)
    if (!preview) return
    try {
      preview.img.src = await imageUrlFor(src)
    } catch {
      preview.img.src = src // the cache failed: let the browser load it the usual way
    }
  }

  // ---- only links on or near the screen are looked up ----
  const seen = new WeakSet()
  const nearScreen = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      nearScreen.unobserve(entry.target)
      showPreview(entry.target)
    }
  }, { rootMargin: '400px 0px' })

  function watch (root) {
    const links = root.matches && root.matches(LINKS) ? [root] : root.querySelectorAll(LINKS)
    for (const link of links) {
      if (seen.has(link)) continue
      seen.add(link)
      nearScreen.observe(link)
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
    setTimeout(pruneImages, 5000)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
  else init()
})()
