import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEVELS, PEERS, generate, countSolutions, newGame, setValue, toggleNote, erase, hint, digitCounts,
} from '../games/sudoku/logic.js';

function seeded(seed = 1) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function isValidSolution(grid) {
  for (let i = 0; i < 81; i++) {
    if (grid[i] < 1 || grid[i] > 9) return false;
    if (PEERS[i].some((p) => grid[p] === grid[i])) return false;
  }
  return true;
}

test('every cell has 20 peers', () => {
  assert.ok(PEERS.every((p) => p.length === 20));
});

test('generated puzzles have one solution and the requested givens', () => {
  for (const [key, level] of Object.entries(LEVELS)) {
    const { puzzle, solution } = generate(key, seeded(key.length * 7));
    assert.ok(isValidSolution(solution), key);
    assert.equal(countSolutions(puzzle), 1, key);
    const givens = puzzle.filter(Boolean).length;
    assert.ok(givens >= level.givens - 1 && givens <= level.givens + 3, `${key}: ${givens}`);
    puzzle.forEach((v, i) => { if (v) assert.equal(v, solution[i]); });
  }
});

test('placing numbers counts mistakes, clears notes and wins', () => {
  const s = newGame('easy', seeded(3));
  const open = s.values.findIndex((v) => v === 0);
  const right = s.solution[open];
  const wrong = right === 9 ? 1 : right + 1;
  assert.equal(setValue(s, s.values.findIndex((v) => v !== 0), 5).changed, false); // given
  assert.equal(setValue(s, open, wrong).wrong, true);
  assert.equal(s.mistakes, 1);

  const peer = PEERS[open].find((p) => s.values[p] === 0);
  toggleNote(s, peer, right);
  assert.equal(s.notes[peer] & (1 << right), 1 << right);
  setValue(s, open, right);
  assert.equal(s.notes[peer] & (1 << right), 0);

  for (let i = 0; i < 81; i++) if (s.values[i] !== s.solution[i]) setValue(s, i, s.solution[i]);
  assert.equal(s.status, 'won');
  assert.ok(digitCounts(s).slice(1).every((n) => n === 9));
});

test('erase and hint', () => {
  const s = newGame('medium', seeded(5));
  const open = s.values.findIndex((v) => v === 0);
  setValue(s, open, s.solution[open] === 1 ? 2 : 1);
  assert.equal(erase(s, open), true);
  assert.equal(s.values[open], 0);
  assert.equal(hint(s, open), open);
  assert.equal(s.values[open], s.solution[open]);
  assert.equal(s.hints, 1);
  assert.equal(s.mistakes, 1);
});
