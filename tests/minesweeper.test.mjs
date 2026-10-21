import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEVELS, newGame, neighbors, reveal, chord, toggleFlag, flagsLeft, adjacentMines,
} from '../games/minesweeper/logic.js';

function boardWithMines(mines, rows = 4, cols = 4) {
  const s = newGame('easy');
  Object.assign(s, {
    rows, cols, mineCount: mines.length, mines, status: 'playing',
    revealed: new Array(rows * cols).fill(false), flagged: new Array(rows * cols).fill(false),
  });
  return s;
}

test('first reveal is always safe and opens an area', () => {
  for (const key of Object.keys(LEVELS)) {
    for (let k = 0; k < 20; k++) {
      const s = newGame(key);
      const i = Math.floor(Math.random() * s.rows * s.cols);
      const res = reveal(s, i);
      assert.equal(res.lost, undefined);
      assert.equal(s.mines.length, LEVELS[key].mines);
      assert.equal(adjacentMines(s, i), 0);
      for (const n of neighbors(s, i)) assert.ok(!s.mines.includes(n));
    }
  }
});

test('neighbors handles corners and edges', () => {
  const s = boardWithMines([]);
  assert.equal(neighbors(s, 0).length, 3);
  assert.equal(neighbors(s, 1).length, 5);
  assert.equal(neighbors(s, 5).length, 8);
});

test('flood fill stops at numbers; revealing all safe cells wins', () => {
  // Mine in the bottom-right corner of a 4x4.
  const s = boardWithMines([15]);
  const res = reveal(s, 0);
  assert.equal(res.won, true);
  assert.equal(s.status, 'won');
  assert.equal(s.revealed.filter(Boolean).length, 15);
  assert.equal(s.flagged[15], true);
});

test('revealing a mine loses', () => {
  const s = boardWithMines([5, 10]);
  assert.equal(reveal(s, 5).lost, true);
  assert.equal(s.status, 'lost');
  assert.equal(s.exploded, 5);
});

test('flags block reveals and count down', () => {
  const s = boardWithMines([5, 10]);
  assert.equal(flagsLeft(s), 2);
  toggleFlag(s, 5);
  assert.equal(flagsLeft(s), 1);
  assert.equal(reveal(s, 5).changed, false);
  toggleFlag(s, 5);
  assert.equal(s.flagged[5], false);
});

test('chord opens neighbours when flags match', () => {
  const s = boardWithMines([0]);
  reveal(s, 5); // touches the mine, shows "1"
  assert.equal(s.revealed[1], false);
  assert.equal(chord(s, 5).changed, false); // no flag yet
  toggleFlag(s, 0);
  const res = chord(s, 5);
  assert.equal(res.changed, true);
  assert.equal(s.status, 'won');
});

test('chord with a wrong flag can lose', () => {
  const s = boardWithMines([0]);
  reveal(s, 5);
  toggleFlag(s, 1);
  assert.equal(chord(s, 5).lost, true);
});
