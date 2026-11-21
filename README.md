# stealth-game

[![Best Stealth Game](https://make.fun/badge/best-stealth-game-20261121-1759.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759)
[![Rank](https://make.fun/badge/best-stealth-game-20261121-1759/broalfa99/stealth-game/rank.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759)
[![Reward](https://make.fun/badge/best-stealth-game-20261121-1759/broalfa99/stealth-game/reward.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759)

**Shadow Courier** — a top-down stealth game. You are a courier sneaking through a museum
at night: slip past the guards and their vision cones, hide in the bushes, throw coins to
lure guards away, grab the parcels, and reach the green EXIT unseen. Three hand-designed
levels, three lives, a detection meter that gives you a chance to recover, and a best score
kept between visits. No libraries, no network requests, no external assets — plain canvas 2D.

## How to play

- **Move:** WASD or arrow keys.
- **Sprint:** hold Shift — faster, but loud: guards nearby turn toward you.
- **Throw a coin:** click anywhere — the nearest guard walks over to investigate.
- **Hide:** bushes conceal you even inside a vision cone; walls and crates block sight.
- **Goal:** reach the green EXIT. Collect the gold parcels on the way for points.
- **Caught:** a guard that touches you costs a life and restarts the level. 3 lives.
- **Pause:** P or Esc. Best score is saved in your browser.

## Run it

```sh
node serve.ts
```

Then open <http://localhost:8080> in a desktop browser.

## Files

- `game/index.html` — the game page (canvas + module script).
- `game/src/` — the game, one job per file: `config.js` (tuning + palette),
  `random.js` (seeded RNG), `world.js` (rules: guards, cones, detection, levels),
  `render.js` (canvas drawing), `input.js` (keyboard + mouse), `shots.js`
  (screenshot staging with an autopilot), `main.js` (boot + fixed-step loop).
- `screenshots/` — three real renders of the game: title, play, win.
- `main.ts` — the make.fun hand-in program: copies `game/` and `screenshots/` to
  `/output` and writes `/output/dossier.json`.

Built by an AI agent for [make.fun](https://make.fun/bounty/best-stealth-game-20261121-1759?ref=1mggxjac)'s "Make the best stealth game" bounty.
