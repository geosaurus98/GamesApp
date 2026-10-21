import {
  LEVELS, row, col, box, newGame, isGiven, isWrong, setValue, toggleNote, erase, hint, digitCounts,
} from './logic.js';
import {
  load, store, formatTime, toast, vibrate, fillStats, registerServiceWorker,
} from '../../shared/util.js';

const SAVE_KEY = 'sudoku.save.v1';
const BEST_KEY = 'sudoku.best.v1';
const SETTINGS_KEY = 'sudoku.settings.v1';
const MAX_UNDO = 200;

const $ = (id) => document.getElementById(id);

let state = null;
let selected = -1;
let notesMode = false;
let history = [];
let settings = { showMistakes: true, level: 'easy', ...load(SETTINGS_KEY, {}) };

const save = () => store(SAVE_KEY, { state, history: history.slice(-50) });

// ---------- build ----------

const cells = [];
function buildGrid() {
  const grid = $('grid');
  for (let i = 0; i < 81; i++) {
    const el = document.createElement('div');
    el.className = 'cell';
    el.dataset.i = i;
    el.setAttribute('role', 'gridcell');
    cells.push(el);
    grid.append(el);
  }
}

const padButtons = [];
function buildPad() {
  for (let v = 1; v <= 9; v++) {
    const b = document.createElement('button');
    b.className = 'num';
    b.dataset.v = v;
    b.textContent = v;
    const left = document.createElement('small');
    b.append(left);
    padButtons.push(b);
    $('pad').append(b);
  }
}

// ---------- rendering ----------

function render() {
  const sel = selected;
  const selVal = sel >= 0 ? state.values[sel] : 0;
  cells.forEach((el, i) => {
    const v = state.values[i];
    let cls = 'cell';
    if (col(i) === 2 || col(i) === 5) cls += ' br';
    if (row(i) === 2 || row(i) === 5) cls += ' bb';
    if (isGiven(state, i)) cls += ' given';
    if (sel >= 0 && i !== sel && (row(i) === row(sel) || col(i) === col(sel) || box(i) === box(sel))) cls += ' peer';
    if (selVal && v === selVal && i !== sel) cls += ' same';
    if (i === sel) cls += ' selected';
    if (settings.showMistakes && isWrong(state, i)) cls += ' wrong';
    const keep = el.classList.contains('pop') ? ' pop' : el.classList.contains('flash') ? ' flash' : '';
    el.className = cls + keep;

    if (v) {
      if (el.textContent !== String(v) || el.firstChild?.nodeType !== 3) el.textContent = v;
    } else if (state.notes[i]) {
      const notes = document.createElement('div');
      notes.className = 'notes';
      for (let n = 1; n <= 9; n++) {
        const s = document.createElement('span');
        if (state.notes[i] & (1 << n)) {
          s.textContent = n;
          if (n === selVal) s.className = 'hl';
        }
        notes.append(s);
      }
      el.replaceChildren(notes);
    } else {
      el.textContent = '';
    }
  });

  const counts = digitCounts(state);
  padButtons.forEach((b, k) => {
    const v = k + 1;
    b.classList.toggle('done', counts[v] >= 9);
    b.lastChild.textContent = counts[v] >= 9 ? '' : 9 - counts[v];
  });
  $('pad').classList.toggle('notes-on', notesMode);
  $('notes-btn').setAttribute('aria-pressed', String(notesMode));
  $('notes-state').textContent = notesMode ? 'ON' : 'OFF';
  $('undo-btn').disabled = !history.length;
  $('level').textContent = LEVELS[state.level].label;
  $('mistakes').textContent = `Mistakes: ${state.mistakes}`;
  renderTimer();
}

function renderTimer() {
  $('timer').textContent = formatTime(state.elapsedMs);
}

function animate(i, cls) {
  const el = cells[i];
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
}

// ---------- actions ----------

function snapshot() {
  history.push({ values: [...state.values], notes: [...state.notes], mistakes: state.mistakes, hints: state.hints });
  if (history.length > MAX_UNDO) history.shift();
}

function enterNumber(v) {
  if (selected < 0) {
    toast('Tap a square first');
    return;
  }
  if (state.status !== 'playing' || isGiven(state, selected)) return;
  if (notesMode && !state.values[selected]) {
    snapshot();
    toggleNote(state, selected, v);
  } else {
    snapshot();
    const res = setValue(state, selected, v);
    if (!res.changed) {
      history.pop();
      return;
    }
    animate(selected, 'pop');
    if (res.wrong) {
      vibrate([30, 40, 30]);
      if (settings.showMistakes) toast(`That ${v} doesn't go there`, 1200);
    } else {
      vibrate(8);
      flashCompleted(selected);
    }
    if (res.won) onWin();
  }
  save();
  render();
}

// Celebrate finishing a row, column or box.
function flashCompleted(i) {
  const groups = [
    [...Array(81).keys()].filter((k) => row(k) === row(i)),
    [...Array(81).keys()].filter((k) => col(k) === col(i)),
    [...Array(81).keys()].filter((k) => box(k) === box(i)),
  ];
  for (const g of groups) {
    if (g.every((k) => state.values[k] === state.solution[k])) g.forEach((k) => animate(k, 'flash'));
  }
}

