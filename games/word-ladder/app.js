import {
  newGame, submit, undo, current, steps, hint, emptyStats, recordSolve, shareText as ladderShare,
} from './logic.js';
import {
  load, store, toast, vibrate, dayNumber, shareText, registerServiceWorker,
} from '../../shared/util.js';

const DAILY_KEY = 'ladder.daily.v1';
const PRACTICE_KEY = 'ladder.practice.v1';
const STATS_KEY = 'ladder.stats.v1';
const MODE_KEY = 'ladder.mode.v1';

const $ = (id) => document.getElementById(id);
const today = dayNumber();

let puzzles = [];
let words = new Set();
let byLength = {};
let commonByLength = {};
let mode = load(MODE_KEY, 'daily');
let game = null;
let selected = 0;
let edit = null; // { pos, letter } — the one letter being changed

// ---------- data ----------

async function loadData() {
  const [p, txt, commonTxt] = await Promise.all([
    fetch('puzzles.json').then((r) => r.json()),
    fetch('words.txt').then((r) => r.text()),
    fetch('common.txt').then((r) => r.text()),
  ]);
  puzzles = p;
  const list = txt.split('\n').filter(Boolean);
  words = new Set(list);
  byLength = { 4: list.filter((w) => w.length === 4), 5: list.filter((w) => w.length === 5) };
  const common = commonTxt.split('\n').filter(Boolean);
  commonByLength = { 4: common.filter((w) => w.length === 4), 5: common.filter((w) => w.length === 5) };
}

const dailyPuzzle = () => puzzles[((today % puzzles.length) + puzzles.length) % puzzles.length];

function loadGame() {
  if (mode === 'daily') {
    const saved = load(DAILY_KEY, null);
    game = saved?.day === today ? saved : newGame(dailyPuzzle(), 'daily', today);
  } else {
    game = load(PRACTICE_KEY, null) ?? newPractice();
  }
  edit = null;
  selected = firstMismatch();
  save();
}

function newPractice() {
  let p;
  do p = puzzles[Math.floor(Math.random() * puzzles.length)];
  while (puzzles.length > 1 && p === dailyPuzzle());
  return newGame(p, 'practice');
}

const save = () => store(mode === 'daily' ? DAILY_KEY : PRACTICE_KEY, game);

function firstMismatch() {
  const w = current(game);
  const i = [...w].findIndex((ch, k) => ch !== game.puzzle.end[k]);
  return Math.max(0, i);
}

const candidate = () => {
  const w = current(game);
  return edit ? w.slice(0, edit.pos) + edit.letter + w.slice(edit.pos + 1) : w;
};

// ---------- rendering ----------

function rung(word, cls, prev) {
  const row = document.createElement('div');
  row.className = `rung ${cls}`;
  [...word].forEach((ch, i) => {
    const t = document.createElement('div');
    t.className = 'tile';
    t.textContent = ch;
    if (cls === '' && ch === game.puzzle.end[i]) t.classList.add('match');
    if (prev && prev[i] !== ch) t.classList.add('changed');
    row.append(t);
  });
  return row;
}

function render(popLast = false) {
  const ladder = $('ladder');
  const rows = [];
  const chain = game.chain;
  rows.push(rung(chain[0], 'start'));
  for (let i = 1; i < chain.length; i++) {
    const done = game.status === 'won' && i === chain.length - 1;
    const r = rung(chain[i], done ? 'goal' : '', chain[i - 1]);
    if (popLast && i === chain.length - 1) r.classList.add('pop');
    rows.push(r);
  }
  if (game.status === 'playing') {
    const input = rung(candidate(), 'input');
    input.id = 'input-rung';
    [...input.children].forEach((t, i) => {
      t.dataset.pos = i;
      if (i === selected) t.classList.add('selected');
      if (edit?.pos === i) t.classList.add('edited');
      else if (current(game)[i] === game.puzzle.end[i]) t.classList.add('match');
    });
    rows.push(input);
    const gap = document.createElement('div');
    gap.className = 'rung gap';
    gap.textContent = '⋮';
    rows.push(gap);
    rows.push(rung(game.puzzle.end, 'goal'));
  }
  ladder.replaceChildren(...rows);
  const wrap = $('ladder-wrap');
  wrap.scrollTop = wrap.scrollHeight;

  $('tab-daily').classList.toggle('on', mode === 'daily');
  $('tab-practice').classList.toggle('on', mode === 'practice');
  $('tab-daily').textContent = `Daily #${today + 1}`;
  $('par').textContent = `Par ${game.puzzle.par}`;
  const n = steps(game);
  $('steps').textContent = `${n} step${n === 1 ? '' : 's'}`;
  $('undo-btn').disabled = game.status !== 'playing' || game.chain.length < 2;
  $('hint-btn').disabled = game.status !== 'playing';
}

// ---------- input ----------

function typeLetter(ch) {
  if (game.status !== 'playing') return;
  const base = current(game);
  edit = ch === base[selected] ? null : { pos: selected, letter: ch };
  render();
}

