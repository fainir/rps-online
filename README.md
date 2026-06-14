# RPS Online

A real-time, two-player **Rock Paper Scissors strategy game** — Stratego-style — played
inside a nostalgic ICQ-style chat window. Create a game, share the link with a friend,
and battle head-to-head.

It's an original re-imagining (own art + synthesized sound) of the classic "RPS Online"
board game concept: each piece is secretly a Rock, Paper, or Scissors, plus a hidden Flag
and a Trap. Move your pieces toward the enemy, and when two collide they fight by
Rock-Paper-Scissors rules. Capture the enemy flag to win.

## How to play

1. Enter your name, pick **Red** or **Blue**, and hit **Create Game**.
2. Share the link (or 5-letter code) with a friend.
3. Each player arranges their army (swap pieces by clicking two of your own, or **Shuffle**),
   then presses **Ready**.
4. Take turns moving one piece one square (up/down/left/right).
5. Move onto an enemy to attack:
   - **Rock** beats Scissors, **Scissors** beats Paper, **Paper** beats Rock.
   - A **tie** triggers a live throw-off — both players pick a hand until someone wins.
   - The **Trap** destroys any attacker. The **Flag** is the prize.
6. **Win** by capturing the enemy flag, or by leaving your opponent with no legal moves.

## Tech

- **Server:** Node + Express + `ws` (WebSocket). Authoritative game state, in-memory rooms,
  fog-of-war (you never see the enemy's piece types until they're revealed in battle).
- **Client:** vanilla JS, CSS-drawn pieces, Web-Audio synthesized sound effects. No build step.
- **Engine:** `src/game.js` — pure, dependency-free, fully unit-tested rules.

## Run locally

```bash
npm install
npm start            # http://localhost:3000
npm test             # engine unit tests
node src/ws.itest.js # end-to-end protocol test (server must be running)
```

## Deploy

Ships with a `Dockerfile` and `railway.json`. On [Railway](https://railway.app):

```bash
railway init        # or link an existing project
railway up          # build + deploy
```

The server listens on `process.env.PORT` (Railway provides it) and exposes `/healthz`.

## Project layout

```
server.js            Express + WebSocket server, room manager, turn protocol
src/game.js          Pure game engine (board, combat, tie-break, win conditions)
src/game.test.js     Engine unit tests
src/ws.itest.js      Two-client end-to-end protocol test
public/index.html    ICQ-style window markup
public/styles.css    Theme, board, pieces (original CSS art)
public/app.js         Client: rendering, interaction, animation
public/sfx.js         Synthesized sound effects
```

## License

MIT. Original artwork and audio. Inspired by the RPS-Stratego genre; not affiliated with
any existing product.
