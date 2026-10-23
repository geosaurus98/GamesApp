import {
  newRound, top, canPlay, play, draw, canPass, pass, handPoints, chooseMove,
} from './logic.js';
import { SUITS, RANKS, isRed } from '../../shared/cards.js';
import { load, store, toast, vibrate, registerServiceWorker } from '../../shared/util.js';

const SAVE_KEY = 'crazy8.save.v1';
const ME = 0;
const CPU_DELAY = 750;

const $ = (id) => document.getElementById(id);

const saved = load(SAVE_KEY, null);
let game = saved?.state?.hands ? saved : null; // { players, state, points, wins, first }
let busy = false; // computers are playing
let pendingEight = null;
let shownHand = new Set();
let lastTopId = null;

const name = (p) => (p === ME ? 'You' : game.players === 2 ? 'Computer' : `CPU ${p}`);
const save = () => store(SAVE_KEY, game);

// ---------- rendering ----------

// Cards in your hand are buttons; everything else is a plain element.
function cardEl(card, faceDown = false, tappable = !faceDown) {
  const el = document.createElement(tappable ? 'button' : 'div');
  el.className = `c8${isRed(card.suit) ? ' red' : ''}${faceDown ? ' down' : ''}`;
  if (!faceDown) {
    const corner = document.createElement('span');
    corner.className = 'corner';
    corner.textContent = `${RANKS[card.rank]}${SUITS[card.suit]}`;
    const pip = document.createElement('span');
    pip.className = 'pip';
    pip.textContent = SUITS[card.suit];
    el.append(corner, pip);
    el.dataset.id = card.id;
    el.setAttribute('aria-label', `${RANKS[card.rank]} of ${['spades', 'hearts', 'diamonds', 'clubs'][card.suit]}`);
  }
  return el;
}

function render() {
  const s = game.state;
  const over = s.status === 'over';

  $('opponents').replaceChildren(...s.hands.slice(1).map((hand, k) => {
    const p = k + 1;
    const box = document.createElement('div');
    box.className = `opp${!over && s.turn === p ? ' turn' : ''}`;
    const n = document.createElement('div');
    n.className = 'name';
    n.textContent = name(p);
    const fan = document.createElement('div');
    fan.className = 'fan';
    const show = over ? hand : hand.slice(0, 8);
    fan.append(...show.map((c) => cardEl(c, !over, false)));
    const count = document.createElement('div');
    count.className = 'count';
    count.textContent = `${hand.length} card${hand.length === 1 ? '' : 's'} · ${game.points[p]} pts`;
    box.append(n, fan, count);
    return box;
  }));

  const t = top(s);
  const topEl = cardEl(t, false, false);
  if (t.id !== lastTopId) topEl.classList.add('new');
  lastTopId = t.id;
  $('discard').replaceChildren(topEl);
  const badge = $('suit-badge');
  badge.hidden = t.rank !== 8;
  badge.textContent = `Now ${SUITS[s.suit]}`;
  badge.classList.toggle('red', isRed(s.suit));

  const myTurn = !over && s.turn === ME && !busy;
  const stockLeft = s.stock.length + Math.max(0, s.discard.length - 1);
  $('stock-count').textContent = `${s.stock.length} left`;
  $('stock').disabled = !myTurn || s.draws >= 3 || !stockLeft;
  const playable = s.hands[ME].filter((c) => canPlay(s, c));
  $('stock').classList.toggle('ready', myTurn && !playable.length && s.draws < 3 && stockLeft > 0);

  const hand = [...s.hands[ME]].sort((a, b) => a.suit - b.suit || a.rank - b.rank);
  const handEl = $('hand');
  const cw = $('discard').firstChild?.offsetWidth || 62; // real card width on screen
  const avail = handEl.parentElement.clientWidth - 16;
  const overlap = hand.length > 1 ? Math.min(4, (avail - hand.length * cw) / (hand.length - 1)) : 0;
  handEl.style.setProperty('--overlap', `${Math.max(-cw * 0.72, overlap)}px`);
  const next = new Set();
  handEl.replaceChildren(...hand.map((c) => {
    const el = cardEl(c);
    if (myTurn && canPlay(s, c)) el.classList.add('playable');
    if (!shownHand.has(c.id)) el.classList.add('new');
    next.add(c.id);
    return el;
  }));
  shownHand = next;

  const status = $('status');
  const span = document.createElement('span');
  if (over) {
    span.textContent = s.blocked
      ? `Everyone's stuck. ${name(s.winner)} ${s.winner === ME ? 'have' : 'has'} the lowest hand!`
      : s.winner === ME ? '🎉 You win the round! 🎉' : `${name(s.winner)} wins the round`;
  } else if (s.turn === ME) {
    span.textContent = playable.length ? 'Your turn: play a lifted card' : canPass(s, ME) ? "Still stuck: tap Pass" : 'No match: draw from the deck';
  } else {
    span.textContent = `${name(s.turn)} is thinking`;
    span.className = 'thinking';
  }
  status.replaceChildren(span);

  $('pass-btn').hidden = over;
  $('pass-btn').disabled = !myTurn || !canPass(s, ME);
  $('next-btn').hidden = !over;
  $('score-line').textContent = `You: ${game.points[ME]} pts · ${game.wins[ME]} win${game.wins[ME] === 1 ? '' : 's'}`;
}
window.addEventListener('resize', () => game && render());

