import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  scoreGuess, letterStates, newGame, submitGuess, recordResult, emptyStats, shareGrid,
} from '../games/word-of-the-day/logic.js';

const c = 'correct';
const p = 'present';
const a = 'absent';

test('scores exact, present and absent letters', () => {
  assert.deepEqual(scoreGuess('crane', 'cider'), [c, p, a, a, p]);
  assert.deepEqual(scoreGuess('cider', 'cider'), [c, c, c, c, c]);
});

test('repeated letters only count as many times as the answer has them', () => {
  assert.deepEqual(scoreGuess('speed', 'abide'), [a, a, p, a, p]);
  assert.deepEqual(scoreGuess('eerie', 'there'), [p, a, p, a, c]);
  assert.deepEqual(scoreGuess('llama', 'hello'), [p, p, a, a, a]);
});

test('keyboard keeps the best status for each letter', () => {
  const s = letterStates(['crane', 'cider'], 'cider');
  assert.equal(s.c, c);
  assert.equal(s.r, c);
  assert.equal(s.a, a);
});

test('guesses must be five allowed letters; six misses loses', () => {
  const allowed = new Set(['crane', 'cider', 'adieu', 'stomp', 'lucky', 'gimpy', 'fjord']);
  const isAllowed = (w) => allowed.has(w);
  const g = newGame('cider');
  assert.equal(submitGuess(g, 'cran', isAllowed).message, 'Not enough letters');
  assert.equal(submitGuess(g, 'zzzzz', isAllowed).message, 'Not in word list');
  for (const w of ['crane', 'adieu', 'stomp', 'lucky', 'gimpy']) assert.equal(submitGuess(g, w, isAllowed).ok, true);
  assert.equal(submitGuess(g, 'FJORD', isAllowed).lost, true);
  assert.equal(g.status, 'lost');
});

test('stats track wins, streaks and distribution', () => {
  let stats = emptyStats();
  stats = recordResult(stats, { day: 10, status: 'won', guesses: ['a', 'b', 'c'] });
  stats = recordResult(stats, { day: 11, status: 'won', guesses: ['a'] });
  assert.equal(stats.streak, 2);
  stats = recordResult(stats, { day: 13, status: 'won', guesses: ['a', 'b'] });
  assert.equal(stats.streak, 1);
  assert.equal(stats.maxStreak, 2);
  stats = recordResult(stats, { day: 14, status: 'lost', guesses: [] });
  assert.equal(stats.streak, 0);
  assert.deepEqual(stats.dist, [1, 1, 1, 0, 0, 0]);
  assert.equal(stats.played, 4);
  assert.equal(stats.wins, 3);
});

test('share grid uses emoji squares', () => {
  const text = shareGrid({ answer: 'cider', guesses: ['crane', 'cider'], status: 'won' }, 'Word #1');
  assert.equal(text, 'Word #1 2/6\n\n🟩🟨⬛⬛🟨\n🟩🟩🟩🟩🟩');
});

test('every answer is an allowed guess', () => {
  const dir = new URL('../games/word-of-the-day/', import.meta.url);
  const answers = JSON.parse(readFileSync(new URL('answers.json', dir), 'utf8'));
  const allowed = new Set(readFileSync(new URL('allowed.txt', dir), 'utf8').split('\n'));
  assert.ok(answers.length > 500);
  for (const w of answers) assert.ok(allowed.has(w), w);
});
