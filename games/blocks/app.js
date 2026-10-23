import {
  COLS, ROWS, TYPES, newGame, pieceCells, shift, rotate, softDrop, hardDrop, hold, update, ghostY, visibleRows,
} from './logic.js';
import { load, store, vibrate, registerServiceWorker } from '../../shared/util.js';

const SAVE_KEY = 'blocks.save.v1';
const BEST_KEY = 'blocks.best.v1';
const COLORS = {
  I: '#22c3e6', O: '#f7d038', T: '#a259d9', S: '#4cc35a', Z: '#e5484d', J: '#3b6fd8', L: '#f28c28',
};
const CLEAR_NAMES = ['', 'Single', 'Double', 'Triple', 'Four rows!'];

const $ = (id) => document.getElementById(id);
const canvas = $('board');
const ctx = canvas.getContext('2d');

let state = null;
let running = false; // false = paused or not started
let best = load(BEST_KEY, 0);
let cell = 20;

// ---------- drawing ----------

function resize() {
  const stage = $('stage');
  const h = stage.clientHeight - 12;
  const w = stage.clientWidth - 76 - 8 - 16;
  cell = Math.max(10, Math.floor(Math.min(h / ROWS, w / COLS)));
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${cell * COLS}px`;
  canvas.style.height = `${cell * ROWS}px`;
  canvas.width = cell * COLS * dpr;
  canvas.height = cell * ROWS * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}
window.addEventListener('resize', resize);

function block(c, x, y, size, color, alpha = 1) {
  c.globalAlpha = alpha;
  c.fillStyle = color;
  c.fillRect(x + 1, y + 1, size - 2, size - 2);
  c.fillStyle = 'rgba(255,255,255,0.28)';
  c.fillRect(x + 1, y + 1, size - 2, size * 0.18);
  c.fillStyle = 'rgba(0,0,0,0.22)';
  c.fillRect(x + 1, y + size * 0.82, size - 2, size * 0.18 - 1);
  c.globalAlpha = 1;
}

function draw() {
  if (!state) return;
  ctx.fillStyle = '#15171c';
  ctx.fillRect(0, 0, cell * COLS, cell * ROWS);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let x = 1; x < COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(x * cell + 0.5, 0);
    ctx.lineTo(x * cell + 0.5, ROWS * cell);
    ctx.stroke();
  }
  for (let y = 1; y < ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * cell + 0.5);
    ctx.lineTo(COLS * cell, y * cell + 0.5);
    ctx.stroke();
  }

  visibleRows(state).forEach((row, y) => row.forEach((v, x) => {
    if (v) block(ctx, x * cell, y * cell, cell, COLORS[TYPES[v - 1]]);
  }));

  if (state.status === 'playing' && state.piece) {
    const color = COLORS[state.piece.type];
    const gy = ghostY(state);
    for (const [x, y] of pieceCells({ ...state.piece, y: gy })) {
      if (y < 0) continue;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 2;
      ctx.strokeRect(x * cell + 2, y * cell + 2, cell - 4, cell - 4);
      ctx.globalAlpha = 1;
    }
    for (const [x, y] of pieceCells(state.piece)) {
      if (y >= 0) block(ctx, x * cell, y * cell, cell, color);
    }
  }
  drawMini($('hold'), state.hold ? [state.hold] : [], !state.canHold);
  drawMini($('next'), state.queue.slice(0, 3));
}

// Small previews for Hold and Next.
function drawMini(c, types, dim = false) {
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  const size = 14;
  types.forEach((type, i) => {
    const cells = pieceCells({ type, rot: 0, x: 0, y: 0 });
    const xs = cells.map(([x]) => x);
    const ys = cells.map(([, y]) => y);
    const w = (Math.max(...xs) - Math.min(...xs) + 1) * size;
    const h = (Math.max(...ys) - Math.min(...ys) + 1) * size;
    const ox = (c.width - w) / 2 - Math.min(...xs) * size;
    const oy = i * 56 + (56 - h) / 2 - Math.min(...ys) * size + 2;
    for (const [x, y] of cells) block(g, ox + x * size, oy + y * size, size, COLORS[type], dim ? 0.35 : 1);
  });
}

function renderHud() {
  $('score').textContent = state.score.toLocaleString();
  $('level').textContent = state.level;
  $('lines').textContent = state.lines;
  $('best').textContent = Math.max(best, state.score).toLocaleString();
}

function popup(text) {
  const el = $('popup');
  el.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

function showOverlay(title, text, button = false) {
  $('overlay-title').textContent = title;
  $('overlay-text').textContent = text;
  $('overlay-btn').hidden = !button;
  $('overlay').hidden = false;
}

// ---------- game flow ----------

function afterLock(res) {
  if (!res) return;
  if (res.cleared) {
    popup(CLEAR_NAMES[res.cleared]);
    vibrate(res.cleared === 4 ? [40, 40, 80] : 25);
  } else if (res.locked || res.dropped) {
    vibrate(6);
  }
  renderHud();
  if (state.status === 'over') gameOver();
}

function gameOver() {
  running = false;
  const isBest = state.score > best;
  if (isBest) {
    best = state.score;
    store(BEST_KEY, best);
  }
  store(SAVE_KEY, null);
  renderHud();
  draw();
  vibrate([80, 40, 120]);
  showOverlay(isBest && state.score > 0 ? '★ New best!' : 'Game over',
    `Score ${state.score.toLocaleString()} · ${state.lines} lines`, true);
}

let last = 0;
function frame(now) {
  const dt = Math.min(100, now - (last || now));
  last = now;
  if (running && state.status === 'playing') {
    afterLock(update(state, dt));
    draw();
  }
  requestAnimationFrame(frame);
}

function act(name) {
  if (!running || state.status !== 'playing') return;
  if (name === 'left') shift(state, -1);
  else if (name === 'right') shift(state, 1);
  else if (name === 'rotate') rotate(state, 1);
  else if (name === 'rotateBack') rotate(state, -1);
  else if (name === 'down') softDrop(state);
  else if (name === 'drop') afterLock(hardDrop(state));
  else if (name === 'hold') hold(state);
  renderHud();
  draw();
}

function start(level = 1) {
  state = newGame(Math.random, level);
  running = true;
  last = 0;
  $('overlay').hidden = true;
  renderHud();
  draw();
}

function pause() {
  if (!running) return;
  running = false;
  store(SAVE_KEY, state);
  showOverlay('Paused', 'Tap to keep going');
}

function resume() {
  if (!state || state.status !== 'playing') return;
  running = true;
  last = 0;
  $('overlay').hidden = true;
}

// ---------- input: buttons with auto-repeat ----------

const REPEAT = { left: [170, 50], right: [170, 50], down: [0, 40] };
for (const btn of document.querySelectorAll('.controls button')) {
  let timer = 0;
  const stop = () => {
    clearTimeout(timer);
    btn.classList.remove('down');
  };
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!running) {
      if (state?.status === 'playing') resume();
      return;
    }
    const name = btn.dataset.act;
    btn.classList.add('down');
    act(name);
    const rep = REPEAT[name];
    if (!rep) return;
    const loop = () => {
      act(name);
      timer = setTimeout(loop, rep[1]);
    };
    timer = setTimeout(loop, rep[0] || rep[1]);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, stop);
}

// ---------- input: gestures on the board ----------

let g = null;
$('board-wrap').addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  if (!running) {
    if (!state || state.status === 'over') return;
    if (state.status === 'playing') resume();
    return;
  }
  g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, cx: e.clientX, cy: e.clientY, t0: performance.now(), moved: false };
});
window.addEventListener('pointermove', (e) => {
  if (!g || e.pointerId !== g.id || !running) return;
  const step = cell * 0.9;
  while (e.clientX - g.cx >= step) {
    act('right');
    g.cx += step;
    g.moved = true;
  }
  while (g.cx - e.clientX >= step) {
    act('left');
    g.cx -= step;
    g.moved = true;
  }
  while (e.clientY - g.cy >= step && Math.abs(e.clientY - g.y0) > Math.abs(e.clientX - g.x0)) {
    act('down');
    g.cy += step;
    g.moved = true;
  }
});
window.addEventListener('pointerup', (e) => {
  if (!g || e.pointerId !== g.id) return;
  const dx = e.clientX - g.x0;
  const dy = e.clientY - g.y0;
  const fast = performance.now() - g.t0 < 260;
  const moved = g.moved;
  g = null;
  if (!running) return;
  if (fast && dy > 50 && Math.abs(dy) > Math.abs(dx) * 1.5) act('drop');
  else if (fast && dy < -40 && Math.abs(dy) > Math.abs(dx) * 1.5) act('hold');
  else if (!moved && Math.hypot(dx, dy) < 12) act('rotate');
});
window.addEventListener('pointercancel', () => { g = null; });

$('overlay').addEventListener('click', (e) => {
  if (e.target.closest('button')) return;
  if (!state) start();
});
$('overlay-btn').addEventListener('click', () => start(state?.startLevel ?? 1));

const KEYS = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down', ArrowUp: 'rotate',
  x: 'rotate', z: 'rotateBack', ' ': 'drop', c: 'hold', Shift: 'hold',
};
document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]')) return;
  if (e.key === 'p' || e.key === 'Escape') {
    if (running) pause();
    else resume();
    return;
  }
  const name = KEYS[e.key];
  if (!name) return;
  e.preventDefault();
  if (!state) {
    start();
    return;
  }
  act(name);
});

// ---------- menu ----------

$('menu-btn').addEventListener('click', () => {
  pause();
  $('menu').showModal();
});
$('resume-btn').addEventListener('click', () => {
  $('menu').close();
  resume();
});
for (const btn of document.querySelectorAll('[data-start]')) {
  btn.addEventListener('click', () => {
    $('menu').close();
    start(Number(btn.dataset.start));
  });
}
for (const btn of document.querySelectorAll('[data-close]')) {
  btn.addEventListener('click', () => btn.closest('dialog').close());
}
$('menu').addEventListener('click', (e) => {
  if (e.target === $('menu')) $('menu').close();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') pause();
});
window.addEventListener('pagehide', () => {
  if (state?.status === 'playing') store(SAVE_KEY, state);
});

// ---------- start ----------

const saved = load(SAVE_KEY, null);
if (saved?.board && saved.status === 'playing') {
  state = saved;
  showOverlay('Paused', 'Tap to keep going');
} else {
  state = null;
  showOverlay('Falling Blocks', 'Tap to start');
}
$('best').textContent = best.toLocaleString();
resize();
if (state) renderHud();
requestAnimationFrame(frame);

registerServiceWorker();
