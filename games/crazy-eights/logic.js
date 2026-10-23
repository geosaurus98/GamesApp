// Pure Crazy Eights rules. Player 0 is you; the rest are computer players.
// Match the top card's suit or rank; eights are wild and pick the suit.
// Cards are { id, suit (0-3: ♠♥♦♣), rank (1-13) }.

export const MAX_DRAWS = 3; // per turn, then you may pass

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function newRound(players = 2, rng = Math.random, first = 0) {
  const deck = [];
  for (let suit = 0; suit < 4; suit++) {
    for (let rank = 1; rank <= 13; rank++) deck.push({ id: suit * 13 + rank - 1, suit, rank });
  }
  shuffle(deck, rng);
  const size = players === 2 ? 7 : 5;
  const hands = Array.from({ length: players }, () => deck.splice(0, size));
  // The starting card can't be an eight: tuck eights back into the deck.
  let start = deck.pop();
  while (start.rank === 8) {
    deck.splice(Math.floor(rng() * deck.length), 0, start);
    start = deck.pop();
  }
  return {
    hands,
    stock: deck,
    discard: [start],
    suit: start.suit,
    turn: first,
    draws: 0, // cards drawn this turn
    passes: 0, // passes in a row (everyone stuck ends the round)
    status: 'playing',
    winner: null,
  };
}

export const top = (state) => state.discard[state.discard.length - 1];

export function canPlay(state, card) {
  return card.rank === 8 || card.suit === state.suit || card.rank === top(state).rank;
}

export const playableCards = (state, player) => state.hands[player].filter((c) => canPlay(state, c));

function nextTurn(state) {
  state.turn = (state.turn + 1) % state.hands.length;
  state.draws = 0;
}

// Play a card. `suit` is required for an eight.
export function play(state, player, cardId, suit = null) {
  if (state.status !== 'playing' || state.turn !== player) return false;
  const hand = state.hands[player];
  const i = hand.findIndex((c) => c.id === cardId);
  if (i < 0 || !canPlay(state, hand[i])) return false;
  const card = hand[i];
  if (card.rank === 8 && (suit == null || suit < 0 || suit > 3)) return false;
  hand.splice(i, 1);
  state.discard.push(card);
  state.passes = 0;
  state.suit = card.rank === 8 ? suit : card.suit;
  if (!hand.length) {
    state.status = 'over';
    state.winner = player;
    return true;
  }
  nextTurn(state);
  return true;
}

// Draw one card, reshuffling the discard pile into a new deck if needed.
export function draw(state, player, rng = Math.random) {
  if (state.status !== 'playing' || state.turn !== player || state.draws >= MAX_DRAWS) return null;
  if (!state.stock.length) {
    const keep = state.discard.pop();
    state.stock = shuffle(state.discard, rng);
    state.discard = [keep];
  }
  if (!state.stock.length) return null;
  const card = state.stock.pop();
  state.hands[player].push(card);
  state.draws++;
  state.passes = 0;
  return card;
}

// Passing is allowed once you've drawn your limit or the deck is empty.
export function canPass(state, player) {
  if (state.status !== 'playing' || state.turn !== player) return false;
  const deckEmpty = !state.stock.length && state.discard.length <= 1;
  return state.draws >= MAX_DRAWS || deckEmpty;
}

export function pass(state, player) {
  if (!canPass(state, player)) return false;
  state.passes = (state.passes ?? 0) + 1;
  const deckEmpty = !state.stock.length && state.discard.length <= 1;
  // Everyone passed with nothing left to draw: lowest hand wins.
  if (deckEmpty && state.passes >= state.hands.length) {
    const points = state.hands.map(handPoints);
    state.status = 'over';
    state.winner = points.indexOf(Math.min(...points));
    state.blocked = true;
    return true;
  }
  nextTurn(state);
  return true;
}

// Points left in a hand (eights 50, picture cards 10, others face value).
export const handPoints = (hand) => hand.reduce((n, c) => n + (c.rank === 8 ? 50 : Math.min(c.rank, 10)), 0);

// Suit you hold most of (ignoring eights), for choosing after an eight.
export function favouriteSuit(hand) {
  const counts = [0, 0, 0, 0];
  for (const c of hand) if (c.rank !== 8) counts[c.suit]++;
  return counts.indexOf(Math.max(...counts));
}

// A computer move: { play: cardId, suit? } | { draw: true } | { pass: true }.
// Prefers ordinary cards in the suit it holds most, high cards first, and
// saves eights for when nothing else fits.
export function chooseMove(state, player) {
  const hand = state.hands[player];
  const options = playableCards(state, player);
  const normal = options.filter((c) => c.rank !== 8);
  if (normal.length) {
    const counts = [0, 0, 0, 0];
    for (const c of hand) counts[c.suit]++;
    normal.sort((a, b) => counts[b.suit] - counts[a.suit] || b.rank - a.rank);
    return { play: normal[0].id };
  }
  if (options.length) {
    const rest = hand.filter((c) => c.id !== options[0].id);
    return { play: options[0].id, suit: rest.length ? favouriteSuit(rest) : options[0].suit };
  }
  if (canPass(state, player)) return { pass: true };
  return { draw: true };
}
