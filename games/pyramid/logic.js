// Pure Pyramid solitaire rules: remove pairs of uncovered cards that add up
// to 13 (Jack 11, Queen 12; Kings go alone). Cards are
// { id, suit (0-3: ♠♥♦♣), rank (1-13) }.

export const ROWS = 7;
export const PASSES = 3; // times you may go through the stock

// Pyramid slot index for row r, position i (row r has r + 1 cards).
export const slot = (r, i) => (r * (r + 1)) / 2 + i;
export const rowOf = (n) => Math.floor((Math.sqrt(8 * n + 1) - 1) / 2);

export function deal(rng = Math.random) {
  const deck = [];
  for (let suit = 0; suit < 4; suit++) {
    for (let rank = 1; rank <= 13; rank++) deck.push({ id: suit * 13 + rank - 1, suit, rank });
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return {
    pyramid: deck.splice(0, 28), // null once removed
    stock: deck,
    waste: [],
    pass: 1,
    removed: 0,
    moves: 0,
    elapsedMs: 0,
    status: 'playing',
  };
}

// A pyramid card is free when both cards resting on it are gone.
export function isFree(state, n) {
  if (!state.pyramid[n]) return false;
  const r = rowOf(n);
  if (r === ROWS - 1) return true;
  const i = n - slot(r, 0);
  return !state.pyramid[slot(r + 1, i)] && !state.pyramid[slot(r + 1, i + 1)];
}

// Places: { pile: 'pyramid', index } | { pile: 'waste' }.
export function cardAt(state, place) {
  if (place.pile === 'waste') return state.waste[state.waste.length - 1] ?? null;
  return isFree(state, place.index) ? state.pyramid[place.index] : null;
}

function take(state, place) {
  if (place.pile === 'waste') state.waste.pop();
  else state.pyramid[place.index] = null;
}

const same = (a, b) => a.pile === b.pile && a.index === b.index;

// Remove one King, or two cards adding up to 13.
export function remove(state, a, b = null) {
  if (state.status !== 'playing') return false;
  const ca = cardAt(state, a);
  if (!ca) return false;
  if (!b) {
    if (ca.rank !== 13) return false;
    take(state, a);
    state.removed += 1;
  } else {
    if (same(a, b)) return false;
    const cb = cardAt(state, b);
    if (!cb || ca.rank + cb.rank !== 13) return false;
    take(state, a);
    take(state, b);
    state.removed += 2;
  }
  state.moves++;
  update(state);
  return true;
}

// Turn the next stock card onto the waste, or start another pass.
export function draw(state) {
  if (state.status !== 'playing') return false;
  if (state.stock.length) {
    state.waste.push(state.stock.pop());
  } else if (state.pass < PASSES && state.waste.length) {
    state.stock = state.waste.reverse();
    state.waste = [];
    state.pass++;
  } else {
    return false;
  }
  state.moves++;
  update(state);
  return true;
}

function freePlaces(state) {
  const places = [];
  state.pyramid.forEach((c, index) => { if (isFree(state, index)) places.push({ pile: 'pyramid', index }); });
  if (state.waste.length) places.push({ pile: 'waste' });
  return places;
}

// A legal removal: [place] for a King or [place, place] for a pair.
export function findMove(state) {
  const places = freePlaces(state);
  for (const p of places) if (cardAt(state, p).rank === 13) return [p];
  for (let i = 0; i < places.length; i++) {
    for (let j = i + 1; j < places.length; j++) {
      if (cardAt(state, places[i]).rank + cardAt(state, places[j]).rank === 13) return [places[i], places[j]];
    }
  }
  return null;
}

function update(state) {
  if (state.pyramid.every((c) => !c)) {
    state.status = 'won';
    return;
  }
  const canDraw = state.stock.length > 0 || (state.pass < PASSES && state.waste.length > 0);
  if (!canDraw && !findMove(state)) state.status = 'lost';
}

export const cardsLeft = (state) => state.pyramid.filter(Boolean).length;
