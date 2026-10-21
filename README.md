# GamesApp

A collection of games that runs in your phone's browser and installs to your
home screen like a regular app. It works offline once loaded. No app store or
build step needed: it's plain HTML, CSS and JavaScript.

## Games

- **Bananagrams** (solo): build a connected crossword grid with every tile,
  peel to draw more, dump tiles you can't use, and call Bananas! when the
  bunch runs out. Quick (60 tiles) and Classic (144 tiles) modes, live
  highlighting of invalid words, best times, and auto-saved progress.
  Words are checked against the public-domain ENABLE word list.

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
tests/                     node:test tests for game logic
```

## Adding a game

Create `games/<name>/` with its own `index.html`, add a card for it in the
root `index.html`, and list its files in `sw.js` so it works offline.
