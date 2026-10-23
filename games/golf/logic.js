// Pure Golf solitaire rules: clear seven columns by playing their bottom
// cards onto the pile, one rank higher or lower. Like golf, low scores win.
// Cards are { id, suit (0-3: ♠♥♦♣), rank (1-13) }.

export function deal(rng = Math.random) {
  const deck = [];
  for (let suit = 0; suit < 4; suit++) {
    for (let rank = 1; rank <= 13; rank++) deck.push({ id: suit * 13 + rank - 1, suit, rank });
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const columns = Array.from({ length: 7 }, () => deck.splice(0, 5));
  const pile = [deck.pop()];
  return { columns, stock: deck, pile, moves: 0, streak: 0, bestStreak: 0, elapsedMs: 0, status: 'playing' };
}

// One rank up or down. Kings and Aces don't wrap round.
export const fits = (card, onto) => Math.abs(card.rank - onto.rank) === 1;

export function canPlay(state, col) {
  const column = state.columns[col];
  const card = column?.[column.length - 1];
  return !!card && fits(card, state.pile[state.pile.length - 1]);
}

export function play(state, col) {
  if (state.status !== 'playing' || !canPlay(state, col)) return false;
  state.pile.push(state.columns[col].pop());
  state.moves++;
  state.streak++;
  state.bestStreak = Math.max(state.bestStreak, state.streak);
  update(state);
  return true;
}

export function draw(state) {
  if (state.status !== 'playing' || !state.stock.length) return false;
  state.pile.push(state.stock.pop());
  state.moves++;
  state.streak = 0;
  update(state);
  return true;
}

export const cardsLeft = (state) => state.columns.reduce((n, c) => n + c.length, 0);

// Golf scoring: cards left on the table; a clear table scores minus the
// stock cards you didn't need.
export const score = (state) => (cardsLeft(state) ? cardsLeft(state) : -state.stock.length);

export function playable(state) {
  return state.columns.map((_, i) => i).filter((i) => canPlay(state, i));
}

function update(state) {
  if (!cardsLeft(state)) state.status = 'won';
  else if (!state.stock.length && !playable(state).length) state.status = 'over';
}
