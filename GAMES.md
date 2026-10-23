# Game Ideas

Games that could go into GamesApp. Each one is meant to be played one-handed
or two-thumbed on a phone, in short sessions, with no account or internet
needed (unless it says multiplayer).

**Difficulty to build:** 🟢 easy (a day or so) · 🟡 medium · 🔴 hard
**Status:** ✅ done · 🚧 in progress · 💡 idea

Rough rules: favour games that reuse what we already have (the tile and
dictionary code from Bananagrams, the drag-and-drop board, the timer, best
scores). Every game should save progress automatically and work offline.

---

## Word games

These reuse the Bananagrams dictionary (`games/bananagrams/words.txt`) and
tile styling.

| Game | How it plays | Build | Status |
|---|---|---|---|
| **Bananagrams** | Solo race to use every tile in a connected crossword grid. Peel, dump, Bananas! | 🟡 | ✅ |
| **Word of the Day** | Guess a hidden 5-letter word in 6 tries; tiles turn green / yellow / grey. Same word for everyone each day, plus unlimited practice mode. | 🟢 | ✅ |
| **Spelling Hive** | Seven letters in a honeycomb with one required centre letter. Find as many words as you can; pangrams (using all 7) score big. Ranks from "Beginner" to "Genius". | 🟢 | ✅ |
| **Boggle-style Grid** | 4×4 (or 5×5) grid of letter dice. Swipe through touching letters to make words before the 3-minute timer runs out. Show missed words at the end. | 🟡 | 💡 |
| **Anagram Sprint** | Six or seven scrambled letters. Make every word you can; finding the full-length word moves you to the next round. | 🟢 | 💡 |
| **Word Ladder** | Turn COLD into WARM one letter at a time, every step a real word. Daily puzzle with a par score. | 🟢 | 💡 |
| **Crossword Mini** | 5×5 crossword with short clues. Needs a clue list we write ourselves. | 🟡 | 💡 |
| **Hangman** | Classic guess-the-letters, with categories and a cartoon banana instead of a stick figure. | 🟢 | 💡 |
| **Word Search** | Find hidden words in a letter grid by swiping. Themed packs (animals, food, countries). | 🟢 | 💡 |
| **Letter Drop** | Tetris-meets-words: letters fall into columns; make words across or down to clear them. | 🔴 | 💡 |
| **Scrabble Solo** | Play a full Scrabble-style board against a simple computer opponent with letter scores and bonus squares. | 🔴 | 💡 |

## Number & logic puzzles

Good for daily puzzles. Most can generate unlimited levels from code.

| Game | How it plays | Build | Status |
|---|---|---|---|
| **2048** | Swipe to slide numbered tiles; matching tiles merge. Reach 2048 (then keep going). | 🟢 | ✅ |
| **Sudoku** | 9×9 classic with pencil marks, mistake highlighting and Easy → Expert levels. | 🟡 | ✅ |
| **Minesweeper** | Tap to reveal, long-press to flag. Three board sizes; the first tap is always safe. (Later: a no-guess mode.) | 🟢 | ✅ |
| **Nonograms (Picross)** | Use row and column number clues to fill in squares and reveal a pixel picture. | 🟡 | 💡 |
| **KenKen-style Math Grid** | Fill a grid so each row and column has each number once, and cages hit their target sums or products. | 🟡 | 💡 |
| **Lights Out** | Tapping a light toggles it and its neighbours. Turn them all off. | 🟢 | 💡 |
| **Sliding Puzzle** | Classic 15-puzzle, with an option to use your own photo. | 🟢 | 💡 |
| **Flow Connect** | Draw pipes to join matching coloured dots so every square is filled and no pipes cross. | 🟡 | 💡 |
| **Tents & Trees / Star Battle** | Small logic grids with one simple placement rule. Great daily puzzles. | 🟡 | 💡 |
| **24** | Use four numbers and + − × ÷ to make 24. Quick rounds against the clock. | 🟢 | 💡 |
| **Mastermind** | Crack a hidden colour code; get black/white peg feedback each guess. | 🟢 | 💡 |

## Card games

One shared card deck component (drag, flip, stack animations) would power all
of these.

| Game | How it plays | Build | Status |
|---|---|---|---|
| **Solitaire (Klondike)** | The classic. Draw 1 or draw 3, tap-to-auto-move, undo. | 🟡 | ✅ |
| **Spider Solitaire** | 1, 2 or 4 suits. Build full suit runs from King to Ace. | 🟡 | ✅ |
| **FreeCell** | Almost every deal is solvable; numbered deals so you can retry one. | 🟡 | ✅ |
| **Pyramid** | Remove pairs that add up to 13. | 🟢 | 💡 |
| **Golf Solitaire** | Clear the tableau by playing one higher or lower than the top card. | 🟢 | 💡 |
| **Crazy Eights** | Versus 1–3 computer players. | 🟡 | 💡 |
| **Blackjack** | Practice mode with a strategy hint button and pretend chips. | 🟢 | 💡 |
| **Hearts / Spades** | Four-player trick-taking against computer players. | 🔴 | 💡 |
| **Cribbage** | Board, pegging and scoring against the computer. | 🔴 | 💡 |

## Board games (vs computer or pass-and-play)

"Pass-and-play" means two people share one phone and take turns.

