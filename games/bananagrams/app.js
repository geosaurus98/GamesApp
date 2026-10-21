import {
  MODES, cellKey, parseKey, newGame, checkBoard, locateTile, placeTile, returnToRack,
  recallAll, shuffleRack, dump, peel,
} from './logic.js';

const GRID = 80; // board is GRID x GRID cells
const MIN_CELL = 22;
const MAX_CELL = 64;
const SAVE_KEY = 'bananagrams.save.v1';
const SETTINGS_KEY = 'bananagrams.settings.v1';
const BEST_KEY = 'bananagrams.best.v1';
const DRAG_THRESHOLD = 8;

const $ = (id) => document.getElementById(id);
const els = {
  boardScroll: $('board-scroll'),
  board: $('board'),
  rack: $('rack'),
  timer: $('timer'),
  bunchCount: $('bunch-count'),
  status: $('status'),
  peelBtn: $('peel-btn'),
  dumpBtn: $('dump-btn'),
  toast: $('toast'),
  menu: $('menu'),
  win: $('win'),
  loading: $('loading'),
  hintsToggle: $('hints-toggle'),
};

let words = new Set();
const isWord = (w) => words.has(w.toLowerCase());

let state = null;
let settings = { hints: true, cell: 36 };
let selectedId = null;
let freshIds = new Set(); // tiles to animate on next render
let lastCheck = null;

// ---------- storage ----------

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function store(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the game still works, it just won't resume.
  }
}

const saveGame = () => store(SAVE_KEY, state);

// ---------- rendering ----------

function tileEl(tile) {
  const el = document.createElement('div');
  el.className = 'tile';
  el.textContent = tile.letter;
  el.dataset.id = tile.id;
  if (tile.id === selectedId) el.classList.add('selected');
  if (freshIds.has(tile.id)) el.classList.add('new');
  return el;
}

function render() {
  lastCheck = checkBoard(state.board, isWord);

  const boardFrag = document.createDocumentFragment();
  for (const [key, tile] of Object.entries(state.board)) {
    const { x, y } = parseKey(key);
    const el = tileEl(tile);
    el.style.left = `calc(var(--cell) * ${x})`;
    el.style.top = `calc(var(--cell) * ${y})`;
    if (settings.hints && lastCheck.badCells.has(key)) el.classList.add('bad');
    if (lastCheck.islandCells.has(key)) el.classList.add('island');
    boardFrag.append(el);
  }
  els.board.replaceChildren(boardFrag);

  els.rack.replaceChildren(...state.rack.map(tileEl));
  freshIds = new Set();

  els.bunchCount.textContent = `🍌 ${state.bunch.length}`;
  const bananas = state.bunch.length === 0;
  els.peelBtn.textContent = bananas ? 'Bananas!' : 'Peel!';
  els.dumpBtn.disabled = state.bunch.length < 3;
  renderStatus();
  renderTimer();
}

function renderStatus() {
  const c = lastCheck;
  let text = '';
  let good = false;
  if (c.tileCount > 0 && !c.connected) {
    text = 'Some tiles aren’t connected';
  } else if (settings.hints && c.invalid.length) {
    const list = [...new Set(c.invalid.map((w) => w.word))];
    text = `Not words: ${list.slice(0, 4).join(', ')}${list.length > 4 ? '…' : ''}`;
  } else if (state.rack.length === 0 && c.valid) {
    text = state.bunch.length ? 'Looks good — Peel!' : 'Grid complete — call Bananas!';
    good = true;
  }
  if (!text) {
    els.status.replaceChildren();
    return;
  }
  const span = document.createElement('span');
  span.textContent = text;
  if (good) span.className = 'good';
  els.status.replaceChildren(span);
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

function renderTimer() {
  els.timer.textContent = formatTime(state.elapsedMs);
}

let toastTimer = 0;
function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2400);
}

function vibrate(ms) {
  navigator.vibrate?.(ms);
}

// ---------- zoom & scrolling ----------

function setCell(size, anchor) {
  const cell = Math.round(Math.max(MIN_CELL, Math.min(MAX_CELL, size)));
  const sc = els.boardScroll;
  const rect = sc.getBoundingClientRect();
  const ax = anchor ? anchor.x - rect.left : rect.width / 2;
  const ay = anchor ? anchor.y - rect.top : rect.height / 2;
  const old = settings.cell;
  const bx = (sc.scrollLeft + ax) / old;
  const by = (sc.scrollTop + ay) / old;
  settings.cell = cell;
  applyCell();
  sc.scrollLeft = bx * cell - ax;
  sc.scrollTop = by * cell - ay;
}

