// Pure Word Ladder rules: change one letter at a time to get from the
// start word to the target, using real words.

export function oneApart(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++diff > 1) return false;
  return diff === 1;
}

export function newGame(puzzle, mode = 'daily', day = null) {
  return { puzzle, mode, day, chain: [puzzle.start], hints: 0, status: 'playing' };
}

export const current = (state) => state.chain[state.chain.length - 1];
export const steps = (state) => state.chain.length - 1;

// Returns { ok, message?, won? }.
export function submit(state, raw, isWord) {
  const word = raw.toLowerCase();
  const prev = current(state);
  if (state.status !== 'playing') return { ok: false, message: 'Already solved' };
  if (word.length !== prev.length) return { ok: false, message: `Use ${prev.length} letters` };
  if (word === prev) return { ok: false, message: 'Change one letter' };
  if (!oneApart(word, prev)) return { ok: false, message: 'Change just one letter' };
  if (state.chain.includes(word)) return { ok: false, message: 'Already used' };
  if (word !== state.puzzle.end && !isWord(word)) return { ok: false, message: 'Not in word list' };
  state.chain.push(word);
  if (word === state.puzzle.end) {
    state.status = 'won';
    return { ok: true, won: true };
  }
  return { ok: true };
}

export function undo(state) {
  if (state.status !== 'playing' || state.chain.length < 2) return false;
  state.chain.pop();
  return true;
}

// Shortest route between two words through `words` (same length), or null.
export function shortestPath(from, to, words) {
  if (from === to) return [from];
  const pool = new Set(words);
  pool.add(to);
  const prev = new Map([[from, null]]);
  const queue = [from];
  for (let q = 0; q < queue.length; q++) {
    const w = queue[q];
    for (let i = 0; i < w.length; i++) {
      for (let c = 97; c <= 122; c++) {
        const n = w.slice(0, i) + String.fromCharCode(c) + w.slice(i + 1);
        if (n === w || prev.has(n) || !pool.has(n)) continue;
        prev.set(n, w);
        if (n === to) {
          const path = [to];
          while (prev.get(path[0])) path.unshift(prev.get(path[0]));
          return path;
        }
        queue.push(n);
      }
    }
  }
  return null;
}

// Next word toward the target, avoiding words already in the chain. Follows
// the puzzle's own route when you're on it, then tries everyday words
// (`common`) before the full dictionary (`words`).
export function hint(state, words, common = []) {
  const used = new Set(state.chain);
  const at = current(state);
  const onPath = state.puzzle.path.indexOf(at);
  if (onPath >= 0 && onPath < state.puzzle.path.length - 1) {
    const next = state.puzzle.path[onPath + 1];
    if (!used.has(next)) return next;
  }
  for (const list of [common, words]) {
    const path = shortestPath(at, state.puzzle.end, list.filter((w) => !used.has(w)));
    if (path && path.length > 1) return path[1];
  }
  return null;
}

export function emptyStats() {
  return { played: 0, solved: 0, underPar: 0, streak: 0, maxStreak: 0, lastDay: null };
}

// Record a solved daily puzzle (streaks need consecutive days).
export function recordSolve(stats, state) {
  const s = { ...emptyStats(), ...stats };
  s.played++;
  s.solved++;
  if (steps(state) <= state.puzzle.par) s.underPar++;
  s.streak = s.lastDay != null && state.day === s.lastDay + 1 ? s.streak + 1 : 1;
  s.maxStreak = Math.max(s.maxStreak, s.streak);
  s.lastDay = state.day;
  return s;
}

export function shareText(state, label) {
  const n = steps(state);
  const par = state.puzzle.par;
  const verdict = n < par ? 'under par! 🏆' : n === par ? 'on par ⛳' : `${n - par} over par`;
  const rungs = state.chain.map((w, i) => (i === 0 ? '🟨' : i === state.chain.length - 1 ? '🟩' : '⬜')).join('');
  return `${label}\n${state.puzzle.start.toUpperCase()} → ${state.puzzle.end.toUpperCase()} in ${n} (${verdict})\n${rungs}`;
}
