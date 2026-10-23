// Offline support: serve from cache, refresh the cache in the background.
// Bump VERSION when the file list changes.
const VERSION = 'v11';
const CACHE = `gamesapp-${VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './hub.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './games/bananagrams/',
  './games/bananagrams/index.html',
  './games/bananagrams/style.css',
  './games/bananagrams/app.js',
  './games/bananagrams/logic.js',
  './games/bananagrams/words.txt',
  './shared/game.css',
  './shared/util.js',
  './shared/cards.css',
  './shared/cards.js',
  './games/2048/',
  './games/2048/index.html',
  './games/2048/style.css',
  './games/2048/app.js',
  './games/2048/logic.js',
  './games/minesweeper/',
  './games/minesweeper/index.html',
  './games/minesweeper/style.css',
  './games/minesweeper/app.js',
  './games/minesweeper/logic.js',
  './games/word-of-the-day/',
  './games/word-of-the-day/index.html',
  './games/word-of-the-day/style.css',
  './games/word-of-the-day/app.js',
  './games/word-of-the-day/logic.js',
  './games/word-of-the-day/answers.json',
  './games/word-of-the-day/allowed.txt',
  './games/spelling-hive/',
  './games/spelling-hive/index.html',
  './games/spelling-hive/style.css',
  './games/spelling-hive/app.js',
  './games/spelling-hive/logic.js',
  './games/spelling-hive/puzzles.json',
  './games/solitaire/',
  './games/solitaire/index.html',
  './games/solitaire/style.css',
  './games/solitaire/app.js',
  './games/solitaire/logic.js',
  './games/sudoku/',
  './games/sudoku/index.html',
  './games/sudoku/style.css',
  './games/sudoku/app.js',
  './games/sudoku/logic.js',
  './games/connect-four/',
  './games/connect-four/index.html',
  './games/connect-four/style.css',
  './games/connect-four/app.js',
  './games/connect-four/logic.js',
  './games/snake/',
  './games/snake/index.html',
  './games/snake/style.css',
  './games/snake/app.js',
  './games/snake/logic.js',
  './games/freecell/',
  './games/freecell/index.html',
  './games/freecell/app.js',
  './games/freecell/logic.js',
  './games/spider/',
  './games/spider/index.html',
  './games/spider/app.js',
  './games/spider/logic.js',
  './games/word-ladder/',
  './games/word-ladder/index.html',
  './games/word-ladder/style.css',
  './games/word-ladder/app.js',
  './games/word-ladder/logic.js',
  './games/word-ladder/puzzles.json',
  './games/word-ladder/words.txt',
  './games/word-ladder/common.txt',
  './games/blocks/',
  './games/blocks/index.html',
  './games/blocks/style.css',
  './games/blocks/app.js',
  './games/blocks/logic.js',
  './games/pyramid/',
  './games/pyramid/index.html',
  './games/pyramid/app.js',
  './games/pyramid/logic.js',
  './games/golf/',
  './games/golf/index.html',
  './games/golf/app.js',
  './games/golf/logic.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request, { ignoreSearch: true });
      const network = fetch(request)
        .then((res) => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        })
        .catch(() => cached);
      if (cached) {
        event.waitUntil(network);
        return cached;
      }
      return network;
    }),
  );
});
