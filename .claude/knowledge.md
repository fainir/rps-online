# Knowledge — RPS Online

## Stack
- Node 20 + Express 4 + ws 8. No DB (in-memory rooms). No build step on the client.
- Engine (`src/game.js`) is pure CommonJS, reused by server + tests.

## Source of the design
- Replica of the gameplay from the video "Rock Paper Scissors in ICQ (RPS)" (shachar700).
- It's Stratego-with-RPS in an ICQ-style window. Board 7×6, 14 pieces/side (back 2 rows):
  1 Flag + 1 Trap + 12 fighters (4 Rock / 4 Paper / 4 Scissors).
- All art is original CSS; all SFX synthesized via Web Audio. No copyrighted assets used.

## Key rules
- Fog of war: you only see your own piece kinds; enemy shown face-down until revealed.
- Move 1 step orthogonally. Flag + Trap are immobile.
- Combat: Rock>Scissors>Paper>Rock. Tie → live throw-off (both players pick until decided).
- Trap kills any attacker (trap stays). Flag captured → attacker wins.
- Win: capture enemy flag, opponent has no legal moves, or opponent forfeits.

## Gotchas / decisions
- Board is rendered from each viewer's perspective ("you" at the bottom): blue viewer's
  rows are flipped vertically in `app.js` (`disp()` + `cellByReal`). Game logic stays in
  canonical coords; only display + input mapping flip.
- The HTML `hidden` attribute is overridden by `display:flex`; fixed with `[hidden]{display:none!important}`.
- Server is authoritative — clients can't see hidden enemy kinds because `viewFor()` strips them.
- Tiebreak: since it's strictly 1v1, every battle involves both players, so both always throw.

## Testing
- `node src/game.test.js` — 43 engine assertions.
- `node src/ws.itest.js [wsUrl]` — full two-client game to a winner + rematch. Can target prod.
