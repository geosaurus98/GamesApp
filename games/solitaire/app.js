import {
  SUITS, RANKS, isRed, deal, draw, move, bestTarget, canAutoFinish, autoFinishStep, findHint,
} from './logic.js';
import {
  load, store, formatTime, toast, vibrate, fillStats, registerServiceWorker,
} from '../../shared/util.js';

const SAVE_KEY = 'solitaire.save.v1';
const RECORD_KEY = 'solitaire.record.v1';
const DRAW_KEY = 'solitaire.draw.v1';
const MAX_UNDO = 300;
const DRAG_THRESHOLD = 6;

const $ = (id) => document.getElementById(id);
const table = $('table');
const board = $('board');

let state = null;
let initial = null; // the deal, for "restart"
let history = [];
let finishing = false;

// ---------- persistence ----------

const clone = (s) => JSON.parse(JSON.stringify(s));

function save() {
  store(SAVE_KEY, { state, initial, history: history.slice(-50) });
}

function record() {
  return { played: 0, won: 0, best: {}, ...load(RECORD_KEY, {}) };
}

// ---------- layout ----------

let L = null; // layout metrics
const cardEls = new Map();
const slots = {};

function measure() {
  const W = Math.min(table.clientWidth, 560);
  const gap = Math.max(4, Math.round(W * 0.018));
  const cw = Math.floor((W - gap * 8) / 7);
  const ch = Math.round(cw * 1.4);
  const left = Math.round((W - (cw * 7 + gap * 6)) / 2);
  L = {
    W, H: table.clientHeight, gap, cw, ch,
    colX: (i) => left + i * (cw + gap),
    topY: gap,
    tabY: ch + gap * 2.5,
  };
  board.style.width = `${W}px`;
  board.style.setProperty('--cw', `${cw}px`);
  board.style.setProperty('--ch', `${ch}px`);
}

function buildSlots() {
  const make = (cls, text = '') => {
    const el = document.createElement('div');
    el.className = `slot ${cls}`;
    el.textContent = text;
    board.append(el);
    return el;
  };
  slots.stock = make('stock');
  slots.foundations = SUITS.map((s) => make('foundation', s));
  slots.tableau = Array.from({ length: 7 }, () => make('column'));
}

function buildCards() {
  for (let suit = 0; suit < 4; suit++) {
    for (let rank = 1; rank <= 13; rank++) {
      const el = document.createElement('div');
      el.className = `card${isRed({ suit }) ? ' red' : ''}`;
      el.dataset.id = suit * 13 + rank - 1;
      const corner = document.createElement('span');
      corner.className = 'corner';
      corner.append(RANKS[rank]);
      const small = document.createElement('small');
      small.textContent = SUITS[suit];
      corner.append(small);
      const pip = document.createElement('span');
      pip.className = 'pip';
      pip.textContent = SUITS[suit];
      el.append(corner, pip);
      el.setAttribute('aria-label', `${RANKS[rank]} of ${['spades', 'hearts', 'diamonds', 'clubs'][suit]}`);
      board.append(el);
      cardEls.set(el.dataset.id * 1, el);
    }
  }
}

const place = (el, x, y) => {
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
};

// Tableau spacing shrinks when a column would run off the bottom.
function columnOffsets(col) {
  const room = L.H - L.tabY - L.ch - L.gap;
  let down = L.ch * 0.12;
  let up = L.ch * 0.28;
  const downs = col.filter((c) => !c.up).length;
  const ups = Math.max(0, col.length - downs - 1);
  const need = downs * down + ups * up;
  if (need > room && need > 0) {
    const k = room / need;
    down *= k;
    up *= k;
  }
  return { down, up };
}

// Computes each card's spot. Returns id -> { x, y, z, loc }.
function positions() {
  const pos = new Map();
  state.stock.forEach((c, i) => pos.set(c.id, { x: L.colX(0), y: L.topY, z: i, loc: { pile: 'stock' } }));
  const fanFrom = Math.max(0, state.waste.length - (state.drawCount === 3 ? 3 : 1));
  state.waste.forEach((c, i) => {
    const k = Math.max(0, i - fanFrom);
    pos.set(c.id, { x: L.colX(1) + k * L.cw * 0.4, y: L.topY, z: i, loc: { pile: 'waste', at: i } });
  });
  state.foundations.forEach((f, index) => {
    f.forEach((c, i) => pos.set(c.id, { x: L.colX(3 + index), y: L.topY, z: i, loc: { pile: 'foundation', index, at: i } }));
  });
  state.tableau.forEach((col, index) => {
    const off = columnOffsets(col);
    let y = L.tabY;
    col.forEach((c, i) => {
      pos.set(c.id, { x: L.colX(index), y, z: 100 + i, loc: { pile: 'tableau', index, card: i } });
      y += c.up ? off.up : off.down;
    });
  });
  return pos;
}

