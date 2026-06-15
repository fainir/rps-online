'use strict';
/* RPS Online — client. Talks to the WebSocket server, renders the board,
   handles setup / play / tiebreak / chat, and drives sounds + animations. */
(function () {

  // ---- DOM helpers ----
  function $(id) { return document.getElementById(id); }
  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }

  var KIND_EMOJI = { rock: '✊', paper: '✋', scissors: '✌️', flag: '🚩', trap: '💣' };
  var HAND_EMOJI = { rock: '✊', paper: '✋', scissors: '✌️' };

  // Original chibi-warrior character (my own SVG art), fully rigged for animation:
  // separate legs (walk cycle), torso (breathe), arms (swing), head + topknot (bob),
  // eyes (blink) and three mouths (neutral / happy / sad) toggled for win/lose poses.
  // Team colours come from CSS vars (--gi / --gi-d) so one markup serves both armies.
  var CHIBI_SVG =
    '<svg class="chibi" viewBox="0 0 100 124" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<ellipse class="shadow" cx="50" cy="116" rx="26" ry="6" fill="rgba(0,0,0,.18)"/>' +
      '<g class="leg leg-l"><rect x="37" y="88" width="9" height="20" rx="4.5" fill="var(--gi-d)"/><ellipse cx="41" cy="109" rx="7.5" ry="4" fill="#2f2118"/></g>' +
      '<g class="leg leg-r"><rect x="54" y="88" width="9" height="20" rx="4.5" fill="var(--gi-d)"/><ellipse cx="58" cy="109" rx="7.5" ry="4" fill="#2f2118"/></g>' +
      '<g class="torso">' +
        '<g class="arm arm-l"><rect x="19" y="66" width="11" height="17" rx="5.5" fill="var(--gi)" stroke="rgba(0,0,0,.2)" stroke-width="1.5"/><circle cx="24.5" cy="85" r="6.5" fill="#fbd3a6" stroke="rgba(0,0,0,.2)" stroke-width="1.3"/></g>' +
        '<path d="M26 64 Q50 53 74 64 L71 93 Q50 101 29 93 Z" fill="var(--gi)" stroke="rgba(0,0,0,.22)" stroke-width="2"/>' +
        '<path d="M39 60 L50 70 L61 60" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="2.6" stroke-linejoin="round"/>' +
        '<path d="M50 70 L50 97" stroke="rgba(0,0,0,.14)" stroke-width="2"/>' +
        '<rect x="28" y="81" width="44" height="7.5" rx="3" fill="var(--gi-d)"/>' +
        '<rect x="45.5" y="81" width="9" height="12" rx="2.5" fill="var(--gi-d)"/>' +
        '<g class="arm arm-r"><rect x="70" y="66" width="11" height="17" rx="5.5" fill="var(--gi)" stroke="rgba(0,0,0,.2)" stroke-width="1.5"/><circle cx="75.5" cy="85" r="6.5" fill="#fbd3a6" stroke="rgba(0,0,0,.2)" stroke-width="1.3"/></g>' +
      '</g>' +
      '<g class="head">' +
        '<g class="topknot"><path d="M45 13 Q50 -1 55 13 Q52.5 17 50 17 Q47.5 17 45 13 Z" fill="var(--gi-d)"/><circle cx="50" cy="14" r="5.5" fill="var(--gi-d)"/></g>' +
        '<circle cx="50" cy="46" r="30" fill="#fbd3a6" stroke="rgba(0,0,0,.18)" stroke-width="2"/>' +
        '<path d="M21 41 Q29 20 50 19 Q71 20 79 41 Q70 31 50 31 Q30 31 21 41 Z" fill="var(--gi-d)"/>' +
        '<path class="band" d="M21 41 Q50 31 79 41 L79 49 Q50 39 21 49 Z" fill="var(--gi-d)"/>' +
        '<path class="tail" d="M74 45 q16 1 20 13 q-14 1 -23 -6 Z" fill="var(--gi-d)"/>' +
        '<path class="brow brow-l" d="M32 42 L46 46" stroke="#6b4423" stroke-width="3.8" stroke-linecap="round"/>' +
        '<path class="brow brow-r" d="M68 42 L54 46" stroke="#6b4423" stroke-width="3.8" stroke-linecap="round"/>' +
        '<g class="eye eye-l"><ellipse cx="41" cy="53" rx="6.2" ry="7.4" fill="#fff"/><circle cx="42.6" cy="54" r="3.1" fill="#243245"/><circle cx="43.7" cy="52.6" r="1.1" fill="#fff"/></g>' +
        '<g class="eye eye-r"><ellipse cx="59" cy="53" rx="6.2" ry="7.4" fill="#fff"/><circle cx="57.4" cy="54" r="3.1" fill="#243245"/><circle cx="58.5" cy="52.6" r="1.1" fill="#fff"/></g>' +
        '<ellipse cx="30" cy="61" rx="5.2" ry="3.3" fill="#ff8e7d" opacity=".6"/>' +
        '<ellipse cx="70" cy="61" rx="5.2" ry="3.3" fill="#ff8e7d" opacity=".6"/>' +
        '<path class="mouth mouth-neutral" d="M44 65 q6 4.5 12 0" stroke="#7a4a28" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
        '<path class="mouth mouth-happy" d="M42 63 q8 11 16 0 q-8 4 -16 0 Z" fill="#7a3326" stroke="#7a3326" stroke-width="1"/>' +
        '<path class="mouth mouth-sad" d="M43 69 q7 -7 14 0" stroke="#7a4a28" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
      '</g>' +
    '</svg>';

  // ---- client state ----
  var ws = null, socketReady = false, sendQueue = [];
  var myTeam = null, myName = 'Player', pickedTeam = 'red', roomCode = null;
  var view = null;            // latest fog-of-war view
  var names = { red: null, blue: null };
  var readyState = { red: false, blue: false };
  var connected = { red: false, blue: false };
  var selected = null;        // selected piece id (playing)
  var swapPick = null;        // first piece picked for swap (setup)
  var myToken = null;         // per-seat reconnect token from the server
  var holdTiebreak = false;   // keep the tiebreak modal up briefly to reveal the deciding throw
  var tbHoldTimer = null;
  var fxQueue = [];           // per-piece animations applied AFTER render (hop/clash)
  var rejoining = false;      // true while silently reconnecting to a saved game

  // ---- WebSocket ----
  function wsUrl() {
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return proto + '//' + location.host + '/ws';
  }
  function connect() {
    ws = new WebSocket(wsUrl());
    ws.onopen = function () {
      socketReady = true;
      while (sendQueue.length) ws.send(JSON.stringify(sendQueue.shift()));
    };
    ws.onmessage = function (ev) {
      var msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
      onMessage(msg);
    };
    ws.onclose = function () {
      socketReady = false;
      if (roomCode && myTeam) {
        setStatus('Connection lost — reconnecting…');
        setTimeout(reconnect, 1200);
      }
    };
    ws.onerror = function () {};
  }
  function reconnect() {
    connect();
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (socketReady) {
        clearInterval(iv);
        send({ type: 'join', code: roomCode, name: myName, token: myToken });
      } else if (tries > 8) { clearInterval(iv); }
    }, 400);
  }
  function send(obj) {
    if (socketReady && ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
    else sendQueue.push(obj);
  }

  // ---- session persistence (survive a refresh / dropped tab) ----
  function saveSession() {
    try {
      localStorage.setItem('rps_session', JSON.stringify({
        code: roomCode, team: myTeam, token: myToken, name: myName, ts: Date.now()
      }));
    } catch (e) {}
  }
  function loadSession() {
    try {
      var s = JSON.parse(localStorage.getItem('rps_session') || 'null');
      if (s && s.code && s.token && (Date.now() - (s.ts || 0)) < 30 * 60 * 1000) return s;
    } catch (e) {}
    return null;
  }
  function clearSession() { try { localStorage.removeItem('rps_session'); } catch (e) {} }

  // ---- message router ----
  function onMessage(msg) {
    switch (msg.type) {
      case 'created':
        roomCode = msg.code; myTeam = msg.you; myToken = msg.token || myToken; saveSession(); showShare(); break;
      case 'joined':
        roomCode = msg.code; myTeam = msg.you; myToken = msg.token || myToken; rejoining = false; saveSession(); break;
      case 'state':
        applyState(msg); break;
      case 'chat':
        addChat(msg.from, msg.name, msg.text); SFX.message(); break;
      case 'reject':
        flashStatus('Move not allowed (' + msg.error + ')');
        if (view && view.phase === 'tiebreak') renderTiebreak(); // re-enable throw buttons
        break;
      case 'error':
        onError(msg.error); break;
      case 'pong': break;
    }
  }

  function onError(err) {
    if (err === 'no-such-room' || err === 'room-full') clearSession();
    // if a silent auto-rejoin failed, just drop the user back on a clean intro
    if (rejoining) { rejoining = false; leaveToIntro(); return; }
    var map = {
      'no-such-room': 'No game found with that code.',
      'room-full': 'That game is already full.',
      'server-error': 'Something went wrong. Try again.'
    };
    var hint = $('intro-hint');
    hint.textContent = map[err] || err;
    hint.classList.add('err');
    SFX.lose();
  }

  // ---- state application ----
  function applyState(msg) {
    myTeam = msg.you;
    names = msg.names; readyState = msg.ready; connected = msg.connected;
    var prev = view;
    view = msg.view;
    roomCode = msg.code;

    showScreen('board');
    fxQueue = [];
    processEvents(msg.events || [], prev);
    render();
    applyFx();
  }

  // Apply queued per-piece animations after the DOM has been reconciled, so render()'s
  // className rebuild doesn't wipe them mid-animation.
  function applyFx() {
    fxQueue.forEach(function (fx) {
      var pe = pieceEls[fx.id]; if (!pe) return;
      pe.classList.add(fx.cls);
      var dur = fx.cls === 'hop' ? 320 : 460;
      setTimeout(function () { if (pe) pe.classList.remove(fx.cls); }, dur);
    });
    fxQueue = [];
  }

  function processEvents(events, prev) {
    // A tiebreak that ends with a deciding throw (not another tie) — keep the modal up a
    // moment so the player actually sees the winning hands before it closes.
    var threw = events.some(function (e) { return e.type === 'tiebreak-throw'; });
    var again = events.some(function (e) { return e.type === 'tiebreak-again'; });
    events.forEach(function (e) {
      switch (e.type) {
        case 'opponent-joined':
          if (e.team !== myTeam) { SFX.join(); flashStatus('Opponent joined!'); }
          break;
        case 'start': SFX.message(); break;
        case 'move': SFX.move(); if (e.id) fxQueue.push({ id: e.id, cls: 'hop' }); break;
        case 'battle':
          onBattle(e);
          fxQueue.push({ id: e.attacker, cls: 'clash' });
          fxQueue.push({ id: e.defender, cls: 'clash' });
          break;
        case 'tiebreak-start': SFX.tie(); resetTiebreakHands(true); flashStatus('TIE! Throw to break it'); break;
        case 'tiebreak-throw': onTiebreakThrow(e); break;
        case 'tiebreak-again': setTimeout(function () { resetTiebreakHands(true); }, 800); break;
        case 'win': onWin(e); break;
        case 'turn': break;
        case 'opponent-left': flashStatus('Opponent disconnected…'); break;
        case 'rematch': SFX.join(); resetForRematch(); break;
        case 'rematch-vote': flashStatus('Opponent wants a rematch'); break;
      }
    });
    if (threw && !again) {
      holdTiebreak = true;
      if (tbHoldTimer) clearTimeout(tbHoldTimer);
      tbHoldTimer = setTimeout(function () { holdTiebreak = false; renderTiebreak(); }, 1200);
    }
  }

  // ---- rendering ----
  // Board is rendered from the viewer's perspective: "you" are always at the bottom.
  // Red owns real rows 4-5 (bottom); blue owns 0-1 (top). For the blue viewer we
  // flip rows vertically so their pieces sit at the bottom. Game logic stays in real
  // coords — only display position + input mapping flip.
  var flip = false;                       // true when viewer is blue
  function disp(row) { return flip ? (6 - 1 - row) : row; }   // real -> display row
  var boardEl, cells = [], cellByReal = {};
  function ensureCells() {
    if (cells.length) return;
    flip = (myTeam === 'blue');
    boardEl = $('board');
    var cols = 7, rows = 6;
    for (var dr = 0; dr < rows; dr++) {
      for (var c = 0; c < cols; c++) {
        var rr = flip ? (rows - 1 - dr) : dr;   // real row this display row maps to
        var cell = el('div', 'cell' + (((rr + c) % 2) ? ' dark' : ''));
        cell.style.left = (c * 100 / cols) + '%';
        cell.style.top = (dr * 100 / rows) + '%';
        cell.style.width = (100 / cols) + '%';
        cell.style.height = (100 / rows) + '%';
        cell.dataset.r = rr; cell.dataset.c = c;   // store REAL coords
        cell.addEventListener('click', onCellClick);
        boardEl.appendChild(cell);
        cells.push(cell);
        cellByReal[rr + ',' + c] = cell;
      }
    }
  }
  function cellAt(r, c) { return cellByReal[r + ',' + c]; }

  var pieceEls = {}; // id -> element
  function render() {
    if (!view) return;
    ensureCells();
    updateNames();
    updateSidebar();
    updateStatusBar();
    updateCaptured();

    // clear legal highlights
    cells.forEach(function (c) { c.classList.remove('legal', 'attack'); });

    // reconcile pieces
    var present = {};
    view.pieces.forEach(function (p) {
      present[p.id] = true;
      var pe = pieceEls[p.id];
      var isNew = !pe;
      if (!pe) {
        pe = el('div', 'piece');
        pe.innerHTML = CHIBI_SVG + '<span class="badge"></span>';
        // stagger idle breathing + blinks so the army isn't in lockstep
        var seed = (p.id.charCodeAt(0) + p.id.charCodeAt(p.id.length - 1)) % 12;
        pe.style.setProperty('--bob-delay', (-seed * 0.22).toFixed(2) + 's');
        pe.style.setProperty('--blink-delay', (-(seed * 0.41)).toFixed(2) + 's');
        pe.addEventListener('click', onPieceClick);
        boardEl.appendChild(pe);
        pieceEls[p.id] = pe;
      }
      pe.dataset.id = p.id;
      pe.dataset.r = p.row; pe.dataset.c = p.col;
      pe.style.left = (p.col * 100 / 7) + '%';
      pe.style.top = (disp(p.row) * 100 / 6) + '%';
      pe.style.width = (100 / 7) + '%';
      pe.style.height = (100 / 6) + '%';
      var pose = '';
      if (view.phase === 'over' && view.winner) pose = (p.team === view.winner) ? ' win-pose' : ' lose-pose';
      pe.className = 'piece ' + p.team + (p.mine ? ' mine' : '') + (p.kind ? '' : ' hidden') + (isNew ? ' spawn' : '') + pose;
      var badge = pe.querySelector('.badge');
      if (p.kind) { badge.textContent = KIND_EMOJI[p.kind] || ''; badge.style.display = 'grid'; }
      else { badge.textContent = ''; badge.style.display = 'none'; }
    });

    // death animation for vanished pieces
    Object.keys(pieceEls).forEach(function (id) {
      if (!present[id]) {
        var pe = pieceEls[id];
        pe.classList.add('dead');
        delete pieceEls[id];
        setTimeout(function () { if (pe.parentNode) pe.parentNode.removeChild(pe); }, 420);
      }
    });

    decoratePieces();
    renderOverlays();
    renderTiebreak();
  }

  function decoratePieces() {
    var myTurn = view.turn === view.you && view.phase === 'playing';
    view.pieces.forEach(function (p) {
      var pe = pieceEls[p.id]; if (!pe) return;
      pe.classList.remove('selectable', 'selected', 'swap-pick');
      if (view.phase === 'setup' && p.mine) {
        pe.classList.add('selectable');
        if (swapPick === p.id) pe.classList.add('swap-pick');
      } else if (myTurn && p.mine && isMovable(p.kind)) {
        pe.classList.add('selectable');
        if (selected === p.id) pe.classList.add('selected');
      }
    });
    if (selected && view.phase === 'playing') showLegal(selected);
  }

  function isMovable(kind) { return kind === 'rock' || kind === 'paper' || kind === 'scissors'; }

  function pieceView(id) {
    for (var i = 0; i < view.pieces.length; i++) if (view.pieces[i].id === id) return view.pieces[i];
    return null;
  }

  function showLegal(id) {
    var p = pieceView(id); if (!p) return;
    var deltas = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    deltas.forEach(function (d) {
      var nr = p.row + d[0], nc = p.col + d[1];
      if (nr < 0 || nr >= 6 || nc < 0 || nc >= 7) return;
      var occ = occupant(nr, nc);
      if (occ && occ.team === p.team) return;
      var cell = cellAt(nr, nc);
      cell.classList.add('legal');
      if (occ) cell.classList.add('attack');
    });
  }
  function occupant(r, c) {
    for (var i = 0; i < view.pieces.length; i++) {
      var p = view.pieces[i];
      if (p.row === r && p.col === c) return p;
    }
    return null;
  }

  function updateNames() {
    var topTeam = myTeam === 'red' ? 'blue' : 'red';
    var top = $('name-top'), bot = $('name-bottom');
    top.textContent = names[topTeam] || ((topTeam === 'red' ? 'Red' : 'Blue') + ' (waiting…)');
    bot.textContent = (names[myTeam] || 'You') + ' (you)';
    top.className = 'name-tag name-top ' + topTeam;
    bot.className = 'name-tag name-bottom ' + myTeam;
    top.classList.toggle('turn-active', view.phase === 'playing' && view.turn === topTeam);
    bot.classList.toggle('turn-active', view.phase === 'playing' && view.turn === myTeam);
  }

  function updateStatusBar() {
    var setup = $('setup-controls'), chat = $('chat-controls');
    if (view.phase === 'setup') {
      setup.hidden = false; chat.hidden = true;
      $('btn-ready').disabled = !!readyState[myTeam];
      $('btn-shuffle').disabled = !!readyState[myTeam];
      if (readyState[myTeam]) setStatus('Ready! Waiting for opponent…');
      else setStatus('Arrange your army, then press Ready');
    } else {
      setup.hidden = true; chat.hidden = false;
      var inPlay = view.phase === 'playing' || view.phase === 'tiebreak';
      $('btn-resign').hidden = !inPlay;
      if (view.phase === 'playing') {
        setStatus(view.turn === myTeam ? 'Your move' : 'Opponent is thinking…');
      } else if (view.phase === 'tiebreak') {
        setStatus('Tie-break in progress…');
      } else if (view.phase === 'over') {
        setStatus(view.winner == null ? "It's a draw" : 'Game over');
      }
    }
  }

  var CAP_ORDER = ['rock', 'paper', 'scissors', 'trap', 'flag'];
  function capItems(lost) {
    lost = lost || {};
    var html = CAP_ORDER.filter(function (k) { return lost[k]; }).map(function (k) {
      return '<span class="cap-item">' + KIND_EMOJI[k] + '<i>' + lost[k] + '</i></span>';
    }).join('');
    return html || '<span class="cap-none">none yet</span>';
  }
  function updateCaptured() {
    var tray = $('captured-tray');
    var cap = view.captured;
    if (!cap || view.phase === 'setup') { tray.hidden = true; return; }
    var opp = myTeam === 'red' ? 'blue' : 'red';
    var total = Object.keys(cap.red || {}).length + Object.keys(cap.blue || {}).length;
    if (!total) { tray.hidden = true; return; }
    tray.hidden = false;
    // Show what each side has LOST. "You lost" = your team's casualties.
    tray.innerHTML =
      '<div class="cap-group ' + myTeam + '"><span class="cap-head">You lost</span>' +
        '<span class="cap-items">' + capItems(cap[myTeam]) + '</span></div>' +
      '<div class="cap-group ' + opp + '"><span class="cap-head">Rival lost</span>' +
        '<span class="cap-items">' + capItems(cap[opp]) + '</span></div>';
  }

  function updateSidebar() {
    var orb = $('turn-orb'), txt = $('turn-text');
    orb.className = 'turn-orb';
    if (view.phase === 'playing') {
      orb.classList.add(view.turn);
      txt.textContent = (view.turn === myTeam ? 'YOUR\nTURN' : 'THEIR\nTURN');
    } else if (view.phase === 'setup') { txt.textContent = 'SET\nUP'; }
    else if (view.phase === 'over') { txt.textContent = view.winner == null ? 'DRAW' : 'OVER'; }
    else { txt.textContent = 'TIE!'; }
  }

  // ---- overlays ----
  function renderOverlays() {
    var wait = $('overlay-wait'), over = $('overlay-over');
    var opp = myTeam === 'red' ? 'blue' : 'red';
    // Only show the share/wait overlay before the opponent has joined; once both are in
    // setup, let them arrange their armies freely.
    var showWait = view.phase === 'setup' && !connected[opp];
    wait.dataset.show = showWait ? 'true' : 'false';
    over.dataset.show = view.phase === 'over' ? 'true' : 'false';
    if (view.phase === 'over') {
      var w = view.winner;
      var winnerEl = $('over-winner');
      if (w == null) {
        winnerEl.textContent = "It's a draw!";
        winnerEl.className = 'over-winner draw';
      } else {
        var iWon = w === myTeam;
        winnerEl.textContent = (names[w] || (w === 'red' ? 'Red' : 'Blue')) + ' wins!' + (iWon ? ' 🎉' : '');
        winnerEl.className = 'over-winner ' + w;
      }
    }
  }

  // ---- tiebreak modal ----
  function colorTiebreakHands() {
    var opp = myTeam === 'red' ? 'blue' : 'red';
    $('tb-you').style.boxShadow = '0 0 0 2px var(--' + (myTeam || 'red') + ')';
    $('tb-opp').style.boxShadow = '0 0 0 2px var(--' + opp + ')';
  }
  function renderTiebreak() {
    var tb = $('tiebreak');
    var btns = tb.querySelectorAll('.tb-btn');
    if (view.phase === 'tiebreak') {
      tb.dataset.show = 'true';
      colorTiebreakHands();
      var threw = view.pending && view.pending.iThrew;
      btns.forEach(function (b) { b.disabled = !!threw; });
      $('tb-status').textContent = threw ? 'Waiting for opponent…' : 'Pick your throw';
      if (!threw) { $('tb-you').textContent = '?'; }
    } else if (holdTiebreak) {
      // keep showing the resolved throw briefly before the modal closes
      tb.dataset.show = 'true';
      btns.forEach(function (b) { b.disabled = true; });
      $('tb-status').textContent = 'Decided!';
    } else {
      tb.dataset.show = 'false';
    }
  }
  function resetTiebreakHands(both) {
    $('tb-you').textContent = '?';
    if (both) $('tb-opp').textContent = '?';
    var btns = $('tiebreak').querySelectorAll('.tb-btn');
    btns.forEach(function (b) { b.disabled = false; });
    $('tb-status').textContent = 'Pick your throw';
  }
  function onTiebreakThrow(e) {
    var myChoice = e.attackerTeam === myTeam ? e.attackerChoice : e.defenderChoice;
    var oppChoice = e.attackerTeam === myTeam ? e.defenderChoice : e.attackerChoice;
    $('tb-you').textContent = HAND_EMOJI[myChoice];
    $('tb-opp').textContent = HAND_EMOJI[oppChoice];
    $('tb-you').classList.add('shake'); $('tb-opp').classList.add('shake');
    setTimeout(function () { $('tb-you').classList.remove('shake'); $('tb-opp').classList.remove('shake'); }, 320);
    SFX.shoot();
  }

  // ---- battle display ----
  function teamFromId(id) { return id.charAt(0) === 'r' ? 'red' : 'blue'; }
  function onBattle(e) {
    SFX.battle();
    var aTeam = teamFromId(e.attacker), dTeam = teamFromId(e.defender);
    var bd = $('battle-display');
    bd.innerHTML = '';
    var row = el('div', 'bd-row');
    var a = el('div', 'bd-piece ' + aTeam); a.textContent = KIND_EMOJI[e.attackerKind] || '?';
    var vs = el('div', 'bd-vs'); vs.textContent = 'vs';
    var d = el('div', 'bd-piece ' + dTeam); d.textContent = KIND_EMOJI[e.defenderKind] || '?';
    row.appendChild(a); row.appendChild(vs); row.appendChild(d);
    bd.appendChild(row);
    var res = el('div', 'bd-result');
    var winTeam = teamFromId(e.winner);
    res.classList.add(winTeam === 'red' ? 'bd-win-red' : 'bd-win-blue');
    res.textContent = (names[winTeam] || (winTeam === 'red' ? 'Red' : 'Blue')) + ' wins';
    bd.appendChild(res);
    // the combatants' clash animation is queued via fxQueue (applied after render)
  }

  function onWin(e) {
    setTimeout(function () {
      if (e.winner == null) SFX.tie();          // draw
      else if (e.winner === myTeam) SFX.win();
      else SFX.lose();
    }, 250);
  }

  // ---- interactions ----
  function onPieceClick(ev) {
    ev.stopPropagation();
    var id = ev.currentTarget.dataset.id;
    var p = pieceView(id); if (!p) return;

    if (view.phase === 'setup' && p.mine) {
      SFX.select();
      if (swapPick === null) { swapPick = id; decoratePieces(); }
      else if (swapPick === id) { swapPick = null; decoratePieces(); }
      else {
        var a = pieceView(swapPick);
        send({ type: 'swap', a: [a.row, a.col], b: [p.row, p.col] });
        swapPick = null;
      }
      return;
    }

    if (view.phase === 'playing' && view.turn === myTeam) {
      if (p.mine && isMovable(p.kind)) {
        selected = (selected === id) ? null : id;
        SFX.select();
        render();
      } else if (selected) {
        // clicked an enemy piece adjacent to selected -> attack via cell logic
        tryMoveTo(p.row, p.col);
      }
    }
  }

  function onCellClick(ev) {
    var r = +ev.currentTarget.dataset.r, c = +ev.currentTarget.dataset.c;
    if (view.phase === 'playing' && selected) tryMoveTo(r, c);
  }

  function tryMoveTo(r, c) {
    var p = pieceView(selected); if (!p) return;
    var dr = Math.abs(p.row - r), dc = Math.abs(p.col - c);
    if (dr + dc !== 1) return; // must be orthogonal neighbour
    var occ = occupant(r, c);
    if (occ && occ.team === myTeam) return;
    send({ type: 'move', from: [p.row, p.col], to: [r, c] });
    selected = null;
  }

  // ---- status / chat ----
  var statusTimer = null;
  function setStatus(t) { $('status-text').textContent = t; }
  function flashStatus(t) {
    setStatus(t);
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(function () { if (view) updateStatusBar(); }, 2600);
  }
  function addChat(team, name, text) {
    var log = $('chat-log');
    var b = el('div', 'chat-bubble ' + team);
    b.innerHTML = '<b></b>: <span></span>';
    b.querySelector('b').textContent = name;
    b.querySelector('span').textContent = text;
    log.appendChild(b);
    while (log.children.length > 4) log.removeChild(log.firstChild);
    setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 9000);
  }

  // ---- screens ----
  function showScreen(name) {
    ['intro', 'board'].forEach(function (s) {
      $('screen-' + s).dataset.active = (s === name) ? 'true' : 'false';
    });
  }
  function showShare() {
    $('room-code').textContent = roomCode;
    var link = location.origin + '/?room=' + roomCode;
    $('share-link').value = link;
  }
  function resetForRematch() {
    selected = null; swapPick = null;
    $('rematch-hint').textContent = '';
    $('battle-display').innerHTML = '<div class="bd-empty">Battles appear here</div>';
  }
  // Hard reset back to the intro screen (leave the room entirely).
  function leaveToIntro() {
    clearSession();
    roomCode = null; myTeam = null; myToken = null; view = null; selected = null; swapPick = null;
    $('overlay-over').dataset.show = 'false';
    $('rematch-hint').textContent = '';
    $('battle-display').innerHTML = '<div class="bd-empty">Battles appear here</div>';
    var hint = $('intro-hint'); hint.classList.remove('err');
    hint.textContent = 'Create a game, then share the link with a friend.';
    $('btn-create').textContent = 'Create Game ▶';
    $('code-input').value = '';
    showScreen('intro');
  }

  // ---- wire up UI ----
  function initUI() {
    // show the actual game characters in the team picker
    var ar = document.querySelector('.avatar-red'), ab = document.querySelector('.avatar-blue');
    if (ar) ar.innerHTML = CHIBI_SVG;
    if (ab) ab.innerHTML = CHIBI_SVG;

    // team pick
    $('pick-red').addEventListener('click', function () { setPick('red'); });
    $('pick-blue').addEventListener('click', function () { setPick('blue'); });
    function setPick(t) {
      pickedTeam = t;
      $('pick-red').setAttribute('aria-pressed', t === 'red');
      $('pick-blue').setAttribute('aria-pressed', t === 'blue');
      SFX.click();
    }

    $('btn-create').addEventListener('click', function () {
      SFX.resume();
      myName = ($('name-input').value || 'Player').trim().slice(0, 20) || 'Player';
      send({ type: 'create', team: pickedTeam, name: myName });
      SFX.click();
    });
    $('btn-join').addEventListener('click', doJoin);
    $('code-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') doJoin(); });
    function doJoin() {
      SFX.resume();
      var code = ($('code-input').value || '').toUpperCase().trim();
      if (!code) { $('intro-hint').textContent = 'Enter a game code to join.'; return; }
      myName = ($('name-input').value || 'Player').trim().slice(0, 20) || 'Player';
      send({ type: 'join', code: code, name: myName });
      SFX.click();
    }

    $('btn-shuffle').addEventListener('click', function () { send({ type: 'shuffle' }); SFX.click(); });
    $('btn-ready').addEventListener('click', function () { send({ type: 'ready' }); SFX.click(); });
    $('btn-rematch').addEventListener('click', function () {
      send({ type: 'rematch' }); SFX.click();
      $('rematch-hint').textContent = 'Waiting for opponent to accept…';
    });
    $('btn-newgame').addEventListener('click', function () { SFX.click(); leaveToIntro(); });
    $('btn-resign').addEventListener('click', function () {
      if (window.confirm('Resign this game? Your opponent wins.')) { send({ type: 'resign' }); SFX.click(); }
    });

    // rules / help
    function showRules(s) { $('overlay-rules').dataset.show = s ? 'true' : 'false'; }
    $('btn-help').addEventListener('click', function () { showRules(true); SFX.click(); });
    $('btn-rules-close').addEventListener('click', function () { showRules(false); SFX.click(); });

    $('btn-copy').addEventListener('click', function () {
      var inp = $('share-link'); inp.select();
      try { navigator.clipboard.writeText(inp.value); } catch (e) { document.execCommand('copy'); }
      $('btn-copy').textContent = 'Copied!';
      setTimeout(function () { $('btn-copy').textContent = 'Copy'; }, 1500);
      SFX.click();
    });

    // tiebreak buttons
    $('tiebreak').querySelectorAll('.tb-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        var choice = b.dataset.choice;
        $('tb-you').textContent = HAND_EMOJI[choice];
        send({ type: 'throw', choice: choice });
        $('tiebreak').querySelectorAll('.tb-btn').forEach(function (x) { x.disabled = true; });
        $('tb-status').textContent = 'Waiting for opponent…';
        SFX.click();
      });
    });

    // chat
    $('btn-send').addEventListener('click', sendChat);
    $('chat-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') sendChat(); });
    function sendChat() {
      var t = ($('chat-input').value || '').trim();
      if (!t) return;
      send({ type: 'chat', text: t });
      $('chat-input').value = '';
    }

    // mute
    $('btn-mute').addEventListener('click', function () {
      var m = !SFX.isMuted(); SFX.toggle(m);
      $('btn-mute').classList.toggle('muted', m);
    });

    // deselect on board background click
    $('board').addEventListener('click', function (e) {
      if (e.target === $('board') && selected) { selected = null; render(); }
    });

    // auto-join from URL
    var params = new URLSearchParams(location.search);
    var room = params.get('room');
    if (room) {
      $('code-input').value = room.toUpperCase();
      $('btn-create').textContent = 'Create New ▶';
      $('intro-hint').textContent = "You're invited! Enter your name and tap Join.";
      $('name-input').focus();
    }
  }

  // If we have a recent saved game (refresh / dropped tab), silently reconnect to our seat.
  function maybeRejoin() {
    var s = loadSession();
    if (!s) return;
    // Only reconnect to the same room the link points at (if any).
    var room = new URLSearchParams(location.search).get('room');
    if (room && room.toUpperCase() !== s.code) return;
    rejoining = true;
    myName = s.name || myName;
    setStatus('Reconnecting to your game…');
    send({ type: 'join', code: s.code, name: s.name, token: s.token });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initUI();
    connect();
    maybeRejoin();
  });
})();
