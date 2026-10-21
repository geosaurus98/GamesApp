// Pure Sudoku rules and puzzle generator. Grids are arrays of 81 numbers
// (0 = empty), row by row.

export const LEVELS = {
  easy: { label: 'Easy', givens: 40 },
  medium: { label: 'Medium', givens: 33 },
  hard: { label: 'Hard', givens: 28 },
  expert: { label: 'Expert', givens: 24 },
};

export const row = (i) => Math.floor(i / 9);
export const col = (i) => i % 9;
export const box = (i) => Math.floor(row(i) / 3) * 3 + Math.floor(col(i) / 3);

// The 20 cells sharing a row, column or box with each cell.
export const PEERS = Array.from({ length: 81 }, (_, i) => {
  const out = [];
  for (let j = 0; j < 81; j++) {
    if (j !== i && (row(j) === row(i) || col(j) === col(i) || box(j) === box(i))) out.push(j);
  }
  return out;
});

function candidates(grid, i) {
  let used = 0;
  for (const p of PEERS[i]) used |= 1 << grid[p];
  const out = [];
  for (let v = 1; v <= 9; v++) if (!(used & (1 << v))) out.push(v);
  return out;
}

function shuffled(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Backtracking that always fills the most constrained empty cell first.
function solve(grid, rng, limit, found) {
  let best = -1;
  let bestCands = null;
  for (let i = 0; i < 81; i++) {
    if (grid[i]) continue;
    const c = candidates(grid, i);
    if (!c.length) return found;
    if (!bestCands || c.length < bestCands.length) {
      best = i;
      bestCands = c;
      if (c.length === 1) break;
    }
  }
  if (best === -1) {
    found.count++;
    if (!found.grid) found.grid = [...grid];
    return found;
  }
  for (const v of rng ? shuffled(bestCands, rng) : bestCands) {
    grid[best] = v;
    solve(grid, rng, limit, found);
    if (found.count >= limit) break;
  }
  grid[best] = 0;
  return found;
}

export function countSolutions(grid, limit = 2) {
  return solve([...grid], null, limit, { count: 0 }).count;
}

export function solveGrid(grid) {
  return solve([...grid], null, 1, { count: 0 }).grid ?? null;
}

function attempt(target, rng) {
  const solution = solve(new Array(81).fill(0), rng, 1, { count: 0 }).grid;
  const puzzle = [...solution];
  let filled = 81;
  // Remove cells in symmetric pairs while the answer stays unique.
  for (const i of shuffled([...Array(41).keys()], rng)) {
    if (filled <= target) break;
    const pair = i === 40 ? [40] : [i, 80 - i];
    const saved = pair.map((p) => puzzle[p]);
    pair.forEach((p) => { puzzle[p] = 0; });
    if (countSolutions(puzzle) === 1) filled -= pair.length;
    else pair.forEach((p, k) => { puzzle[p] = saved[k]; });
  }
  return { puzzle, solution, filled };
}

// Harder levels can get stuck above their target, so keep the closest of a
// few tries (each takes a few milliseconds).
export function generate(levelKey = 'easy', rng = Math.random) {
  const target = (LEVELS[levelKey] ?? LEVELS.easy).givens;
  let best = null;
  for (let tries = 0; tries < 40; tries++) {
    const a = attempt(target, rng);
    if (!best || a.filled < best.filled) best = a;
    if (best.filled <= target + 1) break;
  }
  return { puzzle: best.puzzle, solution: best.solution };
}

export function newGame(levelKey = 'easy', rng = Math.random) {
  const { puzzle, solution } = generate(levelKey, rng);
  return {
    level: levelKey in LEVELS ? levelKey : 'easy',
    puzzle,
    solution,
    values: [...puzzle],
    notes: new Array(81).fill(0), // bit v set = pencil mark v
    mistakes: 0,
    hints: 0,
    elapsedMs: 0,
    status: 'playing',
  };
}

export const isGiven = (state, i) => state.puzzle[i] !== 0;
export const isWrong = (state, i) => state.values[i] !== 0 && state.values[i] !== state.solution[i];

// Place a number. Clears that number from the notes of every peer.
export function setValue(state, i, v) {
  if (state.status !== 'playing' || isGiven(state, i)) return { changed: false };
  if (state.values[i] === v) return { changed: false };
  state.values[i] = v;
  state.notes[i] = 0;
  const wrong = v !== state.solution[i];
  if (wrong) state.mistakes++;
  else for (const p of PEERS[i]) state.notes[p] &= ~(1 << v);
  const won = state.values.every((x, k) => x === state.solution[k]);
  if (won) state.status = 'won';
  return { changed: true, wrong, won };
}

export function toggleNote(state, i, v) {
  if (state.status !== 'playing' || state.values[i]) return false;
  state.notes[i] ^= 1 << v;
  return true;
}

export function erase(state, i) {
  if (state.status !== 'playing' || isGiven(state, i)) return false;
  if (!state.values[i] && !state.notes[i]) return false;
  state.values[i] = 0;
  state.notes[i] = 0;
  return true;
}

// Reveal one cell: the selected one if it's open, otherwise a random open one.
export function hint(state, selected = -1, rng = Math.random) {
  if (state.status !== 'playing') return -1;
  const open = (i) => state.values[i] !== state.solution[i];
  let i = selected;
  if (i < 0 || !open(i)) {
    const cells = [...Array(81).keys()].filter(open);
    if (!cells.length) return -1;
    i = cells[Math.floor(rng() * cells.length)];
  }
  state.hints++;
  const mistakes = state.mistakes;
  setValue(state, i, state.solution[i]);
  state.mistakes = mistakes;
  return i;
}

// How many of each digit are placed correctly (for dimming finished digits).
export function digitCounts(state) {
  const counts = new Array(10).fill(0);
  state.values.forEach((v, i) => {
    if (v && v === state.solution[i]) counts[v]++;
  });
  return counts;
}