let pos = new Map();
function render() {
  measure();
  place(slots.stock, L.colX(0), L.topY);
  slots.stock.textContent = state.stock.length ? '' : state.waste.length ? '↻' : '';
  slots.foundations.forEach((el, i) => place(el, L.colX(3 + i), L.topY));
  slots.tableau.forEach((el, i) => place(el, L.colX(i), L.tabY));
  for (const el of Object.values(slots).flat()) {
    el.style.width = `${L.cw}px`;
    el.style.height = `${L.ch}px`;
  }

  const all = [...state.stock, ...state.waste, ...state.foundations.flat(), ...state.tableau.flat()];
  pos = positions();
  for (const c of all) {
    const el = cardEls.get(c.id);
    const p = pos.get(c.id);
    el.classList.toggle('down', !c.up);
    el.style.transform = `translate(${p.x}px, ${p.y}px)`;
    el.style.zIndex = p.z;
  }

  $('moves').textContent = `${state.moves} move${state.moves === 1 ? '' : 's'}`;
  $('undo-btn').disabled = history.length === 0;
  $('finish-btn').hidden = !canAutoFinish(state);
  renderTimer();
}

function renderTimer() {
  $('timer').textContent = formatTime(state.elapsedMs);
}

window.addEventListener('resize', () => state && render());

// ---------- actions ----------

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
  save();
  render();
  if (state.status === 'won') onWin();
  return true;
}

function nope(id) {
  const el = cardEls.get(id);
  el.classList.remove('nope');
  void el.offsetWidth;
  el.classList.add('nope');
}

function tapCard(id) {
  const p = pos.get(id);
  if (!p || finishing) return;
  if (p.loc.pile === 'stock') return commit(() => draw(state));
  const from = locFrom(p.loc);
  if (!from) return;
  const to = bestTarget(state, from);
  if (to && commit(() => move(state, from, to))) vibrate(8);
  else nope(id);
}

// Turns a card position into a move source (only top cards outside the tableau).
function locFrom(loc) {
  if (loc.pile === 'waste') return loc.at === state.waste.length - 1 ? { pile: 'waste' } : null;
  if (loc.pile === 'foundation') {
    return loc.at === state.foundations[loc.index].length - 1 ? { pile: 'foundation', index: loc.index } : null;
  }
  if (loc.pile === 'tableau') return state.tableau[loc.index][loc.card].up ? { ...loc } : null;
  return null;
}

function undo() {
  if (!history.length || finishing) return;
  state = history.pop();
  save();
  render();
}

function autoFinish() {
  if (finishing) return;
  finishing = true;
  const step = () => {
    const s = autoFinishStep(state);
    if (!s || state.status === 'won') {
      finishing = false;
      render();
      return;
    }
    history.push(clone(state));
    move(state, s.from, s.to);
    save();
    render();
    if (state.status === 'won') {
      finishing = false;
      onWin();
      return;
    }
    setTimeout(step, 70);
  };
  step();
}

function onWin() {
  vibrate([40, 60, 40, 60, 120]);
  const r = record();
  r.won++;
  const key = `draw${state.drawCount}`;
  const prev = r.best[key];
  const isBest = !prev || state.elapsedMs < prev.time;
  if (isBest) r.best[key] = { time: state.elapsedMs, moves: state.moves };
  store(RECORD_KEY, r);
  fillStats($('win-stats'), [
    ['Mode', `Draw ${state.drawCount}`],
    ['Time', `${formatTime(state.elapsedMs)}${isBest ? ' ★ best!' : ''}`],
    ['Moves', state.moves],
    ['Games won', `${r.won} of ${r.played}`],
  ]);
  // Bounce the foundation kings for a little celebration.
  state.foundations.forEach((f) => cardEls.get(f[12].id)?.classList.add('hint'));
  setTimeout(() => $('win').showModal(), 900);
}

function startGame(drawCount = load(DRAW_KEY, 1)) {
  store(DRAW_KEY, drawCount);
  state = deal(Math.random, drawCount);
  initial = clone(state);
  history = [];
  save();
  for (const el of cardEls.values()) el.classList.remove('hint');
  render();
}

function showHint() {
  const hint = findHint(state);
  if (!hint) {
    toast('No moves left. Try Undo or a new game.');
    return;
  }
  if (hint.draw) {
    flash(state.stock.length ? cardEls.get(state.stock.at(-1).id) : slots.stock);
    toast('Turn over a card from the deck');
    return;
  }
  const fromCards = hint.from.pile === 'tableau'
    ? state.tableau[hint.from.index].slice(hint.from.card ?? -1)
    : [hint.from.pile === 'waste' ? state.waste.at(-1) : state.foundations[hint.from.index].at(-1)];
  fromCards.forEach((c) => flash(cardEls.get(c.id)));
  const dest = hint.to.pile === 'foundation' ? state.foundations[hint.to.index] : state.tableau[hint.to.index];
  flash(dest.length ? cardEls.get(dest.at(-1).id) : hint.to.pile === 'foundation' ? slots.foundations[hint.to.index] : slots.tableau[hint.to.index]);
}

