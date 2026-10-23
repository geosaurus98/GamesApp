import { deal, canPlay, play, draw, cardsLeft, score, playable } from './logic.js';
import { createTable } from '../../shared/cards.js';
import {
  load, store, toast, vibrate, fillStats, registerServiceWorker,
} from '../../shared/util.js';

const SAVE_KEY = 'golf.save.v1';
const RECORD_KEY = 'golf.record.v1';
const SETTINGS_KEY = 'golf.settings.v1';

const $ = (id) => document.getElementById(id);
const tableEl = $('table');
const board = $('board');

let state = null;
let history = [];
const settings = { wrap: true, ...load(SETTINGS_KEY, {}) };

const clone = (s) => JSON.parse(JSON.stringify(s));
const save = () => store(SAVE_KEY, { state, history: history.slice(-60) });
const record = () => ({ played: 0, won: 0, best: null, total: 0, ...load(RECORD_KEY, {}) });

// ---------- layout ----------

let L = null;
function measure() {
  const W = Math.min(tableEl.clientWidth, 560);
  const H = tableEl.clientHeight;
  const gap = Math.max(3, Math.round(W * 0.015));
  // Columns are 5 cards with 0.3 overlap: 2.2 card heights, plus the deck row.
  const cw = Math.min(Math.floor((W - gap * 8) / 7), Math.floor((H - gap * 8 - 24) / (3.4 * 1.4)));
  const ch = Math.round(cw * 1.4);
  const left = Math.round((W - (cw * 7 + gap * 6)) / 2);
  L = {
    W, gap, cw, ch,
    colX: (i) => left + i * (cw + gap),
    colY: gap * 2,
    step: ch * 0.3,
    stockY: gap * 2 + ch * 0.3 * 4 + ch + gap * 4,
  };
  board.style.width = `${W}px`;
  board.style.setProperty('--cw', `${cw}px`);
  board.style.setProperty('--ch', `${ch}px`);
  board.style.setProperty('--corner', `${Math.round(cw * 0.34)}px`);
}

const table = createTable(board, {
  getDrag: (id) => (columnOf(id) >= 0 ? [id] : null),
  onTap: (id) => tapCard(id),
  onDrop: (ids, cx, cy) => {
    const col = columnOf(ids[0]);
    const p = pilePos();
    const near = Math.abs(cx - (p.x + L.cw / 2)) < L.cw * 1.2 && Math.abs(cy - (p.y + L.ch / 2)) < L.ch;
    return col >= 0 && near && act(() => play(state, col));
  },
});
for (let suit = 0; suit < 4; suit++) {
  for (let rank = 1; rank <= 13; rank++) table.addCard(suit * 13 + rank - 1, suit, rank);
}

const stockSlot = document.createElement('div');
stockSlot.className = 'slot clickable';
board.append(stockSlot);
const label = document.createElement('div');
label.className = 'stock-label';
board.append(label);

// Column index if this card is at the bottom of a column (playable spot).
function columnOf(id) {
  return state.columns.findIndex((col) => col.length && col[col.length - 1].id === id);
}

const stockPos = () => ({ x: L.W / 2 - L.cw - L.gap * 3, y: L.stockY });
const pilePos = () => ({ x: L.W / 2 + L.gap * 3, y: L.stockY });

function render() {
  measure();
  const sp = stockPos();
  const pp = pilePos();
  Object.assign(stockSlot.style, { left: `${sp.x}px`, top: `${sp.y}px`, width: `${L.cw}px`, height: `${L.ch}px` });
  label.textContent = `${state.stock.length} in deck`;
  Object.assign(label.style, { left: `${sp.x - L.cw}px`, width: `${L.cw * 3}px`, top: `${sp.y + L.ch + 4}px` });

  const live = new Set(playable(state).map((i) => state.columns[i].at(-1).id));
  state.columns.forEach((col, i) => col.forEach((c, k) => {
    table.place(c.id, L.colX(i), L.colY + k * L.step, 10 + k, true);
    const el = table.els.get(c.id);
    el.classList.toggle('blocked', k < col.length - 1);
    el.classList.toggle('selected', live.has(c.id) && state.status === 'playing' && showMoves);
  }));
  state.stock.forEach((c, k) => {
    table.place(c.id, sp.x, sp.y, 100 + k, false);
    table.els.get(c.id).classList.remove('blocked', 'selected');
  });
  // Spread the last few pile cards so you can see what was played.
  state.pile.forEach((c, k) => {
    const back = state.pile.length - 1 - k;
    table.place(c.id, pp.x + Math.max(0, 2 - back) * L.cw * 0.12, pp.y, 200 + k, true);
    table.els.get(c.id).classList.remove('blocked', 'selected');
  });

  $('left').textContent = `${cardsLeft(state)} left`;
  $('streak').textContent = `Streak ${state.streak}`;
  $('undo-btn').disabled = !history.length;
}
window.addEventListener('resize', () => state && render());

