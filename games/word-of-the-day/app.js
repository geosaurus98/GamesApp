import {
  WORD_LENGTH, MAX_GUESSES, scoreGuess, letterStates, newGame, submitGuess,
  emptyStats, recordResult, shareGrid,
} from './logic.js';
import {
  load, store, toast, vibrate, dayNumber, shareText, registerServiceWorker,
} from '../../shared/util.js';

const DAILY_KEY = 'wotd.daily.v1';
const PRACTICE_KEY = 'wotd.practice.v1';
const STATS_KEY = 'wotd.stats.v1';
const MODE_KEY = 'wotd.mode.v1';
const FLIP_MS = 250; // per-tile delay, matches style.css

const $ = (id) => document.getElementById(id);

let answers = [];
let allowed = new Set();
let mode = load(MODE_KEY, 'daily');
let game = null;
let typed = '';
let busy = false; // ignore input while a row flips
const today = dayNumber();

// ---------- data ----------

async function loadWords() {
  const [a, txt] = await Promise.all([
    fetch('answers.json').then((r) => r.json()),
    fetch('allowed.txt').then((r) => r.text()),
  ]);
  answers = a;
  allowed = new Set([...txt.split('\n').filter(Boolean), ...answers]);
}

const dailyAnswer = (day) => answers[((day % answers.length) + answers.length) % answers.length];
const randomAnswer = () => answers[Math.floor(Math.random() * answers.length)];

function loadGame() {
  if (mode === 'daily') {
    const saved = load(DAILY_KEY, null);
    game = saved?.day === today ? saved : newGame(dailyAnswer(today), 'daily', today);
  } else {
    const saved = load(PRACTICE_KEY, null);
    game = saved && saved.status === 'playing' ? saved : newGame(randomAnswer(), 'practice');
  }
  typed = '';
  saveGame();
}

function saveGame() {
  store(mode === 'daily' ? DAILY_KEY : PRACTICE_KEY, game);
}

// ---------- rendering ----------

const rows = [];
function buildGrid() {
  const grid = $('grid');
  for (let r = 0; r < MAX_GUESSES; r++) {
    const row = document.createElement('div');
    row.className = 'row';
    const tiles = [];
    for (let i = 0; i < WORD_LENGTH; i++) {
      const t = document.createElement('div');
      t.className = 'tile';
      t.style.setProperty('--i', i);
      row.append(t);
      tiles.push(t);
    }
    grid.append(row);
    rows.push({ row, tiles });
  }
}

function renderGrid(revealRow = -1) {
  rows.forEach(({ row, tiles }, r) => {
    row.className = 'row';
    const guess = game.guesses[r];
    const states = guess ? scoreGuess(guess, game.answer) : null;
    const text = guess ?? (r === game.guesses.length ? typed : '');
    tiles.forEach((t, i) => {
      const ch = text[i] ?? '';
      t.textContent = ch;
      let cls = 'tile';
      if (states) cls += ` ${states[i]}`;
      else if (ch) cls += ' filled';
      if (r === revealRow) cls += ' reveal';
      t.className = cls;
    });
  });
}

const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', '+zxcvbnm-'];
function buildKeyboard() {
  const kb = $('keyboard');
  KEY_ROWS.forEach((letters, r) => {
    const row = document.createElement('div');
    row.className = `krow${r === 1 ? ' mid' : ''}`;
    for (const ch of letters) {
      const key = document.createElement('button');
      key.className = 'key';
      if (ch === '+') {
        key.textContent = 'Enter';
        key.dataset.key = 'Enter';
        key.classList.add('wide');
      } else if (ch === '-') {
        key.textContent = '⌫';
        key.dataset.key = 'Backspace';
        key.classList.add('wide');
        key.setAttribute('aria-label', 'Delete');
      } else {
        key.textContent = ch;
        key.dataset.key = ch;
      }
      row.append(key);
    }
    kb.append(row);
  });
}

function renderKeyboard() {
  const states = letterStates(game.guesses, game.answer);
  for (const key of document.querySelectorAll('.key')) {
    const s = states[key.dataset.key];
    key.className = `key${key.classList.contains('wide') ? ' wide' : ''}${s ? ` ${s}` : ''}`;
  }
}

function renderTabs() {
  $('tab-daily').classList.toggle('on', mode === 'daily');
  $('tab-practice').classList.toggle('on', mode === 'practice');
  $('tab-daily').textContent = `Daily #${today + 1}`;
}

function renderAll() {
  renderTabs();
  renderGrid();
  renderKeyboard();
}

// ---------- input ----------

function shakeRow() {
  const { row } = rows[game.guesses.length];
  row.classList.remove('shake');
  void row.offsetWidth;
  row.classList.add('shake');
  vibrate([30, 30, 30]);
}

function press(key) {
  if (busy || game.status !== 'playing' || document.querySelector('dialog[open]')) return;
  if (key === 'Enter') return enter();
  if (key === 'Backspace') {
    typed = typed.slice(0, -1);
  } else if (/^[a-z]$/.test(key) && typed.length < WORD_LENGTH) {
    typed += key;
  } else {
    return;
  }
  renderGrid();
}

