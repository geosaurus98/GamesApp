import {
  START_BANK, blackjackWin, newGame, deal, hit, stand, double, split, canDouble, canSplit, handValue, bestPlay,
} from './logic.js';
import { SUITS, RANKS, isRed } from '../../shared/cards.js';
import { load, store, toast, vibrate, fillStats, registerServiceWorker } from '../../shared/util.js';

const SAVE_KEY = 'blackjack.save.v1';
const SETTINGS_KEY = 'blackjack.settings.v1';

const $ = (id) => document.getElementById(id);

let state = load(SAVE_KEY, null);
if (!state?.shoe) state = newGame();
let settings = { coach: false, ...load(SETTINGS_KEY, {}) };
let bet = state.phase === 'betting' ? 0 : state.lastBet;
let shown = new Set(); // card ids already on screen (new ones animate in)

const save = () => store(SAVE_KEY, state);

// ---------- rendering ----------

function cardEl(card, faceDown, delay) {
  const el = document.createElement('div');
  el.className = `bj-card${isRed(card.suit) ? ' red' : ''}${faceDown ? ' down' : ''}`;
  const corner = document.createElement('span');
  corner.className = 'corner';
  corner.textContent = `${RANKS[card.rank]}${SUITS[card.suit]}`;
  const pip = document.createElement('span');
  pip.className = 'pip';
  pip.textContent = SUITS[card.suit];
  el.append(corner, pip);
  const key = `${card.id}${faceDown ? 'd' : ''}`;
  // The dealer's hole card was already on the table face down: just reveal it.
  const revealed = !faceDown && shown.has(`${card.id}d`);
  if (!shown.has(key) && !revealed) {
    el.classList.add('new');
    el.style.setProperty('--delay', `${delay * 0.12}s`);
  }
  return [el, key];
}

const RESULT_TEXT = { win: 'Win', blackjack: 'Blackjack!', push: 'Push', lose: 'Lose', bust: 'Bust' };

function render() {
  const nextShown = new Set();
  let delay = 0;
  const hideHole = state.phase === 'player';

  const dealerEls = state.dealer.map((c, i) => {
    const [el, key] = cardEl(c, hideHole && i === 1, shown.has(`${c.id}${hideHole && i === 1 ? 'd' : ''}`) ? 0 : delay++);
    nextShown.add(key);
    return el;
  });
  $('dealer-hand').replaceChildren(...dealerEls);
  $('dealer-total').textContent = !state.dealer.length ? ''
    : hideHole ? handValue([state.dealer[0]]).total : handValue(state.dealer).total;

  $('player-hands').replaceChildren(...state.hands.map((h, i) => {
    const wrap = document.createElement('div');
    wrap.className = `player-hand${state.phase === 'player' && i === state.active && state.hands.length > 1 ? ' active' : ''}`;
    const label = document.createElement('div');
    label.className = 'label';
    const v = handValue(h.cards);
    label.innerHTML = `You <b class="total">${v.soft && v.total < 21 ? `${v.total - 10}/${v.total}` : v.total}</b>`;
    const handEl = document.createElement('div');
    handEl.className = 'hand';
    handEl.append(...h.cards.map((c) => {
      const [el, key] = cardEl(c, false, shown.has(`${c.id}`) ? 0 : delay++);
      nextShown.add(key);
      return el;
    }));
    const tag = document.createElement('div');
    tag.className = 'bet-tag';
    tag.textContent = `Bet ${h.bet}${h.doubled ? ' (doubled)' : ''}`;
    wrap.append(label, handEl, tag);
    if (h.result) {
      const r = document.createElement('div');
      r.className = `result ${h.result}`;
      r.textContent = RESULT_TEXT[h.result];
      wrap.append(r);
    }
    return wrap;
  }));
  shown = nextShown;

  $('bank').textContent = state.bank.toLocaleString();
  $('bet').textContent = (state.phase === 'betting' ? bet : state.hands.reduce((n, h) => n + h.bet, 0)).toLocaleString();
  $('bet-controls').hidden = state.phase !== 'betting';
  $('play-controls').hidden = state.phase !== 'player';
  $('done-controls').hidden = state.phase !== 'done';
  if (state.phase === 'betting') {
    for (const b of document.querySelectorAll('[data-chip]')) b.disabled = bet + Number(b.dataset.chip) > state.bank;
    $('deal-btn').disabled = bet <= 0;
    $('deal-btn').textContent = bet ? `Deal ${bet}` : 'Deal';
  }
  if (state.phase === 'player') {
    $('play-controls').querySelector('[data-act="double"]').disabled = !canDouble(state);
    $('play-controls').querySelector('[data-act="split"]').disabled = !canSplit(state);
    for (const b of document.querySelectorAll('[data-act]')) b.classList.remove('suggest');
  }
  if (state.phase === 'done') {
    $('again-btn').textContent = state.lastBet <= state.bank ? `Deal again (${state.lastBet})` : 'Deal again';
    $('again-btn').disabled = state.bank <= 0;
  }
  renderMessage();
}

