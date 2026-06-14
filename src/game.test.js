'use strict';

// Lightweight test runner (no deps). Run: node src/game.test.js
var G = require('./game');

var passed = 0, failed = 0;
function eq(a, b, msg) {
  var ok = JSON.stringify(a) === JSON.stringify(b);
  if (ok) { passed++; } else { failed++; console.error('FAIL:', msg, '\n  expected', JSON.stringify(b), '\n  got     ', JSON.stringify(a)); }
}
function ok(cond, msg) { if (cond) passed++; else { failed++; console.error('FAIL:', msg); } }

// --- RPS truth table ---
eq(G.rps('rock', 'scissors'), 'a', 'rock beats scissors');
eq(G.rps('scissors', 'paper'), 'a', 'scissors beats paper');
eq(G.rps('paper', 'rock'), 'a', 'paper beats rock');
eq(G.rps('scissors', 'rock'), 'b', 'scissors loses to rock');
eq(G.rps('rock', 'rock'), 'tie', 'same is tie');

// --- bag composition ---
var bag = G.buildBag();
eq(bag.length, 14, 'bag has 14 pieces');
ok(bag.filter(function (k) { return k === 'flag'; }).length === 1, 'one flag');
ok(bag.filter(function (k) { return k === 'trap'; }).length === 1, 'one trap');
ok(bag.filter(function (k) { return k === 'rock'; }).length === 4, 'four rocks');

// --- new game layout ---
var g = G.newGame();
eq(g.pieces.length, 28, '28 pieces total');
eq(g.cols, 7, '7 cols');
eq(g.rows, 6, '6 rows');
var red = g.pieces.filter(function (p) { return p.team === 'red'; });
var blue = g.pieces.filter(function (p) { return p.team === 'blue'; });
eq(red.length, 14, '14 red');
eq(blue.length, 14, '14 blue');
ok(red.every(function (p) { return p.row >= 4; }), 'red on bottom rows');
ok(blue.every(function (p) { return p.row <= 1; }), 'blue on top rows');

// --- helper: build a controlled board ---
function controlled() {
  var s = G.newGame();
  // clear all to a known empty board, then drop specific pieces
  s.pieces.forEach(function (p) { p.alive = false; });
  s.phase = 'playing';
  s.turn = 'red';
  return s;
}
function add(s, team, kind, row, col, id) {
  var p = { id: id || (team[0] + '_' + kind + '_' + row + col), team: team, kind: kind,
    row: row, col: col, alive: true, revealed: false };
  s.pieces.push(p);
  return p;
}

// --- simple move into empty cell, turn flips ---
(function () {
  var s = controlled();
  add(s, 'red', 'rock', 4, 3);
  add(s, 'red', 'flag', 5, 0);   // keep flags alive so game isn't auto-won
  add(s, 'blue', 'flag', 0, 0);
  add(s, 'blue', 'paper', 1, 6);
  var r = G.applyMove(s, 'red', 4, 3, 3, 3);
  ok(r.ok, 'legal forward move ok');
  eq(s.turn, 'blue', 'turn flips to blue after move');
  ok(G.pieceAt(s, 3, 3) != null, 'piece moved to new cell');
})();

// --- diagonal move illegal ---
(function () {
  var s = controlled();
  add(s, 'red', 'rock', 4, 3);
  add(s, 'red', 'flag', 5, 0); add(s, 'blue', 'flag', 0, 0); add(s, 'blue', 'paper', 1, 6);
  var r = G.applyMove(s, 'red', 4, 3, 3, 2);
  ok(!r.ok, 'diagonal move rejected');
})();

// --- attack: rock beats scissors, attacker advances ---
(function () {
  var s = controlled();
  var atk = add(s, 'red', 'rock', 4, 3);
  add(s, 'blue', 'scissors', 3, 3);
  add(s, 'red', 'flag', 5, 0); add(s, 'blue', 'flag', 0, 0);
  add(s, 'blue', 'rock', 1, 6); // blue keeps a mover
  var r = G.applyMove(s, 'red', 4, 3, 3, 3);
  ok(r.ok, 'attack ok');
  ok(s.pieces.filter(function (p) { return p.kind === 'scissors' && p.alive; }).length === 0, 'scissors removed');
  eq(atk.row, 3, 'rock advanced into cell');
  ok(r.events.some(function (e) { return e.type === 'battle' && e.winner === atk.id; }), 'battle won event');
})();

