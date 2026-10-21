import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, move, canMove } from '../games/2048/logic.js';

// rows of values (0 = empty) -> state
function stateFrom(rows) {
  const tiles = [];
  let id = 1;
  rows.forEach((row, r) => row.forEach((value, c) => { if (value) tiles.push({ id: id++, value, r, c }); }));
  return { size: 4, tiles, score: 0, nextId: id, moves: 0, won: false, over: false };
}

function toRows(state) {
  const rows = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  for (const t of state.tiles) rows[t.r][t.c] = t.value;
  return rows;
}

const noSpawn = () => 0.5;

function moveNoSpawn(s, dir) {
  const res = move(s, dir, noSpawn);
  if (!res) return null;
  res.state.tiles = res.state.tiles.filter((t) => t.id !== res.spawned?.id);
  return res;
}

test('new game starts with two tiles', () => {
  assert.equal(newGame().tiles.length, 2);
});

test('slides and merges left, each tile merging once', () => {
  const s = stateFrom([[2, 2, 2, 2], [2, 0, 2, 4], [4, 4, 8, 0], [0, 0, 0, 2]]);
  const res = moveNoSpawn(s, 'left');
  assert.deepEqual(toRows(res.state), [[4, 4, 0, 0], [4, 4, 0, 0], [8, 8, 0, 0], [2, 0, 0, 0]]);
  assert.equal(res.gained, 4 + 4 + 4 + 8);
  assert.equal(res.removed.length, 4);
});

test('slides right, up and down', () => {
  const s = stateFrom([[2, 2, 4, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  assert.deepEqual(toRows(moveNoSpawn(s, 'right').state)[0], [0, 0, 4, 4]);
  const v = stateFrom([[2, 0, 0, 0], [2, 0, 0, 0], [4, 0, 0, 0], [0, 0, 0, 0]]);
  assert.deepEqual(toRows(moveNoSpawn(v, 'down').state).map((r) => r[0]), [0, 0, 4, 4]);
  assert.deepEqual(toRows(moveNoSpawn(v, 'up').state).map((r) => r[0]), [4, 4, 0, 0]);
});

test('a move that changes nothing returns null', () => {
  const s = stateFrom([[2, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  assert.equal(move(s, 'left'), null);
  assert.notEqual(move(s, 'right'), null);
});

test('a real move spawns a new tile', () => {
  const s = stateFrom([[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  const res = move(s, 'right');
  assert.equal(res.state.tiles.length, 2);
  assert.ok(res.spawned);
});

test('reaching 2048 wins; full board with no merges is over', () => {
  const s = stateFrom([[1024, 1024, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  const res = move(s, 'left');
  assert.equal(res.justWon, true);
  assert.equal(res.state.won, true);
  assert.equal(canMove(stateFrom([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]])), false);
  assert.equal(canMove(stateFrom([[2, 2, 4, 8], [4, 8, 16, 32], [2, 4, 2, 4], [4, 2, 4, 2]])), true);
});
