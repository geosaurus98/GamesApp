// Pure Connect Four rules and a computer opponent.
// The board is 42 cells, index = row * 7 + col, row 0 at the bottom.
// Cells hold 0 (empty), 1 (red) or 2 (yellow).

export const COLS = 7;
export const ROWS = 6;

export const LEVELS = {
  easy: { label: 'Easy', depth: 2, blunder: 0.3 },
  medium: { label: 'Medium', depth: 4, blunder: 0.08 },
  hard: { label: 'Hard', depth: 8, blunder: 0 },
};

const idx = (r, c) => r * COLS + c;
// Try centre columns first: better moves earlier means more pruning.
const ORDER = [3, 2, 4, 1, 5, 0, 6];

// Every line of four cells on the board.
export const LINES = (() => {
  const lines = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        const er = r + dr * 3;
        const ec = c + dc * 3;
        if (er < 0 || er >= ROWS || ec < 0 || ec >= COLS) continue;
        lines.push([0, 1, 2, 3].map((k) => idx(r + dr * k, c + dc * k)));
      }
    }
  }
  return lines;
})();

export function newGame(first = 1) {
  return { board: new Array(COLS * ROWS).fill(0), turn: first, moves: [], winner: 0, line: null, status: 'playing' };
}

export function dropRow(board, c) {
  for (let r = 0; r < ROWS; r++) if (!board[idx(r, c)]) return r;
  return -1;
}

export const canDrop = (board, c) => c >= 0 && c < COLS && !board[idx(ROWS - 1, c)];

export function winningLine(board) {
  for (const line of LINES) {
    const v = board[line[0]];
    if (v && line.every((i) => board[i] === v)) return line;
  }
  return null;
}

// Drop the current player's disc. Returns the row, or -1 if illegal.
export function play(state, c) {
  if (state.status !== 'playing' || !canDrop(state.board, c)) return -1;
  const r = dropRow(state.board, c);
  state.board[idx(r, c)] = state.turn;
  state.moves.push(c);
  const line = winningLine(state.board);
  if (line) {
    state.status = 'won';
    state.winner = state.turn;
    state.line = line;
  } else if (state.moves.length === COLS * ROWS) {
    state.status = 'draw';
  } else {
    state.turn = 3 - state.turn;
  }
  return r;
}

export function undo(state) {
  const c = state.moves.pop();
  if (c == null) return false;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (state.board[idx(r, c)]) {
      if (state.status === 'playing') state.turn = 3 - state.turn;
      state.board[idx(r, c)] = 0;
      break;
    }
  }
  state.status = 'playing';
  state.winner = 0;
  state.line = null;
  return true;
}

// Static score of a position from `me`'s point of view.
function evaluate(board, me) {
  const them = 3 - me;
  let score = 0;
  for (let r = 0; r < ROWS; r++) {
    if (board[idx(r, 3)] === me) score += 3;
    else if (board[idx(r, 3)] === them) score -= 3;
  }
  for (const line of LINES) {
    let mine = 0;
    let theirs = 0;
    for (const i of line) {
      if (board[i] === me) mine++;
      else if (board[i] === them) theirs++;
    }
    if (mine && theirs) continue;
    if (mine === 3) score += 5;
    else if (mine === 2) score += 2;
    if (theirs === 3) score -= 4;
    else if (theirs === 2) score -= 2;
  }
  return score;
}

const WIN = 1e6;

function negamax(board, player, depth, alpha, beta, filled) {
  if (filled === COLS * ROWS) return 0;
  // Win right now?
  for (const c of ORDER) {
    if (!canDrop(board, c)) continue;
    const i = idx(dropRow(board, c), c);
    board[i] = player;
    const won = LINES.some((l) => l.includes(i) && l.every((k) => board[k] === player));
    board[i] = 0;
    if (won) return WIN + depth;
  }
  if (depth === 0) return evaluate(board, player);
  let best = -Infinity;
  for (const c of ORDER) {
    if (!canDrop(board, c)) continue;
    const i = idx(dropRow(board, c), c);
    board[i] = player;
    const score = -negamax(board, 3 - player, depth - 1, -beta, -alpha, filled + 1);
    board[i] = 0;
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

// Pick a column for the player whose turn it is.
export function bestMove(state, levelKey = 'medium', rng = Math.random) {
  const level = LEVELS[levelKey] ?? LEVELS.medium;
  const board = [...state.board];
  const me = state.turn;
  const legal = ORDER.filter((c) => canDrop(board, c));
  if (!legal.length) return -1;
  if (rng() < level.blunder) return legal[Math.floor(rng() * legal.length)];
  const filled = state.moves.length;
  let best = -Infinity;
  let choices = [];
  for (const c of legal) {
    const i = idx(dropRow(board, c), c);
    board[i] = me;
    const won = winningLine(board) !== null;
    const score = won ? WIN * 2 : -negamax(board, 3 - me, level.depth - 1, -Infinity, Infinity, filled + 1);
    board[i] = 0;
    if (score > best) {
      best = score;
      choices = [c];
    } else if (score === best) {
      choices.push(c);
    }
  }
  return choices[Math.floor(rng() * choices.length)];
}
