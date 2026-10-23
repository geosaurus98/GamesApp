// Pure FreeCell rules. Cards are { id, suit (0-3: ♠♥♦♣), rank (1-13) }.
// Deals use the classic Microsoft numbering, so deal #1 matches the
// FreeCell game #1 people know.

export const MAX_DEAL = 1000000;
const isRed = (card) => card.suit === 1 || card.suit === 2;
const top = (pile) => pile[pile.length - 1];
// Microsoft card order is clubs, diamonds, hearts, spades.
const MS_SUIT = [3, 2, 1, 0];

export function deal(number) {
  let seed = number;
  const rand = () => {
    seed = (seed * 214013 + 2531011) % 2147483648;
    return Math.floor(seed / 65536);
  };
  const deck = [...Array(52).keys()];
  const cascades = Array.from({ length: 8 }, () => []);
  for (let i = 0; i < 52; i++) {
    const left = 52 - i;
    const j = rand() % left;
    const c = deck[j];
    deck[j] = deck[left - 1];
    const suit = MS_SUIT[c % 4];
    const rank = Math.floor(c / 4) + 1;
    cascades[i % 8].push({ id: suit * 13 + rank - 1, suit, rank });
  }
  return {
    number,
    cascades,
    cells: [null, null, null, null],
    foundations: [[], [], [], []], // by suit
    moves: 0,
    elapsedMs: 0,
    status: 'playing',
  };
}

export function randomDealNumber(rng = Math.random) {
  return 1 + Math.floor(rng() * 32000);
}

const fitsOn = (card, onto) => !onto || (isRed(card) !== isRed(onto) && onto.rank === card.rank + 1);
const fitsFoundation = (card, f) => (top(f)?.rank ?? 0) === card.rank - 1;

// How many cards can move at once using free cells and empty columns.
export function maxRun(state, toEmptyColumn = false) {
  const freeCells = state.cells.filter((c) => !c).length;
  const emptyCols = state.cascades.filter((c) => !c.length).length - (toEmptyColumn ? 1 : 0);
  return (freeCells + 1) * 2 ** Math.max(0, emptyCols);
}

// Is cascades[col] from `start` to the end a proper alternating run?
export function isRun(pile, start) {
  for (let i = start + 1; i < pile.length; i++) if (!fitsOn(pile[i], pile[i - 1])) return false;
  return start < pile.length;
}

// Locations: { pile: 'cascade', index, card } | { pile: 'cell', index } |
// { pile: 'foundation', index }.
function cardsAt(state, from) {
  if (from.pile === 'cascade') {
    const col = state.cascades[from.index];
    const start = from.card ?? col.length - 1;
    return start >= 0 && isRun(col, start) ? col.slice(start) : null;
  }
  if (from.pile === 'cell') return state.cells[from.index] ? [state.cells[from.index]] : null;
  if (from.pile === 'foundation') {
    const t = top(state.foundations[from.index]);
    return t ? [t] : null;
  }
  return null;
}

export function canMove(state, from, to) {
  const cards = cardsAt(state, from);
  if (!cards) return false;
  if (to.pile === from.pile && to.index === from.index) return false;
  if (to.pile === 'foundation') {
    return cards.length === 1 && to.index === cards[0].suit && fitsFoundation(cards[0], state.foundations[to.index]);
  }
  if (to.pile === 'cell') return cards.length === 1 && !state.cells[to.index];
  if (to.pile === 'cascade') {
    const dest = state.cascades[to.index];
    if (!fitsOn(cards[0], top(dest))) return false;
    return cards.length <= maxRun(state, dest.length === 0);
  }
  return false;
}

