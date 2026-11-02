// ==UserScript==
// @name         SudokuPad Color by Digit
// @namespace    https://github.com/caneff/sudokupad-scripts
// @version      0.1.0
// @description  Adds a button that colors every cell holding a digit, using groups of palette colors set in a settings dialog.
// @match        https://sudokupad.app/*
// @match        https://*.sudokupad.app/*
// @match        https://crackingthecryptic.com/*
// @match        https://*.crackingthecryptic.com/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/color-by-digit.user.js
// @downloadURL  https://raw.githubusercontent.com/caneff/sudokupad-scripts/main/color-by-digit.user.js
// ==/UserScript==

(function () {
  'use strict';

  const DATA_KEY = 'ColorByDigit_groups';
  const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

  // A group is one palette key plus the digits that get it.
  const PRELOADS = {
    'Low/5/High': [
      { key: '9', digits: ['0', '1', '2', '3', '4'] },
      { key: '1', digits: ['5'] },
      { key: '6', digits: ['6', '7', '8', '9'] },
    ],
    'Odd/Even': [
      { key: '6', digits: ['1', '3', '5', '7', '9'] },
      { key: '9', digits: ['0', '2', '4', '6', '8'] },
    ],
    Custom: [],
  };
  const DEFAULT_GROUPS = PRELOADS['Odd/Even'];

  const cloneGroups = (groups) => groups.map((g) => ({ key: g.key, digits: [...g.digits] }));

  // Which cells get which key. Pure: cells in, [{index, key}] out.
  function planColoring(cells, groups) {
    const keyOfDigit = {};
    groups.forEach((g) => g.digits.forEach((d) => { keyOfDigit[d] = g.key; }));
    const plan = [];
    cells.forEach((cell, index) => {
      const digit = cell.given || cell.value;
      if (typeof digit !== 'string' || !/^[0-9]$/.test(digit)) return;
      const key = keyOfDigit[digit];
      if (key === undefined) return;
      if ((cell.colours || []).includes(key)) return;
      plan.push({ index, key });
    });
    return plan;
  }

  // Puts a digit in one group, or takes it out if that group already holds it.
  function assignDigit(groups, groupIndex, digit) {
    const had = groups[groupIndex].digits.includes(digit);
    return groups.map((g, i) => {
      const rest = g.digits.filter((d) => d !== digit);
      if (i !== groupIndex) return { key: g.key, digits: rest };
      const digits = had ? rest : [...rest, digit].sort();
      return { key: g.key, digits };
    });
  }

  // Saved data is untrusted: returns clean groups, or null when it is not a list of groups.
  function normalizeGroups(data) {
    if (!Array.isArray(data)) return null;
    const out = [];
    for (const g of data) {
      if (!g || typeof g.key !== 'string' || !Array.isArray(g.digits)) return null;
      const digits = [...new Set(g.digits.filter((d) => DIGITS.includes(d)))].sort();
      out.push({ key: g.key, digits });
    }
    return out;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { planColoring, assignDigit, normalizeGroups, PRELOADS, DEFAULT_GROUPS };
  }
  if (typeof Framework === 'undefined' || !Framework.getApp) return;

  const PALETTE_KEYS = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');

  // The visible colors of the user's current palette, read from the CSS variables
  // SudokuPad sets for each key. Transparent and unset slots are skipped.
  function paletteColors() {
    const style = getComputedStyle(document.documentElement);
    const colors = [];
    PALETTE_KEYS.forEach((key) => {
      const value = style.getPropertyValue(`--cell-color-${key}`).trim();
      if (value && value !== 'transparent') colors.push({ key, value });
    });
    return colors;
  }

  const loadGroups = () => normalizeGroups(Framework.getData(DATA_KEY)) || cloneGroups(DEFAULT_GROUPS);
  const saveGroups = (groups) => Framework.setData(DATA_KEY, groups);

  function press(app) {
    const groups = loadGroups();
    if (groups.length === 0) return;
    const puzzle = app.puzzle;
    const cells = [].concat(puzzle.cells).flat(Infinity);
    const plan = planColoring(cells, groups);
    if (plan.length === 0) return;
    const byKey = {};
    plan.forEach(({ index, key }) => (byKey[key] = byKey[key] || []).push(cells[index]));
    const savedSelection = [...puzzle.selectedCells];
    app.act({ type: 'groupstart' });
    Object.entries(byKey).forEach(([key, keyCells]) => {
      app.deselect();
      app.select(keyCells);
      app.act({ type: 'colour', arg: key });
    });
    app.deselect();
    if (savedSelection.length > 0) app.select(savedSelection);
    app.act({ type: 'groupend' });
  }

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function renderEditor(groups, colors) {
    const rows = groups.map((g, i) => {
      const swatches = colors.map((c) =>
        `<button type="button" data-act="color" data-group="${i}" data-key="${esc(c.key)}" title="${esc(c.key)}" ` +
        `style="width:1.4em;height:1.4em;margin:1px;border-radius:50%;background:${esc(c.value)};` +
        `border:${c.key === g.key ? '3px solid #000' : '1px solid #888'}"></button>`).join('');
      const digits = DIGITS.map((d) =>
        `<button type="button" data-act="digit" data-group="${i}" data-digit="${d}" ` +
        `style="width:1.8em;margin:1px;font-weight:${g.digits.includes(d) ? 'bold' : 'normal'};` +
        `opacity:${g.digits.includes(d) ? 1 : 0.4}">${d}</button>`).join('');
      return `<div style="margin:6px 0;padding:4px;border:1px solid #888;border-radius:4px">` +
        `<div>${swatches}</div><div>${digits} ` +
        `<button type="button" data-act="remove" data-group="${i}">Remove</button></div></div>`;
    }).join('');
    const preloads = Object.keys(PRELOADS)
      .map((n) => `<button type="button" data-act="preload" data-name="${esc(n)}">${esc(n)}</button>`).join(' ');
    return `<div>Preload: ${preloads}</div>${rows || '<div style="margin:6px 0">No groups.</div>'}` +
      `<button type="button" data-act="add">Add group</button>`;
  }

  function openDialog() {
    const colors = paletteColors();
    let groups = loadGroups();
    const draw = () => {
      const box = document.getElementById('color-by-digit-editor');
      if (box) box.innerHTML = renderEditor(groups, colors);
    };
    Framework.showDialog({
      centerOverBoard: true,
      parts: [
        { tag: 'text', innerHTML: '<b>Color by digit</b>' },
        { tag: 'text', innerHTML: '<div id="color-by-digit-editor"></div>' },
        {
          tag: 'options',
          options: [
            { tag: 'button', content: 'Save', action: 'close', handler: () => { saveGroups(groups); Framework.closeDialog(); } },
            { tag: 'button', content: 'Cancel', action: 'close' },
          ],
        },
      ],
    });
    draw();
    const box = document.getElementById('color-by-digit-editor');
    if (!box) return;
    box.addEventListener('click', (event) => {
      const el = event.target.closest('button[data-act]');
      if (!el) return;
      event.preventDefault();
      event.stopPropagation();
      const i = Number(el.dataset.group);
      switch (el.dataset.act) {
        case 'color': groups[i].key = el.dataset.key; break;
        case 'digit': groups = assignDigit(groups, i, el.dataset.digit); break;
        case 'remove': groups.splice(i, 1); break;
        case 'preload': groups = cloneGroups(PRELOADS[el.dataset.name]); break;
        case 'add': {
          const used = groups.map((g) => g.key);
          const free = colors.find((c) => !used.includes(c.key)) || colors[0];
          if (free) groups.push({ key: free.key, digits: [] });
          break;
        }
      }
      draw();
    });
  }

  Framework.getApp().then((app) => {
    Framework.addAppButton({
      name: 'colorbydigit',
      title: 'Color by digit',
      content: 'Color',
      onClick: () => press(app),
    });
    Framework.addSetting({
      tag: 'button',
      name: 'colorbydigit',
      content: 'Color by digit',
      handler: () => {
        Framework.closeDialog();
        setTimeout(openDialog, 0);
      },
    });
  });
})();
