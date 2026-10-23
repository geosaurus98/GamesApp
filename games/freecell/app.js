import {
  deal, randomDealNumber, move, bestTarget, autoStep, findHint, isRun, MAX_DEAL,
} from './logic.js';
import { createTable, nearestColumn, SUITS } from '../../shared/cards.js';
import {
  load, store, formatTime, toast, vibrate, fillStats, registerServiceWorker,
} from '../../shared/util.js';

const SAVE_KEY = 'freecell.save.v1';
const RECORD_KEY = 'freecell.record.v1';
const MAX_UNDO = 300;

const $ = (id) => document.getElementById(id);
const tableEl = $('table');
const board = $('board');

let state = null;
let history = [];
let autoTimer = 0;

const clone = (s) => JSON.parse(JSON.stringify(s));
const save = () => store(SAVE_KEY, { state, history: history.slice(-60) });
const record = () => ({ played: 0, won: 0, best: null, ...load(RECORD_KEY, {}) });

// ---------- layout ----------

let L = null;
function measure() {
  const W = Math.min(tableEl.clientWidth, 600);
  const gap = Math.max(3, Math.round(W * 0.012));
  const cw = Math.floor((W - gap * 9) / 8);
  const ch = Math.round(cw * 1.4);
  const left = Math.round((W - (cw * 8 + gap * 7)) / 2);
  L = {
    H: tableEl.clientHeight, gap, cw, ch,
    colX: (i) => left + i * (cw + gap),
    topY: gap,
    tabY: ch + gap * 3,
  };
  board.style.width = `${W}px`;
  board.style.setProperty('--cw', `${cw}px`);
  board.style.setProperty('--ch', `${ch}px`);
  board.style.setProperty('--corner', `${Math.round(cw * 0.34)}px`);
}

const slots = { cells: [], foundations: [], cascades: [] };
function buildSlots() {
  const make = (text = '') => {
    const el = document.createElement('div');
    el.className = 'slot';
    el.textContent = text;
    board.append(el);
    return el;
  };
  slots.cells = [0, 1, 2, 3].map(() => make());
  slots.foundations = SUITS.map((s) => make(s));
  slots.cascades = Array.from({ length: 8 }, () => make());
}

const table = createTable(board, {
  getDrag: (id) => {
    const loc = locate(id);
    if (!loc) return null;
    if (loc.pile === 'cascade') {
      const col = state.cascades[loc.index];
      return isRun(col, loc.card) ? col.slice(loc.card).map((c) => c.id) : null;
    }
    return [id];
  },
  onTap: (id) => tap(id),
  onDrop: (ids, cx, cy) => {
    const from = locate(ids[0]);
    if (!from) return false;
    const col = nearestColumn(cx, 8, L.colX, L.cw);
    let to;
    if (cy < L.tabY - L.gap) {
      to = col < 4 ? { pile: 'cell', index: col } : { pile: 'foundation', index: Math.floor(ids[0] / 13) };
    } else {
      to = { pile: 'cascade', index: col };
    }
    return commit(() => move(state, from, to));
  },
});

for (let suit = 0; suit < 4; suit++) {
  for (let rank = 1; rank <= 13; rank++) table.addCard(suit * 13 + rank - 1, suit, rank);
}

function locate(id) {
  for (let index = 0; index < 8; index++) {
    const card = state.cascades[index].findIndex((c) => c.id === id);
    if (card >= 0) return { pile: 'cascade', index, card };
  }
  const cell = state.cells.findIndex((c) => c?.id === id);
  if (cell >= 0) return { pile: 'cell', index: cell };
  const suit = Math.floor(id / 13);
  const f = state.foundations[suit];
  if (f.length && f[f.length - 1].id === id) return { pile: 'foundation', index: suit };
  return null;
}

function render() {
  measure();
  const size = (el, x, y) => {
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.width = `${L.cw}px`;
    el.style.height = `${L.ch}px`;
  };
  slots.cells.forEach((el, i) => size(el, L.colX(i), L.topY));
  slots.foundations.forEach((el, i) => size(el, L.colX(4 + i), L.topY));
  slots.cascades.forEach((el, i) => size(el, L.colX(i), L.tabY));

  state.cells.forEach((c, i) => c && table.place(c.id, L.colX(i), L.topY, 10));
  state.foundations.forEach((f, i) => f.forEach((c, k) => table.place(c.id, L.colX(4 + i), L.topY, k)));
  const room = L.H - L.tabY - L.ch - L.gap;
  state.cascades.forEach((col, i) => {
    const step = Math.min(L.ch * 0.3, col.length > 1 ? room / (col.length - 1) : L.ch);
    col.forEach((c, k) => table.place(c.id, L.colX(i), L.tabY + k * step, 100 + k));
  });

  $('deal-no').textContent = `#${state.number}`;
  $('moves').textContent = `${state.moves} move${state.moves === 1 ? '' : 's'}`;
  $('undo-btn').disabled = !history.length;
  $('timer').textContent = formatTime(state.elapsedMs);
}
window.addEventListener('resize', () => state && render());

