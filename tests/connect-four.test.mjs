import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLS, ROWS, LINES, newGame, play, undo, canDrop, bestMove } from '../games/connect-four/logic.js';

const fixed = () => 0.99; // never blunder, pick the last tied choice

function playAll(cols, first = 1) {
  const s = newGame(first);
  for (const c of cols) play(s, c);
  return s;
}

test('there are 69 lines of four', () => {
  assert.equal(LINES.length, 69);
});

test('discs stack from the bottom and turns alternate', () => {
  const s = newGame();
  assert.equal(play(s, 3), 0);
  assert.equal(play(s, 3), 1);
  assert.equal(s.board[3], 1);
  assert.equal(s.board[COLS + 3], 2);
  assert.equal(s.turn, 1);
});

test('full columns reject drops', () => {
  const s = playAll([0, 0, 0, 0, 0, 0]);
  assert.equal(canDrop(s.board, 0), false);
  assert.equal(play(s, 0), -1);
});

test('detects horizontal, vertical and diagonal wins', () => {
  assert.equal(playAll([0, 0, 1, 1, 2, 2, 3]).winner, 1); // across
  assert.equal(playAll([0, 1, 0, 1, 0, 1, 0]).winner, 1); // up
  const diag = playAll([0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]);
  assert.equal(diag.winner, 1);
  assert.equal(diag.line.length, 4);
});

test('a full board with no line is a draw', () => {
  // Rows alternate 1221122 / 2112211: never four in a row any way.
  const s = newGame();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) s.board[r * COLS + c] = (Math.floor((c + 1) / 2) + r) % 2 ? 2 : 1;
  }
  const last = (ROWS - 1) * COLS + 6;
  s.turn = s.board[last];
  s.board[last] = 0;
  s.moves = new Array(COLS * ROWS - 1).fill(0);
  assert.equal(play(s, 6), ROWS - 1);
  assert.equal(s.status, 'draw');
});

test('undo takes back the last disc', () => {
  const s = playAll([0, 0, 1, 1, 2, 2, 3]);
  assert.equal(s.status, 'won');
  undo(s);
  assert.equal(s.status, 'playing');
  assert.equal(s.turn, 1);
  assert.equal(s.board[3], 0);
});

test('computer takes a winning move and blocks a loss', () => {
  for (const level of ['easy', 'medium', 'hard']) {
    const win = playAll([0, 6, 1, 6, 2, 5]); // red can win at column 3
    assert.equal(bestMove(win, level, fixed), 3, `${level} wins`);
    const block = playAll([6, 0, 5, 1, 6, 2]); // yellow threatens column 3
    assert.equal(bestMove(block, level, fixed), 3, `${level} blocks`);
  }
});

test('hard computer answers quickly from the opening', () => {
  const t = Date.now();
  const c = bestMove(newGame(), 'hard', fixed);
  assert.ok(c >= 0 && c < COLS);
  assert.ok(Date.now() - t < 3000, `${Date.now() - t}ms`);
  assert.equal(ROWS, 6);
});