// Hint toggles highlighting of every card you could play.
let showMoves = false;

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
  showMoves = false;
  vibrate(8);
  save();
  render();
  if (state.status !== 'playing') setTimeout(showEnd, 450);
  return true;
}

function tapCard(id) {
  if (state.status !== 'playing') return;
  if (state.stock.some((c) => c.id === id)) {
    act(() => draw(state));
    return;
  }
  const col = columnOf(id);
  if (col < 0 || !canPlay(state, col)) {
    table.nope(id);
    if (col >= 0) toast(state.wrap ? 'Needs to be one higher or lower (K and A connect)' : 'Needs to be one higher or lower than the pile', 1400);
    return;
  }
  act(() => play(state, col));
}

stockSlot.addEventListener('click', () => {
  if (!state.stock.length) toast('The deck is empty');
});

function showEnd() {
  const won = state.status === 'won';
  const r = record();
  const s = score(state);
  r.total += s;
  if (won) r.won++;
  const isBest = r.best == null || s < r.best;
  if (isBest) r.best = s;
  store(RECORD_KEY, r);
  vibrate(won ? [40, 60, 40, 60, 120] : [60, 40, 60]);
  $('end-banner').textContent = won ? '⛳ Cleared! ⛳' : 'Out of moves';
  fillStats($('end-stats'), [
    ['Score', `${s > 0 ? '+' : ''}${s}${isBest ? ' ★ best!' : ''}`],
    ['Longest run', state.bestStreak],
    ['Rounds played', r.played],
    ['Average score', r.played ? (r.total / r.played).toFixed(1) : '–'],
  ]);
  $('end-undo').hidden = won;
  $('end').showModal();
}

function startGame() {
  state = deal(Math.random, settings.wrap);
  history = [];
  showMoves = false;
  save();
  render();
}

function undo() {
  const prev = history.pop();
  if (!prev) return;
  state = prev;
  save();
  render();
}

// ---------- buttons & dialogs ----------

$('undo-btn').addEventListener('click', undo);
$('hint-btn').addEventListener('click', () => {
  if (!playable(state).length) {
    toast(state.stock.length ? 'Nothing fits. Tap the deck.' : 'No moves left');
    if (state.stock.length) table.flash(table.els.get(state.stock.at(-1).id));
    return;
  }
  showMoves = true;
  render();
});
$('new-btn').addEventListener('click', () => {
  if (state.moves > 0 && state.status === 'playing' && !confirm('Deal a new game?')) return;
  startGame();
});
$('menu-btn').addEventListener('click', () => {
  const r = record();
  $('wrap-toggle').checked = settings.wrap;
  fillStats($('record'), r.played ? [
    ['Rounds played', r.played],
    ['Cleared', r.won],
    ...(r.best != null ? [['Best score', r.best]] : []),
  ] : []);
  $('menu').showModal();
});
$('wrap-toggle').addEventListener('change', (e) => {
  settings.wrap = e.target.checked;
  store(SETTINGS_KEY, settings);
  // Applies straight away, including to the game in progress.
  state.wrap = settings.wrap;
  save();
  render();
  toast(settings.wrap ? 'Kings and Aces now connect' : 'Kings and Aces no longer connect', 1500);
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
document.addEventListener('visibilitychange', () => state && save());
window.addEventListener('pagehide', () => state && save());

// ---------- start ----------

const saved = load(SAVE_KEY, null);
if (saved?.state?.columns && saved.state.status === 'playing') {
  state = saved.state;
  history = saved.history ?? [];
  // Games saved before the setting existed follow the current setting.
  if (state.wrap === undefined) state.wrap = settings.wrap;
  render();
} else {
  startGame();
}

registerServiceWorker();
