import {
  LEVELS, newGame, reveal, chord, toggleFlag, flagsLeft, adjacentMines,
} from './logic.js';
import { load, store, formatTime, toast, vibrate, fillStats, registerServiceWorker } from '../../shared/util.js';

const SAVE_KEY = 'minesweeper.save.v1';
const BEST_KEY = 'minesweeper.best.v1';
const LEVEL_KEY = 'minesweeper.level.v1';
const LONG_PRESS_MS = 350;
const MOVE_CANCEL = 10;

const $ = (id) => document.getElementById(id);
const board = $('board');
const wrap = $('wrap');

let state = null;
let flagMode = false;
let cells = [];

const save = () => store(SAVE_KEY, state);

// ---------- layout ----------

// Size squares so the whole field fits on screen.
function fitBoard() {
  if (!state) return;
  const pad = 12 + 2; // board padding + gap allowance
  const w = (wrap.clientWidth - 16 - pad) / state.cols - 2;
  const h = (wrap.clientHeight - 8 - pad) / state.rows - 2;
  const size = Math.max(18, Math.min(44, Math.floor(Math.min(w, h))));
  board.style.setProperty('--cell', `${size}px`);
}
window.addEventListener('resize', fitBoard);

function buildBoard() {
  board.style.setProperty('--cols', state.cols);
  cells = [];
  const frag = document.createDocumentFragment();
  for (let i = 0; i < state.rows * state.cols; i++) {
    const el = document.createElement('div');
    el.className = 'sq';
    el.dataset.i = i;
    el.setAttribute('role', 'gridcell');
    cells.push(el);
    frag.append(el);
  }
  board.replaceChildren(frag);
  fitBoard();
}

// ---------- rendering ----------

function render() {
  const over = state.status === 'won' || state.status === 'lost';
  const mines = new Set(state.mines);
  for (let i = 0; i < cells.length; i++) {
    const el = cells[i];
    let cls = 'sq';
    let text = '';
    if (state.revealed[i]) {
      cls += ' open';
      if (mines.has(i)) {
        text = '💣';
        if (i === state.exploded) cls += ' boom';
      } else {
        const n = adjacentMines(state, i);
        if (n) {
          text = String(n);
          cls += ` n${n}`;
        }
      }
    } else if (state.flagged[i]) {
      text = over && state.status === 'lost' && !mines.has(i) ? '❌' : '🚩';
    } else if (state.status === 'lost' && mines.has(i)) {
      cls += ' open';
      text = '💣';
    }
    if (el.className.replace(' flag-pop', '') !== cls) el.className = cls;
    if (el.textContent !== text) el.textContent = text;
  }
  $('mines-left').textContent = `💣 ${flagsLeft(state)}`;
  $('face').textContent = { ready: '🙂', playing: '🙂', won: '😎', lost: '😵' }[state.status];
  renderTimer();
}

function renderTimer() {
  $('timer').textContent = `⏱ ${formatTime(state.elapsedMs)}`;
}

function setFlagMode(on) {
  flagMode = on;
  $('mode-dig').classList.toggle('on', !on);
  $('mode-flag').classList.toggle('on', on);
  $('mode-dig').setAttribute('aria-checked', String(!on));
  $('mode-flag').setAttribute('aria-checked', String(on));
}

// ---------- actions ----------

function after(result) {
  if (!result?.changed) return;
  save();
  render();
  if (result.lost) {
    vibrate([80, 50, 120]);
    setTimeout(() => showResult(false), 700);
  } else if (result.won) {
    vibrate([40, 60, 40, 60, 120]);
    setTimeout(() => showResult(true), 400);
  }
}

function dig(i) {
  after(state.revealed[i] ? chord(state, i) : reveal(state, i));
}

function flag(i) {
  if (state.revealed[i]) {
    after(chord(state, i));
    return;
  }
  if (state.status === 'ready') {
    toast('Dig a square first');
    return;
  }
  if (!toggleFlag(state, i)) return;
  vibrate(15);
  save();
  render();
  cells[i].classList.add('flag-pop');
  cells[i].addEventListener('animationend', () => cells[i].classList.remove('flag-pop'), { once: true });
}