export function move(state, from, to) {
  if (!canMove(state, from, to)) return false;
  let cards;
  if (from.pile === 'cascade') {
    const col = state.cascades[from.index];
    cards = col.splice(from.card ?? col.length - 1);
  } else if (from.pile === 'cell') {
    cards = [state.cells[from.index]];
    state.cells[from.index] = null;
  } else {
    cards = [state.foundations[from.index].pop()];
  }
  if (to.pile === 'foundation') state.foundations[to.index].push(...cards);
  else if (to.pile === 'cell') [state.cells[to.index]] = cards;
  else state.cascades[to.index].push(...cards);
  state.moves++;
  if (state.foundations.every((f) => f.length === 13)) state.status = 'won';
  return true;
}

// Where a tapped card should go: home, then onto another column, then an
// empty column, then a free cell.
export function bestTarget(state, from) {
  const cards = cardsAt(state, from);
  if (!cards) return null;
  if (cards.length === 1 && from.pile !== 'foundation') {
    const f = { pile: 'foundation', index: cards[0].suit };
    if (canMove(state, from, f)) return f;
  }
  const order = [...state.cascades.keys()];
  for (const index of order) {
    if (state.cascades[index].length && canMove(state, from, { pile: 'cascade', index })) return { pile: 'cascade', index };
  }
  // Moving a whole column into another empty column achieves nothing.
  const wholeColumn = from.pile === 'cascade' && (from.card ?? state.cascades[from.index].length - 1) === 0;
  if (!wholeColumn) {
    for (const index of order) {
      if (!state.cascades[index].length && canMove(state, from, { pile: 'cascade', index })) return { pile: 'cascade', index };
    }
  }
  if (from.pile === 'cascade' && cards.length === 1) {
    const free = state.cells.findIndex((c) => !c);
    if (free >= 0) return { pile: 'cell', index: free };
  }
  return null;
}

// A card can safely go home once both opposite-colour piles are close
// behind, so it will never be needed to hold another card.
function safeHome(state, card) {
  if (card.rank <= 2) return true;
  const opp = isRed(card) ? [0, 3] : [1, 2];
  return opp.every((s) => state.foundations[s].length >= card.rank - 1);
}

// The next safe automatic move to a foundation, or null.
export function autoStep(state) {
  const sources = [
    ...state.cells.map((c, index) => (c ? { from: { pile: 'cell', index }, card: c } : null)),
    ...state.cascades.map((col, index) => (col.length ? { from: { pile: 'cascade', index }, card: top(col) } : null)),
  ].filter(Boolean);
  for (const { from, card } of sources) {
    const to = { pile: 'foundation', index: card.suit };
    if (safeHome(state, card) && canMove(state, from, to)) return { from, to };
  }
  return null;
}

// A suggested move, or null if nothing obvious.
export function findHint(state) {
  const sources = [
    ...state.cells.map((c, index) => (c ? { pile: 'cell', index } : null)).filter(Boolean),
    ...state.cascades.map((col, index) => {
      if (!col.length) return null;
      let start = col.length - 1;
      while (start > 0 && fitsOn(col[start], col[start - 1])) start--;
      return { pile: 'cascade', index, card: start };
    }).filter(Boolean),
  ];
  // Foundations first.
  for (const from of sources) {
    const cards = cardsAt(state, from.pile === 'cascade' ? { ...from, card: state.cascades[from.index].length - 1 } : from);
    const to = { pile: 'foundation', index: cards[0].suit };
    const single = from.pile === 'cascade' ? { ...from, card: state.cascades[from.index].length - 1 } : from;
    if (canMove(state, single, to)) return { from: single, to };
  }
  // Then building on another non-empty column (try the longest movable run).
  for (const from of sources) {
    const len = from.pile === 'cascade' ? state.cascades[from.index].length : 1;
    const startAt = from.pile === 'cascade' ? from.card : 0;
    for (let s = startAt; s < len; s++) {
      const f = from.pile === 'cascade' ? { ...from, card: s } : from;
      for (let index = 0; index < 8; index++) {
        if (state.cascades[index].length && canMove(state, f, { pile: 'cascade', index })) return { from: f, to: { pile: 'cascade', index } };
      }
    }
  }
  return null;
}
