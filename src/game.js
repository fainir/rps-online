'use strict';

// Pure RPS-Stratego game engine. No I/O, no networking — just rules.
// Used by the server (authoritative) and by the unit tests.

var COLS = 7;
var ROWS = 6;

// Piece kinds
var ROCK = 'rock';
var PAPER = 'paper';
var SCISSORS = 'scissors';
var FLAG = 'flag';
var TRAP = 'trap';

var FIGHTERS = [ROCK, PAPER, SCISSORS];

// Standard RPS: returns 'a' if a beats b, 'b' if b beats a, 'tie' if same.
function rps(a, b) {
  if (a === b) return 'tie';
  if (
    (a === ROCK && b === SCISSORS) ||
    (a === SCISSORS && b === PAPER) ||
    (a === PAPER && b === ROCK)
  ) return 'a';
  return 'b';
}

// Deterministic-ish shuffle using a supplied rng (defaults Math.random).
function shuffle(arr, rng) {
  rng = rng || Math.random;
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(rng() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

// Build the bag of 14 piece-kinds for one army: 1 flag, 1 trap, 4/4/4 fighters.
function buildBag() {
  var bag = [FLAG, TRAP];
  for (var i = 0; i < 4; i++) bag.push(ROCK, PAPER, SCISSORS);
  return bag; // 2 + 12 = 14
}

// 'red' occupies the bottom two rows (ROWS-2, ROWS-1).
// 'blue' occupies the top two rows (0, 1). Returns array of piece objects.
function placeArmy(team, rng) {
  var bag = shuffle(buildBag(), rng);
  var rowsForTeam = team === 'red' ? [ROWS - 1, ROWS - 2] : [0, 1];
  var pieces = [];
  var idx = 0;
  for (var r = 0; r < rowsForTeam.length; r++) {
    for (var c = 0; c < COLS; c++) {
      pieces.push({
        id: team[0] + '_' + idx,
        team: team,
        kind: bag[idx],
        row: rowsForTeam[r],
        col: c,
        alive: true,
        revealed: false // becomes true to the opponent once seen in battle
      });
      idx++;
    }
  }
  return pieces;
}

function newGame(rng) {
  return {
    cols: COLS,
    rows: ROWS,
    pieces: placeArmy('red', rng).concat(placeArmy('blue', rng)),
    turn: 'red',           // whose move it is
    phase: 'setup',        // setup -> playing -> tiebreak -> over
    pending: null,         // tiebreak context {attackerId, defenderId, fromRow, fromCol, throws:{}}
    winner: null,
    lastBattle: null,      // {attacker, defender, winner, attackerKind, defenderKind}
    moveCount: 0
  };
}

function pieceAt(state, row, col) {
  for (var i = 0; i < state.pieces.length; i++) {
    var p = state.pieces[i];
    if (p.alive && p.row === row && p.col === col) return p;
  }
  return null;
}

function pieceById(state, id) {
  for (var i = 0; i < state.pieces.length; i++) {
    if (state.pieces[i].id === id) return state.pieces[i];
  }
  return null;
}

function isMovable(kind) {
  return kind === ROCK || kind === PAPER || kind === SCISSORS;
}

// Legal target cells for a piece (orthogonal, 1 step, not onto a friendly piece).
function legalMoves(state, piece) {
  var moves = [];
  if (!piece || !piece.alive || !isMovable(piece.kind)) return moves;
  var deltas = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (var i = 0; i < deltas.length; i++) {
    var nr = piece.row + deltas[i][0];
    var nc = piece.col + deltas[i][1];
    if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
    var occ = pieceAt(state, nr, nc);
    if (occ && occ.team === piece.team) continue; // can't move onto own piece
    moves.push({ row: nr, col: nc, attack: !!occ });
  }
  return moves;
}

function teamHasMoves(state, team) {
  for (var i = 0; i < state.pieces.length; i++) {
    var p = state.pieces[i];
    if (p.alive && p.team === team && isMovable(p.kind)) {
      if (legalMoves(state, p).length > 0) return true;
    }
  }
  return false;
}

function flagAlive(state, team) {
  for (var i = 0; i < state.pieces.length; i++) {
    var p = state.pieces[i];
    if (p.alive && p.team === team && p.kind === FLAG) return true;
  }
  return false;
}

function other(team) { return team === 'red' ? 'blue' : 'red'; }

// Check win conditions; mutates state.phase/winner if a side has won.
function checkWin(state) {
  var teams = ['red', 'blue'];
  for (var i = 0; i < teams.length; i++) {
    var t = teams[i];
    if (!flagAlive(state, t)) { state.phase = 'over'; state.winner = other(t); return; }
    if (!teamHasMoves(state, t)) { state.phase = 'over'; state.winner = other(t); return; }
  }
}

// Attempt a move. Returns {ok, error?, events:[]} where events describe what happened
// (move, battle, tiebreak-start, win). Mutates state.
function applyMove(state, team, fromRow, fromCol, toRow, toCol) {
  if (state.phase !== 'playing') return { ok: false, error: 'not-playing' };
  if (state.turn !== team) return { ok: false, error: 'not-your-turn' };
  var piece = pieceAt(state, fromRow, fromCol);
  if (!piece || piece.team !== team) return { ok: false, error: 'no-piece' };
  if (!isMovable(piece.kind)) return { ok: false, error: 'immobile' };
  var legal = legalMoves(state, piece);
  var match = null;
  for (var i = 0; i < legal.length; i++) {
    if (legal[i].row === toRow && legal[i].col === toCol) { match = legal[i]; break; }
  }
  if (!match) return { ok: false, error: 'illegal-move' };

  state.moveCount++;
  var events = [];

  if (!match.attack) {
    // simple move
    piece.row = toRow; piece.col = toCol;
    events.push({ type: 'move', id: piece.id, from: [fromRow, fromCol], to: [toRow, toCol] });
    endTurn(state, events);
    return { ok: true, events: events };
  }

  // Attack
  var defender = pieceAt(state, toRow, toCol);
  return resolveAttack(state, piece, defender, fromRow, fromCol, events);
}

function resolveAttack(state, attacker, defender, fromRow, fromCol, events) {
  attacker.revealed = true;
  defender.revealed = true;

  // Flag capture
  if (defender.kind === FLAG) {
    defender.alive = false;
    attacker.row = defender.row; attacker.col = defender.col;
    state.lastBattle = { attacker: attacker.id, defender: defender.id, winner: attacker.id,
      attackerKind: attacker.kind, defenderKind: FLAG };
    events.push({ type: 'battle', attacker: attacker.id, defender: defender.id,
      attackerKind: attacker.kind, defenderKind: FLAG, winner: attacker.id, flag: true });
    state.phase = 'over'; state.winner = attacker.team;
    events.push({ type: 'win', winner: attacker.team, reason: 'flag' });
    return { ok: true, events: events };
  }

  // Trap: destroys the attacker, trap remains (now revealed)
  if (defender.kind === TRAP) {
    attacker.alive = false;
    state.lastBattle = { attacker: attacker.id, defender: defender.id, winner: defender.id,
      attackerKind: attacker.kind, defenderKind: TRAP };
    events.push({ type: 'battle', attacker: attacker.id, defender: defender.id,
      attackerKind: attacker.kind, defenderKind: TRAP, winner: defender.id, trap: true });
    finishBattle(state, events);
    return { ok: true, events: events };
  }

  // Fighter vs fighter
  var result = rps(attacker.kind, defender.kind);
  if (result === 'tie') {
    // Enter live tiebreak: both players throw R/P/S until decided.
    state.phase = 'tiebreak';
    state.pending = {
      attackerId: attacker.id,
      defenderId: defender.id,
      fromRow: fromRow, fromCol: fromCol,
      toRow: defender.row, toCol: defender.col,
      throws: {} // team -> choice
    };
    events.push({ type: 'tiebreak-start', attacker: attacker.id, defender: defender.id,
      attackerTeam: attacker.team, defenderTeam: defender.team });
    return { ok: true, events: events };
  }

  var winner = result === 'a' ? attacker : defender;
  var loser = result === 'a' ? defender : attacker;
  applyBattleResult(state, attacker, defender, winner, loser, fromRow, fromCol, events);
  return { ok: true, events: events };
}

function applyBattleResult(state, attacker, defender, winner, loser, fromRow, fromCol, events) {
  loser.alive = false;
  if (winner === attacker) {
    attacker.row = defender.row; attacker.col = defender.col;
  }
  state.lastBattle = { attacker: attacker.id, defender: defender.id, winner: winner.id,
    attackerKind: attacker.kind, defenderKind: defender.kind };
  events.push({ type: 'battle', attacker: attacker.id, defender: defender.id,
    attackerKind: attacker.kind, defenderKind: defender.kind, winner: winner.id });
  finishBattle(state, events);
}

// A tiebreak throw from one team. choice in R/P/S. When both are in, resolve.
function applyTiebreak(state, team, choice) {
  if (state.phase !== 'tiebreak' || !state.pending) return { ok: false, error: 'no-tiebreak' };
  if (FIGHTERS.indexOf(choice) === -1) return { ok: false, error: 'bad-choice' };
  var attacker = pieceById(state, state.pending.attackerId);
  var defender = pieceById(state, state.pending.defenderId);
  if (!attacker || !defender) return { ok: false, error: 'gone' };
  if (team !== attacker.team && team !== defender.team) return { ok: false, error: 'not-in-battle' };
  state.pending.throws[team] = choice;

  var aTeam = attacker.team, dTeam = defender.team;
  if (state.pending.throws[aTeam] == null || state.pending.throws[dTeam] == null) {
    return { ok: true, events: [{ type: 'tiebreak-waiting', team: team }] };
  }

  var aChoice = state.pending.throws[aTeam];
  var dChoice = state.pending.throws[dTeam];
  var result = rps(aChoice, dChoice);
  var events = [{ type: 'tiebreak-throw', attackerChoice: aChoice, defenderChoice: dChoice,
    attackerTeam: aTeam, defenderTeam: dTeam }];

  if (result === 'tie') {
    state.pending.throws = {}; // throw again
    events.push({ type: 'tiebreak-again' });
    return { ok: true, events: events };
  }

  var fromRow = state.pending.fromRow, fromCol = state.pending.fromCol;
  var winner = result === 'a' ? attacker : defender;
  var loser = result === 'a' ? defender : attacker;
  // reflect winning throws as the revealed kind for display
  attacker.kind = aChoice; defender.kind = dChoice;
  state.pending = null;
  applyBattleResult(state, attacker, defender, winner, loser, fromRow, fromCol, events);
  return { ok: true, events: events };
}

function finishBattle(state, events) {
  checkWin(state);
  if (state.phase === 'over') {
    events.push({ type: 'win', winner: state.winner, reason: 'battle' });
  } else {
    state.phase = 'playing';
    endTurn(state, events);
  }
}

function endTurn(state, events) {
  if (state.phase === 'over') return;
  checkWin(state);
  if (state.phase === 'over') {
    events.push({ type: 'win', winner: state.winner, reason: 'no-moves' });
    return;
  }
  state.turn = other(state.turn);
  state.phase = 'playing';
  events.push({ type: 'turn', turn: state.turn });
}

// Swap two of a team's own pieces during setup (lets a player arrange their army).
function swapSetup(state, team, r1, c1, r2, c2) {
  if (state.phase !== 'setup') return { ok: false, error: 'not-setup' };
  var a = pieceAt(state, r1, c1);
  var b = pieceAt(state, r2, c2);
  if (!a || !b || a.team !== team || b.team !== team) return { ok: false, error: 'bad-swap' };
  var tr = a.row, tc = a.col;
  a.row = b.row; a.col = b.col;
  b.row = tr; b.col = tc;
  return { ok: true };
}

// Re-randomise a team's piece kinds in place (keeps positions) — used by "shuffle" in setup.
function reshuffleArmy(state, team, rng) {
  var bag = shuffle(buildBag(), rng);
  var idx = 0;
  for (var i = 0; i < state.pieces.length; i++) {
    var p = state.pieces[i];
    if (p.team === team) { p.kind = bag[idx++]; p.revealed = false; p.alive = true; }
  }
}

// Produce a fog-of-war view of the state for a given viewer team.
// Enemy pieces hide their kind unless revealed. Pending tiebreak choices are hidden
// from the opponent until both have thrown.
function viewFor(state, viewer) {
  var pieces = [];
  for (var i = 0; i < state.pieces.length; i++) {
    var p = state.pieces[i];
    if (!p.alive) continue;
    var show = (p.team === viewer) || p.revealed || state.phase === 'over';
    pieces.push({
      id: p.id, team: p.team, row: p.row, col: p.col,
      kind: show ? p.kind : null,
      mine: p.team === viewer,
      revealed: p.revealed
    });
  }
  var pending = null;
  if (state.pending) {
    var myThrow = state.pending.throws[viewer] != null;
    var bothIn = state.pending.throws.red != null && state.pending.throws.blue != null;
    pending = {
      attackerId: state.pending.attackerId,
      defenderId: state.pending.defenderId,
      iThrew: myThrow,
      bothIn: bothIn
    };
  }
  return {
    cols: state.cols, rows: state.rows,
    pieces: pieces,
    turn: state.turn, phase: state.phase, winner: state.winner,
    pending: pending, lastBattle: state.lastBattle, moveCount: state.moveCount,
    you: viewer
  };
}

module.exports = {
  COLS: COLS, ROWS: ROWS,
  ROCK: ROCK, PAPER: PAPER, SCISSORS: SCISSORS, FLAG: FLAG, TRAP: TRAP,
  rps: rps, shuffle: shuffle, buildBag: buildBag,
  newGame: newGame, pieceAt: pieceAt, pieceById: pieceById,
  legalMoves: legalMoves, applyMove: applyMove, applyTiebreak: applyTiebreak,
  reshuffleArmy: reshuffleArmy, swapSetup: swapSetup, viewFor: viewFor, checkWin: checkWin,
  isMovable: isMovable, teamHasMoves: teamHasMoves, other: other
};
