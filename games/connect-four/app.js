import {
  COLS, ROWS, LEVELS, newGame, play, undo, canDrop, bestMove,
} from './logic.js';
import { load, store, toast, vibrate, registerServiceWorker } from '../../shared/util.js';

const SAVE_KEY = 'connect4.save.v1';
const COMPUTER = 2; // in computer games the human is always red (1)

const $ = (id) => document.getElementById(id);

// mode: 'easy' | 'medium' | 'hard' | 'two'
let saved = load(SAVE_KEY, null);
let mode = saved?.mode ?? 'medium';
let scores = saved?.scores ?? { 1: 0, 2: 0, draws: 0 };
let nextFirst = saved?.nextFirst ?? 1;
let state = saved?.state ?? newGame(1);
let thinking = false;

const vsComputer = () => mode !== 'two';

function save() {
  store(SAVE_KEY, { mode, scores, nextFirst, state });
}

// ---------- board ----------

const columns = [];
const holes = []; // holes[row][col]
function buildBoard() {
  const board = $('board');
  for (let r = 0; r < ROWS; r++) holes.push([]);
  for (let c = 0; c < COLS; c++) {
    const colEl = document.createElement('div');
    colEl.className = 'column';
    colEl.dataset.c = c;
    colEl.setAttribute('aria-label', `Column ${c + 1}`);
    for (let r = ROWS - 1; r >= 0; r--) {
      const hole = document.createElement('div');
      hole.className = 'hole';
      colEl.append(hole);
      holes[r][c] = hole;
    }
    columns.push(colEl);
    board.append(colEl);
  }
}

function discEl(player) {
  const d = document.createElement('div');
  d.className = `disc p${player}`;
  return d;
}

function renderBoard() {
  const lastCol = state.moves.at(-1);
  let lastRow = -1;
  if (lastCol != null) {
    for (let r = ROWS - 1; r >= 0; r--) {
      if (state.board[r * COLS + lastCol]) {
        lastRow = r;
        break;
      }
    }
  }
  const winSet = new Set(state.line ?? []);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = state.board[r * COLS + c];
      const hole = holes[r][c];
      let disc = hole.querySelector('.disc');
      if (!v) {
        disc?.remove();
        continue;
      }
      if (!disc || !disc.classList.contains(`p${v}`)) {
        disc?.remove();
        disc = discEl(v);
        hole.append(disc);
      }
      disc.classList.toggle('win', winSet.has(r * COLS + c));
      disc.classList.toggle('last', r === lastRow && c === lastCol && state.status === 'playing');
    }
  }
}

function renderInfo() {
  const names = vsComputer() ? ['You', `Computer (${LEVELS[mode].label})`] : ['Red', 'Yellow'];
  $('name1').textContent = names[0];
  $('name2').textContent = names[1];
  $('score1').textContent = scores[1];
  $('score2').textContent = scores[2];
  $('draws').textContent = scores.draws;
  document.querySelector('.p1').classList.toggle('turn', state.status === 'playing' && state.turn === 1);
  document.querySelector('.p2').classList.toggle('turn', state.status === 'playing' && state.turn === 2);

  const status = $('status');
  status.replaceChildren();
  const span = document.createElement('span');
  if (state.status === 'won') {
    span.textContent = vsComputer()
      ? (state.winner === COMPUTER ? 'The computer wins this one.' : '🎉 You win! 🎉')
      : `🎉 ${state.winner === 1 ? 'Red' : 'Yellow'} wins! 🎉`;
  } else if (state.status === 'draw') {
    span.textContent = "It's a draw: the board is full.";
  } else if (vsComputer() && state.turn === COMPUTER) {
    span.textContent = 'Computer is thinking';
    span.className = 'thinking';
  } else {
    span.textContent = vsComputer() ? 'Your turn: tap a column' : `${state.turn === 1 ? 'Red' : 'Yellow'}'s turn`;
  }
  status.append(span);
  $('undo-btn').disabled = thinking || !state.moves.length
    || (vsComputer() && !state.moves.some((_, i) => moverOf(i) === 1));
  $('new-btn').textContent = state.status === 'playing' ? 'New game' : 'Play again';
}

