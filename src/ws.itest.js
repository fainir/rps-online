'use strict';
// End-to-end protocol test: spins up two WS clients against a running server,
// plays a full game to completion (handling tiebreaks), asserts a winner emerges.
// Usage: node src/ws.itest.js [wsUrl]   (default ws://localhost:3000/ws)
var WebSocket = require('ws');
var URL = process.argv[2] || 'ws://localhost:3000/ws';

function mkClient(name) {
  var ws = new WebSocket(URL);
  var c = { ws: ws, name: name, team: null, code: null, view: null, onState: null, log: [] };
  ws.on('message', function (raw) {
    var m = JSON.parse(raw);
    c.log.push(m.type);
    if (m.type === 'created') { c.code = m.code; c.team = m.you; }
    if (m.type === 'joined') { c.code = m.code; c.team = m.you; }
    if (m.type === 'state') { c.team = m.you; c.view = m.view; if (c.onState) c.onState(m); }
  });
  c.send = function (o) { ws.send(JSON.stringify(o)); };
  return c;
}
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function until(cond, timeout) {
  timeout = timeout || 4000;
  return new Promise(function (res, rej) {
    var t0 = Date.now();
    (function loop() {
      if (cond()) return res();
      if (Date.now() - t0 > timeout) return rej(new Error('timeout waiting for condition'));
      setTimeout(loop, 25);
    })();
  });
}

function legalMovesFor(view, team) {
  var moves = [];
  var occ = {};
  view.pieces.forEach(function (p) { occ[p.row + ',' + p.col] = p; });
  view.pieces.forEach(function (p) {
    if (p.team !== team || !p.mine) return;
    if (!(p.kind === 'rock' || p.kind === 'paper' || p.kind === 'scissors')) return;
    [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (d) {
      var nr = p.row + d[0], nc = p.col + d[1];
      if (nr < 0 || nr >= 6 || nc < 0 || nc >= 7) return;
      var o = occ[nr + ',' + nc];
      if (o && o.team === team) return;
      moves.push({ from: [p.row, p.col], to: [nr, nc], attack: !!o });
    });
  });
  return moves;
}

(async function main() {
  var fails = 0;
  function assert(cond, msg) { if (!cond) { fails++; console.error('FAIL:', msg); } else console.log('ok -', msg); }

  var A = mkClient('Alice'), B = mkClient('Bob');
  await until(function () { return A.ws.readyState === 1 && B.ws.readyState === 1; });

  A.send({ type: 'create', team: 'red', name: 'Alice' });
  await until(function () { return !!A.code; });
  assert(A.team === 'red', 'creator is red, code=' + A.code);

  B.send({ type: 'join', code: A.code, name: 'Bob' });
  await until(function () { return !!B.code && B.team === 'blue'; });
  assert(B.team === 'blue', 'joiner is blue');

  // both shuffle once then ready
  A.send({ type: 'shuffle' }); B.send({ type: 'shuffle' });
  await wait(50);
  A.send({ type: 'ready' }); B.send({ type: 'ready' });
  await until(function () { return A.view && A.view.phase === 'playing'; });
  assert(A.view.phase === 'playing', 'game started, red to move');
  assert(A.view.turn === 'red', 'red moves first');

  // play the game: whoever's turn, make a move; prefer attacks to force resolution.
  var clients = { red: A, blue: B };
  var safety = 600;
  while (safety-- > 0) {
    var cur = clients[A.view.turn];     // both share same turn value
    var phase = A.view.phase;
    if (phase === 'over') break;

    if (phase === 'tiebreak') {
      // both throw random
      var choices = ['rock', 'paper', 'scissors'];
      A.send({ type: 'throw', choice: choices[Math.floor(Math.random() * 3)] });
      B.send({ type: 'throw', choice: choices[Math.floor(Math.random() * 3)] });
      await wait(40);
      continue;
    }

    if (phase !== 'playing') { await wait(20); continue; }

    var view = cur.view;
    var moves = legalMovesFor(view, view.turn);
    if (!moves.length) { await wait(30); continue; }
    // prefer an attack if available to drive battles
    var pick = moves.filter(function (m) { return m.attack; })[0] || moves[Math.floor(Math.random() * moves.length)];
    var beforeTurn = view.turn;
    cur.send({ type: 'move', from: pick.from, to: pick.to });
    // wait until state advances (turn flips, or phase changes to tiebreak/over)
    await until(function () {
      return A.view.phase === 'over' || A.view.phase === 'tiebreak' || A.view.turn !== beforeTurn;
    }, 4000).catch(function () {});
  }

  assert(A.view.phase === 'over', 'game reached a result');
  assert(A.view.winner === 'red' || A.view.winner === 'blue', 'a winner was declared: ' + A.view.winner);
  assert(B.view.winner === A.view.winner, 'both clients agree on winner');

  // rematch
  A.send({ type: 'rematch' }); B.send({ type: 'rematch' });
  await until(function () { return A.view.phase === 'setup'; }, 3000).catch(function () {});
  assert(A.view.phase === 'setup', 'rematch returns to setup');

  A.ws.close(); B.ws.close();
  console.log('\n' + (fails === 0 ? 'ALL PASS' : fails + ' FAILED'));
  process.exit(fails === 0 ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
