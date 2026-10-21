import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LETTER_COUNTS, MODES, makeTiles, newGame, findWords, checkBoard, placeTile,
  returnToRack, recallAll, dump, peel, cellKey,
} from '../games/bananagrams/logic.js';

const WORDS = new Set(['CAT', 'CAR', 'AT', 'TA', 'ART']);
const isWord = (w) => WORDS.has(w);

function seeded(seed = 1) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function boardFrom(rows) {
  const board = {};
  let id = 1000;
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch !== '.') board[cellKey(x, y)] = { id: id++, letter: ch };
  }));
  return board;
}

test('tile set has 144 tiles', () => {
  assert.equal(Object.values(LETTER_COUNTS).reduce((a, b) => a + b, 0), 144);
  assert.equal(makeTiles().length, 144);
});

test('new game deals by mode', () => {
  for (const [key, mode] of Object.entries(MODES)) {
    const s = newGame(key, seeded());
    assert.equal(s.rack.length, mode.startTiles);
    assert.equal(s.bunch.length, mode.bunchSize - mode.startTiles);
  }
});

test('findWords reads across and down runs only', () => {
  const words = findWords(boardFrom(['CAT', '.R.', '.T.'])).map((w) => w.word).sort();
  assert.deepEqual(words, ['ART', 'CAT']);
});

test('checkBoard flags invalid words and islands', () => {
  const ok = checkBoard(boardFrom(['CAT', '.R.', '.T.']), isWord);
  assert.equal(ok.valid, true);

  const bad = checkBoard(boardFrom(['CAT', '.X.']), isWord);
  assert.equal(bad.valid, false);
  assert.deepEqual(bad.invalid.map((w) => w.word), ['AX']);

  const split = checkBoard(boardFrom(['CAT..', '....A', '....T']), isWord);
  assert.equal(split.connected, false);
  assert.equal(split.islandCells.size, 2);

  assert.equal(checkBoard(boardFrom(['C']), isWord).valid, false);
});

test('placeTile moves and swaps', () => {
  const s = { rack: [{ id: 1, letter: 'A' }, { id: 2, letter: 'B' }], board: {}, bunch: [] };
  placeTile(s, 1, 0, 0);
  assert.equal(s.board['0,0'].id, 1);
  assert.deepEqual(s.rack.map((t) => t.id), [2]);
  // Dropping a rack tile on an occupied cell swaps the occupant into the rack.
  placeTile(s, 2, 0, 0);
  assert.equal(s.board['0,0'].id, 2);
  assert.deepEqual(s.rack.map((t) => t.id), [1]);
  // Board-to-board move onto an occupied cell swaps positions.
  placeTile(s, 1, 1, 0);
  placeTile(s, 1, 0, 0);
  assert.equal(s.board['0,0'].id, 1);
  assert.equal(s.board['1,0'].id, 2);
});

test('returnToRack and recallAll', () => {
  const s = { rack: [{ id: 1, letter: 'A' }, { id: 2, letter: 'B' }, { id: 3, letter: 'C' }], board: {}, bunch: [] };
  returnToRack(s, 1, 3);
  assert.deepEqual(s.rack.map((t) => t.id), [2, 3, 1]);
  placeTile(s, 3, 5, 5);
  returnToRack(s, 3, 0);
  assert.deepEqual(s.rack.map((t) => t.id), [3, 2, 1]);
  placeTile(s, 1, 0, 0);
  placeTile(s, 2, 1, 0);
  recallAll(s);
  assert.equal(Object.keys(s.board).length, 0);
  assert.equal(s.rack.length, 3);
});

test('dump trades one tile for three', () => {
  const s = newGame('classic', seeded());
  const before = s.bunch.length;
  const id = s.rack[0].id;
  const r = dump(s, id, seeded(2));
  assert.equal(r.ok, true);
  assert.equal(s.rack.length, 23);
  assert.equal(s.bunch.length, before - 2);
  assert.ok(s.bunch.some((t) => t.id === id));
  assert.ok(!r.drawn.some((t) => t.id === id));

  s.bunch = s.bunch.slice(0, 2);
  assert.equal(dump(s, s.rack[0].id).ok, false);
});

test('peel requires an empty rack and a valid grid, and wins on empty bunch', () => {
  const s = { rack: [{ id: 1, letter: 'Z' }], board: boardFrom(['CAT']), bunch: [{ id: 9, letter: 'E' }], status: 'playing', peels: 0 };
  assert.equal(peel(s, isWord).ok, false);
  s.rack = [];
  const r = peel(s, isWord);
  assert.equal(r.ok, true);
  assert.equal(r.won, false);
  assert.deepEqual(s.rack.map((t) => t.letter), ['E']);
  assert.equal(s.bunch.length, 0);

  s.rack = [];
  s.board = boardFrom(['CAX']);
  assert.match(peel(s, isWord).message, /CAX/);

  s.board = boardFrom(['CAT']);
  assert.equal(peel(s, isWord).won, true);
  assert.equal(s.status, 'won');
});
