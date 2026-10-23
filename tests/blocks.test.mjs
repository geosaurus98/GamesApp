import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLS, ROWS, TYPES, LOCK_MS, newGame, pieceCells, collides, shift, rotate, hardDrop, softDrop,
  hold, update, ghostY, gravityMs, visibleRows,
} from '../games/blocks/logic.js';

function seeded(seed = 1) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

// Fill visible row r except the listed columns.
function fillRow(state, r, gaps = []) {
  for (let x = 0; x < COLS; x++) if (!gaps.includes(x)) state.board[(r + 2) * COLS + x] = 1;
}

test('every piece has four cells in each rotation', () => {
  for (const type of TYPES) {
    for (let rot = 0; rot < 4; rot++) assert.equal(pieceCells({ type, rot, x: 0, y: 0 }).length, 4);
  }
});

test('the randomiser deals all seven pieces before repeating', () => {
  const s = newGame(seeded(3));
  const first7 = [s.piece.type, ...s.queue.slice(0, 6)];
  assert.equal(new Set(first7).size, 7);
});

test('pieces stop at the walls', () => {
  const s = newGame(seeded(1));
  let moves = 0;
  while (shift(s, -1)) moves++;
  assert.ok(moves > 0 && moves < COLS);
  assert.ok(pieceCells(s.piece).some(([x]) => x === 0));
  assert.equal(shift(s, -1), false);
});

test('rotation kicks off the wall instead of failing', () => {
  const s = newGame(seeded(1));
  s.piece = { type: 'I', rot: 1, x: -2, y: 5 };
  assert.equal(collides(s, s.piece), false);
  assert.equal(rotate(s, 1), true);
  assert.ok(pieceCells(s.piece).every(([x]) => x >= 0));
});

test('hard drop lands on the floor and scores 2 per row', () => {
  const s = newGame(seeded(2));
  s.piece = { type: 'O', rot: 0, x: 3, y: 0 };
  const y = ghostY(s);
  const before = s.score;
  hardDrop(s);
  assert.equal(s.score - before, 2 * y);
  const rows = visibleRows(s);
  assert.ok(rows[ROWS - 1].filter(Boolean).length === 2);
});

test('clearing lines scores by level and levels up every ten lines', () => {
  const s = newGame(seeded(4));
  for (let r = ROWS - 4; r < ROWS; r++) fillRow(s, r, [0]);
  s.piece = { type: 'I', rot: 1, x: -2, y: 0 }; // vertical I in column 0
  const res = hardDrop(s);
  assert.equal(res.cleared, 4);
  assert.equal(s.lines, 4);
  assert.ok(s.score >= 800);
  assert.ok(visibleRows(s).every((row) => row.every((v) => !v)));
  s.lines = 9;
  for (let r = ROWS - 1; r < ROWS; r++) fillRow(s, r, [0]);
  s.piece = { type: 'I', rot: 1, x: -2, y: 0 };
  hardDrop(s);
  assert.equal(s.level, 2);
});

test('gravity pulls pieces down and grounded pieces lock after a pause', () => {
  const s = newGame(seeded(5));
  const y0 = s.piece.y;
  update(s, gravityMs(1) * 3);
  assert.equal(s.piece.y, y0 + 3);
  s.piece = { ...s.piece, y: ghostY(s) };
  const type = s.piece.type;
  assert.deepEqual(update(s, LOCK_MS - 10), {});
  assert.equal(update(s, 20).locked, true);
  assert.ok(visibleRows(s).flat().some(Boolean), `locked ${type}`);
});

test('soft drop moves one row and scores 1', () => {
  const s = newGame(seeded(6));
  const { y } = s.piece;
  assert.equal(softDrop(s).moved, true);
  assert.equal(s.piece.y, y + 1);
  assert.equal(s.score, 1);
});

test('hold swaps once per piece', () => {
  const s = newGame(seeded(7));
  const first = s.piece.type;
  assert.equal(hold(s), true);
  assert.equal(s.hold, first);
  assert.equal(hold(s), false);
  hardDrop(s);
  const now = s.piece.type;
  assert.equal(hold(s), true);
  assert.equal(s.piece.type, first);
  assert.equal(s.hold, now);
});

test('stacking to the top ends the game', () => {
  const s = newGame(seeded(8));
  for (let r = 0; r < ROWS; r++) fillRow(s, r, [9]);
  hardDrop(s);
  assert.equal(s.status, 'over');
});

test('gravity speeds up with level', () => {
  assert.ok(gravityMs(5) < gravityMs(1));
  assert.equal(gravityMs(99), 40);
});
