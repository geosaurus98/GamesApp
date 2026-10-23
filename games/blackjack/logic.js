// Pure Blackjack rules: six-deck shoe, dealer stands on soft 17, blackjack
// pays 3 to 2, double on any two cards (also after a split), one split.
// Cards are { id, suit (0-3: ♠♥♦♣), rank (1-13) }.

export const DECKS = 6;
export const START_BANK = 1000;
const RESHUFFLE_AT = 0.25; // reshuffle when a quarter of the shoe is left

export function newShoe(rng = Math.random) {
  const shoe = [];
  let id = 0;
  for (let d = 0; d < DECKS; d++) {
    for (let suit = 0; suit < 4; suit++) {
      for (let rank = 1; rank <= 13; rank++) shoe.push({ id: id++, suit, rank });
    }
  }
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

export const cardValue = (card) => (card.rank === 1 ? 11 : Math.min(card.rank, 10));

// Best total, and whether an Ace is still counting as 11.
export function handValue(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardValue(c);
    if (c.rank === 1) aces++;
  }
  while (total > 21 && aces) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export const isBlackjack = (cards) => cards.length === 2 && handValue(cards).total === 21;

// Blackjack pays 3 to 2, rounded up to whole chips.
export const blackjackWin = (bet) => Math.ceil(bet * 1.5);

export function newGame(rng = Math.random) {
  return {
    bank: START_BANK,
    shoe: newShoe(rng),
    phase: 'betting', // betting | player | done
    dealer: [],
    hands: [],
    active: 0,
    lastBet: 25,
    stats: { hands: 0, wins: 0, losses: 0, pushes: 0, blackjacks: 0, peak: START_BANK, right: 0, asked: 0 },
  };
}

function drawCard(state, rng) {
  if (!state.shoe.length) state.shoe = newShoe(rng);
  return state.shoe.pop();
}

// Start a round. Returns { ok, message? }.
export function deal(state, bet, rng = Math.random) {
  if (state.phase === 'player') return { ok: false, message: 'Finish this hand first' };
  if (!(bet > 0) || bet > state.bank) return { ok: false, message: "You don't have enough chips" };
  if (state.shoe.length < DECKS * 52 * RESHUFFLE_AT) state.shoe = newShoe(rng);
  state.bank -= bet;
  state.lastBet = bet;
  const p = [drawCard(state, rng)];
  const d = [drawCard(state, rng)];
  p.push(drawCard(state, rng));
  d.push(drawCard(state, rng));
  state.dealer = d;
  state.hands = [{ cards: p, bet, done: false, doubled: false, split: false, result: null }];
  state.active = 0;
  state.phase = 'player';
  // Naturals end the round straight away (the dealer checks for blackjack).
  if (isBlackjack(p) || isBlackjack(d)) finishRound(state, rng);
  return { ok: true };
}

const hand = (state) => state.hands[state.active];

export function canDouble(state) {
  const h = hand(state);
  return state.phase === 'player' && h.cards.length === 2 && state.bank >= h.bet;
}

export function canSplit(state) {
  const h = hand(state);
  return state.phase === 'player' && state.hands.length === 1 && h.cards.length === 2
    && cardValue(h.cards[0]) === cardValue(h.cards[1]) && state.bank >= h.bet;
}

function nextHand(state, rng) {
  hand(state).done = true;
  while (state.active < state.hands.length && state.hands[state.active].done) state.active++;
  if (state.active >= state.hands.length) {
    state.active = state.hands.length - 1;
    finishRound(state, rng);
  }
}

export function hit(state, rng = Math.random) {
  if (state.phase !== 'player') return false;
  const h = hand(state);
  h.cards.push(drawCard(state, rng));
  if (handValue(h.cards).total >= 21) nextHand(state, rng);
  return true;
}

export function stand(state, rng = Math.random) {
  if (state.phase !== 'player') return false;
  nextHand(state, rng);
  return true;
}

export function double(state, rng = Math.random) {
  if (!canDouble(state)) return false;
  const h = hand(state);
  state.bank -= h.bet;
  h.bet *= 2;
  h.doubled = true;
  h.cards.push(drawCard(state, rng));
  nextHand(state, rng);
  return true;
}

export function split(state, rng = Math.random) {
  if (!canSplit(state)) return false;
  const h = hand(state);
  state.bank -= h.bet;
  const second = { cards: [h.cards.pop()], bet: h.bet, done: false, doubled: false, split: true, result: null };
  h.split = true;
  h.cards.push(drawCard(state, rng));
  second.cards.push(drawCard(state, rng));
  state.hands.push(second);
  // Split Aces get one card each.
  if (h.cards[0].rank === 1) {
    h.done = true;
    second.done = true;
    state.active = 1;
    finishRound(state, rng);
  } else if (handValue(h.cards).total === 21) {
    nextHand(state, rng);
  }
  return true;
}

function finishRound(state, rng) {
  for (const h of state.hands) h.done = true;
  const allBust = state.hands.every((h) => handValue(h.cards).total > 21);
  const playerNatural = state.hands.length === 1 && isBlackjack(state.hands[0].cards);
  if (!allBust && !playerNatural && !isBlackjack(state.dealer)) {
    while (handValue(state.dealer).total < 17) state.dealer.push(drawCard(state, rng));
  }
  const dealer = handValue(state.dealer).total;
  const dealerBJ = isBlackjack(state.dealer);
  for (const h of state.hands) {
    const mine = handValue(h.cards).total;
    const natural = !h.split && isBlackjack(h.cards);
    let pay = 0;
    if (mine > 21) h.result = 'bust';
    else if (natural && !dealerBJ) {
      h.result = 'blackjack';
      pay = h.bet + blackjackWin(h.bet);
    } else if (dealerBJ && !natural) h.result = 'lose';
    else if (dealer > 21 || mine > dealer) {
      h.result = 'win';
      pay = h.bet * 2;
    } else if (mine === dealer) {
      h.result = 'push';
      pay = h.bet;
    } else h.result = 'lose';
    state.bank += pay;
    state.stats.hands++;
    if (h.result === 'win' || h.result === 'blackjack') state.stats.wins++;
    else if (h.result === 'push') state.stats.pushes++;
    else state.stats.losses++;
    if (h.result === 'blackjack') state.stats.blackjacks++;
  }
  state.stats.peak = Math.max(state.stats.peak, state.bank);
  state.phase = 'done';
}

// The textbook best play for this hand ("basic strategy" for these rules).
// Returns 'hit' | 'stand' | 'double' | 'split'.
export function bestPlay(cards, upcard, { double: mayDouble = true, split: maySplit = true } = {}) {
  const up = cardValue(upcard); // 2..11
  const { total, soft } = handValue(cards);
  const dbl = (fallback) => (mayDouble && cards.length === 2 ? 'double' : fallback);

  if (maySplit && cards.length === 2 && cardValue(cards[0]) === cardValue(cards[1])) {
    const v = cardValue(cards[0]);
    if (v === 11 || v === 8) return 'split';
    if (v === 9 && ![7, 10, 11].includes(up)) return 'split';
    if ((v === 7 || v === 3 || v === 2) && up <= 7) return 'split';
    if (v === 6 && up <= 6) return 'split';
    if (v === 4 && (up === 5 || up === 6)) return 'split';
  }
  if (soft && total <= 21) {
    if (total >= 20) return 'stand';
    if (total === 19) return up === 6 ? dbl('stand') : 'stand';
    if (total === 18) {
      if (up <= 6) return dbl('stand');
      return up <= 8 ? 'stand' : 'hit';
    }
    if (total === 17) return up >= 3 && up <= 6 ? dbl('hit') : 'hit';
    if (total >= 15) return up >= 4 && up <= 6 ? dbl('hit') : 'hit';
    return up >= 5 && up <= 6 ? dbl('hit') : 'hit';
  }
  if (total >= 17) return 'stand';
  if (total >= 13) return up <= 6 ? 'stand' : 'hit';
  if (total === 12) return up >= 4 && up <= 6 ? 'stand' : 'hit';
  if (total === 11) return dbl('hit');
  if (total === 10) return up <= 9 ? dbl('hit') : 'hit';
  if (total === 9) return up >= 3 && up <= 6 ? dbl('hit') : 'hit';
  return 'hit';
}
