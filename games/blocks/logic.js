// Pure rules for Falling Blocks (a Tetris-style game). Time only enters
// through update(state, ms), so the game runs the same in tests and in the
// browser.

export const COLS = 10;
export const ROWS = 20;
const HIDDEN = 2; // spawn rows above the visible board

// Each piece as its four rotations, listed as [x, y] cells in a 4x4 box.
const SHAPES = {
  I: ['....XXXX........', '..X...X...X...X.', '........XXXX....', '.X...X...X...X..'],
  O: ['.XX..XX.........', '.XX..XX.........', '.XX..XX.........', '.XX..XX.........'],
  T: ['.X..XXX.........', '.X...XX..X......', '....XXX..X......', '.X..XX...X......'],
  S: ['.XX.XX..........', '.X...XX...X.....', '.....XX.XX......', 'X...XX...X......'],
  Z: ['XX...XX.........', '..X..XX..X......', '....XX...XX.....', '.X..XX..X.......'],
  J: ['X...XXX.........', '.XX..X...X......', '....XXX...X.....', '.X...X..XX......'],
  L: ['..X.XXX.........', '.X...X...XX.....', '....XXX.X.......', 'XX...X...X......'],
};
export const TYPES = Object.keys(SHAPES);
const CELLS = Object.fromEntries(TYPES.map((t) => [t, SHAPES[t].map((rot) => {
  const cells = [];
  for (let i = 0; i < 16; i++) if (rot[i] === 'X') cells.push([i % 4, Math.floor(i / 4)]);
  return cells;
})]));

// Small nudges tried when a rotation is blocked (a simple "wall kick").
const KICKS = [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0], [-1, -1], [1, -1]];
const LINE_SCORES = [0, 100, 300, 500, 800];
export const LOCK_MS = 500;
const MAX_LOCK_RESETS = 15;

export function pieceCells(p) {
  return CELLS[p.type][p.rot].map(([x, y]) => [p.x + x, p.y + y]);
}

// Milliseconds per row of falling at each level.
export function gravityMs(level) {
  return Math.max(40, Math.round(800 * 0.82 ** (level - 1)));
}

function bag(rng) {
  const b = [...TYPES];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

export function newGame(rng = Math.random, startLevel = 1) {
  const state = {
    board: new Array(COLS * (ROWS + HIDDEN)).fill(null),
    queue: [...bag(rng), ...bag(rng)],
    piece: null,
    hold: null,
    canHold: true,
    score: 0,
    lines: 0,
    level: startLevel,
    startLevel,
    fallMs: 0,
    lockMs: 0,
    lockResets: 0,
    status: 'playing',
  };
  spawn(state, rng);
  return state;
}

const at = (state, x, y) => state.board[(y + HIDDEN) * COLS + x];

export function collides(state, p) {
  return pieceCells(p).some(([x, y]) => x < 0 || x >= COLS || y >= ROWS || (y >= -HIDDEN && at(state, x, y)));
}

function spawn(state, rng = Math.random, type = null) {
  if (!type) {
    type = state.queue.shift();
    if (state.queue.length < 7) state.queue.push(...bag(rng));
  }
  state.piece = { type, rot: 0, x: 3, y: -1 };
  state.fallMs = 0;
  state.lockMs = 0;
  state.lockResets = 0;
  if (collides(state, state.piece)) state.status = 'over';
}

const grounded = (state) => collides(state, { ...state.piece, y: state.piece.y + 1 });

// After a successful move, a grounded piece gets a little more time.
function touched(state) {
  if (grounded(state) && state.lockResets < MAX_LOCK_RESETS) {
    state.lockMs = 0;
    state.lockResets++;
  }
}

export function shift(state, dx) {
  if (state.status !== 'playing') return false;
  const p = { ...state.piece, x: state.piece.x + dx };
  if (collides(state, p)) return false;
  state.piece = p;
  touched(state);
  return true;
}

export function rotate(state, dir = 1) {
  if (state.status !== 'playing') return false;
  const rot = (state.piece.rot + dir + 4) % 4;
  for (const [kx, ky] of KICKS) {
    const p = { ...state.piece, rot, x: state.piece.x + kx, y: state.piece.y + ky };
    if (!collides(state, p)) {
      state.piece = p;
      touched(state);
      return true;
    }
  }
  return false;
}

export function ghostY(state) {
  let y = state.piece.y;
  while (!collides(state, { ...state.piece, y: y + 1 })) y++;
  return y;
}

// Fix the piece in place, clear full rows, and bring in the next piece.
// Returns the number of rows cleared.
function lock(state, rng) {
  const id = TYPES.indexOf(state.piece.type) + 1;
  let above = false;
  for (const [x, y] of pieceCells(state.piece)) {
    if (y < 0) above = true;
    state.board[(y + HIDDEN) * COLS + x] = id;
  }
  const rows = ROWS + HIDDEN;
  const kept = [];
  let cleared = 0;
  for (let r = 0; r < rows; r++) {
    const row = state.board.slice(r * COLS, (r + 1) * COLS);
    if (row.every(Boolean)) cleared++;
    else kept.push(row);
  }
  state.board = [...new Array(cleared * COLS).fill(null), ...kept.flat()];
  state.lines += cleared;
  state.score += LINE_SCORES[cleared] * state.level;
  state.level = Math.max(state.startLevel, Math.floor(state.lines / 10) + 1);
  state.canHold = true;
  if (above && !cleared) {
    state.status = 'over';
    return cleared;
  }
  spawn(state, rng);
  return cleared;
}

// Move down one row. Returns { moved }.
export function softDrop(state) {
  if (state.status !== 'playing') return { moved: false };
  const p = { ...state.piece, y: state.piece.y + 1 };
  if (collides(state, p)) return { moved: false };
  state.piece = p;
  state.score += 1;
  state.fallMs = 0;
  return { moved: true };
}

export function hardDrop(state, rng = Math.random) {
  if (state.status !== 'playing') return { cleared: 0 };
  const y = ghostY(state);
  state.score += 2 * (y - state.piece.y);
  state.piece = { ...state.piece, y };
  return { cleared: lock(state, rng), dropped: true };
}

export function hold(state, rng = Math.random) {
  if (state.status !== 'playing' || !state.canHold) return false;
  const current = state.piece.type;
  if (state.hold) spawn(state, rng, state.hold);
  else spawn(state, rng);
  state.hold = current;
  state.canHold = false;
  return true;
}

// Advance time: gravity pulls the piece down; a grounded piece locks after
// LOCK_MS. Returns { cleared } when a piece locked during this update.
export function update(state, ms, rng = Math.random) {
  if (state.status !== 'playing') return {};
  if (grounded(state)) {
    state.lockMs += ms;
    if (state.lockMs >= LOCK_MS) return { cleared: lock(state, rng), locked: true };
    return {};
  }
  state.fallMs += ms;
  const g = gravityMs(state.level);
  while (state.fallMs >= g && !grounded(state)) {
    state.fallMs -= g;
    state.piece = { ...state.piece, y: state.piece.y + 1 };
  }
  return {};
}

// The visible board as rows of piece ids (0 = empty), for drawing.
export function visibleRows(state) {
  const rows = [];
  for (let r = 0; r < ROWS; r++) rows.push(state.board.slice((r + HIDDEN) * COLS, (r + HIDDEN + 1) * COLS).map((v) => v ?? 0));
  return rows;
}
