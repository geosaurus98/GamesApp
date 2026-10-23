import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  START_BANK, handValue, isBlackjack, newGame, deal, hit, stand, double, split, canSplit, bestPlay,
} from '../games/blackjack/logic.js';

let nid = 10000;
const c = (rank, suit = 0) => ({ id: nid++, suit, rank });

// Stack the shoe so cards come out in this order (deal: P, D, P, D, then hits).
function rigged(order) {
  const s = newGame();
  s.shoe = [...s.shoe.slice(0, 200), ...order.map((r) => c(r)).reverse()];
  return s;
}

test('hand values count Aces as 1 or 11', () => {
  assert.deepEqual(handValue([c(1), c(6)]), { total: 17, soft: true });
  assert.deepEqual(handValue([c(1), c(6), c(10)]), { total: 17, soft: false });
  assert.deepEqual(handValue([c(1), c(1), c(9)]), { total: 21, soft: true });
  assert.equal(handValue([c(13), c(12), c(2)]).total, 22);
  assert.equal(isBlackjack([c(1), c(12)]), true);
  assert.equal(isBlackjack([c(5), c(6), c(10)]), false);
});

test('betting takes chips; you can only bet what you have', () => {
  const s = newGame();
  assert.equal(deal(s, START_BANK + 1).ok, false);
  const s2 = rigged([10, 9, 7, 8]); // player 17, dealer 17
  deal(s2, 100);
  assert.equal(s2.bank, START_BANK - 100);
  assert.equal(s2.phase, 'player');
});

test('stand and compare: dealer draws to 17, push returns the bet', () => {
  const s = rigged([10, 10, 8, 6, 2]); // player 18, dealer 16 then draws 2 -> 18
  deal(s, 100);
  stand(s);
  assert.equal(s.phase, 'done');
  assert.equal(handValue(s.dealer).total, 18);
  assert.equal(s.hands[0].result, 'push');
  assert.equal(s.bank, START_BANK);
});

test('busting loses even if the dealer would bust too', () => {
  const s = rigged([10, 10, 6, 6, 9]); // player 16 hits 9 = 25
  deal(s, 50);
  hit(s);
  assert.equal(s.hands[0].result, 'bust');
  assert.equal(s.dealer.length, 2); // dealer doesn't draw
  assert.equal(s.bank, START_BANK - 50);
});

test('blackjack pays 3 to 2 straight away', () => {
  const s = rigged([1, 9, 13, 7]);
  deal(s, 100);
  assert.equal(s.phase, 'done');
  assert.equal(s.hands[0].result, 'blackjack');
  assert.equal(s.bank, START_BANK + 150);
});

test('dealer blackjack beats everything but a player blackjack', () => {
  const s = rigged([10, 1, 9, 13]);
  deal(s, 100);
  assert.equal(s.hands[0].result, 'lose');
  assert.equal(s.bank, START_BANK - 100);
});

test('double takes one card and doubles the bet', () => {
  const s = rigged([6, 10, 5, 7, 10, 10]); // player 11, doubles into 21; dealer 17
  deal(s, 100);
  double(s);
  assert.equal(s.hands[0].cards.length, 3);
  assert.equal(s.hands[0].bet, 200);
  assert.equal(s.hands[0].result, 'win');
  assert.equal(s.bank, START_BANK + 200);
});

test('split plays two hands', () => {
  const s = rigged([8, 10, 8, 9, 3, 10, 10]); // 8,8 vs 19; hands 8+3, 8+10
  deal(s, 100);
  assert.equal(canSplit(s), true);
  split(s);
  assert.equal(s.hands.length, 2);
  assert.equal(s.bank, START_BANK - 200);
  hit(s); // first hand 8+3+10 = 21 -> moves on
  stand(s); // second hand 18
  assert.equal(s.phase, 'done');
  assert.deepEqual(s.hands.map((h) => h.result), ['win', 'lose']);
  assert.equal(s.bank, START_BANK);
});

test('basic strategy picks the textbook moves', () => {
  const up = (r) => c(r);
  assert.equal(bestPlay([c(10), c(6)], up(10)), 'hit');
  assert.equal(bestPlay([c(10), c(6)], up(6)), 'stand');
  assert.equal(bestPlay([c(10), c(2)], up(3)), 'hit');
  assert.equal(bestPlay([c(6), c(5)], up(10)), 'double');
  assert.equal(bestPlay([c(6), c(5)], up(10), { double: false }), 'hit');
  assert.equal(bestPlay([c(8), c(8)], up(10)), 'split');
  assert.equal(bestPlay([c(13), c(12)], up(6)), 'stand');
  assert.equal(bestPlay([c(9), c(9)], up(7)), 'stand');
  assert.equal(bestPlay([c(1), c(7)], up(9)), 'hit');
  assert.equal(bestPlay([c(1), c(7)], up(4)), 'double');
  assert.equal(bestPlay([c(1), c(7)], up(4), { double: false }), 'stand');
  assert.equal(bestPlay([c(5), c(5)], up(5)), 'double');
});