function applyCell() {
  els.board.style.setProperty('--cell', `${settings.cell}px`);
  els.board.style.width = `${GRID * settings.cell}px`;
  els.board.style.height = `${GRID * settings.cell}px`;
}

function centerView(smooth = false) {
  const keys = Object.keys(state.board);
  let cx = GRID / 2;
  let cy = GRID / 2;
  if (keys.length) {
    const pts = keys.map(parseKey);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    cx = (Math.min(...xs) + Math.max(...xs) + 1) / 2;
    cy = (Math.min(...ys) + Math.max(...ys) + 1) / 2;
  }
  const sc = els.boardScroll;
  sc.scrollTo({
    left: cx * settings.cell - sc.clientWidth / 2,
    top: cy * settings.cell - sc.clientHeight / 2,
    behavior: smooth ? 'smooth' : 'auto',
  });
}

function cellAt(clientX, clientY) {
  const rect = els.board.getBoundingClientRect();
  const x = Math.floor((clientX - rect.left) / settings.cell);
  const y = Math.floor((clientY - rect.top) / settings.cell);
  if (x < 0 || y < 0 || x >= GRID || y >= GRID) return null;
  return { x, y };
}

// Pinch to zoom on the board.
let pinch = null;
function touchDistance(t) {
  return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
}
els.boardScroll.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2 && !drag) {
    pinch = { dist: touchDistance(e.touches), cell: settings.cell };
  }
}, { passive: true });
els.boardScroll.addEventListener('touchmove', (e) => {
  if (!pinch || e.touches.length !== 2) return;
  e.preventDefault();
  const mid = {
    x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
    y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
  };
  setCell(pinch.cell * (touchDistance(e.touches) / pinch.dist), mid);
}, { passive: false });
els.boardScroll.addEventListener('touchend', (e) => {
  if (e.touches.length < 2 && pinch) {
    pinch = null;
    store(SETTINGS_KEY, settings);
  }
});
els.boardScroll.addEventListener('wheel', (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  setCell(settings.cell * (e.deltaY < 0 ? 1.1 : 0.9), { x: e.clientX, y: e.clientY });
}, { passive: false });
// Stop iOS Safari zooming the whole page.
document.addEventListener('gesturestart', (e) => e.preventDefault());

$('zoom-in').addEventListener('click', () => { setCell(settings.cell * 1.2); store(SETTINGS_KEY, settings); });
$('zoom-out').addEventListener('click', () => { setCell(settings.cell / 1.2); store(SETTINGS_KEY, settings); });
$('center-btn').addEventListener('click', () => centerView(true));

// ---------- moves ----------

function afterMove() {
  selectedId = null;
  saveGame();
  render();
}

function moveToBoard(id, cell) {
  if (placeTile(state, id, cell.x, cell.y)) vibrate(8);
  afterMove();
}

function moveToRack(id, index) {
  returnToRack(state, id, index);
  afterMove();
}

function doDump(id) {
  const result = dump(state, id);
  if (!result.ok) {
    toast(result.message);
    selectedId = null;
    render();
    return;
  }
  result.drawn.forEach((t) => freshIds.add(t.id));
  vibrate(20);
  toast(`Dumped — drew ${result.drawn.map((t) => t.letter).join(' ')}`);
  afterMove();
}

function doPeel() {
  const result = peel(state, isWord);
  if (!result.ok) {
    vibrate([30, 40, 30]);
    toast(result.message);
    return;
  }
  if (result.won) {
    vibrate([40, 60, 40, 60, 120]);
    saveGame();
    render();
    showWin(result.check);
    return;
  }
  result.drawn.forEach((t) => freshIds.add(t.id));
  vibrate(15);
  toast(`Peel! You drew ${result.drawn[0].letter}`);
  afterMove();
}

// ---------- tap & drag ----------

let drag = null;
let autoScrollFrame = 0;
// A tap re-renders the tile, so the browser's follow-up click can land on the
// board or rack behind it. Ignore clicks right after a tile tap.
let lastTileTap = 0;
const justTapped = () => performance.now() - lastTileTap < 400;
const dropHint = document.createElement('div');
dropHint.className = 'drop-hint';