function doErase() {
  if (selected < 0) return;
  snapshot();
  if (!erase(state, selected)) {
    history.pop();
    return;
  }
  save();
  render();
}

function doHint() {
  if (state.status !== 'playing') return;
  snapshot();
  const i = hint(state, selected);
  if (i < 0) {
    history.pop();
    return;
  }
  selected = i;
  animate(i, 'flash');
  flashCompleted(i);
  save();
  render();
  if (state.status === 'won') onWin();
}

function undo() {
  const prev = history.pop();
  if (!prev) return;
  Object.assign(state, prev);
  state.status = 'playing';
  save();
  render();
}

function onWin() {
  vibrate([40, 60, 40, 60, 120]);
  const bests = load(BEST_KEY, {});
  const prev = bests[state.level];
  const clean = state.hints === 0;
  const isBest = clean && (prev == null || state.elapsedMs < prev);
  if (isBest) {
    bests[state.level] = state.elapsedMs;
    store(BEST_KEY, bests);
  }
  const rows = [
    ['Level', LEVELS[state.level].label],
    ['Time', `${formatTime(state.elapsedMs)}${isBest ? ' ★ best!' : ''}`],
    ['Mistakes', state.mistakes],
    ['Hints', state.hints],
  ];
  if (bests[state.level] != null) rows.push(['Best (no hints)', formatTime(bests[state.level])]);
  fillStats($('win-stats'), rows);
  selected = -1;
  render();
  // Ripple across the board before showing the result.
  for (let i = 0; i < 81; i++) setTimeout(() => animate(i, 'flash'), (row(i) + col(i)) * 40);
  setTimeout(() => $('win').showModal(), 1100);
}

function startGame(level = settings.level) {
  settings.level = level;
  store(SETTINGS_KEY, settings);
  state = newGame(level);
  history = [];
  selected = -1;
  save();
  render();
}

// ---------- input ----------

$('grid').addEventListener('click', (e) => {
  const el = e.target.closest('.cell');
  if (!el) return;
  selected = Number(el.dataset.i);
  render();
});

$('pad').addEventListener('click', (e) => {
  const b = e.target.closest('.num');
  if (b) enterNumber(Number(b.dataset.v));
});

$('undo-btn').addEventListener('click', undo);
$('erase-btn').addEventListener('click', doErase);
$('hint-btn').addEventListener('click', doHint);
$('notes-btn').addEventListener('click', () => {
  notesMode = !notesMode;
  render();
});

document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]')) return;
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    undo();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const moves = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 };
  if (/^[1-9]$/.test(e.key)) enterNumber(Number(e.key));
  else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') doErase();
  else if (e.key === 'n') $('notes-btn').click();
  else if (moves[e.key]) {
    if (selected < 0) selected = 40;
    else {
      const next = selected + moves[e.key];
      const sameRow = Math.abs(moves[e.key]) === 1 ? row(next) === row(selected) : true;
      if (next >= 0 && next < 81 && sameRow) selected = next;
    }
    render();
  } else return;
  e.preventDefault();
});

// ---------- menu & dialogs ----------

$('menu-btn').addEventListener('click', () => {
  const bests = load(BEST_KEY, {});
  fillStats($('bests'), Object.entries(LEVELS)
    .filter(([k]) => bests[k] != null)
    .map(([k, l]) => [`Best ${l.label}`, formatTime(bests[k])]));
  $('show-mistakes').checked = settings.showMistakes;
  $('menu').showModal();
});
for (const btn of document.querySelectorAll('[data-level]')) {
  btn.addEventListener('click', () => {
    const playing = state.status === 'playing' && state.values.some((v, i) => v && !isGiven(state, i));
    if (playing && !confirm('Start a new puzzle? Your current one will be lost.')) return;
    $('menu').close();
    startGame(btn.dataset.level);
  });
}
$('show-mistakes').addEventListener('change', (e) => {
  settings.showMistakes = e.target.checked;
  store(SETTINGS_KEY, settings);
  render();
});
$('again-btn').addEventListener('click', () => {
  $('win').close();
  startGame();
});
$('level-btn').addEventListener('click', () => {
  $('win').close();
  startGame();
  $('menu-btn').click();
});
for (const btn of document.querySelectorAll('[data-close]')) {
  btn.addEventListener('click', () => btn.closest('dialog').close());
}
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
}

// ---------- timer ----------

let lastTick = performance.now();
setInterval(() => {
  const now = performance.now();
  if (state?.status === 'playing' && document.visibilityState === 'visible') {
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

buildGrid();
buildPad();
const saved = load(SAVE_KEY, null);
if (saved?.state?.solution && saved.state.status === 'playing') {
  state = saved.state;
  history = saved.history ?? [];
  render();
} else {
  startGame();
}

registerServiceWorker();
