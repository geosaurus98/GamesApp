// Pure Spider solitaire rules: two decks, ten columns. Cards are
// { id, suit (0-3: ♠♥♦♣), rank (1-13), up }.

export const SUIT_SETS = { 1: [0], 2: [0, 1], 4: [0, 1, 2, 3] };
const top = (pile) => pile[pile.length - 1];

export function newGame(suitCount = 1, rng = Math.random) {
  const suits = SUIT_SETS[suitCount] ?? SUIT_SETS[1];
  const copies = 8 / suits.length;
  const deck = [];
  let id = 0;
  for (const suit of suits) {
    for (let k = 0; k < copies; k++) {
      for (let rank = 1; rank <= 13; rank++) deck.push({ id: id++, suit, rank, up: false });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const tableau = Array.from({ length: 10 }, (_, i) => deck.splice(0, i < 4 ? 6 : 5));
  for (const col of tableau) top(col).up = true;
  return {
    suitCount: suits.length,
    tableau,
    stock: deck, // 50 cards: five deals of ten
    done: [], // suits of completed King-to-Ace runs
    moves: 0,
    elapsedMs: 0,
    status: 'playing',
  };
}

// Can pile[start..] be picked up together (same suit, counting down)?
export function isRun(pile, start) {
  if (start < 0 || start >= pile.length || !pile[start].up) return false;
  for (let i = start + 1; i < pile.length; i++) {
    if (pile[i].suit !== pile[i - 1].suit || pile[i].rank !== pile[i - 1].rank - 1) return false;
  }
  return true;
}

export function canMove(state, from, to) {
  if (from.index === to) return false;
  const src = state.tableau[from.index];
  if (!isRun(src, from.card)) return false;
  const dest = top(state.tableau[to]);
  return !dest || dest.rank === src[from.card].rank + 1;
}

function flipTop(col) {
  const t = top(col);
  if (t && !t.up) t.up = true;
}

// Take away a finished King-to-Ace run in one suit from the end of a column.
function collect(state, index) {
  const col = state.tableau[index];
  if (col.length < 13) return false;
  const start = col.length - 13;
  if (col[start].rank !== 13 || !isRun(col, start)) return false;
  state.done.push(col[start].suit);
  col.splice(start);
  flipTop(col);
  if (state.done.length === 8) state.status = 'won';
  return true;
}

// Returns { moved, completed } where completed is true if a run was cleared.
export function move(state, from, to) {
  if (!canMove(state, from, to)) return { moved: false };
  const cards = state.tableau[from.index].splice(from.card);
  state.tableau[to].push(...cards);
  flipTop(state.tableau[from.index]);
  state.moves++;
  return { moved: true, completed: collect(state, to) };
}

// Deal one card onto every column. Not allowed while a column is empty.
export function dealRow(state) {
  if (!state.stock.length) return { ok: false, message: 'No more cards to deal' };
  if (state.tableau.some((c) => !c.length)) return { ok: false, message: 'Fill every column before dealing' };
  for (const col of state.tableau) col.push({ ...state.stock.pop(), up: true });
  state.moves++;
  let completed = false;
  state.tableau.forEach((_, i) => { completed = collect(state, i) || completed; });
  return { ok: true, completed };
}

// Where a tapped run should go: onto a card of its own suit if possible,
// then any card one higher, then an empty column.
export function bestTarget(state, from) {
  const src = state.tableau[from.index];
  if (!isRun(src, from.card)) return null;
  const card = src[from.card];
  let fallback = null;
  let empty = null;
  for (let i = 0; i < 10; i++) {
    if (!canMove(state, from, i)) continue;
    const t = top(state.tableau[i]);
    if (t && t.suit === card.suit) return i;
    if (t && fallback == null) fallback = i;
    if (!t && empty == null && from.card > 0) empty = i;
  }
  return fallback ?? empty;
}

// Longest movable run at the end of each column, as { index, card }.
function runs(state) {
  return state.tableau.map((col, index) => {
    if (!col.length) return null;
    let card = col.length - 1;
    while (card > 0 && isRun(col, card - 1)) card--;
    return { index, card };
  }).filter(Boolean);
}

// A useful move: building in suit, uncovering a hidden card, or dealing.
export function findHint(state) {
  const all = runs(state);
  // Moves onto the same suit first, then moves that turn over a card.
  for (const pass of ['suit', 'reveal']) {
    for (const r of all) {
      for (let card = r.card; card < state.tableau[r.index].length; card++) {
        const from = { index: r.index, card };
        for (let to = 0; to < 10; to++) {
          if (!canMove(state, from, to)) continue;
          const t = top(state.tableau[to]);
          if (!t) continue;
          const src = state.tableau[r.index];
          if (pass === 'suit' && t.suit === src[card].suit && !(card > 0 && src[card - 1].up && src[card - 1].suit === src[card].suit && src[card - 1].rank === src[card].rank + 1)) return { from, to };
          if (pass === 'reveal' && card === r.card && card > 0 && !src[card - 1].up) return { from, to };
        }
      }
    }
  }
  if (state.stock.length) return { deal: true };
  return null;
}