function onPointerDown(e) {
  const el = e.target.closest('.tile');
  if (!el || state.status !== 'playing' || pinch) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  el.setPointerCapture(e.pointerId);
  drag = {
    id: Number(el.dataset.id),
    el,
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    x: e.clientX,
    y: e.clientY,
    // Lift the tile above a finger so it stays visible.
    offsetY: e.pointerType === 'touch' ? -28 : 0,
    moved: false,
    ghost: null,
  };
}

function dropPoint() {
  return { x: drag.x, y: drag.y + drag.offsetY };
}

function onPointerMove(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  drag.x = e.clientX;
  drag.y = e.clientY;
  if (!drag.moved) {
    if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < DRAG_THRESHOLD) return;
    drag.moved = true;
    selectedId = null;
    drag.el.classList.remove('selected');
    drag.el.classList.add('dragging');
    const ghost = drag.el.cloneNode(true);
    ghost.className = 'tile ghost';
    const size = Math.max(settings.cell, 36);
    ghost.style.cssText = `width:${size}px;height:${size}px;font-size:${size * 0.58}px;`;
    document.body.append(ghost);
    drag.ghost = ghost;
    autoScroll();
  }
  updateDrag();
}

function updateDrag() {
  const p = dropPoint();
  drag.ghost.style.left = `${p.x}px`;
  drag.ghost.style.top = `${p.y}px`;
  const target = document.elementFromPoint(p.x, p.y);
  els.dumpBtn.classList.toggle('drop-target', !!target?.closest('#dump-btn'));
  els.rack.classList.toggle('drop-target', !!target?.closest('.tray') && !target.closest('.actions'));
  const cell = target?.closest('#board-scroll') ? cellAt(p.x, p.y) : null;
  if (cell) {
    dropHint.style.left = `${cell.x * settings.cell}px`;
    dropHint.style.top = `${cell.y * settings.cell}px`;
    if (!dropHint.isConnected) els.board.append(dropHint);
  } else {
    dropHint.remove();
  }
}

// Scroll the board while dragging near its edges.
function autoScroll() {
  if (!drag?.moved) return;
  const p = dropPoint();
  const r = els.boardScroll.getBoundingClientRect();
  const edge = 36;
  const speed = 10;
  let dx = 0;
  let dy = 0;
  if (p.y > r.top && p.y < r.bottom) {
    if (p.x < r.left + edge) dx = -speed;
    else if (p.x > r.right - edge) dx = speed;
  }
  if (p.x > r.left && p.x < r.right) {
    if (p.y < r.top + edge) dy = -speed;
    else if (p.y > r.bottom - edge && p.y < r.bottom) dy = speed;
  }
  if (dx || dy) {
    els.boardScroll.scrollBy(dx, dy);
    updateDrag();
  }
  autoScrollFrame = requestAnimationFrame(autoScroll);
}

function endDrag() {
  cancelAnimationFrame(autoScrollFrame);
  drag?.ghost?.remove();
  drag?.el.classList.remove('dragging');
  dropHint.remove();
  els.dumpBtn.classList.remove('drop-target');
  els.rack.classList.remove('drop-target');
  drag = null;
}

function rackIndexAt(x, y) {
  const tiles = [...els.rack.children];
  for (let i = 0; i < tiles.length; i++) {
    const r = tiles[i].getBoundingClientRect();
    if (y < r.top - 3) return i;
    if (y <= r.bottom + 3 && x < r.left + r.width / 2) return i;
  }
  return tiles.length;
}

function onPointerUp(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const { id, moved } = drag;
  const p = dropPoint();
  endDrag();
  if (!moved) {
    lastTileTap = performance.now();
    tapTile(id);
    return;
  }
  const target = document.elementFromPoint(p.x, p.y);
  if (target?.closest('#dump-btn')) {
    doDump(id);
  } else if (target?.closest('.tray') && !target.closest('.actions')) {
    moveToRack(id, rackIndexAt(p.x, p.y));
  } else if (target?.closest('#board-scroll')) {
    const cell = cellAt(p.x, p.y);
    if (cell) moveToBoard(id, cell);
    else render();
  } else {
    render();
  }
}

function tapTile(id) {
  selectedId = selectedId === id ? null : id;
  render();
}

window.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointermove', onPointerMove);
window.addEventListener('pointerup', onPointerUp);
window.addEventListener('pointercancel', (e) => {
  if (drag && e.pointerId === drag.pointerId) {
    endDrag();
    render();
  }
});