function enter() {
  if (game.status !== 'playing') return;
  if (!edit) {
    toast('Tap a letter, then pick a new one', 1400);
    return;
  }
  const res = submit(game, candidate(), (w) => words.has(w));
  if (!res.ok) {
    toast(res.message, 1200);
    vibrate([30, 30, 30]);
    const row = $('input-rung');
    row.classList.remove('shake');
    void row.offsetWidth;
    row.classList.add('shake');
    return;
  }
  edit = null;
  vibrate(10);
  save();
  if (res.won) {
    render(true);
    finish();
    return;
  }
  selected = firstMismatch();
  render(true);
}

function finish() {
  vibrate([40, 60, 40, 60, 120]);
  if (game.mode === 'daily') store(STATS_KEY, recordSolve(load(STATS_KEY, emptyStats()), game));
  const n = steps(game);
  const par = game.puzzle.par;
  toast(n < par ? 'Under par! 🏆' : n === par ? 'On par! ⛳' : 'Solved!', 1600);
  setTimeout(showStats, 1200);
}

function giveHint() {
  if (game.status !== 'playing') return;
  const len = current(game).length;
  const next = hint(game, byLength[len] ?? [], commonByLength[len] ?? []);
  if (!next) {
    toast('No route from here. Try Undo.');
    return;
  }
  const w = current(game);
  const pos = [...w].findIndex((ch, i) => ch !== next[i]);
  game.hints++;
  save();
  selected = pos;
  edit = { pos, letter: next[pos] };
  render();
  toast(`Try ${next.toUpperCase()}`, 1600);
}

function doUndo() {
  if (!undo(game)) return;
  edit = null;
  selected = firstMismatch();
  save();
  render();
}

const ROWS = ['qwertyuiop', 'asdfghjkl', '+zxcvbnm-'];
function buildKeyboard() {
  ROWS.forEach((letters, r) => {
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
        key.setAttribute('aria-label', 'Reset letter');
      } else {
        key.textContent = ch;
        key.dataset.key = ch;
      }
      row.append(key);
    }
    $('keyboard').append(row);
  });
}

function press(key) {
  if (document.querySelector('dialog[open]')) return;
  if (key === 'Enter') enter();
  else if (key === 'Backspace') {
    edit = null;
    render();
  } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const len = current(game).length;
    selected = (selected + (key === 'ArrowLeft' ? len - 1 : 1)) % len;
    if (edit && edit.pos !== selected) edit = null;
    render();
  } else if (/^[a-z]$/.test(key)) typeLetter(key);
}

$('keyboard').addEventListener('click', (e) => {
  const k = e.target.closest('.key');
  if (k) press(k.dataset.key);
});
$('ladder').addEventListener('click', (e) => {
  const t = e.target.closest('#input-rung .tile');
  if (!t) return;
  selected = Number(t.dataset.pos);
  if (edit && edit.pos !== selected) edit = null;
  render();
});
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || !game) return;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (['Enter', 'Backspace', 'ArrowLeft', 'ArrowRight'].includes(key) || /^[a-z]$/.test(key)) {
    e.preventDefault();
    press(key);
  }
});
$('undo-btn').addEventListener('click', doUndo);
$('hint-btn').addEventListener('click', giveHint);

// ---------- stats ----------

function showStats() {
  const s = { ...emptyStats(), ...load(STATS_KEY, {}) };
  const won = game.status === 'won';
  const n = steps(game);
  $('result-banner').textContent = won ? '🪜 Solved!' : 'Statistics';
  $('result-line').textContent = won ? `${n} step${n === 1 ? '' : 's'} · par ${game.puzzle.par}${game.hints ? ` · ${game.hints} hint${game.hints === 1 ? '' : 's'}` : ''}` : '';
  $('s-solved').textContent = s.solved;
  $('s-par').textContent = s.underPar;
  $('s-streak').textContent = s.streak;
  $('s-max').textContent = s.maxStreak;
  $('solution').textContent = won ? `A par route: ${game.puzzle.path.join(' → ')}` : '';
  $('share-btn').hidden = !won;
  $('practice-btn').textContent = mode === 'practice' ? 'Next practice ladder' : 'Play a practice ladder';
  $('stats').showModal();
}

$('share-btn').addEventListener('click', async () => {
  const label = game.mode === 'daily' ? `Word Ladder #${today + 1}` : 'Word Ladder (practice)';
  const res = await shareText(ladderShare(game, label));
  if (res === 'copied') toast('Copied to clipboard');
  else if (res === 'failed') toast('Couldn’t share');
});
$('practice-btn').addEventListener('click', () => {
  $('stats').close();
  mode = 'practice';
  store(MODE_KEY, mode);
  store(PRACTICE_KEY, newPractice());
  loadGame();
  render();
});

// ---------- tabs & dialogs ----------

function switchMode(next) {
  if (mode === next) return;
  mode = next;
  store(MODE_KEY, mode);
  loadGame();
  render();
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
  buildKeyboard();
  try {
    await loadData();
  } catch {
    $('loading').textContent = 'Couldn’t load the word list. Check your connection and reload.';
    return;
  }
  $('loading').hidden = true;
  loadGame();
  render();
  if (!load(STATS_KEY, null) && game.chain.length === 1) $('help').showModal();
}

init();
registerServiceWorker();
