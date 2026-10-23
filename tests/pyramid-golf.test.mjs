import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../games/pyramid/logic.js';
import * as G from '../games/golf/logic.js';

const card = (rank, suit = 0) => ({ id: suit * 13 + rank - 1, suit, rank });

// ---------- Pyramid ----------

function pyramidWith(cards) {
  const s = P.deal();
  s.pyramid = new Array(28).fill(null);
  for (const [n, c] of Object.entries(cards)) s.pyramid[n] = c;
  s.stock = [];
  s.waste = [];
  return s;
}

test('pyramid: 28 cards in seven rows, 24 in the stock', () => {
  const s = P.deal();
  assert.equal(s.pyramid.length, 28);
  assert.equal(s.stock.length, 24);
  assert.equal(P.slot(6, 0), 21);
  assert.equal(P.rowOf(21), 6);
  assert.equal(P.rowOf(20), 5);
  assert.deepEqual([...Array(28).keys()].filter((n) => P.isFree(s, n)), [21, 22, 23, 24, 25, 26, 27]);
});

test('pyramid: a card is free only once both cards on it are gone', () => {
  const s = P.deal();
  const n = P.slot(5, 0); // rests under slots (6,0) and (6,1)
  assert.equal(P.isFree(s, n), false);
  s.pyramid[P.slot(6, 0)] = null;
  assert.equal(P.isFree(s, n), false);
  s.pyramid[P.slot(6, 1)] = null;
  assert.equal(P.isFree(s, n), true);
});

test('pyramid: pairs must add to 13 and kings go alone', () => {
  const s = pyramidWith({ 21: card(6), 22: card(7, 1), 23: card(13), 24: card(5) });
  s.stock = [card(1)];
  assert.equal(P.remove(s, { pile: 'pyramid', index: 21 }, { pile: 'pyramid', index: 24 }), false);
  assert.equal(P.remove(s, { pile: 'pyramid', index: 21 }, { pile: 'pyramid', index: 22 }), true);
  assert.equal(P.remove(s, { pile: 'pyramid', index: 24 }), false);
  assert.equal(P.remove(s, { pile: 'pyramid', index: 23 }), true);
  assert.equal(s.removed, 3);
});

test('pyramid: the waste card can pair with the pyramid; clearing it wins', () => {
  const s = pyramidWith({ 0: card(12) });
  s.waste = [card(1, 2)];
  assert.deepEqual(P.findMove(s), [{ pile: 'pyramid', index: 0 }, { pile: 'waste' }]);
  P.remove(s, { pile: 'pyramid', index: 0 }, { pile: 'waste' });
  assert.equal(s.status, 'won');
});

test('pyramid: three passes through the stock, then stuck means lost', () => {
  const s = pyramidWith({ 0: card(2) });
  s.stock = [card(3), card(4)];
  for (let i = 0; i < 2; i++) P.draw(s);
  assert.equal(P.draw(s), true); // second pass
  P.draw(s);
  P.draw(s);
  assert.equal(P.draw(s), true); // third pass
  P.draw(s);
  P.draw(s);
  assert.equal(s.status, 'lost');
  assert.equal(P.draw(s), false);
});

// ---------- Golf ----------

test('golf: seven columns of five, one card on the pile', () => {
  const s = G.deal();
  assert.deepEqual(s.columns.map((c) => c.length), [5, 5, 5, 5, 5, 5, 5]);
  assert.equal(s.pile.length, 1);
  assert.equal(s.stock.length, 16);
});

test('golf: play one higher or lower, no wrapping', () => {
  assert.equal(G.fits(card(5), card(6)), true);
  assert.equal(G.fits(card(7), card(6)), true);
  assert.equal(G.fits(card(8), card(6)), false);
  assert.equal(G.fits(card(1), card(13)), false);
  const s = G.deal();
  s.pile = [card(6)];
  s.columns[0] = [card(9), card(5)];
  assert.equal(G.play(s, 0), true);
  assert.equal(G.play(s, 0), false); // 9 on 5
  assert.equal(s.streak, 1);
});

test('golf: clearing every column wins and scores the unused stock', () => {
  const s = G.deal();
  s.columns = [[card(7)], [], [], [], [], [], []];
  s.pile = [card(6)];
  s.stock = [card(1), card(2)];
  G.play(s, 0);
  assert.equal(s.status, 'won');
  assert.equal(G.score(s), -2);
});

test('golf: out of stock with nothing to play ends the game', () => {
  const s = G.deal();
  s.columns = [[card(10)], [], [], [], [], [], []];
  s.pile = [card(2)];
  s.stock = [card(5)];
  G.draw(s);
  assert.equal(s.status, 'over');
  assert.equal(G.score(s), 1);
});
