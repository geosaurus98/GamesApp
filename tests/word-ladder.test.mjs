import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  oneApart, newGame, submit, undo, steps, shortestPath, hint, recordSolve, emptyStats, shareText,
} from '../games/word-ladder/logic.js';

const WORDS = ['cold', 'cord', 'card', 'ward', 'warm', 'word', 'worm', 'wore', 'core'];
const isWord = (w) => WORDS.includes(w);
const puzzle = { start: 'cold', end: 'warm', par: 4, path: ['cold', 'cord', 'card', 'ward', 'warm'] };

test('oneApart needs exactly one changed letter', () => {
  assert.equal(oneApart('cold', 'cord'), true);
  assert.equal(oneApart('cold', 'cold'), false);
  assert.equal(oneApart('cold', 'card'), false);
  assert.equal(oneApart('cold', 'colds'), false);
});

test('submit checks length, one-letter change, repeats and the dictionary', () => {
  const g = newGame(puzzle);
  assert.equal(submit(g, 'col', isWord).message, 'Use 4 letters');
  assert.equal(submit(g, 'card', isWord).message, 'Change just one letter');
  assert.equal(submit(g, 'cozd', isWord).message, 'Not in word list');
  assert.equal(submit(g, 'CORD', isWord).ok, true);
  assert.equal(submit(g, 'cold', isWord).message, 'Already used');
});

test('reaching the target wins; undo steps back', () => {
  const g = newGame(puzzle);
  for (const w of ['cord', 'word', 'worm']) submit(g, w, isWord);
  assert.equal(undo(g), true);
  assert.equal(steps(g), 2);
  submit(g, 'worm', isWord);
  assert.equal(submit(g, 'warm', isWord).won, true);
  assert.equal(g.status, 'won');
  assert.equal(undo(g), false);
});

test('shortest paths and hints avoid used words', () => {
  assert.deepEqual(shortestPath('cold', 'warm', WORDS).length, 5);
  const g = newGame(puzzle);
  submit(g, 'cord', isWord);
  assert.equal(hint(g, WORDS), 'card'); // follows the puzzle's route
  submit(g, 'word', isWord); // off the route now
  assert.equal(hint(g, WORDS, ['worm']), 'worm');
  assert.equal(shortestPath('cold', 'zzzz', []), null);
});

test('stats and share text', () => {
  const g = newGame(puzzle, 'daily', 7);
  for (const w of ['cord', 'card', 'ward', 'warm']) submit(g, w, isWord);
  const s = recordSolve(emptyStats(), g);
  assert.deepEqual([s.solved, s.underPar, s.streak], [1, 1, 1]);
  assert.match(shareText(g, 'Word Ladder #8'), /COLD → WARM in 4 \(on par/);
});

test('generated puzzles are solvable in par steps through real words', () => {
  const dir = new URL('../games/word-ladder/', import.meta.url);
  const puzzles = JSON.parse(readFileSync(new URL('puzzles.json', dir), 'utf8'));
  const words = new Set(readFileSync(new URL('words.txt', dir), 'utf8').split('\n'));
  assert.ok(puzzles.length > 365);
  for (const p of puzzles) {
    assert.equal(p.path[0], p.start);
    assert.equal(p.path.at(-1), p.end);
    assert.equal(p.path.length - 1, p.par);
    assert.ok(p.par >= 3 && p.par <= 5);
    for (let i = 1; i < p.path.length; i++) {
      assert.ok(oneApart(p.path[i - 1], p.path[i]), p.path.join('>'));
      assert.ok(words.has(p.path[i]), p.path[i]);
    }
  }
});
