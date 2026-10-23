import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, turn, step, placeFood, stepMs } from '../games/snake/logic.js';

const head = (s) => s.snake[0];

test('starts with three cells, food off the snake, waiting for a swipe', () => {
  const s = newGame();
  assert.equal(s.snake.length, 3);
  assert.equal(s.status, 'ready');
  assert.ok(!s.snake.some((p) => p.x === s.food.x && p.y === s.food.y));
  assert.deepEqual(step(s), {});
});

test('turns queue up and reversing is ignored', () => {
  const s = newGame();
  assert.equal(turn(s, 'left'), false); // straight back into itself
  assert.equal(turn(s, 'up'), true);
  assert.equal(s.status, 'playing');
  assert.equal(turn(s, 'down'), false); // opposite of the queued turn
  assert.equal(turn(s, 'left'), true);
  const { x, y } = head(s);
  step(s);
  assert.deepEqual(head(s), { x, y: y - 1 });
  step(s);
  assert.deepEqual(head(s), { x: x - 1, y: y - 1 });
});

test('eating grows the snake and scores', () => {
  const s = newGame();
  s.food = { x: head(s).x + 1, y: head(s).y };
  turn(s, 'up');
  s.queue = [];
  s.dir = 'right';
  assert.equal(step(s).ate, true);
  assert.equal(s.score, 1);
  assert.equal(s.snake.length, 4);
  step(s);
  assert.equal(s.snake.length, 4);
});

test('walls end the game unless wrapping is on', () => {
  const s = newGame(true);
  s.status = 'playing';
  s.food = { x: 0, y: 0 };
  let res;
  for (let i = 0; i < 20 && !res?.died; i++) res = step(s);
  assert.equal(res.died, true);
  assert.equal(s.status, 'over');

  const w = newGame(false);
  w.status = 'playing';
  w.food = { x: 0, y: 0 };
  for (let i = 0; i < 20; i++) step(w);
  assert.equal(w.status, 'playing');
  assert.ok(head(w).x >= 0 && head(w).x < w.size);
});

test('running into yourself ends the game, but chasing your tail is fine', () => {
  const s = newGame();
  s.status = 'playing';
  s.food = { x: 0, y: 0 };
  // A 2x2 loop: the head moves into the cell the tail is leaving.
  s.snake = [{ x: 5, y: 5 }, { x: 5, y: 6 }, { x: 6, y: 6 }, { x: 6, y: 5 }];
  s.dir = 'right';
  assert.equal(step(s).died, undefined);
  // Five long and turning back on itself hits the body.
  s.snake = [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }, { x: 4, y: 6 }];
  s.dir = 'down';
  assert.equal(step(s).died, true);
});

test('filling the board wins', () => {
  const s = newGame(true, Math.random, 2);
  s.snake = [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }];
  s.status = 'playing';
  placeFood(s);
  assert.deepEqual(s.food, { x: 1, y: 0 });
  s.dir = 'right';
  assert.equal(step(s).won, true);
  assert.equal(s.status, 'won');
});

test('speed ramps up and levels off', () => {
  assert.equal(stepMs(0), 150);
  assert.ok(stepMs(10) < stepMs(0));
  assert.equal(stepMs(1000), 65);
});
