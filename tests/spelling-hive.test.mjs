import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  wordScore, maxScore, rankFor, newGame, submitWord, isPangram,
} from '../games/spelling-hive/logic.js';

const puzzle = { letters: 'aeilnrt', center: 'a', words: ['latrine', 'rain', 'retail', 'tail'] };

test('scoring: 4 letters = 1, longer = length, pangram +7', () => {
  assert.equal(wordScore('rain', puzzle.letters), 1);
  assert.equal(wordScore('retail', puzzle.letters), 6);
  assert.equal(wordScore('latrine', puzzle.letters), 14);
  assert.equal(maxScore(puzzle), 1 + 6 + 14 + 1);
});

test('submitWord validates and scores', () => {
  const g = newGame(puzzle);
  assert.equal(submitWord(g, 'can').message, 'Too short');
  assert.equal(submitWord(g, 'raid').message, 'Bad letters');
  assert.equal(submitWord(g, 'lint').message, 'Missing centre letter');
  assert.equal(submitWord(g, 'liar').message, 'Not in word list');
  const r = submitWord(g, 'LATRINE');
  assert.equal(r.ok, true);
  assert.equal(r.pangram, true);
  assert.equal(submitWord(g, 'latrine').message, 'Already found');
  assert.equal(g.score, 14);
});

test('real words outside the list count as bonus words', () => {
  const g = newGame(puzzle);
  const r = submitWord(g, 'liar', (w) => w === 'liar');
  assert.equal(r.bonus, true);
  assert.deepEqual(g.bonus, ['liar']);
  assert.equal(g.score, 1);
});

test('ranks climb with score', () => {
  assert.equal(rankFor(0, 100).name, 'Beginner');
  assert.equal(rankFor(8, 100).name, 'Good');
  assert.equal(rankFor(70, 100).name, 'Genius');
  assert.equal(rankFor(100, 100).name, 'Queen Bee');
  assert.equal(rankFor(100, 100).next, null);
  assert.deepEqual(rankFor(10, 100).next, { name: 'Solid', needed: 15, toGo: 5 });
});

test('generated puzzles are well formed', () => {
  const puzzles = JSON.parse(readFileSync(new URL('../games/spelling-hive/puzzles.json', import.meta.url), 'utf8'));
  assert.ok(puzzles.length > 365);
  for (const p of puzzles) {
    assert.equal(new Set(p.letters).size, 7);
    assert.ok(p.letters.includes(p.center));
    assert.ok(p.words.some((w) => isPangram(w, p.letters)));
    for (const w of p.words) {
      assert.ok(w.length >= 4 && w.includes(p.center) && [...w].every((ch) => p.letters.includes(ch)), w);
    }
  }
});