function enter() {
  const row = game.guesses.length;
  const res = submitGuess(game, typed, (w) => allowed.has(w));
  if (!res.ok) {
    toast(res.message, 1200);
    shakeRow();
    return;
  }
  typed = '';
  saveGame();
  busy = true;
  renderGrid(row);
  const revealTime = FLIP_MS * (WORD_LENGTH - 1) + 500;
  setTimeout(() => {
    busy = false;
    renderKeyboard();
    if (res.won || res.lost) finish(res.won, row);
  }, revealTime);
}

const PRAISE = ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!'];

function finish(won, row) {
  if (game.mode === 'daily') store(STATS_KEY, recordResult(load(STATS_KEY, emptyStats()), game));
  if (won) {
    rows[row].row.classList.add('win');
    toast(PRAISE[row], 1600);
    vibrate([40, 60, 40, 60, 120]);
  } else {
    toast(game.answer.toUpperCase(), 2500);
  }
  setTimeout(showStats, won ? 1600 : 1800);
}

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (key === 'Enter' || key === 'Backspace' || /^[a-z]$/.test(key)) {
    e.preventDefault();
    press(key);
  }
});

$('keyboard').addEventListener('click', (e) => {
  const key = e.target.closest('.key');
  if (key) press(key.dataset.key);
});

// ---------- stats dialog ----------

function showStats() {
  const stats = { ...emptyStats(), ...load(STATS_KEY, {}) };
  const done = game.status !== 'playing';
  $('result-banner').textContent = !done ? 'Statistics' : game.status === 'won' ? '🎉 Solved!' : 'So close!';
  $('answer-line').innerHTML = done ? `The word was <b>${game.answer.toUpperCase()}</b>` : '';
  $('s-played').textContent = stats.played;
  $('s-win').textContent = stats.played ? Math.round((stats.wins / stats.played) * 100) : 0;
  $('s-streak').textContent = stats.streak;
  $('s-max').textContent = stats.maxStreak;

  const max = Math.max(1, ...stats.dist);
  const todayGuesses = game.mode === 'daily' && game.status === 'won' ? game.guesses.length : 0;
  $('dist').replaceChildren(...stats.dist.map((n, i) => {
    const bar = document.createElement('div');
    bar.className = `bar${todayGuesses === i + 1 ? ' today' : ''}`;
    const label = document.createElement('span');
    label.textContent = i + 1;
    const fill = document.createElement('span');
    fill.className = 'fill';
    fill.style.width = `${Math.max(8, (n / max) * 100)}%`;
    fill.textContent = n;
    bar.append(label, fill);
    return bar;
  }));

  $('share-btn').hidden = !done;
  $('practice-btn').textContent = mode === 'practice' ? 'Next practice word' : 'Play a practice word';
  $('practice-btn').hidden = mode === 'practice' && !done;
  updateCountdown();
  $('stats').showModal();
}

function updateCountdown() {
  const daily = load(DAILY_KEY, null);
  const dailyDone = daily?.day === today && daily.status !== 'playing';
  if (!dailyDone) {
    $('next-word').textContent = '';
    return;
  }
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const mins = Math.ceil((midnight - now) / 60000);
  $('next-word').textContent = `Next daily word in ${Math.floor(mins / 60)}h ${mins % 60}m`;
}

$('share-btn').addEventListener('click', async () => {
  const label = game.mode === 'daily' ? `Word of the Day #${today + 1}` : 'Word of the Day (practice)';
  const res = await shareText(shareGrid(game, label));
  if (res === 'copied') toast('Copied to clipboard');
  else if (res === 'failed') toast('Couldn’t share');
});

$('practice-btn').addEventListener('click', () => {
  $('stats').close();
  mode = 'practice';
  store(MODE_KEY, mode);
  store(PRACTICE_KEY, null);
  loadGame();
  renderAll();
});

// ---------- tabs & dialogs ----------

function switchMode(next) {
  if (busy || mode === next) return;
  mode = next;
  store(MODE_KEY, mode);
  loadGame();
  renderAll();
}
$('tab-daily').addEventListener('click', () => switchMode('daily'));
$('tab-practice').addEventListener('click', () => switchMode('practice'));
$('stats-btn').addEventListener('click', showStats);
$('help-btn').addEventListener('click', () => $('help').showModal());

for (const btn of document.querySelectorAll('[data-close]')) {
  btn.addEventListener('click', () => btn.closest('dialog').close());
}
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
}

// ---------- start ----------

async function init() {
  buildGrid();
  buildKeyboard();
  try {
    await loadWords();
  } catch {
    $('loading').textContent = 'Couldn’t load the word list. Check your connection and reload.';
    return;
  }
  $('loading').hidden = true;
  loadGame();
  renderAll();
  if (!load(STATS_KEY, null) && !game.guesses.length) $('help').showModal();
}

init();
registerServiceWorker();
