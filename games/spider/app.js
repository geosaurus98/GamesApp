import {
  SUIT_SETS, newGame, isRun, move, dealRow, bestTarget, findHint,
} from './logic.js';
import { createTable, nearestColumn, SUITS, isRed } from '../../shared/cards.js';
import {
  load, store, formatTime, toast, vibrate, fillStats, registerServiceWorker,
} from '../../shared/util.js';

const SAVE_KEY = 'spider.save.v1';
const RECORD_KEY = 'spider.record.v1';
const SUITS_KEY = 'spider.suits.v1';
const MAX_UNDO = 300;

const $ = (id) => document.getElementById(id);
const tableEl = $('table');
const board = $('board');

let state = null;
let history = [];
let built = 0; // which suit mix the card elements were built for

const clone = (s) => JSON.parse(JSON.stringify(s));
const save = () => store(SAVE_KEY, { state, history: history.slice(-40) });
const record = () => ({ ...load(RECORD_KEY, {}) });

// ---------- layout ----------

let L = null;
function measure() {
  const W = Math.min(tableEl.clientWidth, 640);
  const gap = Math.max(2, Math.round(W * 0.01));
  const cw = Math.floor((W - gap * 11) / 10);
  const ch = Math.round(cw * 1.45);
  const left = Math.round((W - (cw * 10 + gap * 9)) / 2);
  L = {
    W, H: tableEl.clientHeight, gap, cw, ch, left,
    colX: (i) => left + i * (cw + gap),
    topY: gap * 2,
    tabY: ch + gap * 5,
  };
  board.style.width = `${W}px`;
  board.style.setProperty('--cw', `${cw}px`);
  board.style.setProperty('--ch', `${ch}px`);
  // Narrow cards: make the corner rank bigger so it stays readable.
  board.style.setProperty('--corner', `${Math.round(cw * 0.42)}px`);
}

let table = null;
const slots = { columns: [], done: [] };
let dealsLabel = null;

function build() {
  board.replaceChildren();
  table = createTable(board, {
    getDrag: (id) => {
      const loc = locate(id);
      if (!loc) return null;
      const col = state.tableau[loc.index];
      return isRun(col, loc.card) ? col.slice(loc.card).map((c) => c.id) : null;
    },
    onTap: (id) => tap(id),
    onDrop: (ids, cx, cy) => {
      const from = locate(ids[0]);
      if (!from || cy < L.tabY - L.gap * 2) return false;
      const to = nearestColumn(cx, 10, L.colX, L.cw);
      return act(() => move(state, from, to));
    },
  });
  slots.columns = Array.from({ length: 10 }, () => {
    const el = document.createElement('div');
    el.className = 'slot';
    board.append(el);
    return el;
  });
  slots.done = Array.from({ length: 8 }, () => {
    const el = document.createElement('div');
    el.className = 'slot done-pile';
    board.append(el);
    return el;
  });
  dealsLabel = document.createElement('div');
  dealsLabel.className = 'deals-left';
  board.append(dealsLabel);
  // Ids follow newGame's order (suit by suit, 13 ranks per copy), so every
  // card's face is known even after its run has left the table.
  const suits = SUIT_SETS[state.suitCount];
  const perSuit = 104 / suits.length;
  for (let id = 0; id < 104; id++) table.addCard(id, suits[Math.floor(id / perSuit)], (id % 13) + 1);
  built = state.suitCount;
}

function locate(id) {
  for (let index = 0; index < 10; index++) {
    const card = state.tableau[index].findIndex((c) => c.id === id);
    if (card >= 0) return { index, card };
  }
  return null;
}

function render() {
  if (built !== state.suitCount || !table) build();
  measure();
  const box = (el, x, y, w = L.cw) => {
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.width = `${w}px`;
    el.style.height = `${L.ch}px`;
  };
  slots.columns.forEach((el, i) => box(el, L.colX(i), L.tabY));

  // Finished runs at the top left, slightly fanned.
  const fan = Math.min(L.cw * 0.45, (L.W * 0.55 - L.cw) / 7);
  slots.done.forEach((el, i) => {
    const suit = state.done[i];
    el.hidden = suit == null;
    if (suit == null) return;
    box(el, L.colX(0) + i * fan, L.topY);
    el.textContent = `K${SUITS[suit]}`;
    el.classList.toggle('red', isRed(suit));
    el.style.zIndex = i;
  });

  const seen = new Set();
  // Stock at the top right: one stacked back per remaining deal.
  const deals = Math.ceil(state.stock.length / 10);
  state.stock.forEach((c, i) => {
    const group = Math.floor(i / 10);
    const x = L.colX(9) - (deals - 1 - group) * L.cw * 0.28;
    table.place(c.id, x, L.topY, 200 + i, false);
    seen.add(c.id);
  });
  dealsLabel.textContent = deals ? `${deals} deal${deals === 1 ? '' : 's'}` : '';
  // Label sits just left of the stock, level with its middle.
  const labelRight = L.colX(9) - Math.max(0, deals - 1) * L.cw * 0.28 - 6;
  dealsLabel.style.left = `${labelRight - 80}px`;
  dealsLabel.style.top = `${L.topY + L.ch / 2 - 8}px`;
  dealsLabel.style.width = '80px';

  const room = L.H - L.tabY - L.ch - L.gap;
  state.tableau.forEach((col, index) => {
    let down = L.ch * 0.1;
    let up = L.ch * 0.27;
    const downs = col.filter((c) => !c.up).length;
    const ups = Math.max(0, col.length - downs - 1);
    const need = downs * down + ups * up;
    if (need > room) {
      const k = room / need;
      down *= k;
      up *= k;
    }
    let y = L.tabY;
    col.forEach((c, k) => {
      table.show(c.id);
      table.place(c.id, L.colX(index), y, 300 + k, c.up);
      seen.add(c.id);
      y += c.up ? up : down;
    });
  });
  for (const [id] of table.els) {
    if (!seen.has(id)) table.hide(id);
  }

  $('suits-label').textContent = `${state.suitCount} suit${state.suitCount === 1 ? '' : 's'}`;
  $('moves').textContent = `${state.moves} move${state.moves === 1 ? '' : 's'}`;
  $('undo-btn').disabled = !history.length;
  $('deal-btn').disabled = !state.stock.length;
  $('timer').textContent = formatTime(state.elapsedMs);
}
window.addEventListener('resize', () => state && render());