| Game | How it plays | Build | Status |
|---|---|---|---|
| **Tic-Tac-Toe** | Including an "Ultimate" 9-board version. | 🟢 | 💡 |
| **Connect Four** | Drop discs; four in a row wins. Computer opponent with difficulty levels. | 🟢 | ✅ |
| **Dots and Boxes** | Take turns drawing lines; complete a box to score and go again. | 🟢 | 💡 |
| **Checkers** | Forced captures, kings, simple computer opponent. | 🟡 | 💡 |
| **Reversi (Othello)** | Flip your opponent's discs by surrounding them. | 🟡 | 💡 |
| **Mancala** | Sow seeds around the board; capture the most. | 🟢 | 💡 |
| **Battleship** | Place your fleet, then take turns firing against the computer. | 🟡 | 💡 |
| **Chess** | Full rules with a basic computer opponent and daily puzzles. | 🔴 | 💡 |
| **Backgammon** | Dice, doubling cube optional, versus computer. | 🔴 | 💡 |
| **Go (9×9)** | Small-board Go for quick games. | 🔴 | 💡 |

## Dice games

| Game | How it plays | Build | Status |
|---|---|---|---|
| **Yahtzee-style** | Roll five dice up to three times and fill a scorecard. | 🟢 | 💡 |
| **Farkle** | Push your luck rolling for points; bust and lose the turn's score. | 🟢 | 💡 |
| **Liar's Dice** | Bluff about hidden dice against computer players. | 🟡 | 💡 |
| **Shut the Box** | Roll two dice and flip down tiles that add up to the total. | 🟢 | 💡 |

## Arcade & action

Quick reflex games built on `<canvas>`. Keep controls to taps, swipes or
tilt.

| Game | How it plays | Build | Status |
|---|---|---|---|
| **Snake** | Swipe to steer; eat, grow, don't bite yourself. | 🟢 | ✅ |
| **Flappy-style** | Tap to flap through gaps. Banana-themed, obviously. | 🟢 | 💡 |
| **Breakout** | Drag the paddle; bounce the ball to smash bricks. Power-ups. | 🟡 | 💡 |
| **Falling Blocks** | Tetris-style line clearing with swipe and tap controls. | 🟡 | 💡 |
| **Endless Runner** | Tap to jump, swipe to duck. Distance is your score. | 🟡 | 💡 |
| **Asteroids** | Thumb joystick and fire button; split rocks into smaller rocks. | 🟡 | 💡 |
| **Fruit Slice** | Swipe to slice flying fruit; avoid the bombs. | 🟡 | 💡 |
| **Stack Tower** | Tap to drop a sliding block on the tower; overhang gets cut off. | 🟢 | 💡 |
| **Whack-a-Mole** | Tap critters as they pop up. Gets faster every round. | 🟢 | 💡 |
| **Pong** | One player vs computer, or two thumbs at each end of the phone. | 🟢 | 💡 |

## Memory & brain training

| Game | How it plays | Build | Status |
|---|---|---|---|
| **Memory Match** | Flip cards to find pairs in as few moves as possible. | 🟢 | 💡 |
| **Simon** | Repeat a growing sequence of colours and sounds. | 🟢 | 💡 |
| **Reaction Timer** | Tap the moment the screen turns green. Track your best. | 🟢 | 💡 |
| **Mental Maths Sprint** | Answer as many sums as you can in 60 seconds. | 🟢 | 💡 |
| **Odd One Out** | Spot the tile with a slightly different colour; it gets harder each level. | 🟢 | 💡 |

## Party games (one phone, a group of people)

| Game | How it plays | Build | Status |
|---|---|---|---|
| **Heads Up-style** | Hold the phone on your forehead; friends give clues; tilt to pass or score. Uses the motion sensor. | 🟡 | 💡 |
| **Imposter / Spyfall** | Pass the phone; everyone sees the secret word except the imposter. Discuss and vote. | 🟢 | 💡 |
| **Charades & Pictionary prompts** | Random prompts by category with a round timer. | 🟢 | 💡 |
| **Truth or Dare / Would You Rather** | Card packs with family-friendly and grown-up options. | 🟢 | 💡 |
| **Score Keeper** | Not a game, but handy: track scores for any real-life board or card game. | 🟢 | 💡 |

## Multiplayer online (later)

Needs a small server or a peer-to-peer connection, so save for later.

- **Bananagrams versus friends** — everyone races from the same bunch; "Peel!" makes everyone draw.
- **Word of the Day leaderboard** — compare scores with friends.
- **Turn-based games by link** — send a link to play Connect Four, Chess or Battleship asynchronously.

---

## Suggested build order

1. ~~**Word of the Day**~~ ✅: easy, reuses the dictionary, great daily habit.
2. ~~**2048**~~ ✅: quick win and very satisfying on a phone.
3. ~~**Minesweeper**~~ ✅: classic, simple rules.
4. ~~**Spelling Hive**~~ ✅: reuses the dictionary again.
5. ~~**Solitaire (Klondike)**~~ ✅: builds the shared card deck for every other card game.
6. ~~**Sudoku**~~ ✅: unlimited generated puzzles.
7. ~~**Connect Four**~~ ✅: first game with a computer opponent.
8. ~~**Snake**~~ ✅: first arcade game; sets up the canvas game loop.

## App-wide ideas

- Daily puzzle hub: one "today" card per daily game, with streaks.
- Stats page: games played, win rate and best times per game.
- Light / dark / high-contrast themes, plus sound and vibration toggles.
- Favourites pinned to the top of the home screen.
- Share results as emoji grids (like 🟩🟨⬛) without spoilers.

## Adding a game

See the "Adding a game" section in [README.md](README.md). When a game ships,
change its status here to ✅.
