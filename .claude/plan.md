# RPS Online — Master Plan
*Type: SaaS (realtime multiplayer game) | Started: 2026-06-14 | Target: 2026-06-14*
*Progress: 12/12 tasks (100%) — deployed + QA'd. Live: https://rps-online-production-deb9.up.railway.app*

A faithful web replica of the "Rock Paper Scissors" (RPS Online) ICQ-style strategy
game: Stratego-with-RPS. Create a game, share a link with a friend, play head-to-head.
Original art + sound (no copyrighted assets reproduced). Deploy to Railway.

## Phase 1: Core engine [in progress]
*Goal: Pure, tested game logic. Critical path: Yes*

- [~] Game engine: board, pieces, movement, combat, tie-break, win conditions (L)
  - DoD: src/game.js exports create/move/combat resolving RPS + flag + trap + tie reroll
- [ ] Unit tests for engine (M)
  - DoD: node test runner green for RPS rules, flag capture, trap, tie loop, win

## Phase 2: Realtime server [pending]
- [ ] WebSocket server + room manager (create/join by code), fog-of-war state (L)
  - DoD: two clients can connect to a room, server authoritative, hidden enemy types
- [ ] Turn protocol: move / attack / tiebreak throw / rematch / chat / disconnect (L)

## Phase 3: Client (ICQ-style UI) [pending]
- [ ] ICQ window chrome + intro screen (choose team, advanced mode, send) (M)
- [ ] Board rendering, fog-of-war, piece sprites (original CSS art) (L)
- [ ] Interactions: select/move/attack, tie-break RPS throw modal, animations (L)
- [ ] Synthesized SFX (message blip, click, battle, win/lose) via Web Audio (M)
- [ ] Lobby flow: create → share link → waiting → opponent joins → play → rematch (M)

## Phase 4: Deploy + QA [pending]
- [ ] Railway deploy (single Express+WS service) (M)
  - DoD: public URL serves the game, two browsers can play end-to-end
- [ ] End-to-end QA with two browser clients + fix issues (L)

## Design decisions (faithful to video)
- Board: 7 cols × 6 rows. Each side fills back 2 rows = 14 pieces.
- Pieces: 1 Flag + 1 Trap + 12 fighters (4 Rock / 4 Paper / 4 Scissors), auto-placed, shuffleable.
- Fog-of-war: you see your own types; enemy pieces shown face-down until revealed in battle.
- Move: 1 step orthogonally. Flag + Trap immobile.
- Combat: move onto enemy → reveal. Rock>Scissors>Paper>Rock. Loser removed, winner advances.
- Tie (same type): live RPS tiebreak — both players throw R/P/S until decided.
- Trap: destroys any attacker (trap stays). Flag captured → attacker wins.
- Win: capture enemy flag OR opponent has no movable pieces OR opponent forfeits/leaves.
