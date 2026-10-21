import {
  RANKS, maxScore, rankFor, newGame, submitWord, isPangram, wordScore,
} from './logic.js';
import {
  load, store, toast, vibrate, dayNumber, fillStats, registerServiceWorker,
} from '../../shared/util.js';

const DAILY_KEY = 'hive.daily.v1';
const PRACTICE_KEY = 'hive.practice.v1';
const MODE_KEY = 'hive.mode.v1';
const GAP = 1.06; // spacing between hexes, in hex widths
// Outer hex centres for a flat-topped honeycomb, in hex widths.
const OUTER = [[0, -0.866], [0.75, -0.433], [0.75, 0.433], [0, 0.866], [-0.75, 0.433], [-0.75, -0.433]];

const $ = (id) => document.getElementById(id);

let puzzles = [];
let dictionary = null; // big word list for bonus words, loaded lazily
let mode = load(MODE_KEY, 'daily');
let game = null;
let typed = '';
let outer = []; // outer letters in display order
const today = dayNumber();

// ---------- data ----------

async function loadDictionary() {
  try {
    const text = await fetch('../bananagrams/words.txt').then((r) => r.text());
    dictionary = new Set(text.split('\n'));
  } catch {
    // Without it, only the puzzle's own word list counts.
  }
}

const dailyPuzzle = (day) => puzzles[((day % puzzles.length) + puzzles.length) % puzzles.length];

function loadGame() {
  if (mode === 'daily') {
    const saved = load(DAILY_KEY, null);
    game = saved?.day === today ? saved : newGame(dailyPuzzle(today), 'daily', today);
  } else {
    game = load(PRACTICE_KEY, null) ?? newPractice();
  }
  outer = [...game.puzzle.letters].filter((ch) => ch !== game.puzzle.center);
  typed = '';
  save();
}

function newPractice() {
  let p;
  do p = puzzles[Math.floor(Math.random() * puzzles.length)];
  while (puzzles.length > 1 && p === dailyPuzzle(today));
  return newGame(p, 'practice');
}

function save() {
  store(mode === 'daily' ? DAILY_KEY : PRACTICE_KEY, game);
}

// ---------- rendering ----------

function buildHive() {
  const hive = $('hive');
  const letters = [game.puzzle.center, ...outer];
  const spots = [[0, 0], ...OUTER];
  hive.replaceChildren(...letters.map((ch, i) => {
    const hex = document.createElement('button');
    hex.className = `hex${i === 0 ? ' center' : ''}`;
    hex.textContent = ch;
    hex.dataset.letter = ch;
    hex.style.setProperty('--dx', spots[i][0] * GAP);
    hex.style.setProperty('--dy', spots[i][1] * GAP);
    return hex;
  }));
}

function renderEntry() {
  const entry = $('entry');
  entry.replaceChildren(...[...typed].map((ch) => {
    const span = document.createElement('span');
    span.textContent = ch;
    if (ch === game.puzzle.center) span.className = 'c';
    else if (!game.puzzle.letters.includes(ch)) span.className = 'bad';
    return span;
  }));
}

function renderProgress() {
  const max = maxScore(game.puzzle);
  const rank = rankFor(game.score, max);
  $('rank').textContent = rank.name;
  $('score').textContent = game.score;
  $('track-fill').style.width = `${Math.min(100, (rank.index / (RANKS.length - 1)) * 100)}%`;
  $('next-rank').textContent = rank.next
    ? `${rank.next.toGo} point${rank.next.toGo === 1 ? '' : 's'} to ${rank.next.name}`
    : 'You found every word! 🐝';
}

function renderFound() {
  const all = [...game.found, ...game.bonus];
  const n = all.length;
  $('found-summary').textContent = n
    ? `You have found ${n} word${n === 1 ? '' : 's'}${game.found.length < game.puzzle.words.length ? '' : ' — all of them!'}`
    : "You haven't found any words yet";
  const sorted = all.sort();
  $('found-list').replaceChildren(...sorted.map((w) => {
    const div = document.createElement('div');
    div.textContent = game.bonus.includes(w) ? `${w} ★` : w;
    if (isPangram(w, game.puzzle.letters)) div.className = 'pangram';
    else if (game.bonus.includes(w)) div.className = 'bonus';
    return div;
  }));
}

