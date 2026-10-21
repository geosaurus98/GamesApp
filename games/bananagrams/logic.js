// Pure game logic for solo Bananagrams. No DOM access, so it runs in the
// browser and under `node --test`.

// The official 144-tile distribution.
export const LETTER_COUNTS = {
  A: 13, B: 3, C: 3, D: 6, E: 18, F: 3, G: 4, H: 3, I: 12, J: 2, K: 2, L: 5, M: 3,
  N: 8, O: 11, P: 3, Q: 2, R: 9, S: 6, T: 9, U: 6, V: 3, W: 3, X: 2, Y: 3, Z: 2,
};

export const MODES = {
  quick: { label: 'Quick', bunchSize: 60, startTiles: 15 },
  classic: { label: 'Classic', bunchSize: 144, startTiles: 21 },
};

export const DUMP_DRAW = 3;

export const cellKey = (x, y) => `${x},${y}`;

export function parseKey(key) {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

export function makeTiles() {
  const tiles = [];
  let id = 0;
  for (const [letter, count] of Object.entries(LETTER_COUNTS)) {
    for (let i = 0; i < count; i++) tiles.push({ id: id++, letter });
  }
  return tiles;
}

export function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function newGame(modeKey = 'classic', rng = Math.random) {
  const mode = MODES[modeKey] ?? MODES.classic;
  const bunch = shuffle(makeTiles(), rng).slice(0, mode.bunchSize);
  const rack = bunch.splice(0, mode.startTiles);
  return {
    mode: modeKey in MODES ? modeKey : 'classic',
    bunch,
    rack,
    board: {}, // cellKey -> tile
    elapsedMs: 0,
    peels: 0,
    dumps: 0,
    status: 'playing',
  };
}

// Every maximal horizontal or vertical run of 2+ tiles.
export function findWords(board) {
  const words = [];
  for (const key of Object.keys(board)) {
    const { x, y } = parseKey(key);
    for (const [dx, dy, dir] of [[1, 0, 'across'], [0, 1, 'down']]) {
      if (board[cellKey(x - dx, y - dy)] || !board[cellKey(x + dx, y + dy)]) continue;
      const cells = [];
      let word = '';
      for (let cx = x, cy = y; board[cellKey(cx, cy)]; cx += dx, cy += dy) {
        cells.push(cellKey(cx, cy));
        word += board[cellKey(cx, cy)].letter;
      }
      words.push({ word, cells, dir });
    }
  }
  return words;
}

// Groups of orthogonally connected cells, largest first.
export function components(board) {
  const seen = new Set();
  const groups = [];
  for (const start of Object.keys(board)) {
    if (seen.has(start)) continue;
    const group = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const key = stack.pop();
      group.push(key);
      const { x, y } = parseKey(key);
      for (const n of [cellKey(x + 1, y), cellKey(x - 1, y), cellKey(x, y + 1), cellKey(x, y - 1)]) {
        if (board[n] && !seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    groups.push(group);
  }
  return groups.sort((a, b) => b.length - a.length);
}

export function checkBoard(board, isWord) {
  const tileCount = Object.keys(board).length;
  const words = findWords(board).map((w) => ({ ...w, valid: isWord(w.word) }));
  const invalid = words.filter((w) => !w.valid);
  const badCells = new Set(invalid.flatMap((w) => w.cells));
  const groups = components(board);
  const islandCells = new Set(groups.slice(1).flat());
  const connected = groups.length <= 1;
  return {
    tileCount,
    words,
    invalid,
    badCells,
    islandCells,
    connected,
    // A connected grid of 2+ tiles means every tile is part of some word.
    valid: tileCount >= 2 && connected && invalid.length === 0,
  };
}

export function locateTile(state, id) {
  const index = state.rack.findIndex((t) => t.id === id);
  if (index !== -1) return { where: 'rack', index };
  for (const [key, tile] of Object.entries(state.board)) {
    if (tile.id === id) return { where: 'board', key };
  }
  return null;
}

function takeTile(state, id) {
  const loc = locateTile(state, id);
  if (!loc) return null;
  if (loc.where === 'rack') return { loc, tile: state.rack.splice(loc.index, 1)[0] };
  const tile = state.board[loc.key];
  delete state.board[loc.key];
  return { loc, tile };
}

// Move a tile to a board cell. If the cell is occupied, the occupant swaps
// into the moved tile's old spot.
export function placeTile(state, id, x, y) {
  const target = cellKey(x, y);
  const occupant = state.board[target];
  if (occupant?.id === id) return false;
  const taken = takeTile(state, id);
  if (!taken) return false;
  if (occupant) {
    if (taken.loc.where === 'rack') state.rack.splice(taken.loc.index, 0, occupant);
    else state.board[taken.loc.key] = occupant;
  }
  state.board[target] = taken.tile;
  return true;
}

export function returnToRack(state, id, index = state.rack.length) {
  const taken = takeTile(state, id);
  if (!taken) return false;
  // Moving within the rack: account for the gap left by the removed tile.
  if (taken.loc.where === 'rack' && taken.loc.index < index) index--;
  state.rack.splice(Math.max(0, Math.min(index, state.rack.length)), 0, taken.tile);
  return true;
}

export function recallAll(state) {
  const tiles = Object.entries(state.board)
    .sort(([a], [b]) => {
      const pa = parseKey(a);
      const pb = parseKey(b);
      return pa.y - pb.y || pa.x - pb.x;
    })
    .map(([, tile]) => tile);
  state.rack.push(...tiles);
  state.board = {};
}

export function shuffleRack(state, rng = Math.random) {
  shuffle(state.rack, rng);
}

// Trade one tile for three from the bunch.
export function dump(state, id, rng = Math.random) {
  if (state.bunch.length < DUMP_DRAW) {
    return { ok: false, message: `Need at least ${DUMP_DRAW} tiles in the bunch to dump.` };
  }
  const taken = takeTile(state, id);
  if (!taken) return { ok: false, message: 'Tile not found.' };
  const drawn = state.bunch.splice(0, DUMP_DRAW);
  state.bunch.splice(Math.floor(rng() * (state.bunch.length + 1)), 0, taken.tile);
  state.rack.push(...drawn);
  state.dumps++;
  return { ok: true, drawn };
}

// Peel when every tile is placed in a valid grid. With an empty bunch that's
// a win: Bananas!
export function peel(state, isWord) {
  if (state.status !== 'playing') return { ok: false, message: 'The game is over.' };
  if (state.rack.length > 0) {
    const n = state.rack.length;
    return { ok: false, message: `Place your last ${n === 1 ? 'tile' : `${n} tiles`} first.` };
  }
  const check = checkBoard(state.board, isWord);
  if (!check.connected) return { ok: false, message: 'All tiles must connect into one grid.', check };
  if (check.invalid.length) {
    const list = check.invalid.map((w) => w.word).join(', ');
    return { ok: false, message: `Not in the dictionary: ${list}`, check };
  }
  if (!check.valid) return { ok: false, message: 'Make some words first.', check };
  if (state.bunch.length === 0) {
    state.status = 'won';
    return { ok: true, won: true, check };
  }
  const drawn = state.bunch.splice(0, 1);
  state.rack.push(...drawn);
  state.peels++;
  return { ok: true, won: false, drawn, check };
}