// Who made move number i (players alternate from whoever went first).
const moverOf = (i) => (i % 2 === 0 ? state.first ?? 1 : 3 - (state.first ?? 1));

function render() {
  renderBoard();
  renderInfo();
}

// ---------- moves ----------

function drop(c) {
  const player = state.turn;
  const r = play(state, c);
  if (r < 0) return false;
  renderBoard();
  const disc = holes[r][c].querySelector('.disc');
  const fall = ROWS - r;
  disc.style.setProperty('--fall', fall);
  disc.style.setProperty('--t', `${0.12 + fall * 0.05}s`);
  disc.classList.add('drop');
  vibrate(player === 1 ? 10 : 6);
  if (state.status !== 'playing') finish();
  save();
  renderInfo();
  return true;
}

function finish() {
  if (state.status === 'won') {
    scores[state.winner]++;
    const humanWon = !vsComputer() || state.winner !== COMPUTER;
    vibrate(humanWon ? [40, 60, 40, 60, 120] : [80, 50, 80]);
  } else {
    scores.draws++;
  }
}

function computerTurn() {
  if (!vsComputer() || state.status !== 'playing' || state.turn !== COMPUTER) return;
  thinking = true;
  renderInfo();
  // Let the "thinking" text and the last drop paint before the search runs.
  setTimeout(() => {
    const started = performance.now();
    const c = bestMove(state, mode);
    const wait = Math.max(0, 450 - (performance.now() - started));
    setTimeout(() => {
      thinking = false;
      drop(c);
    }, wait);
  }, 380);
}

function tapColumn(c) {
  if (thinking || state.status !== 'playing') return;
  if (vsComputer() && state.turn === COMPUTER) return;
  if (!canDrop(state.board, c)) {
    toast('That column is full');
    return;
  }
  if (drop(c)) computerTurn();
}

function startGame() {
  state = newGame(nextFirst);
  state.first = nextFirst;
  nextFirst = 3 - nextFirst;
  thinking = false;
  save();
  render();
  if (vsComputer() && state.turn === COMPUTER) toast('The computer goes first this time');
  computerTurn();
}

function doUndo() {
  if (thinking || !state.moves.length) return;
  // Undoing a finished game takes its result back off the scoreboard.
  if (state.status === 'won') scores[state.winner]--;
  else if (state.status === 'draw') scores.draws--;
  undo(state);
  // Against the computer, step back to the human's turn.
  if (vsComputer() && state.turn === COMPUTER && state.moves.length) undo(state);
  save();
  render();
  computerTurn();
}

// ---------- input ----------

$('board').addEventListener('click', (e) => {
  const col = e.target.closest('.column');
  if (col) tapColumn(Number(col.dataset.c));
});
$('board').addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  const col = e.target.closest('.column');
  columns.forEach((el) => el.classList.toggle('hover', el === col));
});
$('board').addEventListener('pointerleave', () => columns.forEach((el) => el.classList.remove('hover')));
document.addEventListener('keydown', (e) => {
  if (/^[1-7]$/.test(e.key) && !document.querySelector('dialog[open]')) tapColumn(Number(e.key) - 1);
});

$('undo-btn').addEventListener('click', doUndo);
$('new-btn').addEventListener('click', () => {
  if (state.status === 'playing' && state.moves.length > 1 && !confirm('Start a new game?')) return;
  startGame();
});

$('menu-btn').addEventListener('click', () => $('menu').showModal());
for (const btn of document.querySelectorAll('[data-mode]')) {
  btn.addEventListener('click', () => {
    $('menu').close();
    if (btn.dataset.mode !== mode) {
      mode = btn.dataset.mode;
      scores = { 1: 0, 2: 0, draws: 0 };
      nextFirst = 1;
    }
    startGame();
  });
}
$('reset-scores').addEventListener('click', () => {
  scores = { 1: 0, 2: 0, draws: 0 };
  save();
  renderInfo();
  $('menu').close();
});
for (const btn of document.querySelectorAll('[data-close]')) {
  btn.addEventListener('click', () => btn.closest('dialog').close());
}
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
}

// ---------- start ----------

buildBoard();
if (!saved) {
  state.first = 1;
  nextFirst = 2;
}
render();
computerTurn();

registerServiceWorker();
