import {
  PASSES, slot, rowOf, deal, isFree, remove, draw, findMove, cardsLeft,
} from './logic.js';
import { createTable } from '../../shared/cards.js';
import {
  load, store, formatTime, toast, vibrate, fillStats, registerServiceWorker,
} from '../../shared/util.js';

const SAVE_KEY = 'pyramid.save.v1';
const RECORD_KEY = 'pyramid.record.v1';

const $ = (id) => document.getElementById(id);
const tableEl = $('table');
const board = $('board');

let state = null;
let history = [];
let selected = null; // a place: { pile: 'pyramid', index } | { pile: 'waste' }

const clone = (s) => JSON.parse(JSON.stringify(s));
const save = () => store(SAVE_KEY, { state, history: history.slice(-60) });
const record = () => ({ played: 0, won: 0, best: null, ...load(RECORD_KEY, {}) });

// ---------- layout ----------

let L = null;
function measure() {
  const W = Math.min(tableEl.clientWidth, 520);
  const H = tableEl.clientHeight;
  const gap = Math.max(3, Math.round(W * 0.015));
  // Seven cards across the bottom row. The layout is 5 card-heights tall
  // (pyramid 4, deck 1) plus gaps and the label, so cap the width to fit.
  const cw = Math.min(Math.floor((W - gap * 8) / 7), Math.floor((H - gap * 5 - 24) / (5 * 1.4)));
  const ch = Math.round(cw * 1.4);
  L = {
    W, gap, cw, ch,
    rowY: (r) => gap * 2 + r * ch * 0.5,
    rowX: (r, i) => W / 2 - ((r + 1) * cw + r * gap) / 2 + i * (cw + gap),
    stockY: gap * 2 + 6 * ch * 0.5 + ch + gap * 3,
  };
  board.style.width = `${W}px`;
  board.style.setProperty('--cw', `${cw}px`);
  board.style.setProperty('--ch', `${ch}px`);
  board.style.setProperty('--corner', `${Math.round(cw * 0.34)}px`);
}

const table = createTable(board, {
  getDrag: (id) => (placeOf(id) ? [id] : null),
  onTap: (id) => tapCard(id),
  onDrop: (ids, cx, cy) => {
    const a = placeOf(ids[0]);
    const b = placeAtPoint(cx, cy, ids[0]);
    if (!a || !b) return false;
    return act(() => remove(state, a, b));
  },
});
for (let suit = 0; suit < 4; suit++) {
  for (let rank = 1; rank <= 13; rank++) table.addCard(suit * 13 + rank - 1, suit, rank);
}

const stockSlot = document.createElement('div');
stockSlot.className = 'slot clickable';
board.append(stockSlot);
const wasteSlot = document.createElement('div');
wasteSlot.className = 'slot';
board.append(wasteSlot);
const passLabel = document.createElement('div');
passLabel.className = 'pass-label';
board.append(passLabel);

// Where a card is, if it can be used right now.
function placeOf(id) {
  const n = state.pyramid.findIndex((c) => c?.id === id);
  if (n >= 0) return isFree(state, n) ? { pile: 'pyramid', index: n } : null;
  const top = state.waste[state.waste.length - 1];
  return top?.id === id ? { pile: 'waste' } : null;
}

const pos = new Map();
function placeAtPoint(x, y, exceptId) {
  for (const [id, p] of pos) {
    if (id === exceptId) continue;
    if (x >= p.x && x <= p.x + L.cw && y >= p.y && y <= p.y + L.ch) {
      const place = placeOf(id);
      if (place) return place;
    }
  }
  return null;
}

function render() {
  measure();
  pos.clear();
  const seen = new Set();
  const stockX = L.W / 2 - L.cw - L.gap * 2;
  const wasteX = L.W / 2 + L.gap * 2;
  for (const [el, x] of [[stockSlot, stockX], [wasteSlot, wasteX]]) {
    el.style.left = `${x}px`;
    el.style.top = `${L.stockY}px`;
    el.style.width = `${L.cw}px`;
    el.style.height = `${L.ch}px`;
  }
  const canRecycle = !state.stock.length && state.pass < PASSES && state.waste.length;
  stockSlot.textContent = canRecycle ? '↻' : '';
  passLabel.textContent = `Deck ${state.pass} of ${PASSES}`;
  passLabel.style.left = `${stockX - L.cw}px`;
  passLabel.style.width = `${L.cw * 3}px`;
  passLabel.style.top = `${L.stockY + L.ch + 4}px`;

  state.pyramid.forEach((c, n) => {
    if (!c) return;
    const r = rowOf(n);
    const i = n - slot(r, 0);
    const x = L.rowX(r, i);
    const y = L.rowY(r);
    table.show(c.id);
    table.place(c.id, x, y, 10 + r, true);
    const el = table.els.get(c.id);
    el.classList.toggle('blocked', !isFree(state, n));
    el.classList.toggle('selected', selected?.pile === 'pyramid' && selected.index === n);
    pos.set(c.id, { x, y });
    seen.add(c.id);
  });
  state.stock.forEach((c, k) => {
    table.show(c.id);
    table.place(c.id, stockX, L.stockY, 100 + k, false);
    table.els.get(c.id).classList.remove('blocked', 'selected');
    seen.add(c.id);
  });
  state.waste.forEach((c, k) => {
    table.show(c.id);
    table.place(c.id, wasteX, L.stockY, 200 + k, true);
    const el = table.els.get(c.id);
    el.classList.remove('blocked');
    el.classList.toggle('selected', selected?.pile === 'waste' && k === state.waste.length - 1);
    if (k === state.waste.length - 1) pos.set(c.id, { x: wasteX, y: L.stockY });
    seen.add(c.id);
  });
  for (const [id, el] of table.els) {
    if (!seen.has(id)) {
      el.classList.remove('selected', 'blocked');
      table.hide(id);
    }
  }
  $('left').textContent = `${cardsLeft(state)} left`;
  $('undo-btn').disabled = !history.length;
  $('timer').textContent = formatTime(state.elapsedMs);
}
window.addEventListener('resize', () => state && render());

