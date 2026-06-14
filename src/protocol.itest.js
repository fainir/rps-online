'use strict';
// Extra protocol tests: resign, and token-gated reconnection (incl. seat-steal rejection).
var WebSocket = require('ws');
var URL = process.argv[2] || 'ws://localhost:3000/ws';

function mk() {
  var ws = new WebSocket(URL);
  var c = { ws: ws, team: null, code: null, token: null, view: null, msgs: [] };
  ws.on('message', function (raw) {
    var m = JSON.parse(raw); c.msgs.push(m);
    if (m.type === 'created') { c.code = m.code; c.team = m.you; c.token = m.token; }
    if (m.type === 'joined') { c.code = m.code; c.team = m.you; c.token = m.token; }
    if (m.type === 'state') { c.team = m.you; c.view = m.view; }
    if (m.type === 'error') { c.error = m.error; }
  });
  c.send = function (o) { ws.send(JSON.stringify(o)); };
  return c;
}
function until(cond, t) { t = t || 3000; return new Promise(function (res, rej) { var t0 = Date.now(); (function l() { if (cond()) return res(); if (Date.now() - t0 > t) return rej(new Error('timeout')); setTimeout(l, 20); })(); }); }
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

(async function () {
  var fails = 0;
  function assert(c, m) { if (!c) { fails++; console.error('FAIL:', m); } else console.log('ok -', m); }

  // ---- RESIGN ----
  var A = mk(), B = mk();
  await until(function () { return A.ws.readyState === 1 && B.ws.readyState === 1; });
  A.send({ type: 'create', team: 'red', name: 'A' });
  await until(function () { return !!A.code; });
  assert(!!A.token, 'creator received a reconnect token');
  B.send({ type: 'join', code: A.code, name: 'B' });
  await until(function () { return B.team === 'blue'; });
  assert(!!B.token, 'joiner received a reconnect token');
  A.send({ type: 'ready' }); B.send({ type: 'ready' });
  await until(function () { return A.view && A.view.phase === 'playing'; });
  A.send({ type: 'resign' });
  await until(function () { return A.view.phase === 'over'; });
  assert(A.view.winner === 'blue', 'resign hands the win to the opponent');
  assert(B.view.winner === 'blue', 'both clients agree on the resign result');
  A.ws.close(); B.ws.close();

  // ---- TOKEN-GATED RECONNECT ----
  var C = mk(), D = mk();
  await until(function () { return C.ws.readyState === 1 && D.ws.readyState === 1; });
  C.send({ type: 'create', team: 'red', name: 'C' });
  await until(function () { return !!C.code; });
  D.send({ type: 'join', code: C.code, name: 'D' });
  await until(function () { return D.team === 'blue'; });
  C.send({ type: 'ready' }); D.send({ type: 'ready' });
  await until(function () { return C.view && C.view.phase === 'playing'; });

  var code = C.code, ctoken = C.token;
  C.ws.close(); // red drops
  await wait(150);

  // Seat-steal attempt: a stranger with the code but NO token must not take red's seat.
  var E = mk();
  await until(function () { return E.ws.readyState === 1; });
  E.send({ type: 'join', code: code, name: 'Evil' });
  await until(function () { return E.error || E.team; });
  assert(E.error === 'room-full' && !E.team, 'tokenless stranger cannot steal the disconnected seat');
  E.ws.close();

  // Legit reconnect with the right token reclaims red.
  var C2 = mk();
  await until(function () { return C2.ws.readyState === 1; });
  C2.send({ type: 'join', code: code, name: 'C', token: ctoken });
  await until(function () { return C2.team || C2.error; });
  assert(C2.team === 'red' && !C2.error, 'correct token reclaims the original (red) seat');
  C2.ws.close(); D.ws.close();

  console.log('\n' + (fails === 0 ? 'ALL PASS' : fails + ' FAILED'));
  process.exit(fails === 0 ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