function renderTabs() {
  $('tab-daily').classList.toggle('on', mode === 'daily');
  $('tab-practice').classList.toggle('on', mode === 'practice');
  $('tab-daily').textContent = `Daily #${today + 1}`;
}

function renderAll() {
  renderTabs();
  buildHive();
  renderEntry();
  renderProgress();
  renderFound();
}

// ---------- input ----------

function type(ch) {
  if (typed.length >= 19) return;
  typed += ch;
  renderEntry();
}

function backspace() {
  typed = typed.slice(0, -1);
  renderEntry();
}

function shake() {
  const entry = $('entry');
  entry.classList.remove('shake');
  void entry.offsetWidth;
  entry.classList.add('shake');
  vibrate([30, 30, 30]);
}

function enter() {
  if (!typed) return;
  const before = rankFor(game.score, maxScore(game.puzzle)).index;
  const res = submitWord(game, typed, (w) => dictionary?.has(w) ?? false);
  if (!res.ok) {
    toast(res.message, 1100);
    shake();
    setTimeout(() => {
      typed = '';
      renderEntry();
    }, 400);
    return;
  }
  typed = '';
  save();
  renderEntry();
  renderProgress();
  renderFound();
  const after = rankFor(game.score, maxScore(game.puzzle));
  const prefix = res.bonus ? '★ Bonus! ' : '';
  if (after.index > before && after.index >= 7) {
    toast(`${prefix}+${res.points} · You reached ${after.name}!`, 2000);
    vibrate([40, 60, 120]);
  } else {
    toast(`${prefix}${res.message} +${res.points}`, 1100);
    vibrate(res.pangram ? [40, 60, 40] : 10);
  }
}

function shuffle() {
  for (let i = outer.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [outer[i], outer[j]] = [outer[j], outer[i]];
  }
  const hive = $('hive');
  hive.classList.add('shuffling');
  setTimeout(() => buildHive(), 150);
  setTimeout(() => hive.classList.remove('shuffling'), 300);
}

$('hive').addEventListener('click', (e) => {
  const hex = e.target.closest('.hex');
  if (hex) type(hex.dataset.letter);
});
$('delete-btn').addEventListener('click', backspace);
$('enter-btn').addEventListener('click', enter);
$('shuffle-btn').addEventListener('click', shuffle);

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
  if (e.key === 'Enter') enter();
  else if (e.key === 'Backspace') backspace();
  else if (e.key === ' ') shuffle();
  else if (/^[a-z]$/i.test(e.key)) type(e.key.toLowerCase());
  else return;
  e.preventDefault();
});

$('found-toggle').addEventListener('click', () => {
  const list = $('found-list');
  list.hidden = !list.hidden;
  $('found-toggle').setAttribute('aria-expanded', String(!list.hidden));
});

// ---------- tabs, menu, answers ----------

function switchMode(next) {
  if (mode === next) return;
  mode = next;
  store(MODE_KEY, mode);
  loadGame();
  renderAll();
}
$('tab-daily').addEventListener('click', () => switchMode('daily'));
$('tab-practice').addEventListener('click', () => switchMode('practice'));

$('menu-btn').addEventListener('click', () => {
  const max = maxScore(game.puzzle);
  fillStats($('ranks'), RANKS.map(([name, pct]) => [name, Math.round(pct * max)]));
  $('menu').showModal();
});

$('new-practice').addEventListener('click', () => {
  $('menu').close();
  mode = 'practice';
  store(MODE_KEY, mode);
  store(PRACTICE_KEY, newPractice());
  loadGame();
  renderAll();
});

$('reveal-btn').addEventListener('click', () => {
  const missing = game.puzzle.words.length - game.found.length;
  if (missing && !confirm(`Show all ${game.puzzle.words.length} answers? You've found ${game.found.length}.`)) return;
  $('menu').close();
  $('answer-list').replaceChildren(...game.puzzle.words.map((w) => {
    const div = document.createElement('div');
    div.textContent = `${w}${isPangram(w, game.puzzle.letters) ? ' 🐝' : ''} (${wordScore(w, game.puzzle.letters)})`;
    if (!game.found.includes(w)) div.className = 'missed';
    return div;
  }));
  $('answers').showModal();
});

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
  try {
    puzzles = await fetch('puzzles.json').then((r) => r.json());
  } catch {
    toast('Couldn’t load puzzles. Check your connection and reload.', 10000);
    return;
  }
  loadGame();
  renderAll();
  loadDictionary();
}

init();
registerServiceWorker();