function showResult(won) {
  const level = LEVELS[state.level];
  const rows = [['Level', level.label], ['Time', formatTime(state.elapsedMs)]];
  if (won) {
    const bests = load(BEST_KEY, {});
    const prev = bests[state.level];
    const isBest = prev == null || state.elapsedMs < prev;
    if (isBest) {
      bests[state.level] = state.elapsedMs;
      store(BEST_KEY, bests);
    }
    rows[1][1] += isBest ? ' ★ best!' : '';
    rows.push(['Best', formatTime(isBest ? state.elapsedMs : prev)]);
  } else {
    const safe = state.rows * state.cols - state.mineCount;
    const cleared = state.revealed.filter(Boolean).length - 1;
    rows.push(['Cleared', `${Math.round((cleared / safe) * 100)}%`]);
  }
  $('result-banner').textContent = won ? '😎 Cleared!' : '💥 Boom!';
  fillStats($('result-stats'), rows);
  $('result').showModal();
}

function startGame(level = state?.level ?? load(LEVEL_KEY, 'easy')) {
  state = newGame(level);
  store(LEVEL_KEY, state.level);
  save();
  buildBoard();
  render();
}

// ---------- input: tap, long-press, right-click ----------

let press = null;

board.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.sq');
  if (!el || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const i = Number(el.dataset.i);
  el.classList.add('pressing');
  press = {
    i,
    el,
    id: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    long: false,
    timer: setTimeout(() => {
      if (!press) return;
      press.long = true;
      el.classList.remove('pressing');
      // Long-press does the opposite of the current tap mode.
      if (flagMode) dig(i);
      else flag(i);
    }, LONG_PRESS_MS),
  };
});

function endPress() {
  if (!press) return;
  clearTimeout(press.timer);
  press.el.classList.remove('pressing');
  press = null;
}

window.addEventListener('pointermove', (e) => {
  if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_CANCEL) endPress();
});

window.addEventListener('pointerup', (e) => {
  if (!press || e.pointerId !== press.id) return;
  const { i, long } = press;
  endPress();
  if (long) return;
  if (flagMode) flag(i);
  else dig(i);
});

window.addEventListener('pointercancel', endPress);

board.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const el = e.target.closest('.sq');
  // Mouse right-click flags; touch long-press is handled by the timer above.
  if (el && !press) flag(Number(el.dataset.i));
});

// ---------- buttons ----------

$('mode-dig').addEventListener('click', () => setFlagMode(false));
$('mode-flag').addEventListener('click', () => setFlagMode(true));
$('face').addEventListener('click', () => {
  if (state.status === 'playing' && !confirm('Start a new game?')) return;
  startGame();
});

function renderBests() {
  const bests = load(BEST_KEY, {});
  fillStats($('bests'), Object.entries(LEVELS)
    .filter(([k]) => bests[k] != null)
    .map(([k, l]) => [`Best ${l.label}`, formatTime(bests[k])]));
}

$('menu-btn').addEventListener('click', () => {
  renderBests();
  $('menu').showModal();
});

for (const btn of document.querySelectorAll('[data-level]')) {
  btn.addEventListener('click', () => {
    if (state.status === 'playing' && !confirm('Start a new game? Your current game will be lost.')) return;
    $('menu').close();
    startGame(btn.dataset.level);
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
$('again-btn').addEventListener('click', () => {
  $('result').close();
  startGame();
});
$('level-btn').addEventListener('click', () => {
  $('result').close();
  startGame();
  renderBests();
  $('menu').showModal();
});

// ---------- timer ----------

let lastTick = performance.now();
setInterval(() => {
  const now = performance.now();
  if (state?.status === 'playing' && document.visibilityState === 'visible') {
    state.elapsedMs += now - lastTick;
    renderTimer();
  }
  lastTick = now;
}, 250);

document.addEventListener('visibilitychange', () => {
  lastTick = performance.now();
  if (state) save();
});
window.addEventListener('pagehide', () => state && save());

// ---------- start ----------

const saved = load(SAVE_KEY, null);
if (saved && saved.level in LEVELS && Array.isArray(saved.revealed)
    && (saved.status === 'playing' || saved.status === 'ready')) {
  state = saved;
  buildBoard();
  render();
} else {
  startGame();
}

registerServiceWorker();
