// Builds the data files for Word of the Day and Spelling Hive.
//   node tools/build-word-data.mjs
// Inputs: the ENABLE dictionary (games/bananagrams/words.txt) and common
// words from SCOWL (tools/data/common-*.txt, see SCOWL-LICENSE.txt).
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const words = (path) => read(path).split('\n').map((w) => w.trim()).filter((w) => w && !w.startsWith('#'));

const enable = new Set(words('games/bananagrams/words.txt'));
const blocked = new Set(words('tools/data/blocklist.txt'));
const common20 = words('tools/data/common-20.txt').filter((w) => enable.has(w) && !blocked.has(w));
const common35 = words('tools/data/common-35.txt').filter((w) => enable.has(w) && !blocked.has(w));

// Deterministic shuffle so regenerating gives the same order.
function seeded(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Skip simple plurals and past tenses ("BOOKS", "TRIED") as answers.
function isInflected(w, set) {
  if (w.endsWith('s') && !w.endsWith('ss') && (set.has(w.slice(0, -1)) || (w.endsWith('es') && set.has(w.slice(0, -2))))) return true;
  if (w.endsWith('ed') && (set.has(w.slice(0, -2)) || set.has(w.slice(0, -1)))) return true;
  return false;
}

// ---------- Word of the Day ----------
const set20 = new Set(common20);
const answers = shuffle(common20.filter((w) => w.length === 5 && !isInflected(w, set20)), seeded(2048));
const allowed = [...enable].filter((w) => w.length === 5).sort();
writeFileSync(new URL('games/word-of-the-day/answers.json', root), `${JSON.stringify(answers)}\n`);
writeFileSync(new URL('games/word-of-the-day/allowed.txt', root), `${allowed.join('\n')}\n`);
console.log(`Word of the Day: ${answers.length} answers, ${allowed.length} allowed guesses`);

// ---------- Spelling Hive ----------
const letterSet = (w) => [...new Set(w)].sort().join('');
const hiveWords = common35.filter((w) => w.length >= 4 && !w.includes('s'));
const pangramSets = new Set(common20.filter((w) => !w.includes('s') && new Set(w).size === 7).map(letterSet));

const puzzles = [];
for (const letters of pangramSets) {
  const fits = hiveWords.filter((w) => [...w].every((ch) => letters.includes(ch)));
  for (const center of letters) {
    const found = fits.filter((w) => w.includes(center));
    const pangrams = found.filter((w) => new Set(w).size === 7);
    if (found.length >= 18 && found.length <= 55 && pangrams.length) {
      puzzles.push({ letters, center, words: found.sort() });
    }
  }
}
// One centre per letter set keeps the daily puzzles varied.
const bySet = new Map();
for (const p of shuffle(puzzles, seeded(7))) if (!bySet.has(p.letters)) bySet.set(p.letters, p);
const hive = shuffle([...bySet.values()], seeded(99));
writeFileSync(new URL('games/spelling-hive/puzzles.json', root), `${JSON.stringify(hive)}\n`);
console.log(`Spelling Hive: ${hive.length} puzzles`);