// --- attack loss: attacker dies, defender stays ---
(function () {
  var s = controlled();
  var atk = add(s, 'red', 'scissors', 4, 3);
  var def = add(s, 'blue', 'rock', 3, 3);
  add(s, 'red', 'flag', 5, 0); add(s, 'blue', 'flag', 0, 0); add(s, 'red', 'rock', 5, 6);
  G.applyMove(s, 'red', 4, 3, 3, 3);
  ok(!atk.alive, 'losing attacker dies');
  ok(def.alive && def.row === 3 && def.col === 3, 'defender stays put');
})();

// --- flag capture wins immediately ---
(function () {
  var s = controlled();
  var atk = add(s, 'red', 'rock', 4, 3);
  add(s, 'blue', 'flag', 3, 3);
  add(s, 'red', 'flag', 5, 0);
  var r = G.applyMove(s, 'red', 4, 3, 3, 3);
  eq(s.phase, 'over', 'game over on flag capture');
  eq(s.winner, 'red', 'red wins');
  ok(r.events.some(function (e) { return e.type === 'win' && e.reason === 'flag'; }), 'flag win event');
})();

// --- trap kills attacker ---
(function () {
  var s = controlled();
  var atk = add(s, 'red', 'paper', 4, 3);
  var trap = add(s, 'blue', 'trap', 3, 3);
  add(s, 'red', 'flag', 5, 0); add(s, 'blue', 'flag', 0, 0); add(s, 'red', 'rock', 5, 6);
  G.applyMove(s, 'red', 4, 3, 3, 3);
  ok(!atk.alive, 'attacker dies on trap');
  ok(trap.alive, 'trap remains');
})();

// --- tie triggers tiebreak, then resolves ---
(function () {
  var s = controlled();
  var atk = add(s, 'red', 'rock', 4, 3);
  var def = add(s, 'blue', 'rock', 3, 3);
  add(s, 'red', 'flag', 5, 0); add(s, 'blue', 'flag', 0, 0); add(s, 'blue', 'paper', 1, 6);
  var r = G.applyMove(s, 'red', 4, 3, 3, 3);
  eq(s.phase, 'tiebreak', 'tie enters tiebreak');
  ok(r.events.some(function (e) { return e.type === 'tiebreak-start'; }), 'tiebreak-start event');
  // both throw same -> again
  G.applyTiebreak(s, 'red', 'rock');
  var r2 = G.applyTiebreak(s, 'blue', 'rock');
  eq(s.phase, 'tiebreak', 'still tiebreak after double tie');
  ok(r2.events.some(function (e) { return e.type === 'tiebreak-again'; }), 'tiebreak again');
  // red throws paper, blue rock -> red wins
  G.applyTiebreak(s, 'red', 'paper');
  var r3 = G.applyTiebreak(s, 'blue', 'rock');
  ok(!def.alive, 'tiebreak loser removed');
  ok(atk.alive && atk.row === 3, 'tiebreak winner advanced');
  eq(s.phase, 'playing', 'back to playing after tiebreak');
  eq(s.turn, 'blue', 'turn flipped after resolved attack');
})();

// --- win by no movable pieces ---
(function () {
  var s = controlled();
  add(s, 'red', 'rock', 4, 3);
  add(s, 'red', 'flag', 5, 0);
  add(s, 'blue', 'flag', 0, 0); // blue only has an immobile flag -> blue has no moves
  G.checkWin(s);
  eq(s.phase, 'over', 'game over when a side has no moves');
  eq(s.winner, 'red', 'red wins when blue cannot move');
})();

// --- fog of war view hides enemy kinds ---
(function () {
  var s = G.newGame();
  s.phase = 'playing';
  var view = G.viewFor(s, 'red');
  var enemyVisible = view.pieces.filter(function (p) { return p.team === 'blue' && p.kind != null; });
  eq(enemyVisible.length, 0, 'enemy kinds hidden in fog view');
  var mineVisible = view.pieces.filter(function (p) { return p.team === 'red' && p.kind != null; });
  eq(mineVisible.length, 14, 'own kinds visible');
})();

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
