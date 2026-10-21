// Pure Klondike solitaire rules.
// A card is { id, suit (0-3), rank (1-13), up (face up) }.
// Foundations are fixed per suit: foundations[suit].

export const SUITS = ['♠', '♥', '♦', '♣'];
export const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const isRed = (card) => card.suit === 1 || card.suit === 2;

export function newDeck() {
  const deck = [];
  for (let suit = 0; suit < 4; suit++) {
    for (let rank = 1; rank <= 13; rank++) deck.push({ id: suit * 13 + rank - 1, suit, rank, up: false });
  }
  return deck;
}

export function deal(rng = Math.random, drawCount = 1) {
  const deck = newDeck();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const tableau = [];
  for (let col = 0; col < 7; col++) {
    const pile = deck.splice(0, col + 1);
    pile[pile.length - 1].up = true;
    tableau.push(pile);
  }
  return {
    stock: deck,
    waste: [],
    foundations: [[], [], [], []],
    tableau,
    drawCount,
    moves: 0,
    elapsedMs: 0,
    status: 'playing',
  };
}

const top = (pile) => pile[pile.length - 1];

export function canPlaceOnTableau(card, pile) {
  const t = top(pile);
  if (!t) return card.rank === 13;
  return t.up && isRed(t) !== isRed(card) && t.rank === card.rank + 1;
}

export function canPlaceOnFoundation(card, foundation) {
  const t = top(foundation);
  return t ? t.suit === card.suit && t.rank === card.rank - 1 : card.rank === 1;
}

// Turn over stock cards onto the waste, or recycle the waste when the
// stock is empty.
export function draw(state) {
  if (state.stock.length === 0) {
    if (state.waste.length === 0) return false;
    state.stock = state.waste.reverse().map((c) => ({ ...c, up: false }));
    state.waste = [];
  } else {
    const n = Math.min(state.drawCount, state.stock.length);
    for (let i = 0; i < n; i++) state.waste.push({ ...state.stock.pop(), up: true });
  }
  state.moves++;
  return true;
}

// Locations: { pile: 'waste' } | { pile: 'foundation', index } |
// { pile: 'tableau', index, card } where card is the position in the column.
function source(state, from) {
  if (from.pile === 'waste') return state.waste.length ? { pile: state.waste, at: state.waste.length - 1 } : null;
  if (from.pile === 'foundation') {
    const f = state.foundations[from.index];
    return f.length ? { pile: f, at: f.length - 1 } : null;
  }
  if (from.pile === 'tableau') {
    const col = state.tableau[from.index];
    const at = from.card ?? col.length - 1;
    return col[at]?.up ? { pile: col, at } : null;
  }
  return null;
}

export function canMove(state, from, to) {
  const src = source(state, from);
  if (!src) return false;
  const cards = src.pile.slice(src.at);
  if (to.pile === 'foundation') {
    return cards.length === 1 && to.index === cards[0].suit && canPlaceOnFoundation(cards[0], state.foundations[to.index]);
  }
  if (to.pile === 'tableau') {
    if (from.pile === 'tableau' && from.index === to.index) return false;
    return canPlaceOnTableau(cards[0], state.tableau[to.index]);
  }
  return false;
}

export function move(state, from, to) {
  if (!canMove(state, from, to)) return false;
  const src = source(state, from);
  const cards = src.pile.splice(src.at);
  const dest = to.pile === 'foundation' ? state.foundations[to.index] : state.tableau[to.index];
  dest.push(...cards);
  if (from.pile === 'tableau') {
    const t = top(state.tableau[from.index]);
    if (t && !t.up) t.up = true;
  }
  state.moves++;
  if (isWon(state)) state.status = 'won';
  return true;
}

// Where a tapped card should go: its foundation if possible, otherwise the
// first tableau column that takes it (preferring non-empty columns).
export function bestTarget(state, from) {
  const src = source(state, from);
  if (!src) return null;
  const card = src.pile[src.at];
  const single = src.at === src.pile.length - 1;
  if (single && from.pile !== 'foundation') {
    const f = { pile: 'foundation', index: card.suit };
    if (canMove(state, from, f)) return f;
  }
  const cols = [...state.tableau.keys()];
  // Moving a king that's already at the bottom of a column to another empty one is pointless.
  const kingAtBottom = from.pile === 'tableau' && card.rank === 13 && src.at === 0;
  for (const preferEmpty of [false, true]) {
    for (const index of cols) {
      const isEmpty = state.tableau[index].length === 0;
      if (isEmpty !== preferEmpty || (isEmpty && kingAtBottom)) continue;
      const to = { pile: 'tableau', index };
      if (canMove(state, from, to)) return to;
    }
  }
  return null;
}

export function isWon(state) {
  return state.foundations.every((f) => f.length === 13);
}

// Everything is face up and the stock is used up: the rest is mechanical.
export function canAutoFinish(state) {
  return state.status === 'playing' && state.stock.length === 0 && state.waste.length === 0
    && state.tableau.every((col) => col.every((c) => c.up));
}

// Next card to send to a foundation while auto-finishing (lowest rank first).
export function autoFinishStep(state) {
  let best = null;
  state.tableau.forEach((col, index) => {
    const card = top(col);
    if (card && canPlaceOnFoundation(card, state.foundations[card.suit]) && (!best || card.rank < best.rank)) {
      best = { rank: card.rank, from: { pile: 'tableau', index }, to: { pile: 'foundation', index: card.suit } };
    }
  });
  return best;
}

// A useful move to suggest, or { draw: true }, or null when stuck.
export function findHint(state) {
  const froms = [{ pile: 'waste' }, ...state.tableau.map((_, index) => ({ pile: 'tableau', index }))];
  // 1. Anything that can go up to a foundation.
  for (const from of froms) {
    const card = source(state, from);
    if (!card) continue;
    const to = { pile: 'foundation', index: card.pile[card.at].suit };
    if (canMove(state, from, to)) return { from, to };
  }
  // 2. Tableau moves that turn over a hidden card or free up a column for a king.
  for (let index = 0; index < 7; index++) {
    const col = state.tableau[index];
    const first = col.findIndex((c) => c.up);
    if (first === -1) continue;
    const from = { pile: 'tableau', index, card: first };
    if (first === 0 && col[0].rank === 13) continue;
    for (let t = 0; t < 7; t++) {
      const to = { pile: 'tableau', index: t };
      if (canMove(state, from, to) && state.tableau[t].length > 0) return { from, to };
      if (canMove(state, from, to) && first > 0) return { from, to };
    }
  }
  // 3. Waste card onto the tableau.
  for (let t = 0; t < 7; t++) {
    const to = { pile: 'tableau', index: t };
    if (canMove(state, { pile: 'waste' }, to)) return { from: { pile: 'waste' }, to };
  }
  if (state.stock.length || state.waste.length > 1) return { draw: true };
  return null;
}

export const cardLabel = (card) => `${RANKS[card.rank]}${SUITS[card.suit]}`;
