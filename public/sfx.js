/* Original synthesized sound effects via the Web Audio API.
   All tones are generated at runtime — no sampled/recorded audio. */
(function () {
  'use strict';
  var ctx = null;
  var muted = false;

  function ac() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // One oscillator note.
  function note(freq, start, dur, type, gain) {
    var c = ac(); if (!c) return;
    var t0 = c.currentTime + start;
    var osc = c.createOscillator();
    var g = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.18, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(c.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  // Short noise burst (for clashes / whooshes).
  function noise(start, dur, gain, hp) {
    var c = ac(); if (!c) return;
    var t0 = c.currentTime + start;
    var n = Math.floor(c.sampleRate * dur);
    var buf = c.createBuffer(1, n, c.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = c.createBufferSource(); src.buffer = buf;
    var filt = c.createBiquadFilter(); filt.type = 'highpass'; filt.frequency.value = hp || 600;
    var g = c.createGain(); g.gain.setValueAtTime(gain || 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt); filt.connect(g); g.connect(c.destination);
    src.start(t0); src.stop(t0 + dur);
  }

  var S = {
    click: function () { if (muted) return; note(660, 0, 0.07, 'square', 0.10); },
    select: function () { if (muted) return; note(880, 0, 0.06, 'triangle', 0.12); },
    move: function () { if (muted) return; note(330, 0, 0.10, 'sine', 0.16); noise(0, 0.06, 0.05, 400); },
    // ICQ-style two-tone alert (original interpretation): low-high blip pair.
    message: function () {
      if (muted) return;
      note(523, 0, 0.09, 'square', 0.13);
      note(784, 0.10, 0.12, 'square', 0.14);
    },
    battle: function () {
      if (muted) return;
      noise(0, 0.18, 0.22, 800);
      note(180, 0, 0.18, 'sawtooth', 0.16);
      note(120, 0.04, 0.16, 'sawtooth', 0.12);
    },
    tie: function () {
      if (muted) return;
      note(440, 0, 0.12, 'triangle', 0.12);
      note(440, 0.16, 0.12, 'triangle', 0.12);
    },
    shoot: function () { if (muted) return; noise(0, 0.10, 0.16, 1200); note(700, 0, 0.08, 'square', 0.10); },
    win: function () {
      if (muted) return;
      [523, 659, 784, 1047].forEach(function (f, i) { note(f, i * 0.12, 0.22, 'triangle', 0.16); });
    },
    lose: function () {
      if (muted) return;
      [523, 415, 330, 262].forEach(function (f, i) { note(f, i * 0.14, 0.26, 'sawtooth', 0.14); });
    },
    join: function () {
      if (muted) return;
      note(440, 0, 0.10, 'sine', 0.14); note(660, 0.10, 0.14, 'sine', 0.16);
    },
    toggle: function (m) { muted = m; },
    isMuted: function () { return muted; },
    resume: function () { ac(); }
  };

  window.SFX = S;
})();
