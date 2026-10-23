// Builds the data files for Word of the Day, Spelling Hive and Word Ladder.
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

// ---------- Word Ladder ----------
// Puzzles join two everyday words through common words, changing one letter
// per step. Players may use any dictionary word along the way.
function neighbours(list) {
  const buckets = new Map();
  for (const w of list) {
    for (let i = 0; i < w.length; i++) {
      const key = `${w.slice(0, i)}_${w.slice(i + 1)}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(w);
    }
  }
  const graph = new Map(list.map((w) => [w, []]));
  for (const group of buckets.values()) {
    for (const a of group) for (const b of group) if (a !== b) graph.get(a).push(b);
  }
  return graph;
}

function bfs(graph, start) {
  const prev = new Map([[start, null]]);
  const dist = new Map([[start, 0]]);
  const queue = [start];
  for (let q = 0; q < queue.length; q++) {
    const w = queue[q];
    for (const n of graph.get(w)) {
      if (dist.has(n)) continue;
      dist.set(n, dist.get(w) + 1);
      prev.set(n, w);
      queue.push(n);
    }
  }
  return { dist, prev };
}

const ladder = [];
for (const len of [4, 5]) {
  const graph = neighbours(common35.filter((w) => w.length === len));
  const rng = seeded(len * 101);
  const starts = shuffle(common20.filter((w) => w.length === len && !isInflected(w, set20) && graph.has(w)), rng);
  const usedEnds = new Set();
  for (const start of starts) {
    const { dist, prev } = bfs(graph, start);
    const ends = [...dist].filter(([w, d]) => d >= 3 && d <= 5 && set20.has(w) && !isInflected(w, set20) && !usedEnds.has(w)).map(([w]) => w);
    if (!ends.length) continue;
    const end = ends[Math.floor(rng() * ends.length)];
    usedEnds.add(end);
    const path = [end];
    while (prev.get(path[0])) path.unshift(prev.get(path[0]));
    ladder.push({ start, end, par: path.length - 1, path });
  }
}
const ladderPuzzles = shuffle(ladder, seeded(4321)).slice(0, 1200);
const ladderWords = [...enable].filter((w) => w.length === 4 || w.length === 5).sort();
writeFileSync(new URL('games/word-ladder/puzzles.json', root), `${JSON.stringify(ladderPuzzles)}\n`);
writeFileSync(new URL('games/word-ladder/words.txt', root), `${ladderWords.join('\n')}\n`);
// Everyday words, so hints suggest words people know.
const ladderCommon = common35.filter((w) => w.length === 4 || w.length === 5).sort();
writeFileSync(new URL('games/word-ladder/common.txt', root), `${ladderCommon.join('\n')}\n`);
console.log(`Word Ladder: ${ladderPuzzles.length} puzzles, ${ladderWords.length} playable words`);
