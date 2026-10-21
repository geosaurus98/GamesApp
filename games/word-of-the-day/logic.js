// Pure rules for Word of the Day (a five-letter guessing game).

export const WORD_LENGTH = 5;
export const MAX_GUESSES = 6;

// Colour each letter: 'correct' (right spot), 'present' (elsewhere in the
// word) or 'absent'. Repeated letters only count as often as the answer has
// them, with exact matches claimed first.
export function scoreGuess(guess, answer) {
  const result = new Array(guess.length).fill('absent');
  const left = {};
  for (let i = 0; i < answer.length; i++) {
    if (guess[i] === answer[i]) result[i] = 'correct';
    else left[answer[i]] = (left[answer[i]] ?? 0) + 1;
  }
  for (let i = 0; i < guess.length; i++) {
    if (result[i] !== 'correct' && left[guess[i]] > 0) {
      result[i] = 'present';
      left[guess[i]]--;
    }
  }
  return result;
}

const RANK = { absent: 1, present: 2, correct: 3 };

// Best-known status of each letter, for colouring the keyboard.
export function letterStates(guesses, answer) {
  const states = {};
  for (const g of guesses) {
    scoreGuess(g, answer).forEach((s, i) => {
      const ch = g[i];
      if (!states[ch] || RANK[s] > RANK[states[ch]]) states[ch] = s;
    });
  }
  return states;
}

export function newGame(answer, mode = 'daily', day = null) {
  return { mode, day, answer, guesses: [], status: 'playing' };
}

// Returns { ok, message?, won?, lost? }.
export function submitGuess(state, guess, isAllowed) {
  guess = guess.toLowerCase();
  if (state.status !== 'playing') return { ok: false, message: 'Game over' };
  if (guess.length !== WORD_LENGTH) return { ok: false, message: 'Not enough letters' };
  if (!isAllowed(guess)) return { ok: false, message: 'Not in word list' };
  state.guesses.push(guess);
  if (guess === state.answer) {
    state.status = 'won';
    return { ok: true, won: true };
  }
  if (state.guesses.length >= MAX_GUESSES) {
    state.status = 'lost';
    return { ok: true, lost: true };
  }
  return { ok: true };
}

export function emptyStats() {
  return { played: 0, wins: 0, streak: 0, maxStreak: 0, lastDay: null, dist: [0, 0, 0, 0, 0, 0] };
}

// Record a finished daily game. Streaks break when a day is skipped or lost.
export function recordResult(stats, state) {
  const s = { ...emptyStats(), ...stats, dist: [...(stats?.dist ?? emptyStats().dist)] };
  s.played++;
  if (state.status === 'won') {
    s.wins++;
    s.dist[state.guesses.length - 1]++;
    s.streak = s.lastDay != null && state.day === s.lastDay + 1 ? s.streak + 1 : 1;
    s.maxStreak = Math.max(s.maxStreak, s.streak);
  } else {
    s.streak = 0;
  }
  s.lastDay = state.day;
  return s;
}

const EMOJI = { correct: '🟩', present: '🟨', absent: '⬛' };

export function shareGrid(state, label) {
  const score = state.status === 'won' ? state.guesses.length : 'X';
  const rows = state.guesses.map((g) => scoreGuess(g, state.answer).map((s) => EMOJI[s]).join(''));
  return `${label} ${score}/${MAX_GUESSES}\n\n${rows.join('\n')}`;
}