// ---------- actions ----------

function act(mutate) {
  const before = clone(state);
  if (!mutate()) return false;
  if (before.moves === 0) {
    const r = record();
    r.played++;
    store(RECORD_KEY, r);
  }
  history.push(before);
  selected = null;
  vibrate(10);
  save();
  render();
  if (state.status !== 'playing') setTimeout(showEnd, 500);
  return true;
}

const samePlace = (a, b) => a && b && a.pile === b.pile && a.index === b.index;

function tapCard(id) {
  if (state.status !== 'playing') return;
  if (state.stock.some((c) => c.id === id)) {
    act(() => draw(state));
    return;
  }
  const place = placeOf(id);
  if (!place) {
    table.nope(id);
    return;
  }
  if (samePlace(place, selected)) {
    selected = null;
    render();
    return;
  }
  // A King goes straight away.
  if (act(() => remove(state, place))) return;
  if (selected) {
    if (act(() => remove(state, selected, place))) return;
    toast("Those don't add up to 13", 1100);
    table.nope(id);
  }
  selected = place;
  render();
}

stockSlot.addEventListener('click', () => act(() => draw(state)));

function showHint() {
  const move = findMove(state);
  if (!move) {
    toast(state.stock.length || state.pass < PASSES ? 'Turn over a card from the deck' : 'No moves left');
    if (state.stock.length) table.flash(table.els.get(state.stock[state.stock.length - 1].id));
    return;
  }
  for (const p of move) {
    const c = p.pile === 'waste' ? state.waste[state.waste.length - 1] : state.pyramid[p.index];
    table.flash(table.els.get(c.id));
  }
}

function undo() {
  const prev = history.pop();
  if (!prev) return;
  state = prev;
  selected = null;
  save();
  render();
}

function showEnd() {
  const won = state.status === 'won';
  const r = record();
  if (won) {
    r.won++;
    if (r.best == null || state.elapsedMs < r.best) r.best = state.elapsedMs;
    store(RECORD_KEY, r);
    vibrate([40, 60, 40, 60, 120]);
  }
  $('end-banner').textContent = won ? '🎉 Pyramid cleared! 🎉' : 'No more moves';
  fillStats($('end-stats'), [
    ['Cards removed', `${state.removed} of 52`],
    ['Pyramid left', cardsLeft(state)],
    ['Time', formatTime(state.elapsedMs)],
    ['Games won', `${r.won} of ${r.played}`],
  ]);
  $('end-undo').hidden = won;
  $('end').showModal();
}

function startGame() {
  state = deal();
  history = [];
  selected = null;
  save();
  render();
}

// ---------- buttons & dialogs ----------

$('undo-btn').addEventListener('click', undo);
$('hint-btn').addEventListener('click', showHint);
$('new-btn').addEventListener('click', () => {
  if (state.moves > 0 && state.status === 'playing' && !confirm('Deal a new game?')) return;
  startGame();
});
$('menu-btn').addEventListener('click', () => {
  const r = record();
  fillStats($('record'), r.played ? [
    ['Games won', `${r.won} of ${r.played}`],
    ...(r.best != null ? [['Best time', formatTime(r.best)]] : []),
  ] : []);
  $('menu').showModal();
});
$('menu-new').addEventListener('click', () => {
  $('menu').close();
  startGame();
});
$('again-btn').addEventListener('click', () => {
  $('end').close();
  startGame();
});
$('end-undo').addEventListener('click', () => {
  $('end').close();
  undo();
});
for (const btn of document.querySelectorAll('[data-close]')) {
  btn.addEventListener('click', () => btn.closest('dialog').close());
}
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
}
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    undo();
  }
});

// ---------- timer ----------

let lastTick = performance.now();
setInterval(() => {
  const now = performance.now();
  if (state?.status === 'playing' && state.moves > 0 && document.visibilityState === 'visible') {
    state.elapsedMs += now - lastTick;
    $('timer').textContent = formatTime(state.elapsedMs);
  }
  lastTick = now;
}, 500);
document.addEventListener('visibilitychange', () => {
  lastTick = performance.now();
  if (state) save();
});
window.addEventListener('pagehide', () => state && save());

// ---------- start ----------

const saved = load(SAVE_KEY, null);
if (saved?.state?.pyramid && saved.state.status === 'playing') {
  state = saved.state;
  history = saved.history ?? [];
  render();
} else {
  startGame();
}

registerServiceWorker();
