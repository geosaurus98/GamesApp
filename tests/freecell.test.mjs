import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deal, maxRun, canMove, move, bestTarget, autoStep, findHint } from '../games/freecell/logic.js';

const S = ['S', 'H', 'D', 'C'];
const R = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'];
const name = (c) => R[c.rank] + S[c.suit];
const card = (rank, suit) => ({ id: suit * 13 + rank - 1, suit, rank });

function empty() {
  return {
    number: 0, cascades: Array.from({ length: 8 }, () => []), cells: [null, null, null, null],
    foundations: [[], [], [], []], moves: 0, elapsedMs: 0, status: 'playing',
  };
}

test('deal #1 matches the classic layout', () => {
  const s = deal(1);
  assert.deepEqual(s.cascades.map((c) => c.length), [7, 7, 7, 7, 6, 6, 6, 6]);
  assert.deepEqual(s.cascades.map((c) => name(c[0])), ['JD', '2D', '9H', 'JC', '5D', '7H', '7C', '5H']);
  assert.equal(new Set(s.cascades.flat().map((c) => c.id)).size, 52);
});

test('runs that fit can move as far as free space allows', () => {
  const s = empty();
  s.cascades[0] = [card(9, 0), card(8, 1), card(7, 0)]; // 9♠ 8♥ 7♠
  s.cascades[1] = [card(10, 2)]; // 10♦
  for (let i = 2; i < 8; i++) s.cascades[i] = [card(13, i % 4)];
  s.cells = [card(1, 0), card(2, 0), card(3, 0), card(4, 0)];
  assert.equal(maxRun(s), 1);
  assert.equal(canMove(s, { pile: 'cascade', index: 0, card: 0 }, { pile: 'cascade', index: 1 }), false);
  s.cells = [card(1, 0), card(2, 0), null, null];
  assert.equal(maxRun(s), 3);
  assert.equal(move(s, { pile: 'cascade', index: 0, card: 0 }, { pile: 'cascade', index: 1 }), true);
  assert.equal(s.cascades[1].length, 4);
});

test('empty columns double the run size, except when moving into one', () => {
  const s = empty();
  s.cascades[0] = [card(5, 0)];
  assert.equal(maxRun(s), 5 * 2 ** 7);
  assert.equal(maxRun(s, true), 5 * 2 ** 6);
});

test('broken sequences cannot move together', () => {
  const s = empty();
  s.cascades[0] = [card(9, 0), card(7, 1)];
  s.cascades[1] = [card(10, 2)];
  assert.equal(canMove(s, { pile: 'cascade', index: 0, card: 0 }, { pile: 'cascade', index: 1 }), false);
});

test('free cells hold one card; foundations build up by suit', () => {
  const s = empty();
  s.cascades[0] = [card(5, 3), card(1, 1)];
  assert.deepEqual(bestTarget(s, { pile: 'cascade', index: 0 }), { pile: 'foundation', index: 1 });
  move(s, { pile: 'cascade', index: 0 }, { pile: 'foundation', index: 1 });
  // A lone card gains nothing from moving to another empty column.
  assert.deepEqual(bestTarget(s, { pile: 'cascade', index: 0 }), { pile: 'cell', index: 0 });
  s.cascades[1] = [card(2, 3)];
  for (let i = 2; i < 8; i++) s.cascades[i] = [card(13, 0)];
  assert.deepEqual(bestTarget(s, { pile: 'cascade', index: 0 }), { pile: 'cell', index: 0 });
  move(s, { pile: 'cascade', index: 0 }, { pile: 'cell', index: 0 });
  assert.equal(canMove(s, { pile: 'cascade', index: 1 }, { pile: 'cell', index: 0 }), false);
});

test('auto moves only send cards home when it is safe', () => {
  const s = empty();
  s.cascades[0] = [card(1, 0)];
  assert.ok(autoStep(s));
  move(s, autoStep(s).from, autoStep(s).to);
  s.foundations[0] = [card(1, 0), card(2, 0)];
  s.cascades[0] = [card(3, 0)]; // 3♠ with no red piles started: keep it out
  assert.equal(autoStep(s), null);
  s.foundations[1] = [card(1, 1), card(2, 1)];
  s.foundations[2] = [card(1, 2), card(2, 2)];
  assert.ok(autoStep(s));
});

test('winning and hints', () => {
  const s = empty();
  for (let suit = 0; suit < 4; suit++) {
    for (let rank = 1; rank <= 13; rank++) s.foundations[suit].push(card(rank, suit));
  }
  s.cascades[0] = [s.foundations[3].pop()];
  assert.deepEqual(findHint(s), { from: { pile: 'cascade', index: 0, card: 0 }, to: { pile: 'foundation', index: 3 } });
  move(s, { pile: 'cascade', index: 0 }, { pile: 'foundation', index: 3 });
  assert.equal(s.status, 'won');
});
