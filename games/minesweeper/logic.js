// Pure Minesweeper rules. Mines are placed on the first reveal so the first
// tap always opens an area.

export const LEVELS = {
  easy: { label: 'Easy', cols: 9, rows: 9, mines: 10 },
  medium: { label: 'Medium', cols: 10, rows: 16, mines: 25 },
  hard: { label: 'Hard', cols: 12, rows: 20, mines: 45 },
};

export function newGame(levelKey = 'easy') {
  const level = LEVELS[levelKey] ?? LEVELS.easy;
  const n = level.rows * level.cols;
  return {
    level: levelKey in LEVELS ? levelKey : 'easy',
    rows: level.rows,
    cols: level.cols,
    mineCount: level.mines,
    mines: [], // cell indexes; empty until the first reveal
    revealed: new Array(n).fill(false),
    flagged: new Array(n).fill(false),
    status: 'ready', // ready | playing | won | lost
    exploded: -1,
    elapsedMs: 0,
  };
}

export function neighbors(state, i) {
  const r = Math.floor(i / state.cols);
  const c = i % state.cols;
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < state.rows && nc >= 0 && nc < state.cols) out.push(nr * state.cols + nc);
    }
  }
  return out;
}

// Place mines anywhere except the tapped cell and its neighbours.
export function placeMines(state, safe, rng = Math.random) {
  const n = state.rows * state.cols;
  const blocked = new Set([safe, ...neighbors(state, safe)]);
  // Tiny boards can't keep the whole 3x3 clear; then only protect the cell.
  const pool = [];
  for (let i = 0; i < n; i++) if (!blocked.has(i)) pool.push(i);
  if (pool.length < state.mineCount) {
    for (const i of blocked) if (i !== safe) pool.push(i);
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  state.mines = pool.slice(0, state.mineCount).sort((a, b) => a - b);
}

export function isMine(state, i) {
  return state.mines.includes(i);
}

export function adjacentMines(state, i) {
  const set = new Set(state.mines);
  return neighbors(state, i).filter((n) => set.has(n)).length;
}

export function flagsLeft(state) {
  return state.mineCount - state.flagged.filter(Boolean).length;
}

// Reveal a cell, flood-filling through zeros. Returns { changed, lost, won }.
export function reveal(state, i, rng = Math.random) {
  if (state.status === 'won' || state.status === 'lost') return { changed: false };
  if (state.revealed[i] || state.flagged[i]) return { changed: false };
  if (state.status === 'ready') {
    placeMines(state, i, rng);
    state.status = 'playing';
  }
  const mines = new Set(state.mines);
  if (mines.has(i)) {
    state.revealed[i] = true;
    state.exploded = i;
    state.status = 'lost';
    return { changed: true, lost: true };
  }
  const stack = [i];
  while (stack.length) {
    const cell = stack.pop();
    if (state.revealed[cell] || state.flagged[cell]) continue;
    state.revealed[cell] = true;
    const around = neighbors(state, cell);
    if (!around.some((n) => mines.has(n))) stack.push(...around);
  }
  return { changed: true, won: checkWin(state) };
}

// Tapping a revealed number whose flags all match opens the other neighbours.
export function chord(state, i, rng = Math.random) {
  if (state.status !== 'playing' || !state.revealed[i]) return { changed: false };
  const around = neighbors(state, i);
  const flags = around.filter((n) => state.flagged[n]).length;
  if (flags !== adjacentMines(state, i)) return { changed: false };
  let changed = false;
  for (const n of around) {
    if (state.revealed[n] || state.flagged[n]) continue;
    const res = reveal(state, n, rng);
    changed ||= res.changed;
    if (res.lost) return { changed: true, lost: true };
  }
  return { changed, won: state.status === 'won' };
}

export function toggleFlag(state, i) {
  if (state.status === 'won' || state.status === 'lost' || state.revealed[i]) return false;
  state.flagged[i] = !state.flagged[i];
  return true;
}

function checkWin(state) {
  const safeCells = state.rows * state.cols - state.mineCount;
  if (state.revealed.filter(Boolean).length !== safeCells) return false;
  state.status = 'won';
  // Flag the remaining mines for a tidy finished board.
  for (const m of state.mines) state.flagged[m] = true;
  return true;
}