// ---------- moves ----------

function act(mutate) {
  const before = clone(state);
  const res = mutate();
  if (!(res.moved || res.ok)) {
    if (res.message) toast(res.message);
    return false;
  }
  if (before.moves === 0) {
    const r = record();
    const key = `s${state.suitCount}`;
    r[key] = { played: 0, won: 0, ...r[key] };
    r[key].played++;
    store(RECORD_KEY, r);
  }
  history.push(before);
  if (history.length > MAX_UNDO) history.shift();
  if (res.completed) {
    vibrate([30, 40, 60]);
    toast('Run complete! 🕷️');
  } else {
    vibrate(8);
  }
  save();
  render();
  if (state.status === 'won') onWin();
  return true;
}

function tap(id) {
  if (state.status !== 'playing') return;
  if (state.stock.some((c) => c.id === id)) {
    act(() => dealRow(state));
    return;
  }
  const from = locate(id);
  if (!from) return;
  const to = bestTarget(state, from);
  if (to == null || !act(() => move(state, from, to))) table.nope(id);
}

function undo() {
  const prev = history.pop();
  if (!prev) return;
  state = prev;
  save();
  render();
}

function onWin() {
  vibrate([40, 60, 40, 60, 120]);
  const r = record();
  const key = `s${state.suitCount}`;
  const rec = { played: 1, won: 0, ...r[key] };
  rec.won++;
  const isBest = rec.best == null || state.elapsedMs < rec.best;
  if (isBest) rec.best = state.elapsedMs;
  r[key] = rec;
  store(RECORD_KEY, r);
  fillStats($('win-stats'), [
    ['Suits', state.suitCount],
    ['Time', `${formatTime(state.elapsedMs)}${isBest ? ' ★ best!' : ''}`],
    ['Moves', state.moves],
    ['Games won', `${rec.won} of ${rec.played}`],
  ]);
  setTimeout(() => $('win').showModal(), 500);
}

function startGame(suits = load(SUITS_KEY, 1)) {
  store(SUITS_KEY, suits);
  state = newGame(suits);
  history = [];
  built = 0; // card faces depend on the suit mix
  save();
  render();
}

function showHint() {
  const hint = findHint(state);
  if (!hint) {
    toast('No moves left. Try Undo or a new game.');
    return;
  }
  if (hint.deal) {
    if (state.tableau.some((c) => !c.length)) {
      toast('Move a card into the empty column, then deal');
      return;
    }
    toast('Deal more cards');
    table.flash(table.els.get(state.stock[state.stock.length - 1].id));
    return;
  }
  state.tableau[hint.from.index].slice(hint.from.card).forEach((c) => table.flash(table.els.get(c.id)));
  const dest = state.tableau[hint.to];
  table.flash(dest.length ? table.els.get(dest[dest.length - 1].id) : slots.columns[hint.to]);
}

// ---------- buttons & dialogs ----------

$('undo-btn').addEventListener('click', undo);
$('hint-btn').addEventListener('click', showHint);
$('deal-btn').addEventListener('click', () => act(() => dealRow(state)));
$('new-btn').addEventListener('click', () => {
  if (state.moves > 0 && state.status === 'playing' && !confirm('Start a new game?')) return;
  startGame();
});
$('again-btn').addEventListener('click', () => {
  $('win').close();
  startGame();
});
$('menu-btn').addEventListener('click', () => {
  const r = record();
  const rows = [];
  for (const n of [1, 2, 4]) {
    const rec = r[`s${n}`];
    if (rec?.played) rows.push([`${n} suit${n > 1 ? 's' : ''}`, `won ${rec.won} of ${rec.played}${rec.best != null ? ` · best ${formatTime(rec.best)}` : ''}`]);
  }
  fillStats($('record'), rows);
  $('menu').showModal();
});
for (const btn of document.querySelectorAll('[data-suits]')) {
  btn.addEventListener('click', () => {
    $('menu').close();
    startGame(Number(btn.dataset.suits));
  });
}
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
if (saved?.state?.tableau && saved.state.status === 'playing') {
  state = saved.state;
  history = saved.history ?? [];
  render();
} else {
  startGame();
}

registerServiceWorker();
