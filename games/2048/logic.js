// Pure 2048 rules. Tiles carry ids so the UI can animate them sliding.

export const SIZE = 4;
export const WIN_VALUE = 2048;

const VECTORS = {
  left: { dr: 0, dc: -1 },
  right: { dr: 0, dc: 1 },
  up: { dr: -1, dc: 0 },
  down: { dr: 1, dc: 0 },
};

export function emptyCells(tiles, size = SIZE) {
  const taken = new Set(tiles.map((t) => t.r * size + t.c));
  const cells = [];
  for (let i = 0; i < size * size; i++) {
    if (!taken.has(i)) cells.push({ r: Math.floor(i / size), c: i % size });
  }
  return cells;
}

// Adds a 2 (90%) or 4 (10%) in a random empty cell. Returns the new tile.
export function spawnTile(state, rng = Math.random) {
  const cells = emptyCells(state.tiles, state.size);
  if (!cells.length) return null;
  const { r, c } = cells[Math.floor(rng() * cells.length)];
  const tile = { id: state.nextId++, value: rng() < 0.9 ? 2 : 4, r, c };
  state.tiles.push(tile);
  return tile;
}

export function newGame(rng = Math.random, size = SIZE) {
  const state = {
    size,
    tiles: [],
    score: 0,
    nextId: 1,
    moves: 0,
    won: false, // reached 2048 at some point
    over: false,
  };
  spawnTile(state, rng);
  spawnTile(state, rng);
  return state;
}

// Slide every tile toward `dir`. Returns null if nothing moves, otherwise
// { state, removed, merged, spawned, gained } where `removed` are tiles that
// merged into another (with the cell they slid to) and `merged` are the ids
// of tiles that doubled.
export function move(prev, dir, rng = Math.random) {
  const v = VECTORS[dir];
  if (!v || prev.over) return null;
  const size = prev.size;
  const tiles = prev.tiles.map((t) => ({ ...t }));
  const grid = new Map(tiles.map((t) => [t.r * size + t.c, t]));

  const removed = [];
  const merged = [];
  let gained = 0;
  let moved = false;

  for (let line = 0; line < size; line++) {
    // Walk from the edge we're moving toward, so tiles pile up there.
    const cells = [];
    for (let i = 0; i < size; i++) {
      const k = v.dr > 0 || v.dc > 0 ? size - 1 - i : i;
      cells.push(v.dr ? { r: k, c: line } : { r: line, c: k });
    }

    let target = 0;
    let last = null; // tile at cells[target - 1], if it can still merge
    for (const { r, c } of cells) {
      const tile = grid.get(r * size + c);
      if (!tile) continue;
      if (last && last.value === tile.value) {
        last.value *= 2;
        gained += last.value;
        merged.push(last.id);
        removed.push({ ...tile, r: last.r, c: last.c });
        tile.gone = true;
        last = null;
        moved = true;
        continue;
      }
      const dest = cells[target++];
      if (dest.r !== tile.r || dest.c !== tile.c) moved = true;
      tile.r = dest.r;
      tile.c = dest.c;
      last = tile;
    }
  }

  if (!moved) return null;

  const state = {
    ...prev,
    tiles: tiles.filter((t) => !t.gone),
    score: prev.score + gained,
    moves: prev.moves + 1,
  };
  const spawned = spawnTile(state, rng);
  const justWon = !prev.won && state.tiles.some((t) => t.value >= WIN_VALUE);
  if (justWon) state.won = true;
  state.over = !canMove(state);
  return { state, removed, merged, spawned, gained, justWon };
}

export function canMove(state) {
  const { size, tiles } = state;
  if (tiles.length < size * size) return true;
  const grid = new Map(tiles.map((t) => [t.r * size + t.c, t.value]));
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const val = grid.get(r * size + c);
      if (c + 1 < size && grid.get(r * size + c + 1) === val) return true;
      if (r + 1 < size && grid.get((r + 1) * size + c) === val) return true;
    }
  }
  return false;
}

export function maxTile(state) {
  return state.tiles.reduce((m, t) => Math.max(m, t.value), 0);
}