// Tap an empty square to place the selected tile there.
els.board.addEventListener('click', (e) => {
  if (selectedId == null || justTapped() || e.target.closest('.tile')) return;
  const cell = cellAt(e.clientX, e.clientY);
  if (cell) moveToBoard(selectedId, cell);
});

// Tap the rack's empty space to send a selected board tile back.
els.rack.addEventListener('click', (e) => {
  if (selectedId == null || justTapped() || e.target.closest('.tile')) return;
  if (locateTile(state, selectedId)?.where === 'board') moveToRack(selectedId);
});

// ---------- buttons ----------

els.dumpBtn.addEventListener('click', () => {
  if (selectedId == null) {
    toast('Drag a tile onto Dump, or select a tile first.');
    return;
  }
  doDump(selectedId);
});

$('shuffle-btn').addEventListener('click', () => {
  shuffleRack(state);
  afterMove();
});

$('recall-btn').addEventListener('click', () => {
  if (!Object.keys(state.board).length) return;
  recallAll(state);
  afterMove();
});

els.peelBtn.addEventListener('click', doPeel);

$('menu-btn').addEventListener('click', () => els.menu.showModal());
$('menu-close').addEventListener('click', () => els.menu.close());
els.menu.addEventListener('click', (e) => {
  if (e.target === els.menu) els.menu.close(); // backdrop tap
});

for (const btn of els.menu.querySelectorAll('[data-new]')) {
  btn.addEventListener('click', () => {
    const inProgress = state.status === 'playing' && Object.keys(state.board).length > 0;
    if (inProgress && !confirm('Start a new game? Your current game will be lost.')) return;
    els.menu.close();
    startGame(btn.dataset.new);
  });
}

els.hintsToggle.addEventListener('change', () => {
  settings.hints = els.hintsToggle.checked;
  store(SETTINGS_KEY, settings);
  render();
});

$('win-again').addEventListener('click', () => {
  els.win.close();
  startGame(state.mode);
});

// ---------- game lifecycle ----------

function showWin(check) {
  const bests = load(BEST_KEY, {});
  const prev = bests[state.mode];
  const isBest = prev == null || state.elapsedMs < prev;
  if (isBest) {
    bests[state.mode] = state.elapsedMs;
    store(BEST_KEY, bests);
  }
  const longest = check.words.reduce((a, w) => (w.word.length > a.length ? w.word : a), '');
  const rows = [
    ['Mode', MODES[state.mode].label],
    ['Time', `${formatTime(state.elapsedMs)}${isBest ? ' ★ best!' : ''}`],
    ['Best', formatTime(isBest ? state.elapsedMs : prev)],
    ['Tiles used', check.tileCount],
    ['Words', check.words.length],
    ['Longest word', longest],
    ['Peels', state.peels],
    ['Dumps', state.dumps],
  ];
  $('win-stats').replaceChildren(...rows.flatMap(([k, v]) => {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    return [dt, dd];
  }));
  els.win.showModal();
}

function startGame(mode) {
  state = newGame(mode);
  selectedId = null;
  state.rack.forEach((t) => freshIds.add(t.id));
  saveGame();
  render();
  centerView();
}

// Count play time only while the game is visible.
let lastTick = performance.now();
setInterval(() => {
  const now = performance.now();
  if (state?.status === 'playing' && document.visibilityState === 'visible') {
    state.elapsedMs += now - lastTick;
    renderTimer();
    if (Math.floor(state.elapsedMs / 1000) % 5 === 0) saveGame();
  }
  lastTick = now;
}, 1000);

document.addEventListener('visibilitychange', () => {
  lastTick = performance.now();
  if (state) saveGame();
});
window.addEventListener('pagehide', () => state && saveGame());

async function loadWords() {
  const res = await fetch('words.txt');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  words = new Set(text.split('\n').map((w) => w.trim()).filter(Boolean));
}

async function init() {
  settings = { ...settings, ...load(SETTINGS_KEY, {}) };
  els.hintsToggle.checked = settings.hints;
  applyCell();

  try {
    await loadWords();
  } catch (err) {
    els.loading.textContent = `Couldn't load the dictionary (${err.message}). Check your connection and reload.`;
    return;
  }
  els.loading.hidden = true;

  const saved = load(SAVE_KEY, null);
  if (saved?.status === 'playing' && saved.mode in MODES && Array.isArray(saved.rack)) {
    state = saved;
    render();
    centerView();
  } else {
    startGame('classic');
    els.menu.showModal();
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('../../sw.js').catch(() => {});
}

init();
