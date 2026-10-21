// Pure rules for Spelling Hive: make words from seven letters, always
// using the centre one.

export const MIN_LENGTH = 4;

export const RANKS = [
  ['Beginner', 0],
  ['Good Start', 0.02],
  ['Moving Up', 0.05],
  ['Good', 0.08],
  ['Solid', 0.15],
  ['Nice', 0.25],
  ['Great', 0.4],
  ['Amazing', 0.5],
  ['Genius', 0.7],
  ['Queen Bee', 1],
];

export const isPangram = (word, letters) => [...letters].every((ch) => word.includes(ch));

// 4-letter words score 1; longer words score their length; pangrams +7.
export function wordScore(word, letters) {
  const base = word.length === MIN_LENGTH ? 1 : word.length;
  return base + (isPangram(word, letters) ? 7 : 0);
}

export function maxScore(puzzle) {
  return puzzle.words.reduce((sum, w) => sum + wordScore(w, puzzle.letters), 0);
}

export function rankFor(score, max) {
  let rank = RANKS[0];
  let next = null;
  for (let i = 0; i < RANKS.length; i++) {
    const needed = Math.round(RANKS[i][1] * max);
    if (score >= needed) rank = RANKS[i];
    else {
      next = { name: RANKS[i][0], needed, toGo: needed - score };
      break;
    }
  }
  return { name: rank[0], index: RANKS.indexOf(rank), next };
}

export function newGame(puzzle, mode = 'daily', day = null) {
  return { mode, day, puzzle, found: [], bonus: [], score: 0 };
}

// isBonusWord(word) says whether a word outside the puzzle's list is still a
// real word (from the big dictionary); those score as bonus words.
// Returns { ok, message, points?, pangram?, bonus? }.
export function submitWord(state, raw, isBonusWord = () => false) {
  const word = raw.toLowerCase();
  const { letters, center, words } = state.puzzle;
  if (word.length < MIN_LENGTH) return { ok: false, message: 'Too short' };
  if (![...word].every((ch) => letters.includes(ch))) return { ok: false, message: 'Bad letters' };
  if (!word.includes(center)) return { ok: false, message: 'Missing centre letter' };
  if (state.found.includes(word) || state.bonus.includes(word)) return { ok: false, message: 'Already found' };

  const inList = words.includes(word);
  if (!inList && !isBonusWord(word)) return { ok: false, message: 'Not in word list' };

  const points = wordScore(word, letters);
  const pangram = isPangram(word, letters);
  if (inList) state.found.push(word);
  else state.bonus.push(word);
  state.score += points;
  return { ok: true, points, pangram, bonus: !inList, message: pangram ? 'Pangram!' : praise(word.length) };
}

function praise(len) {
  if (len <= 4) return 'Good!';
  if (len <= 6) return 'Nice!';
  return 'Awesome!';
}