// ---------- moves ----------

function commit(mutate) {
  const before = clone(state);
  if (!mutate()) return false;
  if (before.moves === 0) {
    const r = record();
    r.played++;
    store(RECORD_KEY, r);
  }
  history.push(before);
  if (history.length > MAX_UNDO) history.shift();
  vibrate(8);
  save();
  render();
  scheduleAuto();
  if (state.status === 'won') onWin();
  return true;
}

// Send safe cards home one at a time so you can see them go.
function scheduleAuto() {
  clearTimeout(autoTimer);
  autoTimer = setTimeout(() => {
    if (state.status !== 'playing' || table.isDragging()) return;
    const step = autoStep(state);
    if (!step) return;
    move(state, step.from, step.to);
    save();
    render();
    if (state.status === 'won') onWin();
    else scheduleAuto();
  }, 160);
}

function tap(id) {
  const from = locate(id);
  if (!from || state.status !== 'playing') return;
  // Tapping a card under a run moves the run from that card if possible.
  const to = bestTarget(state, from);
  if (!to || !commit(() => move(state, from, to))) table.nope(id);
}

function undo() {
  clearTimeout(autoTimer);
  const prev = history.pop();
  if (!prev) return;
  state = prev;
  save();
  render();
}

function onWin() {
  vibrate([40, 60, 40, 60, 120]);
  const r = record();
  r.won++;
  const isBest = r.best == null || state.elapsedMs < r.best;
  if (isBest) r.best = state.elapsedMs;
  store(RECORD_KEY, r);
  fillStats($('win-stats'), [
    ['Deal', `#${state.number}`],
    ['Time', `${formatTime(state.elapsedMs)}${isBest ? ' ★ best!' : ''}`],
    ['Moves', state.moves],
    ['Games won', `${r.won} of ${r.played}`],
  ]);
  setTimeout(() => $('win').showModal(), 600);
}

function startGame(number = randomDealNumber()) {
  clearTimeout(autoTimer);
  state = deal(number);
  history = [];
  save();
  render();
}

function showHint() {
  const hint = findHint(state);
  if (!hint) {
    toast('No simple moves. Try using a free cell, or Undo.');
    return;
  }
  const cards = hint.from.pile === 'cascade'
    ? state.cascades[hint.from.index].slice(hint.from.card)
    : [state.cells[hint.from.index]];
  cards.forEach((c) => table.flash(table.els.get(c.id)));
  const dest = hint.to.pile === 'foundation' ? state.foundations[hint.to.index] : state.cascades[hint.to.index];
  const last = dest[dest.length - 1];
  table.flash(last ? table.els.get(last.id) : hint.to.pile === 'foundation' ? slots.foundations[hint.to.index] : slots.cascades[hint.to.index]);
}

// ---------- buttons & dialogs ----------

const inProgress = () => state.moves > 0 && state.status === 'playing';

$('undo-btn').addEventListener('click', undo);
$('hint-btn').addEventListener('click', showHint);
$('new-btn').addEventListener('click', () => {
  if (inProgress() && !confirm('Deal a new game?')) return;
  startGame();
});
$('again-btn').addEventListener('click', () => {
  $('win').close();
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
$('random-btn').addEventListener('click', () => {
  $('menu').close();
  startGame();
});
$('pick-btn').addEventListener('click', () => {
  const n = Number(prompt('Deal number (1 to 1,000,000):', String(state.number)));
  if (!Number.isInteger(n) || n < 1 || n > MAX_DEAL) return;
  $('menu').close();
  startGame(n);
});
$('restart-btn').addEventListener('click', () => {
  $('menu').close();
  history.push(clone(state));
  const elapsed = state.elapsedMs;
  state = deal(state.number);
  state.elapsedMs = elapsed;
  save();
  render();
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

buildSlots();
const saved = load(SAVE_KEY, null);
if (saved?.state?.cascades && saved.state.status === 'playing') {
  state = saved.state;
  history = saved.history ?? [];
  render();
  scheduleAuto();
} else {
  startGame();
}

registerServiceWorker();
