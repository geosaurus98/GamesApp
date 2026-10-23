// Pure Snake rules. The snake is a list of cells, head first.

export const SIZE = 17;

const VECTORS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

export function newGame(walls = true, rng = Math.random, size = SIZE) {
  const mid = Math.floor(size / 2);
  const state = {
    size,
    walls,
    snake: [{ x: mid - 2, y: mid }, { x: mid - 3, y: mid }, { x: mid - 4, y: mid }],
    dir: 'right',
    queue: [], // turns waiting for the next steps, so quick swipes aren't lost
    food: null,
    grow: 0,
    score: 0,
    status: 'ready', // ready | playing | over | won
  };
  placeFood(state, rng);
  return state;
}

export function placeFood(state, rng = Math.random) {
  const taken = new Set(state.snake.map((p) => p.y * state.size + p.x));
  const free = [];
  for (let i = 0; i < state.size * state.size; i++) if (!taken.has(i)) free.push(i);
  if (!free.length) {
    state.food = null;
    return false;
  }
  const i = free[Math.floor(rng() * free.length)];
  state.food = { x: i % state.size, y: Math.floor(i / state.size) };
  return true;
}

// Queue a turn. Reversing straight into yourself is ignored.
export function turn(state, dir) {
  if (!VECTORS[dir] || state.status === 'over' || state.status === 'won') return false;
  const last = state.queue.at(-1) ?? state.dir;
  if (dir === last || dir === OPPOSITE[last] || state.queue.length >= 3) return false;
  state.queue.push(dir);
  if (state.status === 'ready') state.status = 'playing';
  return true;
}

// Advance one cell. Returns { ate, died, won }.
export function step(state, rng = Math.random) {
  if (state.status !== 'playing') return {};
  if (state.queue.length) state.dir = state.queue.shift();
  const v = VECTORS[state.dir];
  const head = state.snake[0];
  let x = head.x + v.x;
  let y = head.y + v.y;
  if (x < 0 || y < 0 || x >= state.size || y >= state.size) {
    if (state.walls) {
      state.status = 'over';
      return { died: true };
    }
    x = (x + state.size) % state.size;
    y = (y + state.size) % state.size;
  }
  const ate = state.food && x === state.food.x && y === state.food.y;
  if (ate) state.grow += 1;
  // The tail moves out of the way this step unless the snake is growing.
  const body = state.grow > 0 ? state.snake : state.snake.slice(0, -1);
  if (body.some((p) => p.x === x && p.y === y)) {
    state.status = 'over';
    return { died: true };
  }
  state.snake.unshift({ x, y });
  if (state.grow > 0) state.grow--;
  else state.snake.pop();
  if (ate) {
    state.score++;
    if (!placeFood(state, rng)) {
      state.status = 'won';
      return { ate: true, won: true };
    }
  }
  return { ate: !!ate };
}

// Milliseconds per step: starts relaxed, speeds up as you eat.
export const stepMs = (score) => Math.max(65, 150 - score * 3);