function flash(el) {
  el.classList.remove('hint');
  void el.offsetWidth;
  el.classList.add('hint');
  el.addEventListener('animationend', () => el.classList.remove('hint'), { once: true });
}

// ---------- drag & tap ----------

let drag = null;

board.addEventListener('pointerdown', (e) => {
  if (finishing || state.status !== 'playing') return;
  if (e.target.closest('.slot.stock')) {
    commit(() => draw(state));
    return;
  }
  const el = e.target.closest('.card');
  if (!el) return;
  const id = Number(el.dataset.id);
  const p = pos.get(id);
  const from = p.loc.pile === 'stock' ? null : locFrom(p.loc);
  const ids = from?.pile === 'tableau'
    ? state.tableau[from.index].slice(from.card).map((c) => c.id)
    : [id];
  e.preventDefault();
  el.setPointerCapture(e.pointerId);
  drag = { id, from, ids, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, moved: false };
});

window.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.pointerId || !drag.from) return;
  drag.dx = e.clientX - drag.x0;
  drag.dy = e.clientY - drag.y0;
  if (!drag.moved && Math.hypot(drag.dx, drag.dy) < DRAG_THRESHOLD) return;
  drag.moved = true;
  for (const id of drag.ids) {
    const el = cardEls.get(id);
    const p = pos.get(id);
    el.classList.add('dragging');
    el.style.transform = `translate(${p.x + drag.dx}px, ${p.y + drag.dy}px)`;
    el.style.zIndex = 500 + p.z;
  }
});

function dropTarget() {
  const p = pos.get(drag.id);
  const cx = p.x + drag.dx + L.cw / 2;
  const cy = p.y + drag.dy + L.ch / 2;
  let col = 0;
  let best = Infinity;
  for (let i = 0; i < 7; i++) {
    const d = Math.abs(L.colX(i) + L.cw / 2 - cx);
    if (d < best) {
      best = d;
      col = i;
    }
  }
  // Any drop on the foundation row goes to that card's suit pile (ids are suit * 13 + rank - 1).
  if (cy < L.tabY && col >= 3) return { pile: 'foundation', index: Math.floor(drag.id / 13) };
  if (cy >= L.tabY - L.gap) return { pile: 'tableau', index: col };
  return null;
}

window.addEventListener('pointerup', (e) => {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const d = drag;
  if (!d.moved) {
    drag = null;
    tapCard(d.id);
    return;
  }
  const to = dropTarget();
  drag = null;
  for (const id of d.ids) cardEls.get(id).classList.remove('dragging');
  if (!(to && commit(() => move(state, d.from, to)))) render();
  else vibrate(8);
});

window.addEventListener('pointercancel', () => {
  if (!drag) return;
  for (const id of drag.ids) cardEls.get(id).classList.remove('dragging');
  drag = null;
  render();
});

// ---------- buttons & dialogs ----------

$('undo-btn').addEventListener('click', undo);
$('hint-btn').addEventListener('click', showHint);
$('finish-btn').addEventListener('click', autoFinish);
$('new-btn').addEventListener('click', () => {
  if (state.moves > 0 && state.status === 'playing' && !confirm('Deal a new game?')) return;
  startGame();
});
$('again-btn').addEventListener('click', () => {
  $('win').close();
  startGame();
});

$('menu-btn').addEventListener('click', () => {
  const r = record();
  const rows = [['Games won', `${r.won} of ${r.played}`]];
  for (const n of [1, 3]) {
    const b = r.best[`draw${n}`];
    if (b) rows.push([`Best Draw ${n}`, `${formatTime(b.time)} · ${b.moves} moves`]);
  }
  fillStats($('record'), r.played ? rows : []);
  $('menu').showModal();
});
for (const btn of document.querySelectorAll('[data-draw]')) {
  btn.addEventListener('click', () => {
    $('menu').close();
    startGame(Number(btn.dataset.draw));
  });
}
$('restart-btn').addEventListener('click', () => {
  $('menu').close();
  if (!initial) return;
  history.push(clone(state));
  state = clone(initial);
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
    renderTimer();
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
buildCards();
const saved = load(SAVE_KEY, null);
if (saved?.state?.tableau && saved.state.status === 'playing') {
  state = saved.state;
  initial = saved.initial;
  history = saved.history ?? [];
  render();
} else {
  startGame();
}

registerServiceWorker();
