import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, isRun, canMove, move, dealRow, bestTarget, findHint } from '../games/spider/logic.js';

let nextId = 500;
const card = (rank, suit = 0, up = true) => ({ id: nextId++, suit, rank, up });

function empty() {
  return { suitCount: 1, tableau: Array.from({ length: 10 }, () => [card(13, 3, false)]), stock: [], done: [], moves: 0, elapsedMs: 0, status: 'playing' };
}

test('deal: 54 cards in ten columns, 50 in the stock, tops face up', () => {
  for (const suits of [1, 2, 4]) {
    const s = newGame(suits);
    assert.deepEqual(s.tableau.map((c) => c.length), [6, 6, 6, 6, 5, 5, 5, 5, 5, 5]);
    assert.equal(s.stock.length, 50);
    assert.ok(s.tableau.every((c) => c.at(-1).up && c.slice(0, -1).every((x) => !x.up)));
    const all = [...s.stock, ...s.tableau.flat()];
    assert.equal(new Set(all.map((c) => c.id)).size, 104);
    assert.equal(new Set(all.map((c) => c.suit)).size, suits);
  }
});

test('only same-suit descending runs move together; any suit can be built on', () => {
  const s = empty();
  s.tableau[0] = [card(9, 1), card(8, 1), card(7, 1)];
  s.tableau[1] = [card(10, 0)];
  s.tableau[2] = [card(9, 0), card(8, 1)];
  assert.ok(isRun(s.tableau[0], 0));
  assert.equal(isRun(s.tableau[2], 0), false);
  assert.equal(canMove(s, { index: 0, card: 0 }, 1), true); // hearts onto a spade 10
  assert.equal(canMove(s, { index: 2, card: 0 }, 1), false);
  assert.equal(canMove(s, { index: 2, card: 1 }, 1), false); // 8 on 10
});

test('moving uncovers and flips the next card', () => {
  const s = empty();
  s.tableau[0] = [card(4, 0, false), card(5, 0)];
  s.tableau[1] = [card(6, 0)];
  move(s, { index: 0, card: 1 }, 1);
  assert.equal(s.tableau[0][0].up, true);
});

test('a full King-to-Ace run in one suit is cleared; eight wins', () => {
  const s = empty();
  s.tableau[0] = [card(2, 0, false)];
  for (let r = 13; r >= 2; r--) s.tableau[0].push(card(r, 0));
  s.tableau[1] = [card(1, 0)];
  s.done = [0, 0, 0, 0, 0, 0, 0];
  const res = move(s, { index: 1, card: 0 }, 0);
  assert.equal(res.completed, true);
  assert.equal(s.tableau[0].length, 1);
  assert.equal(s.tableau[0][0].up, true);
  assert.equal(s.status, 'won');
});

test('dealing needs every column filled', () => {
  const s = newGame(1);
  const before = s.stock.length;
  assert.equal(dealRow(s).ok, true);
  assert.equal(s.stock.length, before - 10);
  assert.ok(s.tableau.every((c) => c.at(-1).up));
  s.tableau[3] = [];
  assert.equal(dealRow(s).ok, false);
});

test('taps prefer building in suit; hints suggest dealing when stuck', () => {
  const s = empty();
  s.tableau[0] = [card(5, 1)];
  s.tableau[1] = [card(6, 0)];
  s.tableau[2] = [card(6, 1)];
  assert.equal(bestTarget(s, { index: 0, card: 0 }), 2);
  assert.deepEqual(findHint(s), { from: { index: 0, card: 0 }, to: 2 });
  const stuck = empty();
  stuck.stock = [card(1)];
  assert.deepEqual(findHint(stuck), { deal: true });
});
