import { newGame, move, maxTile } from './logic.js';
import { load, store, toast, vibrate, fillStats, registerServiceWorker } from '../../shared/util.js';

const SAVE_KEY = '2048.save.v1';
const BEST_KEY = '2048.best.v1';
const SWIPE_MIN = 24;

const $ = (id) => document.getElementById(id);
const board = $('board');

let state = null;
let undoState = null;
let best = load(BEST_KEY, 0);
const tileEls = new Map(); // tile id -> element
let pending = null; // move animation waiting to finish

function save() {
  store(SAVE_KEY, { state, undoState });
}

// ---------- rendering ----------

function setPos(el, tile) {
  el.style.setProperty('--r', tile.r);
  el.style.setProperty('--c', tile.c);
}

function setValue(el, value) {
  el.textContent = value;
  el.dataset.v = value;
  el.classList.remove('d3', 'd4', 'd5');
  const digits = String(value).length;
  if (digits >= 3) el.classList.add(`d${Math.min(digits, 5)}`);
}

function makeTile(tile, cls) {
  const el = document.createElement('div');
  el.className = 'tile';
  if (cls) el.classList.add(cls);
  setPos(el, tile);
  setValue(el, tile.value);
  board.append(el);
  tileEls.set(tile.id, el);
  return el;
}

function buildCells() {
  const frag = document.createDocumentFragment();
  for (let r = 0; r < state.size; r++) {
    for (let c = 0; c < state.size; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.style.setProperty('--r', r);
      cell.style.setProperty('--c', c);
      frag.append(cell);
    }
  }
  board.replaceChildren(frag);
}

// Rebuild everything without animation (load, new game, undo).
function renderAll(animateNew = false) {
  pending = null;
  tileEls.clear();
  buildCells();
  for (const t of state.tiles) makeTile(t, animateNew ? 'new' : null);
  renderScores();
}

function renderScores(gained = 0) {
  $('score').textContent = state.score;
  if (state.score > best) {
    best = state.score;
    store(BEST_KEY, best);
  }
  $('best').textContent = best;
  $('undo-btn').disabled = !undoState;
  if (gained) {
    const plus = document.createElement('span');
    plus.className = 'plus';
    plus.textContent = `+${gained}`;
    $('score').parentElement.append(plus);
    plus.addEventListener('animationend', () => plus.remove());
  }
}

// ---------- moves ----------

function finishMove() {
  if (!pending) return;
  const { res } = pending;
  clearTimeout(pending.timer);
  pending = null;
  for (const t of res.removed) {
    tileEls.get(t.id)?.remove();
    tileEls.delete(t.id);
  }
  for (const t of state.tiles) {
    const el = tileEls.get(t.id);
    if (!el) continue;
    if (res.merged.includes(t.id)) {
      setValue(el, t.value);
      el.classList.remove('merged', 'new');
      void el.offsetWidth; // restart the pop animation
      el.classList.add('merged');
    }
  }
  if (res.spawned) makeTile(res.spawned, 'new');
  renderScores(res.gained);

  if (res.justWon) {
    vibrate([40, 60, 120]);
    $('win').showModal();
  } else if (state.over) {
    vibrate([60, 40, 60]);
    showGameOver();
  }
}

function doMove(dir) {
  if (document.querySelector('dialog[open]')) return;
  finishMove();
  const res = move(state, dir);
  if (!res) return;
  undoState = state;
  state = res.state;
  if (res.merged.length) vibrate(8);

  // Slide surviving tiles and the ones about to merge into them.
  for (const t of state.tiles) {
    const el = tileEls.get(t.id);
    if (el) setPos(el, t);
  }
  for (const t of res.removed) {
    const el = tileEls.get(t.id);
    if (el) setPos(el, t);
  }
  pending = { res, timer: setTimeout(finishMove, 115) };
  save();
}

function showGameOver() {
  fillStats($('over-stats'), [
    ['Score', state.score],
    ['Best', best],
    ['Biggest tile', maxTile(state)],
    ['Moves', state.moves],
  ]);
  $('over').showModal();
}

function startGame() {
  state = newGame();
  undoState = null;
  save();
  renderAll(true);
}

function undo() {
  if (!undoState) return;
  finishMove();
  state = undoState;
  undoState = null;
  save();
  renderAll();
  toast('Took back your last move');
}

// ---------- input ----------

const KEYS = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  a: 'left', d: 'right', w: 'up', s: 'down',
};
document.addEventListener('keydown', (e) => {
  const dir = KEYS[e.key];
  if (!dir) return;
  e.preventDefault();
  doMove(dir);
});

let swipe = null;
$('play').addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  swipe = { id: e.pointerId, x: e.clientX, y: e.clientY };
});
window.addEventListener('pointerup', (e) => {
  if (!swipe || e.pointerId !== swipe.id) return;
  const dx = e.clientX - swipe.x;
  const dy = e.clientY - swipe.y;
  swipe = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
  if (Math.abs(dx) > Math.abs(dy)) doMove(dx > 0 ? 'right' : 'left');
  else doMove(dy > 0 ? 'down' : 'up');
});
window.addEventListener('pointercancel', () => { swipe = null; });

// ---------- buttons & dialogs ----------

$('new-btn').addEventListener('click', () => {
  if (state.moves > 0 && !state.over && !confirm('Start a new game? Your current game will be lost.')) return;
  startGame();
});
$('undo-btn').addEventListener('click', undo);
$('over-undo').addEventListener('click', () => {
  $('over').close();
  undo();
});
$('help-btn').addEventListener('click', () => $('help').showModal());

for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog && dialog.id !== 'over') dialog.close(); // backdrop tap
  });
}
for (const btn of document.querySelectorAll('[data-close]')) {
  btn.addEventListener('click', () => btn.closest('dialog').close());
}
for (const btn of document.querySelectorAll('[data-new]')) {
  btn.addEventListener('click', () => {
    btn.closest('dialog').close();
    startGame();
  });
}

// ---------- start ----------

const saved = load(SAVE_KEY, null);
if (saved?.state?.tiles && !saved.state.over) {
  state = saved.state;
  undoState = saved.undoState ?? null;
  renderAll();
} else {
  startGame();
}

registerServiceWorker();