// ---------- turns ----------

function afterMove() {
  const s = game.state;
  if (s.status === 'over') {
    const gained = s.hands.reduce((n, h, p) => (p === s.winner ? n : n + handPoints(h)), 0);
    game.points[s.winner] += gained;
    game.wins[s.winner]++;
    vibrate(s.winner === ME ? [40, 60, 40, 60, 120] : [80, 50, 80]);
    if (gained) toast(`${name(s.winner)} ${s.winner === ME ? 'score' : 'scores'} ${gained} points`, 2200);
  }
  save();
  render();
  if (s.status === 'playing' && s.turn !== ME) runComputers();
}

function runComputers() {
  if (busy) return;
  busy = true;
  render();
  const step = () => {
    const s = game.state;
    if (s.status !== 'playing' || s.turn === ME) {
      busy = false;
      render();
      return;
    }
    const p = s.turn;
    const move = chooseMove(s, p);
    if (move.play != null) {
      const card = s.hands[p].find((c) => c.id === move.play);
      play(s, p, move.play, move.suit);
      if (card.rank === 8) toast(`${name(p)} played an 8: now ${SUITS[s.suit]}`, 1600);
      if (s.status === 'over') {
        busy = false;
        afterMove();
        return;
      }
    } else if (move.draw) {
      draw(s, p);
    } else {
      pass(s, p);
      if (s.status === 'over') {
        busy = false;
        afterMove();
        return;
      }
    }
    save();
    render();
    setTimeout(step, move.draw ? 400 : CPU_DELAY);
  };
  setTimeout(step, CPU_DELAY);
}

function playMine(cardId, suit = null) {
  if (!play(game.state, ME, cardId, suit)) return;
  vibrate(10);
  afterMove();
}

// ---------- input ----------

$('hand').addEventListener('click', (e) => {
  const el = e.target.closest('.c8');
  const s = game.state;
  if (!el || busy || s.status !== 'playing' || s.turn !== ME) return;
  const card = s.hands[ME].find((c) => c.id === Number(el.dataset.id));
  if (!canPlay(s, card)) {
    toast(`Match ${SUITS[s.suit]} or ${RANKS[top(s).rank]}, or play an 8`, 1500);
    el.animate([{ transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'none' }], 200);
    return;
  }
  if (card.rank === 8) {
    pendingEight = card.id;
    $('suit-picker').showModal();
    return;
  }
  playMine(card.id);
});

for (const b of document.querySelectorAll('[data-suit]')) {
  b.addEventListener('click', () => {
    $('suit-picker').close();
    if (pendingEight != null) playMine(pendingEight, Number(b.dataset.suit));
    pendingEight = null;
  });
}

$('stock').addEventListener('click', () => {
  if (busy || game.state.turn !== ME) return;
  if (draw(game.state, ME)) {
    vibrate(6);
    save();
    render();
  }
});

$('pass-btn').addEventListener('click', () => {
  if (busy || !pass(game.state, ME)) return;
  afterMove();
});

$('next-btn').addEventListener('click', () => {
  game.first = (game.first + 1) % game.players;
  game.state = newRound(game.players, Math.random, game.first);
  shownHand = new Set();
  afterMove();
});

// ---------- menu ----------

function newGame(players) {
  game = {
    players,
    first: 0,
    points: new Array(players).fill(0),
    wins: new Array(players).fill(0),
    state: newRound(players),
  };
  shownHand = new Set();
  busy = false;
  afterMove();
}

$('menu-btn').addEventListener('click', () => $('menu').showModal());
for (const b of document.querySelectorAll('[data-players]')) {
  b.addEventListener('click', () => {
    $('menu').close();
    newGame(Number(b.dataset.players));
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

if (game) {
  shownHand = new Set(game.state.hands[ME].map((c) => c.id));
  lastTopId = top(game.state).id;
  render();
  if (game.state.status === 'playing' && game.state.turn !== ME) runComputers();
} else {
  newGame(2);
  $('menu').showModal();
}

registerServiceWorker();
