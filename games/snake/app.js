import { newGame, turn, step, stepMs } from './logic.js';
import { load, store, vibrate, registerServiceWorker } from '../../shared/util.js';

const SAVE_KEY = 'snake.save.v1';
const BEST_KEY = 'snake.best.v1';
const WALLS_KEY = 'snake.walls.v1';
const SWIPE_MIN = 22;

const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const ctx = canvas.getContext('2d');

let walls = load(WALLS_KEY, true);
let state = null;
let paused = false;
let best = load(BEST_KEY, {});
const bestKey = () => (walls ? 'walls' : 'wrap');

// ---------- drawing ----------

let px = 0; // canvas size in device pixels
function resize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  px = Math.round(rect.width * dpr);
  canvas.width = px;
  canvas.height = px;
  draw();
}
window.addEventListener('resize', resize);

const COLORS = {
  light: '#aad751',
  dark: '#a2d149',
  head: '#3b6fd8',
  tail: '#7fa6f2',
  food: '#e7471d',
};

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h); // older browsers
  ctx.fill();
}

function draw() {
  if (!state || !px) return;
  const n = state.size;
  const cell = px / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      ctx.fillStyle = (x + y) % 2 ? COLORS.dark : COLORS.light;
      ctx.fillRect(x * cell, y * cell, cell + 0.5, cell + 0.5);
    }
  }

  if (state.food) {
    const { x, y } = state.food;
    const cx = (x + 0.5) * cell;
    const cy = (y + 0.55) * cell;
    ctx.fillStyle = COLORS.food;
    ctx.beginPath();
    ctx.arc(cx, cy, cell * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4a8f29';
    ctx.beginPath();
    ctx.ellipse(cx + cell * 0.12, cy - cell * 0.4, cell * 0.14, cell * 0.07, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.arc(cx - cell * 0.13, cy - cell * 0.12, cell * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }

  // Body from tail to head so the head is drawn on top; colour fades to the tail.
  const len = state.snake.length;
  for (let i = len - 1; i >= 0; i--) {
    const p = state.snake[i];
    const t = len > 1 ? i / (len - 1) : 0;
    ctx.fillStyle = mix(COLORS.head, COLORS.tail, t);
    const pad = cell * (i === 0 ? 0.04 : 0.1);
    roundRect(p.x * cell + pad, p.y * cell + pad, cell - pad * 2, cell - pad * 2, cell * 0.3);
    // Fill the gap to the next segment so the body looks joined up.
    const next = state.snake[i - 1];
    if (next && Math.abs(next.x - p.x) + Math.abs(next.y - p.y) === 1) {
      const gx = Math.min(p.x, next.x) * cell + (next.x !== p.x ? cell / 2 : pad);
      const gy = Math.min(p.y, next.y) * cell + (next.y !== p.y ? cell / 2 : pad);
      const gw = next.x !== p.x ? cell : cell - pad * 2;
      const gh = next.y !== p.y ? cell : cell - pad * 2;
      ctx.fillRect(gx, gy, gw, gh);
    }
  }
  drawEyes(state.snake[0], cell);
}

function drawEyes(head, cell) {
  const dirs = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const [dx, dy] = dirs[state.dir];
  const cx = (head.x + 0.5) * cell + dx * cell * 0.15;
  const cy = (head.y + 0.5) * cell + dy * cell * 0.15;
  const side = [dy, -dx];
  const dead = state.status === 'over';
  for (const s of [-1, 1]) {
    const ex = cx + side[0] * s * cell * 0.2;
    const ey = cy + side[1] * s * cell * 0.2;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ex, ey, cell * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1d1d1f';
    if (dead) {
      ctx.fillRect(ex - cell * 0.08, ey - cell * 0.02, cell * 0.16, cell * 0.04);
    } else {
      ctx.beginPath();
      ctx.arc(ex + dx * cell * 0.04, ey + dy * cell * 0.04, cell * 0.065, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function mix(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',')})`;
}

// ---------- HUD & overlay ----------

function renderHud() {
  $('score').textContent = state.score;
  $('best').textContent = best[bestKey()] ?? 0;
  $('mode-label').textContent = walls ? 'Walls on' : 'No walls';
}

function showOverlay(title, text, button = false) {
  $('overlay-title').textContent = title;
  $('overlay-text').textContent = text;
  $('overlay-btn').hidden = !button;
  $('overlay').hidden = false;
}

const hideOverlay = () => { $('overlay').hidden = true; };

function bump() {
  const box = $('score').parentElement;
  box.classList.remove('bump');
  void box.offsetWidth;
  box.classList.add('bump');
}

// ---------- game loop ----------

let last = 0;
let acc = 0;
function frame(now) {
  const dt = Math.min(250, now - (last || now));
  last = now;
  if (state.status === 'playing' && !paused) {
    acc += dt;
    while (acc >= stepMs(state.score) && state.status === 'playing') {
      acc -= stepMs(state.score);
      const res = step(state);
      if (res.ate) {
        vibrate(12);
        bump();
        renderHud();
      }
      if (res.died || res.won) end(res.won);
    }
    draw();
  }
  requestAnimationFrame(frame);
}

function end(won) {
  const key = bestKey();
  const isBest = state.score > (best[key] ?? 0);
  if (isBest) {
    best[key] = state.score;
    store(BEST_KEY, best);
  }
  renderHud();
  draw();
  store(SAVE_KEY, null);
  if (won) {
    vibrate([40, 60, 40, 60, 120]);
    showOverlay('🏆 You filled the board!', `Score ${state.score}`, true);
    return;
  }
  vibrate([80, 40, 120]);
  const stage = canvas.parentElement;
  stage.classList.remove('shake');
  void stage.offsetWidth;
  stage.classList.add('shake');
  setTimeout(() => showOverlay(
    isBest && state.score > 0 ? '★ New best!' : 'Game over',
    `Score ${state.score}${isBest ? '' : ` · Best ${best[key] ?? 0}`}`,
    true,
  ), 450);
}

function startGame() {
  state = newGame(walls);
  paused = false;
  acc = 0;
  renderHud();
  draw();
  showOverlay('Snake', 'Swipe in any direction to start');
}

function setPaused(on) {
  if (state.status !== 'playing') return;
  paused = on;
  if (on) {
    showOverlay('Paused', 'Tap to keep going');
    store(SAVE_KEY, { state, walls });
  } else {
    hideOverlay();
    last = 0;
  }
}

function steer(dir) {
  if (paused) setPaused(false);
  if (state.status === 'over' || state.status === 'won') return;
  const wasReady = state.status === 'ready';
  if (turn(state, dir) && wasReady) hideOverlay();
}

// ---------- input ----------

let touch = null;
$('play').addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  touch = { id: e.pointerId, x: e.clientX, y: e.clientY, swiped: false };
});
window.addEventListener('pointermove', (e) => {
  if (!touch || e.pointerId !== touch.id) return;
  const dx = e.clientX - touch.x;
  const dy = e.clientY - touch.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
  steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  // Keep tracking from here so one gesture can make several turns.
  touch.x = e.clientX;
  touch.y = e.clientY;
  touch.swiped = true;
});
window.addEventListener('pointerup', (e) => {
  if (!touch || e.pointerId !== touch.id) return;
  const tapped = !touch.swiped;
  touch = null;
  if (!tapped) return;
  if (state.status === 'playing') setPaused(!paused);
  else if (state.status === 'ready') {
    // A tap also starts the game, heading the way the snake faces.
    state.status = 'playing';
    hideOverlay();
  }
});
window.addEventListener('pointercancel', () => { touch = null; });

const KEYS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
};
document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]')) return;
  if (KEYS[e.key]) {
    e.preventDefault();
    steer(KEYS[e.key]);
  } else if (e.key === ' ' || e.key === 'p') {
    e.preventDefault();
    if (state.status === 'playing') setPaused(!paused);
    else if (state.status !== 'ready') startGame();
  }
});

$('overlay-btn').addEventListener('click', startGame);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') setPaused(true);
});

// ---------- menu ----------

$('menu-btn').addEventListener('click', () => {
  setPaused(true);
  $('menu').showModal();
});
for (const btn of document.querySelectorAll('[data-walls]')) {
  btn.addEventListener('click', () => {
    walls = btn.dataset.walls === '1';
    store(WALLS_KEY, walls);
    $('menu').close();
    startGame();
  });
}
for (const btn of document.querySelectorAll('[data-close]')) {
  btn.addEventListener('click', () => btn.closest('dialog').close());
}
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
}

// ---------- start ----------

const saved = load(SAVE_KEY, null);
if (saved?.state?.snake && saved.state.status === 'playing') {
  walls = saved.walls;
  state = saved.state;
  paused = true;
  renderHud();
  showOverlay('Paused', 'Tap to keep going');
} else {
  startGame();
}
resize();
requestAnimationFrame(frame);

registerServiceWorker();