let lastMessage = '';
function renderMessage() {
  let text = '';
  if (state.phase === 'betting') text = state.bank > 0 ? 'Place your bet' : 'Out of chips! Reset them in the ☰ menu';
  else if (state.phase === 'done') {
    const net = state.hands.reduce((n, h) => n + ({ win: h.bet, blackjack: blackjackWin(h.bet), push: 0 }[h.result] ?? -h.bet), 0);
    const d = handValue(state.dealer).total;
    const dealerNote = d > 21 ? 'Dealer busts! ' : '';
    text = net > 0 ? `${dealerNote}You win ${net.toLocaleString()} 🎉` : net < 0 ? `${dealerNote}You lose ${(-net).toLocaleString()}` : `${dealerNote}Push: bet returned`;
  }
  const el = $('message');
  el.textContent = text;
  if (text && text !== lastMessage) {
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }
  lastMessage = text;
}

// ---------- actions ----------

function suggestion() {
  const h = state.hands[state.active];
  return bestPlay(h.cards, state.dealer[0], { double: canDouble(state), split: canSplit(state) });
}

const PLAY_NAMES = { hit: 'Hit', stand: 'Stand', double: 'Double', split: 'Split' };

function play(action) {
  if (state.phase !== 'player') return;
  const advice = suggestion();
  const h = state.hands[state.active];
  const situation = `${handValue(h.cards).total} vs dealer ${RANKS[state.dealer[0].rank]}`;
  const fn = { hit, stand, double, split }[action];
  if (!fn(state)) return;
  state.stats.asked++;
  if (action === advice) state.stats.right++;
  else if (settings.coach) toast(`Coach: the book says ${PLAY_NAMES[advice]} on ${situation}`, 2200);
  vibrate(8);
  after();
}

function after() {
  save();
  render();
  if (state.phase === 'done') {
    const won = state.hands.some((h) => h.result === 'win' || h.result === 'blackjack');
    vibrate(won ? [30, 50, 60] : 20);
  }
}

function startRound(amount) {
  const res = deal(state, amount);
  if (!res.ok) {
    toast(res.message);
    return;
  }
  bet = amount;
  after();
}

// ---------- input ----------

for (const b of document.querySelectorAll('[data-chip]')) {
  b.addEventListener('click', () => {
    const v = Number(b.dataset.chip);
    if (bet + v > state.bank) return;
    bet += v;
    vibrate(5);
    render();
  });
}
$('clear-btn').addEventListener('click', () => {
  bet = 0;
  render();
});
$('deal-btn').addEventListener('click', () => startRound(bet));
for (const b of document.querySelectorAll('[data-act]')) {
  b.addEventListener('click', () => play(b.dataset.act));
}
$('coach-btn').addEventListener('click', () => {
  const advice = suggestion();
  for (const b of document.querySelectorAll('[data-act]')) b.classList.toggle('suggest', b.dataset.act === advice);
  toast(`Best move: ${PLAY_NAMES[advice]}`, 1500);
});
$('again-btn').addEventListener('click', () => {
  if (state.lastBet > state.bank) {
    state.phase = 'betting';
    bet = 0;
    save();
    render();
    return;
  }
  startRound(state.lastBet);
});
$('change-btn').addEventListener('click', () => {
  state.phase = 'betting';
  bet = 0;
  state.hands = [];
  state.dealer = [];
  save();
  render();
});

document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]')) return;
  const keys = { h: 'hit', s: 'stand', d: 'double', p: 'split' };
  if (keys[e.key]) play(keys[e.key]);
  else if (e.key === 'Enter') {
    if (state.phase === 'betting' && bet) startRound(bet);
    else if (state.phase === 'done') $('again-btn').click();
  }
});

// ---------- menu ----------

$('menu-btn').addEventListener('click', () => {
  const s = state.stats;
  fillStats($('stats'), [
    ['Hands played', s.hands],
    ['Won / lost / pushed', `${s.wins} / ${s.losses} / ${s.pushes}`],
    ['Blackjacks', s.blackjacks],
    ['Most chips', s.peak.toLocaleString()],
    ['Textbook moves', s.asked ? `${Math.round((s.right / s.asked) * 100)}%` : '–'],
  ]);
  $('coach-toggle').checked = settings.coach;
  $('menu').showModal();
});
$('coach-toggle').addEventListener('change', (e) => {
  settings.coach = e.target.checked;
  store(SETTINGS_KEY, settings);
});
$('reset-btn').addEventListener('click', () => {
  if (state.phase === 'player') {
    toast('Finish this hand first');
    return;
  }
  const stats = state.stats;
  state = newGame();
  state.stats = { ...stats, peak: Math.max(stats.peak, START_BANK) };
  bet = 0;
  save();
  render();
  $('menu').close();
});
for (const btn of document.querySelectorAll('[data-close]')) {
  btn.addEventListener('click', () => btn.closest('dialog').close());
}
$('menu').addEventListener('click', (e) => {
  if (e.target === $('menu')) $('menu').close();
});

// ---------- start ----------

// Cards already on the table when the page opens shouldn't fly in again.
for (const c of state.dealer) shown.add(`${c.id}`);
for (const h of state.hands) for (const c of h.cards) shown.add(`${c.id}`);
if (state.phase === 'player' && state.dealer[1]) shown.add(`${state.dealer[1].id}d`);
render();

registerServiceWorker();
