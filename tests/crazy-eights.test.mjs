import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_DRAWS, newRound, top, canPlay, play, draw, canPass, pass, handPoints, chooseMove,
} from '../games/crazy-eights/logic.js';

const card = (rank, suit) => ({ id: suit * 13 + rank - 1, suit, rank });

function table(hands, start, stock = []) {
  return { hands, stock, discard: [start], suit: start.suit, turn: 0, draws: 0, status: 'playing', winner: null };
}

test('deals 7 each for two players, 5 each for more; never starts on an eight', () => {
  for (let i = 0; i < 30; i++) {
    const two = newRound(2);
    assert.deepEqual(two.hands.map((h) => h.length), [7, 7]);
    assert.notEqual(top(two).rank, 8);
    const four = newRound(4);
    assert.deepEqual(four.hands.map((h) => h.length), [5, 5, 5, 5]);
    assert.equal(four.stock.length + 20 + 1, 52);
  }
});

test('match suit or rank; eights are wild and set the suit', () => {
  const s = table([[card(5, 0), card(9, 2), card(8, 3), card(2, 1)], [card(3, 3)]], card(9, 1));
  assert.equal(canPlay(s, card(5, 0)), false);
  assert.equal(canPlay(s, card(9, 2)), true);
  assert.equal(canPlay(s, card(2, 1)), true);
  assert.equal(play(s, 0, card(8, 3).id), false); // needs a suit
  assert.equal(play(s, 0, card(8, 3).id, 0), true);
  assert.equal(s.suit, 0);
  assert.equal(s.turn, 1);
  assert.equal(play(s, 0, card(5, 0).id), false); // not your turn
});

test('draw up to three, then pass', () => {
  const s = table([[card(5, 0)], [card(3, 3)]], card(9, 1), [card(1, 3), card(2, 3), card(4, 3), card(6, 3)]);
  assert.equal(canPass(s, 0), false);
  for (let i = 0; i < MAX_DRAWS; i++) assert.ok(draw(s, 0));
  assert.equal(draw(s, 0), null);
  assert.equal(pass(s, 0), true);
  assert.equal(s.turn, 1);
});

test('an empty deck is rebuilt from the discard pile', () => {
  const s = table([[card(5, 0)], [card(3, 3)]], card(9, 1), []);
  s.discard = [card(2, 2), card(4, 2), card(9, 1)];
  assert.ok(draw(s, 0));
  assert.equal(s.discard.length, 1);
  assert.equal(top(s).rank, 9);
  assert.equal(s.stock.length, 1);
});

test('emptying your hand wins; points count what others hold', () => {
  const s = table([[card(9, 2)], [card(8, 3), card(13, 0), card(4, 1)]], card(9, 1));
  play(s, 0, card(9, 2).id);
  assert.equal(s.status, 'over');
  assert.equal(s.winner, 0);
  assert.equal(handPoints(s.hands[1]), 50 + 10 + 4);
});

test('computer saves eights and picks its strongest suit', () => {
  const s = table([[], [card(8, 0), card(3, 1), card(7, 2), card(10, 2)]], card(3, 3));
  s.turn = 1;
  assert.deepEqual(chooseMove(s, 1), { play: card(3, 1).id });
  s.hands[1] = [card(8, 0), card(7, 2), card(10, 2), card(12, 1)];
  assert.deepEqual(chooseMove(s, 1), { play: card(8, 0).id, suit: 2 });
  s.hands[1] = [card(7, 2)];
  s.stock = [card(1, 1)];
  assert.deepEqual(chooseMove(s, 1), { draw: true });
  s.draws = MAX_DRAWS;
  assert.deepEqual(chooseMove(s, 1), { pass: true });
});

test('a whole game between computers always finishes', () => {
  for (let g = 0; g < 200; g++) {
    const s = newRound(2 + (g % 3));
    let guard = 0;
    while (s.status === 'playing' && guard++ < 5000) {
      const m = chooseMove(s, s.turn);
      if (m.play != null) play(s, s.turn, m.play, m.suit);
      else if (m.draw) draw(s, s.turn);
      else pass(s, s.turn);
    }
    assert.equal(s.status, 'over');
    if (!s.blocked) assert.equal(s.hands[s.winner].length, 0);
  }
});

test('if everyone is stuck with no deck, the lowest hand wins', () => {
  const s = table([[card(13, 0)], [card(2, 0), card(3, 0)]], card(9, 1), []);
  assert.equal(pass(s, 0), true);
  assert.equal(pass(s, 1), true);
  assert.equal(s.status, 'over');
  assert.equal(s.winner, 1); // 5 points beats 10
});
