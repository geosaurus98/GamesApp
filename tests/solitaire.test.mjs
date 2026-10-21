import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deal, draw, move, canMove, bestTarget, canAutoFinish, autoFinishStep, findHint, isWon,
} from '../games/solitaire/logic.js';

const card = (rank, suit, up = true) => ({ id: suit * 13 + rank - 1, rank, suit, up });

function empty(drawCount = 1) {
  return {
    stock: [], waste: [], foundations: [[], [], [], []],
    tableau: [[], [], [], [], [], [], []], drawCount, moves: 0, elapsedMs: 0, status: 'playing',
  };
}

test('deal lays out 28 tableau cards and 24 in the stock', () => {
  const s = deal();
  assert.deepEqual(s.tableau.map((c) => c.length), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(s.stock.length, 24);
  for (const col of s.tableau) {
    assert.equal(col.at(-1).up, true);
    assert.ok(col.slice(0, -1).every((c) => !c.up));
  }
  const ids = new Set([...s.stock, ...s.tableau.flat()].map((c) => c.id));
  assert.equal(ids.size, 52);
});

test('draw turns cards over and recycles the waste', () => {
  const s = empty(3);
  s.stock = [card(1, 0, false), card(2, 0, false), card(3, 0, false), card(4, 0, false)];
  draw(s);
  assert.deepEqual(s.waste.map((c) => c.rank), [4, 3, 2]);
  assert.ok(s.waste.every((c) => c.up));
  draw(s);
  assert.deepEqual(s.waste.map((c) => c.rank), [4, 3, 2, 1]);
  draw(s); // recycle
  assert.deepEqual(s.stock.map((c) => c.rank), [1, 2, 3, 4]);
  assert.ok(s.stock.every((c) => !c.up));
  assert.equal(s.waste.length, 0);
});

test('tableau needs alternating colours, one rank lower; empty takes kings', () => {
  const s = empty();
  s.tableau[0] = [card(8, 0)]; // 8 of spades
  s.tableau[1] = [card(7, 1)]; // 7 of hearts
  s.tableau[2] = [card(7, 3)]; // 7 of clubs
  s.tableau[3] = [card(13, 2)]; // king of diamonds
  assert.equal(canMove(s, { pile: 'tableau', index: 1 }, { pile: 'tableau', index: 0 }), true);
  assert.equal(canMove(s, { pile: 'tableau', index: 2 }, { pile: 'tableau', index: 0 }), false);
  assert.equal(canMove(s, { pile: 'tableau', index: 1 }, { pile: 'tableau', index: 4 }), false);
  assert.equal(canMove(s, { pile: 'tableau', index: 3 }, { pile: 'tableau', index: 4 }), true);
});

test('moving a run flips the newly exposed card', () => {
  const s = empty();
  s.tableau[0] = [card(5, 0, false), card(9, 1), card(8, 0)];
  s.tableau[1] = [card(10, 3)];
  assert.equal(move(s, { pile: 'tableau', index: 0, card: 1 }, { pile: 'tableau', index: 1 }), true);
  assert.deepEqual(s.tableau[1].map((c) => c.rank), [10, 9, 8]);
  assert.equal(s.tableau[0][0].up, true);
});

test('foundations build up by suit from the ace', () => {
  const s = empty();
  s.waste = [card(2, 1), card(1, 1)];
  assert.deepEqual(bestTarget(s, { pile: 'waste' }), { pile: 'foundation', index: 1 });
  move(s, { pile: 'waste' }, { pile: 'foundation', index: 1 });
  assert.equal(canMove(s, { pile: 'waste' }, { pile: 'foundation', index: 0 }), false);
  move(s, { pile: 'waste' }, { pile: 'foundation', index: 1 });
  assert.equal(s.foundations[1].length, 2);
});

test('bestTarget skips pointless king moves', () => {
  const s = empty();
  s.tableau[0] = [card(13, 0)];
  assert.equal(bestTarget(s, { pile: 'tableau', index: 0 }), null);
});

test('auto finish plays everything up and wins', () => {
  const s = empty();
  for (let suit = 0; suit < 4; suit++) {
    for (let rank = 13; rank >= 1; rank--) s.tableau[suit].push(card(rank, suit));
  }
  assert.equal(canAutoFinish(s), true);
  let step;
  while ((step = autoFinishStep(s))) move(s, step.from, step.to);
  assert.equal(isWon(s), true);
  assert.equal(s.status, 'won');
});

test('hints prefer foundation moves, then suggest drawing', () => {
  const s = empty();
  s.tableau[0] = [card(1, 2)];
  assert.deepEqual(findHint(s), { from: { pile: 'tableau', index: 0 }, to: { pile: 'foundation', index: 2 } });
  s.tableau[0] = [card(5, 2)];
  s.stock = [card(9, 0, false)];
  assert.deepEqual(findHint(s), { draw: true });
  s.stock = [];
  assert.equal(findHint(s), null);
});
