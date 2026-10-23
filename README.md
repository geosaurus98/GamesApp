# GamesApp

A collection of games that runs in your phone's browser and installs to your
home screen like a regular app. It works offline once loaded. No app store or
build step needed: it's plain HTML, CSS and JavaScript.

## Games

See [GAMES.md](GAMES.md) for the list of game ideas and the planned build order.

- **Bananagrams** (solo): build a connected crossword grid with every tile,
  peel to draw more, dump tiles you can't use, and call Bananas! when the
  bunch runs out. Quick (60 tiles) and Classic (144 tiles) modes, live
  highlighting of invalid words, best times, and auto-saved progress.
  Words are checked against the public-domain ENABLE word list.
- **Word of the Day**: guess the five-letter word in six tries. A new daily
  word for everyone (about 900 days of words) plus unlimited practice,
  streaks, guess stats and an emoji result you can share.
- **Spelling Hive**: make words from seven letters, always using the centre
  one. A new daily hive plus practice puzzles, ranks from Beginner to
  Queen Bee, pangrams, and ★ bonus words for real words off the list.
- **Solitaire** (Klondike): tap a card to send it to the best spot or drag
  whole runs, Draw 1 or Draw 3, hints, unlimited undo, restart the same
  deal, one-tap auto-finish, and win records.
- **FreeCell**: all cards face up, four free cells, multi-card moves when
  there's room, safe cards go home by themselves. Uses the classic deal
  numbers, so you can replay or share a deal (#1 is the famous one).
- **Spider**: two decks in ten columns with 1, 2 or 4 suits. Same-suit runs
  move together, finished King-to-Ace runs clear away, five deals from the
  stock, hints, undo and win records per suit count.
- **Pyramid**: remove pairs adding to 13 (Kings alone) from uncovered cards
  and the deck, three passes through the deck, tap or drag pairs, hints
  and undo.
- **Golf**: play column cards one higher or lower onto the pile; low score
  wins. Streak counter, hints that light up playable cards, undo, best and
  average scores.
- **Blackjack**: you against the dealer with pretend chips: six-deck shoe,
  dealer stands on soft 17, blackjack pays 3 to 2, double, split. A
  strategy coach shows the textbook move and tracks how often you play it.
- **Crazy Eights**: match the top card's suit or number, eights are wild
  and choose the suit. Play 1 to 3 computer players, draw up to three when
  stuck, and score the cards left in other hands.
- **Sudoku**: endless generated puzzles with exactly one solution, in
  Easy, Medium, Hard and Expert. Notes that tidy themselves up, highlights
  for the selected row, column and number, mistake checking you can turn
  off, hints, undo and best times.
- **Connect Four**: play the computer (Easy, Medium or Hard; it looks up
  to 8 moves ahead) or a friend on the same phone. Falling-disc animation,
  the winning four light up, undo, a running scoreboard and players take
  turns going first.
- **Snake**: swipe to steer, eat apples to grow and speed up. Walls-on or
  no-walls mode, tap to pause, keeps your game if you switch apps, and best
  scores per mode.
- **Word Ladder**: change one letter at a time to climb from one word to
  another. A daily ladder plus practice (1,200 puzzles with 4- and 5-letter
  words), par scores, hints that suggest everyday words, streaks and a
  shareable result.
- **Falling Blocks**: a Tetris-style game. Tap to rotate, drag to move,
  flick down to drop and up to hold, or use the buttons (which repeat when
  held). Ghost piece, hold, three-piece preview, levels that speed up,
  pause and resume, and best score.
- **2048**: swipe to slide and merge tiles. Smooth animations, undo, best
  score, and arrow keys on a computer.
- **Minesweeper**: tap to dig, long-press (or Flag mode) to flag, tap a
  number to clear around it. Easy, Medium and Hard boards sized for a phone
  held upright; the first tap is always safe. Best times per level.

## Put it on your phone

1. On GitHub, open **Settings → Pages**, set **Source** to *Deploy from a
   branch*, pick `main` and `/ (root)`, and save. After a minute the site is
   live at `https://<your-username>.github.io/GamesApp/`.
2. Open that link on your phone.
   - **iPhone (Safari):** tap Share → *Add to Home Screen*.
   - **Android (Chrome):** tap ⋮ → *Add to Home screen* / *Install app*.
3. Launch it from the home screen icon. It opens full screen and works offline.

## Run locally

```sh
npm start          # serves the app at http://localhost:3000
npm test           # runs the game logic tests
```

To try it on your phone while developing, run the server and open
`http://<your-computer's-LAN-IP>:3000` on a phone on the same Wi-Fi.

## Project layout

```
index.html, hub.css        Game picker (home screen)
manifest.webmanifest       Makes the site installable
sw.js                      Offline cache (bump VERSION when files change)
icons/                     App icons
games/bananagrams/
  logic.js                 Rules: tiles, words, peel, dump (no DOM)
  app.js                   Touch UI: drag & drop, zoom, timer, saving
  index.html, style.css
  words.txt                Dictionary
games/<each game>/
                           Same layout: logic.js (rules) + app.js (UI)
shared/                    Styles and helpers shared by game pages
tools/build-word-data.mjs  Regenerates the word game puzzle files
tools/data/                Common-word lists from SCOWL (see SCOWL-LICENSE.txt)
tests/                     node:test tests for game logic
```

## Word data

Word of the Day answers, Spelling Hive puzzles and Word Ladder puzzles are generated from the
ENABLE dictionary plus common-word lists from
[SCOWL](http://wordlist.aspell.net/) (`tools/data/`, licence in
`SCOWL-LICENSE.txt`). Words in `tools/data/blocklist.txt` are never used as
answers. To regenerate after changing the lists:

```sh
node tools/build-word-data.mjs
```

## Adding a game

Create `games/<name>/` with its own `index.html` (link `shared/game.css` and
import helpers from `shared/util.js` for the common look), add a card for it
in the root `index.html`, list its files in `sw.js` and bump `VERSION` so it
works offline. Mark it ✅ in [GAMES.md](GAMES.md).
