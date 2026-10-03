/* =========================================================================
   DI LOLLO RUNNER
   Endless runner 3D. Protagonista: Tung Tung Sahur.
   Villano: Di Lollo (Lauti, "el Cara Larga"). Tengo que fumar del piso para sobrevivir.
   ========================================================================= */
(function () {
  'use strict';

  var THREE = window.THREE;
  if (!THREE) { document.getElementById('load').innerHTML = '<div class="t">No se pudo cargar el motor 3D</div>'; return; }

  /* =========================================================================
     1. CONFIGURACIÓN
     ========================================================================= */
  var CFG = {
    laneX: [-2.35, 0, 2.35],
    laneSpeed: 14,
    gravity: -34,
    jumpV: 11.2,
    slideTime: 0.6,
    startSpeed: 13.5,
    maxSpeed: 30,
    playerZ: 0,
    roadLen: 280,
    roadW: 9.4,
    farZ: -215,      // línea de aparición
    killZ: 16,       // detrás de cámara
    dashWorld: 12,   // altura de mundo que cubre 1 tile de la textura
    shadow: true
  };

  var DIFFS = {
    facil:    { id: 'facil',    name: 'TRANQUI',  drain: 0.70, pity: 0.90, gap: 36, label: 'Lauti va de paseo. Corré tranquilo y fumá tranquilo.' },
    normal:   { id: 'normal',   name: 'NORMAL',   drain: 1.00, pity: 1.00, gap: 30, label: 'El clásico: no dejes que el Cara Larga se te acerque.' },
    malvado:  { id: 'malvado',  name: 'MALVADO',  drain: 1.40, pity: 1.09, gap: 24, label: 'Di Lollo está de mal genio y corre el doble. Suerte.' }
  };

  var PHASES = [
    { top: 0x6b4a7a, bot: 0xffb07c, sun: 0xfff0c9, sunI: 1.2, sunDir: [0.35, 0.16, -0.92], fog: 0xe8a37a, hemiS: 0xffd0a8, hemiG: 0x5a4a3a, light: 0xffd0a0, lI: 0.9, lamps: 0.0, amb: 0.44 },
    { top: 0x4a7fb5, bot: 0xd8d4c4, sun: 0xfff4d8, sunI: 1.0, sunDir: [0.25, 0.75, -0.60], fog: 0xcfc9b8, hemiS: 0xc8dcf0, hemiG: 0x7a6a52, light: 0xfff2dc, lI: 1.15, lamps: 0.0, amb: 0.50 },
    { top: 0x4a2a58, bot: 0xe8613c, sun: 0xffb060, sunI: 1.3, sunDir: [-0.45, 0.10, -0.88], fog: 0xc96a4a, hemiS: 0xff9a70, hemiG: 0x4a3838, light: 0xffa870, lI: 0.95, lamps: 0.4, amb: 0.40 },
    { top: 0x0a0a18, bot: 0x241a38, sun: 0x8fa8e0, sunI: 0.45, sunDir: [-0.2, 0.45, -0.87], fog: 0x12142a, hemiS: 0x3e4a80, hemiG: 0x18181c, light: 0x8fa8e0, lI: 0.38, lamps: 1.0, amb: 0.28 }
  ];

  var SIGNS = ['TUCAS', 'EL PUEBLO', 'DONDE TUNG', 'DI LOLLO GYM', 'BAÑOS', 'KIOSCO', 'LA ESQUINA',
    'REMIS', 'FIERRO', 'CERVEZA', 'ALMACÉN', 'LA PLAYGROUND', 'BARRIO UNIDO', 'CARA LARGA'];

  /* =========================================================================
     2. UTILIDADES
     ========================================================================= */
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var rnd = function (a, b) { return a + Math.random() * (b - a); };
  var rndi = function (a, b) { return Math.floor(a + Math.random() * (b - a + 1)); };
  var pick = function (arr) { return arr[(Math.random() * arr.length) | 0]; };
  var damp = function (a, b, l, dt) { return lerp(a, b, 1 - Math.exp(-l * dt)); };
  var TAU = Math.PI * 2;

  // progreso 0..1 según los metros recorridos (independiente de la velocidad actual)
  var progress = function () { return clamp(G.dist / 1400, 0, 1); };

  var PAL = {
    wood: 0xc08a4c, woodD: 0x8a5a2b, woodDD: 0x5b3a1c,
    tuca: 0x7cc63f, tucaD: 0x3f6b18, pimiento: 0xd93b30,
    skin: 0xe8b98a, skinD: 0xc9905f, pants: 0x2f3e6b,
    red: 0xd8232a, cream: 0xf5f1e6, dark: 0x1b1b25
  };

  /* =========================================================================
     3. AUDIO (sintetizado, sin archivos)
     ========================================================================= */
  var Snd = (function () {
    var ctx = null, master = null, noiseBuf = null;
    var musicEl = null, musicSrc = null, musicReady = false, musicErr = false;
    var muted = false, bpm = 96, intensity = 0, nextTime = 0, step = 0, barIdx = 0;
    var STEP = 0.5; // corcheas por patrón

    function init() {
      if (ctx) return;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.85;
      master.connect(ctx.destination);
      var n = ctx.sampleRate * 1.2;
      noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

    /* ---------- pistas en loop (orden aleatorio) ---------- */
    var TRACKS = ['audio/01-la-bebecita.mp3', 'audio/02-pala-ancha.mp3'];
    var musicEl = null, musicReady = false, musicErr = false;
    var musicQueue = [];   // pistas precargadas para evitar cortes
    var trackIdx = -1;     // posición actual dentro de la playlist
    var order = [];        // orden de esta pasada (barajada)
    var fartEl = null, fartReady = false;
    var chaseEl = null, chaseReady = false, chaseGain = null;
    var musicVol = 0.6;    // volumen de MÚSICA (los sfx nunca se tocan)
    var muted = false, bpm = 96, intensity = 0, nextTime = 0, step = 0, barIdx = 0;
    var STEP = 0.5; // corcheas por patrón

    function init() {
      if (ctx) return;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.85;
      master.connect(ctx.destination);
      var n = ctx.sampleRate * 1.2;
      noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      // bus de SFX de persecución: independiente del volumen de música
      chaseGain = ctx.createGain();
      chaseGain.gain.value = 0;
      chaseGain.connect(master);
    }
    function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

    function makeAudio(src, loop) {
      var a = new Audio();
      a.loop = loop === true;      // por defecto NO: así dispara 'ended' y avanza
      a.preload = 'auto';
      a.src = src;
      return a;
    }

    /* Playlist: baraja las pistas para cada pasada.
       Cuando se acaba una pasada, se rearma y vuelve a empezar. */
    function shuffle(n) {
      var arr = [], i, j, t;
      for (i = 0; i < n; i++) arr.push(i);
      for (i = arr.length - 1; i > 0; i--) {
        j = Math.floor(Math.random() * (i + 1));
        t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    }
    function newPass() {
      order = shuffle(TRACKS.length);
      trackIdx = -1;
    }

    function initMusic() {
      if (musicEl || musicErr || !TRACKS.length) return;
      try {
        newPass();
        TRACKS.forEach(function (s) { musicQueue.push(makeAudio(s, false)); });
        musicEl = musicQueue[order[0]];
        musicEl.addEventListener('canplaythrough', function () {
          musicReady = true;
          musicEl.addEventListener('ended', nextTrack);
          startMusic();
        }, { once: true });
        musicEl.addEventListener('error', function () {
          musicErr = true; musicReady = false;
        });
        musicEl.load();
      } catch (e) { musicErr = true; }
    }

    function nextTrack() {
      if (musicErr || !musicQueue.length) return;
      trackIdx++;
      // se terminó la pasada -> barajamos de nuevo y seguimos
      if (trackIdx >= order.length) {
        var first = order[0];
        newPass();
        order.splice(order.indexOf(first), 1);
        order.unshift(first);       // que la primera siga siendo la misma
        trackIdx = 0;
      }
      var next = musicQueue[order[trackIdx]];
      if (next === musicEl && order.length > 1) { trackIdx = (trackIdx + 1) % order.length; next = musicQueue[order[trackIdx]]; }
      musicEl = next;
      // enganchamos el listener de 'ended' a la pista nueva
      if (musicEl.__hooked !== true) {
        musicEl.addEventListener('ended', nextTrack);
        musicEl.__hooked = true;
      }
      musicEl.volume = muted ? 0 : musicVol;
      var pr = musicEl.play();
      if (pr && pr.catch) pr.catch(function () { });
    }

    function startMusic() {
      if (!musicEl || !musicReady || muted) return;
      musicEl.volume = musicVol;
      var pr = musicEl.play();
      if (pr && pr.catch) pr.catch(function () { });
    }
    function musicOn() { return !!(musicEl && musicReady && !musicErr); }
    // qué pista está sonando (para mostrarlo o depurar)
    function currentTrack() {
      var i = (trackIdx >= 0) ? order[trackIdx] : order[0];
      return i == null ? null : TRACKS[i];
    }
    // volumen de MÚSICA únicamente (los sfx no se ven afectados)
    function setMusicVol(v) {
      musicVol = clamp(v, 0, 1);
      musicQueue.forEach(function (a) { if (a) a.volume = musicVol; });
      if (musicEl && musicReady) musicEl.volume = musicVol;
    }

    function noise(t, dur, f0, f1, vol, type) {
      if (!ctx) return;
      var s = ctx.createBufferSource(); s.buffer = noiseBuf;
      var bp = ctx.createBiquadFilter();
      bp.type = type || 'bandpass';
      bp.frequency.setValueAtTime(f0, t);
      bp.frequency.exponentialRampToValueAtTime(Math.max(60, f1), t + dur);
      bp.Q.value = 1.1;
      var g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(bp); bp.connect(g); g.connect(master);
      s.start(t); s.stop(t + dur + 0.02);
    }
    function tone(t, dur, type, f0, f1, vol, dest) {
      if (!ctx) return;
      var o = ctx.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.012, dur * 0.25));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest || master);
      o.start(t); o.stop(t + dur + 0.03);
    }
    // "TUNG" — golpe de tambor/madera
    function tung(t, vol) {
      vol = vol == null ? 0.5 : vol;
      tone(t, 0.16, 'triangle', 520, 190, vol * 0.9);
      tone(t, 0.1, 'sine', 160, 70, vol * 0.7);
      noise(t, 0.035, 2600, 900, vol * 0.5);
    }
    function dum(t, vol) {
      tone(t, 0.34, 'sine', 120, 48, vol);
      noise(t, 0.06, 900, 200, vol * 0.35);
    }
    // "SA-SA-HUR" — voz filtrada
    function saa(t, dur, vol) {
      vol = vol == null ? 0.22 : vol;
      var f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.setValueAtTime(520, t);
      f.frequency.linearRampToValueAtTime(760, t + dur * 0.6);
      f.frequency.linearRampToValueAtTime(430, t + dur);
      f.Q.value = 3.2;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + dur * 0.25);
      g.gain.setValueAtTime(vol, t + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      var o1 = ctx.createOscillator(); o1.type = 'sawtooth';
      o1.frequency.setValueAtTime(112, t);
      o1.frequency.linearRampToValueAtTime(104, t + dur);
      var lfo = ctx.createOscillator(); lfo.frequency.value = 11;
      var lg = ctx.createGain(); lg.gain.value = 7;
      lfo.connect(lg); lg.connect(o1.frequency);
      o1.connect(f); f.connect(g); g.connect(master);
      o1.start(t); o1.stop(t + dur + 0.05);
      lfo.start(t); lfo.stop(t + dur + 0.05);
    }

    /* ---------- sfx: perfect fart (30% al saltar) ---------- */
    function initFart() {
      if (fartEl) return;
      try {
        fartEl = new Audio('audio/sfx-perfect-fart.mp3');
        fartEl.volume = 0.85;
        fartEl.preload = 'auto';
        fartEl.addEventListener('canplaythrough', function () { fartReady = true; });
        fartEl.addEventListener('error', function () { fartReady = false; });
        fartEl.load();
      } catch (e) { fartReady = false; }
    }
    function playFart() {
      if (!fartEl || !fartReady || muted) return;
      try {
        fartEl.pause();
        fartEl.currentTime = 0;
        var pr = fartEl.play();
        if (pr && pr.catch) pr.catch(function () { });
      } catch (e) { }
    }

    /* ---------- sfx: persecución, volumen según proximidad ---------- */
    // gap en metros; far = distancia a la que ya no se oye. Máximo 100%.
    function initChase() {
      if (chaseEl) return;
      try {
        chaseEl = makeAudio('audio/sfx-persecucion.mp3', true);
        chaseEl.volume = 1;
        chaseEl.addEventListener('canplaythrough', function () {
          chaseReady = true;
          if (!muted) { var p = chaseEl.play(); if (p && p.catch) p.catch(function () { }); }
        });
        chaseEl.addEventListener('error', function () { chaseReady = false; });
        chaseEl.load();
        if (ctx) ctx.createMediaElementSource(chaseEl).connect(chaseGain);
      } catch (e) { chaseReady = false; }
    }
    function updateChaseVol(gap, far) {
      if (!chaseReady || !ctx || !chaseGain) return;
      var k = 1 - clamp((gap - 3.5) / Math.max(1, far - 3.5), 0, 1);
      k = k * k;                                    // curva: fuerte recién cuando está encima
      chaseGain.gain.setTargetAtTime(clamp(k, 0, 1), ctx.currentTime, 0.22);
    }

    /* ================= CUMBIA VILLERA =================
       Patrón en 2/4 (dos pulsos por compás, 8 corcheas).
       bombo = bombo legüero, guacha = guacharaca (madera),
       campana = cowbell/chingolo, y arriba un acorde de banda. */

    // 8 pasos por compás (corcheas). Códigos: 0 nada, B bombo, G guacha, C campana, S synth
    var CUMBIA = [
      'BGBSGCSS',
      'GBGSBCGS'
    ];
    var CHORDS = [                 // acorde por medio compás (notas MIDI)
      [45, 52, 57, 60],            // Am
      [43, 50, 55, 58],            // G
      [41, 48, 53, 57],            // F
      [45, 52, 57, 61]             // D
    ];
    var mtof = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };

    function bombo(t, vol) {
      vol = vol == null ? 0.5 : vol;
      tone(t, 0.22, 'sine', 130, 48, vol);
      noise(t, 0.04, 1200, 300, vol * 0.3);
    }
    function guacha(t, vol) {        // madera corta, muy characteristic de cumbia
      vol = vol == null ? 0.32 : vol;
      tone(t, 0.05, 'square', 1900, 900, vol * 0.5);
      tone(t, 0.03, 'triangle', 2400, 1400, vol * 0.3);
      noise(t, 0.02, 4000, 2000, vol * 0.25);
    }
    function campana(t, vol) {       // metal/cowbell brillante
      vol = vol == null ? 0.16 : vol;
      tone(t, 0.09, 'square', 2400, 2400, vol * 0.35);
      tone(t, 0.09, 'square', 3560, 3560, vol * 0.25);
    }
    function acorde(t, notes, dur, vol) {   // pad de la banda, tipo riff cumbia
      vol = vol == null ? 0.1 : vol;
      notes.forEach(function (m, i) {
        var o = ctx.createOscillator();
        o.type = i % 2 ? 'square' : 'sawtooth';
        o.frequency.value = mtof(m) * (i % 2 ? 1.005 : 1);
        var g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol / notes.length, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        var lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 1800;
        o.connect(lp); lp.connect(g); g.connect(master);
        o.start(t); o.stop(t + dur + 0.03);
      });
    }

    function schedule() {
      if (!ctx || muted) return;
      // si hay pista real cargada, no superponemos la percusión sintética
      if (musicOn()) return;
      var spb = 60 / bpm, sdt = spb * STEP;   // STEP = 0.5 => corchea
      var horizon = ctx.currentTime + 0.25;
      if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;
      var guard = 0;
      while (nextTime < horizon && guard++ < 48) {
        var bar = CUMBIA[barIdx % CUMBIA.length];
        var ch = bar[step % 8];
        var inten = 0.75 + intensity * 0.5;
        if (ch === 'B') bombo(nextTime, 0.5 * inten);
        if (ch === 'G') guacha(nextTime, 0.34 * inten);
        if (ch === 'C') campana(nextTime, 0.18 * inten);
        if (ch === 'S') acorde(nextTime, CHORDS[barIdx % CHORDS.length], sdt * 1.9, 0.09);
        // el "tung tung" cada 4to compás, como acento del estribillo
        if (step % 8 === 0 && barIdx % 2 === 0) tung(nextTime, 0.3 * inten);
        if (step % 8 === 2) tung(nextTime, 0.22 * inten);
        nextTime += sdt;
        step++;
        if (step % 8 === 0) barIdx++;
      }
    }

    return {
      init: init, resume: resume, schedule: schedule,
      initMusic: initMusic, musicOn: musicOn,
      initFart: initFart, initChase: initChase,
      setMusicVol: setMusicVol,
      updateChaseVol: updateChaseVol,
      // playlist (para depurar): _tracks() -> {queue, order, idx, cur}
      tracks: function () {
        return {
          queue: musicQueue.map(function (a) { return (a.currentSrc || a.src || '').split('/').pop(); }),
          loopFlags: musicQueue.map(function (a) { return a.loop; }),
          order: order.slice(), idx: trackIdx, cur: currentTrack()
        };
      },
      // dispara el fin de la pista actual (para probar la playlist)
      _endCurrent: function () { if (musicEl) musicEl.dispatchEvent(new Event('ended')); },
      _next: nextTrack,
      // 30% de probabilidad en cada salto
      maybeFart: function () { if (Math.random() < 0.30) playFart(); },
      tung: function (v) { if (ctx && !muted) tung(ctx.currentTime, v == null ? 0.3 : v); },
      ctxTime: function () { return ctx ? ctx.currentTime : 0; },
      setTempo: function (b) { bpm = clamp(b, 84, 150); if (musicEl) musicEl.playbackRate = clamp(bpm / 96, 0.85, 1.35); },
      setIntensity: function (i) { intensity = i; },
      get muted() { return muted; },
      toggle: function () {
        muted = !muted;
        if (master) master.gain.value = muted ? 0 : 0.85;
        if (muted) { musicQueue.forEach(function (a) { if (a) a.pause(); }); }
        else startMusic();
        return muted;
      },
      pause: function () { if (!muted) musicQueue.forEach(function (a) { if (a) a.pause(); }); },
      unpause: function () { startMusic(); },
      /* ---- efectos ---- */
      jump: function () { if (!ctx || muted) return; var t = ctx.currentTime; tone(t, 0.16, 'sine', 320, 780, 0.2); noise(t, 0.09, 1400, 3000, 0.12); },
      land: function () { if (!ctx || muted) return; var t = ctx.currentTime; tone(t, 0.13, 'sine', 190, 60, 0.28); noise(t, 0.05, 1200, 300, 0.16); },
      step: function () { if (!ctx || muted) return; var t = ctx.currentTime; noise(t, 0.03, 1500, 500, 0.09); },
      tuca: function (n) { if (!ctx || muted) return; var t = ctx.currentTime; var i = Math.min(n, 6); tone(t, 0.06, 'square', 880 + i * 55, 1320 + i * 70, 0.075); },
      power: function () {
        if (!ctx || muted) return; var t = ctx.currentTime;
        // arpegio al estilo banda de cumbia
        [523, 659, 784, 880, 1046].forEach(function (f, i) {
          tone(t + i * 0.055, 0.14, 'square', f, f, 0.1);
        });
        campana(t + 0.24, 0.3);
      },
      smash: function () { if (!ctx || muted) return; var t = ctx.currentTime; noise(t, 0.22, 4200, 300, 0.4, 'lowpass'); tone(t, 0.25, 'sine', 260, 45, 0.36); campana(t, 0.3); },
      hit: function () { if (!ctx || muted) return; var t = ctx.currentTime; tone(t, 0.3, 'sawtooth', 150, 60, 0.26); noise(t, 0.18, 800, 120, 0.3, 'lowpass'); guacha(t, 0.4); },
      caught: function () {
        if (!ctx || muted) return; var t = ctx.currentTime;
        [0, 0.15, 0.3].forEach(function (d, i) { tung(t + d, 0.55 - i * 0.1); });
        // "OAAA" final de Di Lollo
        saa(t + 0.45, 0.85, 0.3);
        tone(t + 0.45, 0.85, 'sawtooth', 300, 120, 0.14);
      },
      // cuando DI LOLLO te saca las zapatillas: chirrido de suela arrastrada
      shoes: function () { if (!ctx || muted) return; var t = ctx.currentTime; noise(t, 0.34, 900, 260, 0.3); tone(t, 0.2, 'sawtooth', 90, 45, 0.16); },
      click: function () { if (!ctx || muted) return; var t = ctx.currentTime; tone(t, 0.05, 'square', 660, 880, 0.07); },
      whoosh: function () { if (!ctx || muted) return; var t = ctx.currentTime; noise(t, 0.3, 300, 2600, 0.13); }
    };
  })();

  /* =========================================================================
     4. TEXTURAS PROCEDURALES
     ========================================================================= */
  function cvs(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function tex(canvas, repX, repY) {
    var t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (repX) t.repeat.set(repX, repY || repX);
    t.anisotropy = 4;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function makeWood() {
    var c = cvs(128, 256), x = c.getContext('2d');
    x.fillStyle = '#c08a4c'; x.fillRect(0, 0, 128, 256);
    for (var i = 0; i < 70; i++) {
      var y = Math.random() * 256;
      x.strokeStyle = 'rgba(' + (Math.random() < 0.5 ? '90,58,26' : '216,166,104') + ',' + (0.06 + Math.random() * 0.2) + ')';
      x.lineWidth = 0.6 + Math.random() * 2.4;
      x.beginPath(); x.moveTo(0, y);
      for (var px = 0; px <= 128; px += 16) x.lineTo(px, y + Math.sin(px * 0.09 + i) * 3.5);
      x.stroke();
    }
    // nudos
    for (var k = 0; k < 3; k++) {
      var cx = Math.random() * 128, cy = Math.random() * 256;
      for (var r = 9; r > 0; r -= 1.6) {
        x.strokeStyle = 'rgba(90,58,26,' + (0.08 + (9 - r) * 0.03) + ')';
        x.lineWidth = 1.2;
        x.beginPath(); x.ellipse(cx, cy, r, r * 0.6, 0.3, 0, TAU); x.stroke();
      }
    }
    x.fillStyle = 'rgba(60,36,16,.16)';
    for (var d = 0; d < 40; d++) x.fillRect(Math.random() * 128, Math.random() * 256, 1 + Math.random() * 3, 1 + Math.random() * 8);
    return tex(c, 1, 1);
  }

  // camino de tierra apisonada concharcos y basura: NO es asfalto
  function makeRoad() {
    var W = 256, H = 512, c = cvs(W, H), x = c.getContext('2d');
    x.fillStyle = '#8a7358'; x.fillRect(0, 0, W, H);
    // tierra con manchas y variaciones de tono
    for (var i = 0; i < 11000; i++) {
      var t = 90 + Math.random() * 90;
      x.fillStyle = 'rgba(' + (t | 0) + ',' + ((t * 0.84) | 0) + ',' + ((t * 0.62) | 0) + ',' + (0.14 + Math.random() * 0.4) + ')';
      x.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 3, 1 + Math.random() * 3);
    }
    // rodadas de las ruedas
    for (var r = 0; r < 3; r++) {
      var rx = 50 + r * 78;
      var grd = x.createLinearGradient(rx - 26, 0, rx + 26, 0);
      grd.addColorStop(0, 'rgba(60,48,34,0)');
      grd.addColorStop(0.5, 'rgba(60,48,34,.30)');
      grd.addColorStop(1, 'rgba(60,48,34,0)');
      x.fillStyle = grd; x.fillRect(rx - 26, 0, 52, H);
    }
    // baches y grietas
    for (var p = 0; p < 20; p++) {
      x.strokeStyle = 'rgba(50,40,30,.32)'; x.lineWidth = 1 + Math.random() * 2;
      x.beginPath(); var sx = Math.random() * W, sy = Math.random() * H;
      x.moveTo(sx, sy);
      for (var s = 0; s < 6; s++) { sx += (Math.random() - 0.5) * 50; sy += (Math.random() - 0.5) * 50; x.lineTo(sx, sy); }
      x.stroke();
    }
    // charcos de agua estancada
    for (var w2 = 0; w2 < 7; w2++) {
      var px = Math.random() * W, py = Math.random() * H, pr = 8 + Math.random() * 20;
      x.fillStyle = 'rgba(58,64,58,.55)';
      x.beginPath(); x.ellipse(px, py, pr, pr * 0.62, Math.random() * TAU, 0, TAU); x.fill();
      x.fillStyle = 'rgba(140,150,140,.20)';
      x.beginPath(); x.ellipse(px - pr * 0.25, py - pr * 0.18, pr * 0.5, pr * 0.24, 0, 0, TAU); x.fill();
    }
    // basura tirada: papelitos y envelopes
    for (var q = 0; q < 46; q++) {
      x.save();
      x.translate(Math.random() * W, Math.random() * H);
      x.rotate(Math.random() * TAU);
      x.fillStyle = ['rgba(230,226,210,.6)', 'rgba(200,196,180,.5)', 'rgba(120,110,95,.5)'][rndi(0, 2)];
      x.fillRect(-3, -2, 5 + Math.random() * 5, 3 + Math.random() * 3);
      x.restore();
    }
    return tex(c, 1, CFG.roadLen / CFG.dashWorld);
  }

  // ladrillo crudo (villa): el material de base
  function makeCrudo() {
    var c = cvs(128, 128), x = c.getContext('2d');
    x.fillStyle = '#9a5a3c'; x.fillRect(0, 0, 128, 128);
    var bh = 8, bw = 26;
    for (var row = 0; row * bh < 128; row++) {
      var off = (row % 2) ? -bw / 2 : 0;
      for (var col = -1; col * bw < 128; col++) {
        var bx = col * bw + off + 1, by = row * bh + 1;
        var v = 0.82 + Math.random() * 0.36;
        x.fillStyle = 'rgb(' + ((158 * v) | 0) + ',' + ((92 * v) | 0) + ',' + ((62 * v) | 0) + ')';
        x.fillRect(bx, by, bw - 2, bh - 2);
      }
    }
    // mortero y suciedad
    for (var i = 0; i < 2200; i++) {
      x.fillStyle = 'rgba(' + (60 + Math.random() * 40 | 0) + ',' + (50 + Math.random() * 30 | 0) + ',' + (40 + Math.random() * 20 | 0) + ',' + Math.random() * 0.2 + ')';
      x.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
    return tex(c, 1, 1);
  }

  // chapa zincada acanalada (techos de chapa)
  function makeChapa() {
    var c = cvs(64, 64), x = c.getContext('2d');
    for (var i = 0; i < 64; i++) {
      var w = 0.5 + 0.5 * Math.sin(i / 64 * TAU * 6);
      var g = 120 + w * 70;
      x.fillStyle = 'rgb(' + (g | 0) + ',' + ((g + 4) | 0) + ',' + ((g + 10) | 0) + ')';
      x.fillRect(i, 0, 1, 64);
    }
    // óxido
    for (var r = 0; r < 220; r++) {
      x.fillStyle = 'rgba(' + (120 + Math.random() * 50 | 0) + ',' + (60 + Math.random() * 30 | 0) + ',' + (30 + Math.random() * 20 | 0) + ',' + (0.1 + Math.random() * 0.35) + ')';
      x.fillRect(Math.random() * 64, Math.random() * 64, 1 + Math.random() * 4, 1 + Math.random() * 4);
    }
    return tex(c, 1, 1);
  }

  // revoque / hormigón crudo sin terminar
  function makeHormigon() {
    var c = cvs(128, 128), x = c.getContext('2d');
    x.fillStyle = '#9d968a'; x.fillRect(0, 0, 128, 128);
    for (var i = 0; i < 5000; i++) {
      var g = 120 + Math.random() * 70;
      x.fillStyle = 'rgba(' + (g | 0) + ',' + (g | 0) + ',' + ((g * 0.95) | 0) + ',' + (0.1 + Math.random() * 0.3) + ')';
      x.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
    // manchas de humedad
    for (var s = 0; s < 14; s++) {
      var sy = Math.random() * 128;
      var grd = x.createLinearGradient(0, sy, 0, sy + 40);
      grd.addColorStop(0, 'rgba(60,58,50,.35)');
      grd.addColorStop(1, 'rgba(60,58,50,0)');
      x.fillStyle = grd; x.fillRect(0, sy, 128, 40);
    }
    return tex(c, 1, 1);
  }

  // grafitis / Tags de la villa
  /* ---------- logo pintado en las paredes (grafiti) ----------
   Usa el PNG real (img/logo.png). Le sacamos el fondo blanco para que quede
   como una pintada y no un sticker rectangular. */
  var logoTexMat = null;
  function makeLogoTexture() {
    var img = new Image();
    logoTexMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.92, side: THREE.DoubleSide
    });
    img.onload = function () {
      var S = 512;
      var c = cvs(S, S), x = c.getContext('2d');
      x.clearRect(0, 0, S, S);
      x.drawImage(img, 0, 0, S, S);

      /* Borrado del fondo por inundación desde los bordes.
       No sirve con "todo lo blanco es transparente": los trazos blancos de
       adentro del globo son del mismo blanco y hay que conservarlos.
       Sólo se borra el blanco CONECTADO con el borde, que es el fondo real. */
      var imgd = x.getImageData(0, 0, S, S);
      var d = imgd.data;
      var visited = new Uint8Array(S * S);

      function isBg(k) {
        var o = k * 4;
        return d[o] > 212 && d[o + 1] > 212 && d[o + 2] > 212;
      }

      var stack = [], px, py, idx;
      function push(ix, iy) {
        if (ix < 0 || iy < 0 || ix >= S || iy >= S) return;
        var k = iy * S + ix;
        if (visited[k] || !isBg(k)) return;
        visited[k] = 1; stack.push(k);
      }
      for (var i = 0; i < S; i++) { push(i, 0); push(i, S - 1); push(0, i); push(S - 1, i); }

      while (stack.length) {
        idx = stack.pop();
        px = idx % S; py = (idx / S) | 0;
        push(px + 1, py); push(px - 1, py); push(px, py + 1); push(px, py - 1);
      }
      for (var k2 = 0; k2 < S * S; k2++) if (visited[k2]) d[k2 * 4 + 3] = 0;
      x.putImageData(imgd, 0, 0);

      var t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      if (logoTexMat) { logoTexMat.map = t; logoTexMat.needsUpdate = true; }
    };
    img.onerror = function () { /* sin logo: no se pinta nada */ };
    img.src = 'img/logo.png';
    return logoTexMat;
  }

  function makeTags() {
    var c = cvs(256, 128), x = c.getContext('2d');
    x.clearRect(0, 0, 256, 128);
    var cols = ['#e0356f', '#35d6ff', '#ffd166', '#a6ff5a', '#ff7a3d', '#c86bff'];
    for (var t = 0; t < 7; t++) {
      x.save();
      x.translate(Math.random() * 240 + 8, Math.random() * 110 + 12);
      x.rotate((Math.random() - 0.5) * 0.5);
      x.strokeStyle = cols[rndi(0, cols.length - 1)];
      x.lineWidth = 2 + Math.random() * 4;
      x.globalAlpha = 0.55 + Math.random() * 0.4;
      x.beginPath();
      var len = 20 + Math.random() * 60;
      x.moveTo(0, 0);
      for (var k = 0; k < 5; k++) x.lineTo((len / 5) * k, (Math.random() - 0.5) * 26);
      x.stroke();
      x.restore();
    }
    return tex(c, 1, 1);
  }

  function makeSidewalk() {
    var c = cvs(128, 128), x = c.getContext('2d');
    x.fillStyle = '#b9ad9b'; x.fillRect(0, 0, 128, 128);
    for (var i = 0; i < 2200; i++) {
      var g = 140 + Math.random() * 70;
      x.fillStyle = 'rgba(' + (g | 0) + ',' + (g | 0) + ',' + (g | 0) + ',' + (0.1 + Math.random() * 0.25) + ')';
      x.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
    x.strokeStyle = 'rgba(90,82,70,.55)'; x.lineWidth = 2;
    for (var i = 0; i <= 128; i += 64) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 128); x.stroke(); }
    x.beginPath(); x.moveTo(0, 64); x.lineTo(128, 64); x.stroke();
    return tex(c, 1, 1);
  }

  /* (makeFacades ya no se usa: ahora las casas son de crudo/chapa) */
  function makeFacades() {
    var wallCols = ['#e8c9a0', '#d9a066', '#c96f4a', '#8fb8a8', '#9a86c4', '#d9d3c4', '#6f97c4', '#c4a06b', '#b0576a', '#7f9c72'];
    for (var v = 0; v < 8; v++) {
      var c = cvs(128, 256), x = c.getContext('2d');
      var col = wallCols[(v * 3 + 1) % wallCols.length];
      x.fillStyle = col; x.fillRect(0, 0, 128, 256);
      // grano
      for (var g = 0; g < 2600; g++) {
        x.fillStyle = 'rgba(0,0,0,' + (Math.random() * 0.07) + ')';
        x.fillRect(Math.random() * 128, Math.random() * 256, 2, 2);
      }
      var cols = 3 + (v % 2), rows = 5 + (v % 3);
      var cw = 128 / cols, rh = 256 / rows;
      for (var r = 0; r < rows; r++) {
        // línea de piso
        x.fillStyle = 'rgba(0,0,0,.13)'; x.fillRect(0, r * rh, 128, 2);
        for (var cI = 0; cI < cols; cI++) {
          var wI = cw * 0.5, hI = rh * 0.52;
          var wx = cI * cw + (cw - wI) / 2, wy = r * rh + rh * 0.16;
          var lit = Math.random() < 0.28;
          x.fillStyle = lit ? '#ffd98a' : '#2b3440';
          x.fillRect(wx, wy, wI, hI);
          x.fillStyle = 'rgba(255,255,255,.25)';
          x.fillRect(wx, wy, wI, 2);
          // marco
          x.strokeStyle = 'rgba(255,255,255,.5)'; x.lineWidth = 1.4;
          x.strokeRect(wx, wy, wI, hI);
          if (Math.random() < 0.35) { // baranda
            x.fillStyle = 'rgba(30,30,40,.6)';
            x.fillRect(wx - 1, wy + hI, wI + 2, 3);
          }
        }
      }
      // puerta
      x.fillStyle = 'rgba(60,35,25,.85)';
      x.fillRect(cols * cw * 0.5 - 6, 256 - rh * 0.62, 12, rh * 0.62);
      facades.push(tex(c, 1, 1));
    }
  }

  var signTexes = [];
  function makeSigns() {
    var bgs = ['#d8232a', '#1f7ae0', '#f4a521', '#138a4a', '#8e2ec9', '#e0356f', '#12121a'];
    var fgs = ['#fff6d6', '#ffffff', '#12121a', '#fff'];
    for (var i = 0; i < 8; i++) {
      var c = cvs(256, 64), x = c.getContext('2d');
      x.fillStyle = bgs[i % bgs.length]; x.fillRect(0, 0, 256, 64);
      x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 5; x.strokeRect(5, 5, 246, 54);
      x.fillStyle = fgs[i % fgs.length];
      x.font = 'bold 34px Impact, "Arial Black", sans-serif';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(SIGNS[i], 128, 35, 232);
      signTexes.push(tex(c, 1, 1));
    }
  }

  function makeStripe() {
    var c = cvs(128, 128), x = c.getContext('2d');
    x.fillStyle = '#f5f1e6'; x.fillRect(0, 0, 128, 128);
    for (var i = 0; i < 128; i += 22) { x.fillStyle = '#d8232a'; x.fillRect(i, 0, 11, 128); }
    return tex(c, 1, 1);
  }

  /* ---------- foto fotorrealista pegada en la cara de Di Lollo ----------
   Recorta el rostro (mitad superior de la foto), lo adapta a formato cuadrado
   sin deformarlo y lo aplica como parche curvo con máscara ovalada suave.
   Si el archivo no está, el parche queda invisible y el juego no se rompe. */
  var faceTexMat = null;
  function makeFaceTexture() {
    var img = new Image();
    faceTexMat = new THREE.MeshLambertMaterial({
      color: 0xffffff, transparent: true, depthWrite: false, opacity: 0
    });
    img.onload = function () {
      var S = 512;
      var c = cvs(S, S), x = c.getContext('2d');
      x.clearRect(0, 0, S, S);

      // recorte del rostro: centrado en la cara, formato cuadrado
      var sh = img.height * 0.52;                     // desde la frente hasta la barbilla
      var sw = sh;
      var sx = (img.width - sw) / 2;
      var sy = img.height * 0.04;
      // "cover": mantener proporción para no deformar la cara
      var scale = Math.max(S / sw, S / sh);
      var dw = sw * scale, dh = sh * scale;
      x.drawImage(img, sx, sy, sw, sh, (S - dw) / 2, (S - dh) / 2, dw, dh);

      // máscara ovalada con bordes suaves para fundirse con la cabeza 3D
      var grd = x.createRadialGradient(S / 2, S / 2, S * 0.2, S / 2, S / 2, S * 0.5);
      grd.addColorStop(0, 'rgba(0,0,0,1)');
      grd.addColorStop(0.66, 'rgba(0,0,0,1)');
      grd.addColorStop(0.88, 'rgba(0,0,0,0.6)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      x.globalCompositeOperation = 'destination-in';
      x.fillStyle = grd;
      x.beginPath(); x.ellipse(S / 2, S / 2, S * 0.5, S * 0.52, 0, 0, TAU); x.fill();
      x.globalCompositeOperation = 'source-over';

      var t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      if (faceTexMat) {
        faceTexMat.map = t;
        faceTexMat.opacity = 1;
        faceTexMat.needsUpdate = true;
      }
    };
    img.onerror = function () { /* sin foto: cabeza lisa, sin romper nada */ };
    img.src = 'img/pity-face.jpg';
    return faceTexMat;
  }

  // textura de la foto de Di Lollo (se usa también en el menú)
  var naikTexMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  function makeNaik() {
    var c = cvs(128, 56), x = c.getContext('2d');
    x.fillStyle = '#141414';
    x.font = 'bold 44px Impact, "Arial Black", sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('NAIK', 64, 30);
    naikTexMat = new THREE.MeshLambertMaterial({ map: tex(c, 1, 1) });
    return naikTexMat;
  }

  /* =========================================================================
     5. ESCENA
     ========================================================================= */
  var stage = document.getElementById('stage');
  var renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = CFG.shadow;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.autoClear = false;
  stage.appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcfe3f2, 55, 195);

  var camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.1, 600);
  camera.position.set(0, 3.25, 6.9);

  var mirrorCam = new THREE.PerspectiveCamera(48, 2.5, 0.35, 120);

  // luces
  var hemi = new THREE.HemisphereLight(0xbfe3ff, 0x8a7a63, 0.55);
  scene.add(hemi);
  var amb = new THREE.AmbientLight(0xffffff, 0.42);
  scene.add(amb);
  var sun = new THREE.DirectionalLight(0xfff6e2, 1.25);
  sun.position.set(6, 16, 8);
  sun.castShadow = CFG.shadow;
  sun.shadow.mapSize.set(1024, 1024);
  var sc = sun.shadow.camera;
  sc.left = -13; sc.right = 13; sc.top = 16; sc.bottom = -6; sc.near = 1; sc.far = 60;
  sun.shadow.bias = -0.0015;
  scene.add(sun);
  scene.add(sun.target);

  // cielo
  var skyMat = new THREE.ShaderMaterial({
    uniforms: {
      top: { value: new THREE.Color(0x2e8fe0) },
      bot: { value: new THREE.Color(0xcfeafc) },
      sunCol: { value: new THREE.Color(0xffffff) },
      sunI: { value: 1.0 },
      sunDir: { value: new THREE.Vector3(0.25, 0.75, -0.6) }
    },
    vertexShader: 'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: [
      'uniform vec3 top,bot,sunCol,sunDir;uniform float sunI;varying vec3 vP;',
      'void main(){vec3 d=normalize(vP);',
      'float h=clamp(d.y*1.5+0.12,0.0,1.0);',
      'vec3 c=mix(bot,top,pow(h,0.8));',
      'float s=max(dot(d,normalize(sunDir)),0.0);',
      'c+=sunCol*pow(s,90.0)*sunI*1.8;',
      'c+=sunCol*pow(s,8.0)*sunI*0.30;',
      'c+=sunCol*pow(s,2.0)*sunI*0.06;',
      'gl_FragColor=vec4(c,1.0);}'
    ].join('\n'),
    side: THREE.BackSide, depthWrite: false, fog: false
  });
  var sky = new THREE.Mesh(new THREE.SphereGeometry(420, 24, 16), skyMat);
  sky.renderOrder = -1;
  scene.add(sky);

  /* =========================================================================
     6. MUNDO (carretera, aceras, edificios, props)
     ========================================================================= */
  var world = new THREE.Group();
  scene.add(world);

  var roadTex = makeRoad();
  var roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  var roadGeo = new THREE.PlaneGeometry(CFG.roadW, CFG.roadLen);
  roadGeo.rotateX(-Math.PI / 2);
  var road = new THREE.Mesh(roadGeo, roadMat);
  road.position.z = -CFG.roadLen / 2 + 20;
  road.receiveShadow = true;
  world.add(road);

  var walkTex = makeSidewalk();
  walkTex.repeat.set(1, CFG.roadLen / 6);
  var walkMat = new THREE.MeshLambertMaterial({ map: walkTex });
  var curbMat = new THREE.MeshLambertMaterial({ color: 0xb8ac96 });
  var dirtMat = new THREE.MeshLambertMaterial({ color: 0x6b5f4d });
  [-1, 1].forEach(function (s) {
    // vereda angosta de cemento, medio rota
    var g = new THREE.PlaneGeometry(5, CFG.roadLen); g.rotateX(-Math.PI / 2);
    var m = new THREE.Mesh(g, walkMat); m.position.set(s * (CFG.roadW / 2 + 2.5), 0.01, -CFG.roadLen / 2 + 20);
    m.receiveShadow = true; world.add(m);
    // bordillo bajo de cemento
    var cg = new THREE.BoxGeometry(0.3, 0.22, CFG.roadLen);
    var cm = new THREE.Mesh(cg, curbMat); cm.position.set(s * (CFG.roadW / 2 + 0.15), 0.11, -CFG.roadLen / 2 + 20);
    cm.receiveShadow = true; world.add(cm);
    // tierra/backlot
    var dg = new THREE.PlaneGeometry(120, CFG.roadLen); dg.rotateX(-Math.PI / 2);
    var dm = new THREE.Mesh(dg, dirtMat); dm.position.set(s * 62, -0.06, -CFG.roadLen / 2 + 20);
    world.add(dm);
  });

  var woodTex = makeWood();

  /* ---- casas de villa ---- */
  makeSigns(); makeNaik(); makeFaceTexture(); makeLogoTexture();
  var crudoTex = makeCrudo();
  var chapaTex = makeChapa();
  var hormigonTex = makeHormigon();
  var tagsTex = makeTags();
  tagsTex.repeat.set(1, 1);
  var crudoMat = new THREE.MeshLambertMaterial({ map: crudoTex });
  var chapaMat = new THREE.MeshLambertMaterial({ map: chapaTex });
  var hormigonMat = new THREE.MeshLambertMaterial({ map: hormigonTex });
  var revoqueMat = new THREE.MeshLambertMaterial({ color: 0xb0a894 });
  var tagsMat = new THREE.MeshLambertMaterial({ map: tagsTex, transparent: true });
  var signMats = signTexes.map(function (t) { return new THREE.MeshLambertMaterial({ map: t, emissive: 0x221100, emissiveIntensity: 0.25 }); });
  var metalMat = new THREE.MeshLambertMaterial({ color: 0x8d8d97 });
  var rustMat = new THREE.MeshLambertMaterial({ color: 0x7a4a2a });
  var glassMat = new THREE.MeshLambertMaterial({ color: 0x9fd8e8, emissive: 0x123, emissiveIntensity: 0.4 });

  function makeBuilding(frontSign, isStreet) {
    var g = new THREE.Group();
    g.userData.front = frontSign || -1;
    var faceX = frontSign < 0 ? -1 : 1;
    var w = rnd(4.5, 7.5), h = rnd(4.5, 9), d = rnd(4, 7);
    var wall = Math.random() < 0.68 ? crudoMat : (Math.random() < 0.5 ? revoqueMat : hormigonMat);

    var body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wall);
    body.position.y = h / 2;
    body.castShadow = false; body.receiveShadow = true;
    g.add(body);

    // techo de chapa acanalada, ligeramente inclinado
    var roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.7, 0.14, d + 0.7), chapaMat);
    roof.position.set(rnd(-0.3, 0.3), h + 0.2, 0);
    roof.rotation.z = rnd(-0.09, 0.09);
    roof.rotation.x = rnd(-0.07, 0.07);
    g.add(roof);
    // viga que sobresale
    var beam = new THREE.Mesh(new THREE.BoxGeometry(w + 1.1, 0.12, 0.12), rustMat);
    beam.position.set(0, h - 0.15, d / 2 + 0.45); g.add(beam);

    // hierro de la losa asomando (nervadura sin cubrir)
    if (Math.random() < 0.55) {
      for (var r = 0; r < 3; r++) {
        var bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, rnd(0.7, 1.5), 5), rustMat);
        bar.position.set(rnd(-w / 3, w / 3), h + rnd(0.5, 0.9), rnd(-d / 3, d / 3));
        bar.rotation.z = rnd(-0.3, 0.3);
        g.add(bar);
      }
    }

    // tanque de agua negro sobre pedestal (símbolo de la villa)
    if (Math.random() < 0.8) {
      var tx = rnd(-w / 3, w / 3), tz = rnd(-d / 3, d / 3);
      var tank = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.0, 12), new THREE.MeshLambertMaterial({ color: 0x2a2a30 }));
      tank.position.set(tx, h + 0.95, tz); g.add(tank);
      var stand = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.45, 0.95), hormigonMat);
      stand.position.set(tx, h + 0.42, tz); g.add(stand);
    }

    // ventanas con reja, en la cara que da a la calle
    var winCount = rndi(1, 2);
    for (var wi = 0; wi < winCount; wi++) {
      var wz = rnd(-d / 3, d / 3), wy = rnd(1.6, Math.max(2.2, h - 1.6));
      var fr = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.8), new THREE.MeshLambertMaterial({ color: 0x2b2b33 }));
      fr.position.set(faceX * (w / 2 + 0.02), wy, wz); g.add(fr);
      var bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 0.05), metalMat);
      bar2.position.set(faceX * (w / 2 + 0.06), wy, wz); g.add(bar2);
      var bar3 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.8), metalMat);
      bar3.position.set(faceX * (w / 2 + 0.06), wy, wz); g.add(bar3);
    }

    // grafiti/tag en la pared
    if (Math.random() < 0.5) {
      var tg = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), tagsMat);
      tg.position.set(faceX * (w / 2 + 0.05), rnd(1.2, 2.6), rnd(-d / 3, d / 3));
      tg.rotation.y = faceX > 0 ? Math.PI / 2 : -Math.PI / 2;
      g.add(tg);
    }

    // El LOGO pintado en la pared.
    // Sólo en casas que dan a la calle (las de atrás están tapadas), y por
    // encima de los tags para que nunca queden tapados.
    // 5% al azar, pero la casa del medio de cada fila SIEMPRE lleva uno:
    // con 5% puro, una de cada cuatro cargas quedaba sin ningún logo.
    if (isStreet) {
      streetIdx++;
      if (streetIdx === 4 || streetIdx === 17 || Math.random() < 0.05) {
        var lg = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.1), logoTexMat);
        lg.position.set(faceX * (w / 2 + 0.06), rnd(2.6, Math.min(h - 0.8, 4.6)), rnd(-d / 4, d / 4));
        lg.rotation.y = faceX > 0 ? Math.PI / 2 : -Math.PI / 2;
        lg.rotation.z = rnd(-0.1, 0.1);
        lg.renderOrder = 1;
        g.add(lg);
      }
    }

    // tendedero con ropa entre esta casa y la de enfrente
    if (Math.random() < 0.5) {
      var ly = rnd(2.6, Math.max(3, h - 0.8));
      var line = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.03, 0.03), new THREE.MeshLambertMaterial({ color: 0x6a6a70 }));
      line.position.set(faceX * (w / 2 + 1.6), ly, rnd(-d / 3, d / 3));
      g.add(line);
      var cols = [0xe8e4dc, 0xd84a6a, 0x4a7fd8, 0xf4c020, 0x5ac47a, 0xe07a3a];
      for (var ci = 0; ci < 4; ci++) {
        var cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.6),
          new THREE.MeshLambertMaterial({ color: cols[rndi(0, cols.length - 1)], side: THREE.DoubleSide }));
        cloth.position.set(faceX * (w / 2 + 0.5 + ci * 0.75), ly - 0.34, line.position.z);
        cloth.rotation.y = faceX > 0 ? Math.PI / 2 : -Math.PI / 2;
        g.add(cloth);
      }
    }

    // kiosco/chapa al frente con letrero
    if (Math.random() < 0.45) {
      var aw = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, d * 0.7), chapaMat);
      aw.position.set(faceX * (w / 2 + 0.45), 2.3, 0);
      aw.rotation.z = rnd(-0.1, 0.1); g.add(aw);
      var sg = new THREE.Mesh(new THREE.PlaneGeometry(d * 0.6, 0.8), signMats[rndi(0, signMats.length - 1)]);
      sg.position.set(faceX * (w / 2 + 0.05), 2.95, 0);
      sg.rotation.y = faceX > 0 ? Math.PI / 2 : -Math.PI / 2;
      g.add(sg);
    }
    return g;
  }

  var streetIdx = 0;      // cuenta las casas de la calle (para ubicar los logos fijos)
  var buildings = [];
  (function () {
    var spacing = 12;
    for (var s = 0; s < 2; s++) {
      // primera fila: la que da a la calle
for (var i = 0; i < 13; i++) {
        var b = makeBuilding(s ? -1 : 1, true);   // la fachada mira siempre a la calle
        b.position.set((s ? 1 : -1) * (CFG.roadW / 2 + 4.5 + rnd(2.5, 4.5)), 0, -i * spacing - rnd(0, 5) + 10);
        b.rotation.y = (s ? Math.PI : 0) + rnd(-0.05, 0.05);
        b.userData.span = spacing * 13;
        world.add(b);
        buildings.push(b);
      }
      // segunda fila: casas más altas detrás, para que el barrio tenga volumen
      for (var k = 0; k < 10; k++) {
        var b2 = makeBuilding(s ? -1 : 1, false);
        var sc2 = rnd(0.85, 1.5);
        b2.scale.set(1, sc2, 1);
        b2.position.set((s ? 1 : -1) * (CFG.roadW / 2 + 15 + rnd(2, 6)), 0, -k * (spacing * 1.7) - rnd(0, 8) + 10);
        b2.rotation.y = (s ? Math.PI : 0) + rnd(-0.12, 0.12);
        b2.userData.span = spacing * 1.7 * 10;
        world.add(b2);
        buildings.push(b2);
      }
    }
  })();

  /* ---- props de acera ---- */
  var lampMat = new THREE.MeshLambertMaterial({ color: 0x2f2f38 });
  var lampGlowMat = new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0xffdd88, emissiveIntensity: 0.2 });
  var potMat = new THREE.MeshLambertMaterial({ color: 0xa8573a });
  var leafMat = new THREE.MeshLambertMaterial({ color: 0x3f8f3a });

  function makeStreetlight() {
    var g = new THREE.Group();
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.2, 8), lampMat); pole.position.y = 2.6; g.add(pole);
    var arm = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 0.1), lampMat); arm.position.set(0.6, 5.1, 0); g.add(arm);
    var lamp = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.35), lampGlowMat); lamp.position.set(1.15, 5.0, 0); g.add(lamp);
    g.userData.glow = lamp;
    return g;
  }
  function makePlant() {
    var g = new THREE.Group();
    var pot = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.24, 0.5, 8), potMat); pot.position.y = 0.25; g.add(pot);
    for (var i = 0; i < 5; i++) {
      var l = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 5), leafMat);
      l.position.set(rnd(-0.2, 0.2), 0.85, rnd(-0.2, 0.2));
      l.rotation.z = rnd(-0.4, 0.4); l.rotation.x = rnd(-0.4, 0.4); g.add(l);
    }
    return g;
  }
  function makeBin() {
    var g = new THREE.Group();
    var b = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.28, 0.85, 10), new THREE.MeshLambertMaterial({ color: 0x3f6b4f }));
    b.position.y = 0.42; g.add(b);
    var lid = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.1, 10), new THREE.MeshLambertMaterial({ color: 0x2c4d38 }));
    lid.position.y = 0.88; g.add(lid);
    return g;
  }
  function makeMoto() {
    var g = new THREE.Group();
    var col = [0xf4c020, 0xd8232a, 0x1f7ae0, 0xeeeeee][rndi(0, 3)];
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 1.25), new THREE.MeshLambertMaterial({ color: col }));
    body.position.y = 0.6; g.add(body);
    var seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.6), new THREE.MeshLambertMaterial({ color: 0x1b1b25 }));
    seat.position.set(0, 0.9, 0.15); g.add(seat);
    for (var s = -1; s <= 1; s += 2) {
      var wh = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 10), new THREE.MeshLambertMaterial({ color: 0x15151a }));
      wh.rotation.z = Math.PI / 2; wh.position.set(0, 0.28, s * 0.45); g.add(wh);
    }
    return g;
  }
  function makeStand() { // puesto de tucas
    var g = new THREE.Group();
    var table = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.9, 0.8), new THREE.MeshLambertMaterial({ color: 0x8d6b3f }));
    table.position.y = 0.45; g.add(table);
    var um = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.55, 8, 1, true), new THREE.MeshLambertMaterial({ color: 0xd8232a, side: THREE.DoubleSide }));
    um.position.y = 2.1; g.add(um);
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.1, 6), metalMat); pole.position.y = 1.05; g.add(pole);
    var sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), signMats[0]);
    sign.position.set(0, 2.45, 0.02); g.add(sign);
    return g;
  }
  function makeDog() {
    var g = new THREE.Group();
    var m = new THREE.MeshLambertMaterial({ color: [0xc98f4e, 0x8a6a4a, 0xe8e0d0][rndi(0, 2)] });
    var b = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.72), m); b.position.y = 0.42; g.add(b);
    var h = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.3), m); h.position.set(0, 0.58, 0.5); g.add(h);
    var t = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.36, 6), m);
    t.rotation.x = -0.7; t.position.set(0, 0.72, 0.6); g.add(t);
    for (var s = -1; s <= 1; s += 2) for (var f = -1; f <= 1; f += 2) {
      var lg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 0.1), m);
      lg.position.set(s * 0.12, 0.17, f * 0.28); g.add(lg);
    }
    return g;
  }
  // bolsa de basura / Forsch (icónico en la villa)
  function makeBag() {
    var g = new THREE.Group();
    var col = [0x2a2a30, 0x3a3a42, 0x1f2a3a, 0x4a3a2a][rndi(0, 3)];
    var bag = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 7), new THREE.MeshLambertMaterial({ color: col }));
    bag.position.y = 0.32; bag.scale.y = 1.15; g.add(bag);
    var knot = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.2, 6), new THREE.MeshLambertMaterial({ color: col }));
    knot.position.y = 0.7; g.add(knot);
    return g;
  }
  // pila de escombros / cascotes
  function makeRubble() {
    var g = new THREE.Group();
    for (var i = 0; i < 7; i++) {
      var r = new THREE.Mesh(new THREE.BoxGeometry(rnd(0.2, 0.5), rnd(0.15, 0.3), rnd(0.2, 0.45)),
        new THREE.MeshLambertMaterial({ color: rndi(0, 1) ? 0x9a9082 : 0x8a6a52 }));
      r.position.set(rnd(-0.5, 0.5), rnd(0.08, 0.32), rnd(-0.5, 0.5));
      r.rotation.set(rnd(0, 1), rnd(0, TAU), rnd(0, 1));
      g.add(r);
    }
    return g;
  }
  // tacho / OIL Bideno (vertedero)
  function makeCans() {
    var g = new THREE.Group();
    for (var i = 0; i < 5; i++) {
      var c = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.24, 8),
        new THREE.MeshLambertMaterial({ color: rndi(0, 1) ? 0xc8c0a8 : 0xa8382a }));
      c.position.set(rnd(-0.35, 0.35), 0.12, rnd(-0.35, 0.35));
      c.rotation.set(Math.PI / 2 * (i % 2 ? 1 : 0), rnd(0, TAU), rnd(0, 1));
      g.add(c);
    }
    return g;
  }
  // pared medianera con revoque descascarado
  function makeWall() {
    var g = new THREE.Group();
    var wall = new THREE.Mesh(new THREE.BoxGeometry(3.2, rnd(1.6, 2.4), 0.3), revoqueMat);
    wall.position.y = wall.geometry.parameters.height / 2; g.add(wall);
    var tag = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), tagsMat);
    tag.position.set(0, wall.geometry.parameters.height * 0.5, 0.17); g.add(tag);
    return g;
  }
  // tanque de gas / cilindro
  function makeCylinder() {
    var g = new THREE.Group();
    var c = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.9, 12), new THREE.MeshLambertMaterial({ color: 0xb8b0a0 }));
    c.position.y = 0.45; g.add(c);
    var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 12), new THREE.MeshLambertMaterial({ color: 0x8a8270 }));
    cap.position.y = 0.92; g.add(cap);
    return g;
  }
  // chapa clavada / leaning trash
  function makeSheet() {
    var g = new THREE.Group();
    var s1 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.4, 0.04), chapaMat);
    s1.position.y = 0.7; s1.rotation.z = rnd(-0.3, 0.3); s1.castShadow = true; g.add(s1);
    return g;
  }
  //结构调整: escalera de-elements externals
  function makeBricks() {
    var g = new THREE.Group();
    for (var i = 0; i < 5; i++) {
      var b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.11), new THREE.MeshLambertMaterial({ color: 0x9a5a3c }));
      b.position.set(rnd(-0.3, 0.3), 0.05 + i * 0.1, rnd(-0.2, 0.2));
      b.rotation.y = rnd(0, 1); g.add(b);
    }
    return g;
  }
  // pila de cubiertas / techo de chapa apilado
  function makeStack() {
    var g = new THREE.Group();
    for (var i = 0; i < 3; i++) {
      var s = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.5), chapaMat);
      s.position.set(rnd(-0.1, 0.1), 0.04 + i * 0.05, rnd(-0.1, 0.1));
      s.rotation.y = rnd(0, 1); g.add(s);
    }
    return g;
  }

  var propFns = [makeStreetlight, makePlant, makeBin, makeMoto, makeStand, makeDog, makeBag, makeRubble, makeCans, makeWall, makeCylinder, makeSheet, makeBricks, makeStack];
  var props = [];
  (function () {
    for (var i = 0; i < 40; i++) {
      var slot = new THREE.Group();
      var variants = propFns.map(function (f) { var v = f(); v.visible = false; slot.add(v); return v; });
      world.add(slot);
      props.push({ slot: slot, variants: variants, z: -i * 8 - rnd(0, 6), side: (i % 2 ? 1 : -1), cur: -1 });
    }
  })();
  function refreshProp(p) {
    if (p.cur >= 0) p.variants[p.cur].visible = false;
    var idx;
    do { idx = rndi(0, propFns.length - 1); } while (idx === p.cur);
    p.cur = idx; p.variants[idx].visible = true;
    var off = propFns[idx] === makeStreetlight ? 0 : rnd(0.4, 2.6);
    p.slot.position.set(p.side * (CFG.roadW / 2 + 1.4 + (propFns[idx] === makeStreetlight ? 0 : off)), 0, p.z);
    p.slot.rotation.y = p.side > 0 ? Math.PI : 0;
    p.slot.children[idx].rotation.y = rnd(-0.4, 0.4);
  }

  /* ---- cables cruzando el pasaje (maraña eléctrica) ---- */
  var cables = [];
  (function () {
    for (var i = 0; i < 18; i++) {
      var g = new THREE.Group();
      var n = rndi(4, 8);
      for (var k = 0; k < n; k++) {
        var len = CFG.roadW + 6;
        var cable = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, len, 5), new THREE.MeshLambertMaterial({ color: 0x1a1a20 }));
        cable.rotation.z = Math.PI / 2;
        cable.position.y = rnd(3.8, 6.4);
        cable.position.z = rnd(-0.5, 0.5);
        g.add(cable);
      }
      g.position.z = -i * 17 - rnd(0, 8);
      world.add(g);
      cables.push({ g: g, z: g.position.z });
    }
  })();

  /* ---- vecinos caminando en la calle (transeúntes de la villa) ---- */
  var pedestrians = [];
  var SKINS = [0x6b4226, 0x8a5a34, 0xa87547, 0x4a2e1a, 0xc4905f, 0x7a4a2a, 0x9c6b3f, 0x5c3a1e];
  var SHIRTS = [0xd84a6a, 0x2f6fbf, 0xf4c020, 0x2a2a32, 0x3fa85a, 0xe07a3a, 0x8e44ad, 0xe8e4dc, 0x1f8f9c];
  var PANTS = [0x2a3a5a, 0x1a1a22, 0x4a3a2a, 0x2f2f38, 0x5a4a6a, 0x3a3a3a];
  function makePedestrian() {
    var g = new THREE.Group();
    var skin = new THREE.MeshLambertMaterial({ color: pick(SKINS) });
    var shirt = new THREE.MeshLambertMaterial({ color: pick(SHIRTS) });
    var pants = new THREE.MeshLambertMaterial({ color: pick(PANTS) });
    var scale = rnd(0.85, 1.12);
    g.scale.setScalar(scale);

    var hip = new THREE.Group(); hip.position.y = 0.78; g.add(hip);
    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.56, 0.24), shirt);
    torso.position.y = 0.26; hip.add(torso);
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.28), skin);
    head.position.y = 0.72; hip.add(head);

    // varios tipos de gorro/gorra, estilo callejero
    var hatType = rndi(0, 3);
    if (hatType === 0) {            // gorra
      var cp = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.3), pick([0xd8232a, 0x1f7ae0, 0x2a2a32, 0xf4c020]));
      cp.position.y = 0.9; hip.add(cp);
      var vis = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.12), pick([0xd8232a, 0x1f7ae0, 0x2a2a32]));
      vis.position.set(0, 0.88, -0.18); hip.add(vis);
    } else if (hatType === 1) {     // bucket hat
      var bk = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.14, 10), pick([0x6b5a3a, 0x2a2a32, 0x4a7a4a]));
      bk.position.y = 0.9; hip.add(bk);
      var brimB = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.03, 12), pick([0x6b5a3a, 0x2a2a32, 0x4a7a4a]));
      brimB.position.y = 0.83; hip.add(brimB);
    } else if (hatType === 2) {     // pañuelo/cana brava
      var bc = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6, 0, TAU, 0, 1.1), pick([0xd8232a, 0x1f7ae0, 0x4a2a6a, 0xe8e4dc]));
      bc.position.y = 0.87; hip.add(bc);
      var tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.06), pick([0xd8232a, 0x1f7ae0]));
      tail.position.set(0.14, 0.84, 0.1); tail.rotation.z = -0.4; hip.add(tail);
    } else {                        // pelo
      var hair = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.09, 0.29), new THREE.MeshLambertMaterial({ color: 0x1a1a18 }));
      hair.position.y = 0.89; hip.add(hair);
    }

    var legs = [];
    [-1, 1].forEach(function (s) {
      var l = new THREE.Group(); l.position.set(s * 0.11, 0.02, 0); hip.add(l);
      var th = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.4, 0.16), pants); th.position.y = -0.2; l.add(th);
      var ft = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.09, 0.26), new THREE.MeshLambertMaterial({ color: 0x1a1a20 }));
      ft.position.set(0, -0.42, -0.04); l.add(ft);
      legs.push(l);
    });
    var arms = [];
    [-1, 1].forEach(function (s) {
      var a = new THREE.Group(); a.position.set(s * 0.28, 0.5, 0); hip.add(a);
      var up = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.12), shirt); up.position.y = -0.2; a.add(up);
      var hd = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.11), skin); hd.position.y = -0.44; a.add(hd);
      arms.push(a);
    });
    return { g: g, hip: hip, legs: legs, arms: arms };
  }
  (function () {
    for (var i = 0; i < 30; i++) {
      var p = makePedestrian();
      // caminan por la vereda, away del carril de juego
      var side = (i % 2 ? 1 : -1);
      p.g.position.set(side * (CFG.roadW / 2 + rnd(0.9, 2.2)), 0, -i * 11 - rnd(0, 8));
      p.phase = Math.random() * TAU;
      p.speed = rnd(2.6, 4.8);
      p.dir = Math.random() < 0.5 ? 1 : -1;
      p.baseX = p.g.position.x;
      p.span = rnd(1.6, 3.0);
      p.z = -i * 11 - rnd(0, 8);
      world.add(p.g);
      pedestrians.push(p);
    }
  })();
  function updatePedestrians(dt) {
    for (var i = 0; i < pedestrians.length; i++) {
      var p = pedestrians[i];
      p.phase += dt * p.speed;
      // avanzan con el mundo (se reciclan cuando pasan la cámara)
      p.z += G.speed * dt;
      if (p.z > CFG.killZ + 6) p.z -= 30 * 11;
      // deambulan sobre la vereda sin salirse del carril
      var off = Math.sin(p.phase * 0.28) * p.span;
      p.g.position.x = p.baseX + off;
      p.g.position.z = p.z;
      var fwd = Math.cos(p.phase * 0.28);
      p.g.rotation.y = fwd > 0 ? 0 : Math.PI;
      // animación de piernas balanceando
      p.legs[0].rotation.x = Math.sin(p.phase) * 0.62;
      p.legs[1].rotation.x = Math.sin(p.phase + Math.PI) * 0.62;
      p.arms[0].rotation.x = Math.sin(p.phase + Math.PI) * 0.5;
      p.arms[1].rotation.x = Math.sin(p.phase) * 0.5;
      p.hip.position.y = 0.78 + Math.abs(Math.sin(p.phase)) * 0.04;
    }
  }

  /* ---- banderines (cordón de banderitas) ---- */
  var buntings = [];
  (function () {
    var cols = [0xf4c020, 0xd8232a, 0x1f7ae0, 0xffffff, 0x138a4a];
    for (var i = 0; i < 9; i++) {
      var g = new THREE.Group();
      var line = new THREE.Mesh(new THREE.BoxGeometry(22, 0.04, 0.04), new THREE.MeshLambertMaterial({ color: 0x3a3a42 }));
      line.position.y = 6.4 - i * 0.1; g.add(line);
      for (var k = 0; k < 14; k++) {
        var f = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 3), new THREE.MeshLambertMaterial({ color: cols[k % 5] }));
        f.position.set(-10 + k * 1.55, 6.2 - i * 0.1 - 0.28 + Math.sin(k * 0.7 + i) * 0.1, 0);
        f.rotation.x = Math.PI;
        g.add(f);
      }
      g.position.z = -i * 34;
      world.add(g);
      buntings.push({ g: g, z: -i * 34 });
    }
  })();

  /* ---- skyline lejano ---- */
  var skyline = new THREE.Group();
  (function () {
    var m = new THREE.MeshLambertMaterial({ color: 0x6a7391 });
    for (var i = 0; i < 46; i++) {
      var a = (i / 46) * TAU;
      var h = rnd(12, 52), w = rnd(10, 26);
      var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), m);
      b.position.set(Math.sin(a) * 175, h / 2 - 2, Math.cos(a) * 175 - 90);
      skyline.add(b);
    }
  })();
  scene.add(skyline);

  /* =========================================================================
     7. OBSTÁCULOS
     ========================================================================= */
  function mkMat(c, extra) { return new THREE.MeshLambertMaterial(Object.assign({ color: c }, extra || {})); }

  function obBarricade() {
    var g = new THREE.Group();
    var woodM = new THREE.MeshLambertMaterial({ map: woodTex });
    for (var s = -1; s <= 1; s += 2) {
      var post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.0, 0.16), woodM);
      post.position.set(s * 0.85, 0.5, 0); post.castShadow = true; g.add(post);
    }
    [0.42, 0.72].forEach(function (y) {
      var pl = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.2, 0.12), woodM);
      pl.position.y = y; pl.castShadow = true; g.add(pl);
    });
    var warn = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.18), new THREE.MeshLambertMaterial({ color: 0xf4c020 }));
    warn.position.set(0, 0.57, 0.07); g.add(warn);
    g.userData = { w: 1.95, h: 0.95, zHalf: 0.3, kind: 'jump' };
    return g;
  }
  function obBanner() {
    var g = new THREE.Group();
    var postM = mkMat(0x55555f);
    for (var s = -1; s <= 1; s += 2) {
      var post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.1, 8), postM);
      post.position.set(s * 0.92, 1.55, 0); post.castShadow = true; g.add(post);
    }
    var board = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.35, 0.12), signMats[rndi(0, signMats.length - 1)]);
    board.position.y = 1.95; board.castShadow = true; g.add(board);
    var bar = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.14, 0.2), mkMat(0x3a3a42));
    bar.position.y = 1.2; g.add(bar);
    g.userData = { w: 2.0, h: 3.0, zHalf: 0.28, yMin: 1.18, kind: 'slide' };
    return g;
  }
  function obCart() {
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.BoxGeometry(1.85, 1.5, 1.0), mkMat(0xb0562f));
    body.position.y = 0.85; body.castShadow = true; g.add(body);
    var top = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.16, 1.15), mkMat(0x8a3f1f));
    top.position.y = 1.66; g.add(top);
    var um = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.6, 8, 1, true), mkMat(0x1f7ae0, { side: THREE.DoubleSide }));
    um.position.y = 2.2; g.add(um);
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 6), metalMat); pole.position.y = 1.7; g.add(pole);
    for (var s = -1; s <= 1; s += 2) {
      var wh = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 10), mkMat(0x1b1b25));
      wh.rotation.z = Math.PI / 2; wh.position.set(s * 0.7, 0.3, 0.3); g.add(wh);
    }
    g.userData = { w: 1.9, h: 2.5, zHalf: 0.55, kind: 'solid' };
    return g;
  }
  // colectivo/ónibus: verde fluorescente, parabrisas enorme, formatted como los viejos
  function obBus() {
    var g = new THREE.Group();
    var bodyM = new THREE.MeshLambertMaterial({ color: 0x8fd63a });   // verde flúo
    var darkM = new THREE.MeshLambertMaterial({ color: 0x2a2f38 });
    var body = new THREE.Mesh(new THREE.BoxGeometry(5.0, 2.5, 2.0), bodyM);
    body.position.y = 1.55; body.castShadow = true; g.add(body);
    // techo ligeramente curvo hacia adelante
    var roof = new THREE.Mesh(new THREE.BoxGeometry(4.9, 0.18, 2.05), new THREE.MeshLambertMaterial({ color: 0xd8dde0 }));
    roof.position.set(0, 2.82, 0); g.add(roof);
    // parabrisas frontal grande y oscuro
    var wind = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.35, 0.1), darkM);
    wind.position.set(0, 2.0, -1.02); g.add(wind);
    // pilar central
    var mid = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.35, 0.12), bodyM);
    mid.position.set(0, 2.0, -1.06); g.add(mid);
    // parabrisas trasero
    var wind2 = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.2, 0.1), darkM);
    wind2.position.set(0, 2.05, 1.02); g.add(wind2);
    // ventanillas laterales
    [-1, 1].forEach(function (s) {
      for (var i = 0; i < 5; i++) {
        var w = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.95, 0.7), darkM);
        w.position.set(s * 2.52, 2.05, -0.72 + i * 0.36); g.add(w);
      }
      // franja de color
      var band = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 2.0), new THREE.MeshLambertMaterial({ color: 0xe8e4da }));
      band.position.set(s * 2.53, 1.5, 0); g.add(band);
    });
    // cartel de recorrido arriba del parabrisas ("317")
    var sign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.4), new THREE.MeshLambertMaterial({ color: 0xf0e8d0, emissive: 0x332200, emissiveIntensity: 0.4 }));
    sign.position.set(0, 2.95, -0.7); sign.rotation.x = -0.3; g.add(sign);
    // franja con "COLECTIVO"
    var bandTxt = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.34), signMats[3]);
    bandTxt.position.set(0, 2.55, -1.02); g.add(bandTxt);
    // bumper y luces
    var bumper = new THREE.Mesh(new THREE.BoxGeometry(5.05, 0.35, 0.16), darkM);
    bumper.position.set(0, 0.55, -1.0); g.add(bumper);
    var lights = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.25, 0.08), new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0xddc070, emissiveIntensity: 0.8 }));
    lights.position.set(0, 1.05, -1.03); g.add(lights);
    // ruedas
    [-1, 1].forEach(function (s) {
      var wh = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 12), new THREE.MeshLambertMaterial({ color: 0x15151a }));
      wh.rotation.z = Math.PI / 2; wh.position.set(s * 2.2, 0.45, 0.98); g.add(wh);
      var wh2 = wh.clone(); wh2.position.z = -0.98; g.add(wh2);
      var hub = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.32, 8), new THREE.MeshLambertMaterial({ color: 0xc8c8c8 }));
      hub.rotation.z = Math.PI / 2; hub.position.copy(wh.position); g.add(hub);
    });
    // puerta lateral
    var door = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.8, 0.9), darkM);
    door.position.set(-2.53, 1.15, 0.4); g.add(door);
    g.userData = { w: 5.1, h: 3.0, zHalf: 1.15, kind: 'solid', noSmash: true };
    return g;
  }
  function obBin() {
    var g = new THREE.Group();
    var b = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.5, 1.1), mkMat(0x2f6b4f));
    b.position.y = 0.75; b.castShadow = true; g.add(b);
    var lid = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.16, 1.2), mkMat(0x1f4a38));
    lid.position.y = 1.55; g.add(lid);
    var tag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7), signMats[6]);
    tag.position.set(0, 0.8, 0.57); g.add(tag);
    g.userData = { w: 1.95, h: 1.65, zHalf: 0.6, kind: 'solid' };
    return g;
  }
  function obBarrel() {
    var g = new THREE.Group();
    var b = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.9, 12), mkMat(0xf4a521));
    b.position.y = 0.45; b.castShadow = true; g.add(b);
    [0.2, 0.7].forEach(function (y) {
      var r = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.09, 12), mkMat(0x2b2b33));
      r.position.y = y; g.add(r);
    });
    var mark = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.4), mkMat(0xd8232a));
    mark.position.set(0, 0.45, 0.43); g.add(mark);
    g.userData = { w: 0.86, h: 0.9, zHalf: 0.42, kind: 'jump', rolling: true };
    return g;
  }
  function obTent() { // carpa de obra: hay que pasar por el lado
    var g = new THREE.Group();
    var base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 1.4), mkMat(0xf0a93b));
    base.position.y = 0.55; base.castShadow = true; g.add(base);
    var tarp = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.0, 4), mkMat(0x1f7ae0, { side: THREE.DoubleSide }));
    tarp.position.y = 1.6; tarp.rotation.y = Math.PI / 4; g.add(tarp);
    var cone = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.6, 8), mkMat(0xff5e5b));
    cone.position.set(0.9, 2.3, 0); g.add(cone);
    g.userData = { w: 2.2, h: 2.4, zHalf: 0.7, kind: 'solid' };
    return g;
  }

  // gente durmiendo en la calle: hay que esquivarla, no atravesarla
  function obSleeper() {
    var g = new THREE.Group();
    var skin = new THREE.MeshLambertMaterial({ color: pick(SKINS) });
    var shirt = new THREE.MeshLambertMaterial({ color: pick(SHIRTS) });
    var pants = new THREE.MeshLambertMaterial({ color: pick(PANTS) });
    var hairC = pick([0x1a1a18, 0x2e2018, 0x3a2a1a, 0x4a3a28]);
    var hairM = new THREE.MeshLambertMaterial({ color: hairC });

    // cartón de debajo (colchón)
    var card = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.045, 2.05),
      new THREE.MeshLambertMaterial({ color: 0xb08a52 }));
    card.position.y = 0.025; card.receiveShadow = true; g.add(card);
    // bolsa/abrigo como almohada
    var pillow = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.14, 0.42),
      new THREE.MeshLambertMaterial({ color: pick([0x8a6a3a, 0x6b5a3a, 0x4a5a6a]) }));
    pillow.position.set(0.02, 0.1, -0.84); g.add(pillow);

    /* ---- persona acostada de lado, de cabeza a los pies (-Z → +Z) ---- */
    var body = new THREE.Group();
    body.position.y = 0.06;
    g.add(body);

    // torso: acostado boca arriba, apenas girado de costado
    var torso = new THREE.Group();
    torso.position.set(0, 0.3, 0.02);
    torso.rotation.z = 0.1;
    body.add(torso);
    var chest = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 0.78), shirt);
    chest.castShadow = true; torso.add(chest);
    // hombro (el lado de arriba, porque está de costado)
    var sh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), shirt);
    sh.position.set(-0.15, 0.1, -0.3); torso.add(sh);

    // cabeza apoyada en la almohada, mirando hacia la calle (-Z) y arriba
    var head = new THREE.Group();
    head.position.set(0.0, 0.4, -0.8);
    head.rotation.set(-0.55, 0.25, 0.12);
    body.add(head);
    var skull = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.29, 0.27), skin);
    skull.castShadow = true; head.add(skull);
    var hair = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.13, 0.29), hairM);
    hair.position.set(0.02, 0.13, 0.01); head.add(hair);
    // ojos cerrados: dos líneas oscuras (dan "dormido")
    [-0.07, 0.07].forEach(function (ex) {
      var eye = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.022, 0.02), new THREE.MeshLambertMaterial({ color: 0x2a1d16 }));
      eye.position.set(ex, 0.01, -0.14); eye.rotation.z = ex > 0 ? -0.2 : 0.2;
      head.add(eye);
    });
    var mouth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.02), new THREE.MeshLambertMaterial({ color: 0x7a4a44 }));
    mouth.position.set(0, -0.08, -0.14); head.add(mouth);

    // brazo doblado, mano cerca de la cara
    var armG = new THREE.Group();
    armG.position.set(-0.19, 0.12, -0.3);
    armG.rotation.set(0.3, 0, 0.75);
    torso.add(armG);
    var upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.36, 0.12), shirt);
    upperArm.position.y = -0.18; armG.add(upperArm);
    var foreG = new THREE.Group(); foreG.position.y = -0.36; foreG.rotation.x = -1.5;
    armG.add(foreG);
    var fore = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.32, 0.11), skin);
    fore.position.y = -0.16; foreG.add(fore);
    var hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), skin);
    hand.position.y = -0.34; foreG.add(hand);

    // segundo brazo, estirado a lo largo del cuerpo
    var arm2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.46, 0.12), shirt);
    arm2.position.set(0.2, -0.12, 0.04); arm2.rotation.z = -0.35; arm2.rotation.x = -0.15;
    arm2.castShadow = true; torso.add(arm2);
    var hand2 = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), skin);
    hand2.position.set(0.29, -0.34, 0.1); torso.add(hand2);

    // piernas: acostadas, apenas flexionadas y separadas
    [-1, 1].forEach(function (s) {
      var thigh = new THREE.Group();
      thigh.position.set(s * 0.14, -0.06, 0.32);
      thigh.rotation.z = s * 0.14;                 // abiertas en abanico
      torso.add(thigh);
      var th = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.54), pants);
      th.position.z = 0.27; th.castShadow = true; thigh.add(th);

      var shin = new THREE.Group();
      shin.position.z = 0.54;
      shin.rotation.x = -0.35;                     // rodilla medio doblada
      shin.rotation.z = -s * 0.1;
      thigh.add(shin);
      var sh2 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.46), pants);
      sh2.position.z = 0.23; sh2.castShadow = true; shin.add(sh2);
      var foot = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.11, 0.26), new THREE.MeshLambertMaterial({ color: 0x1a1a20 }));
      foot.position.set(0, -0.02, 0.48); shin.add(foot);
    });

    // zapatillas al lado (se las sacó para dormir)
    for (var q = 0; q < 2; q++) {
      var shoe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.26), new THREE.MeshLambertMaterial({ color: 0xf0e8d8 }));
      shoe.position.set(0.42 + q * 0.18, 0.06, 0.5 - q * 0.12);
      shoe.rotation.y = 0.4 - q * 0.7;
      g.add(shoe);
      var sole = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.035, 0.27), new THREE.MeshLambertMaterial({ color: 0x2a2a32 }));
      sole.position.copy(shoe.position); sole.position.y = 0.01; sole.rotation.y = shoe.rotation.y;
      g.add(sole);
    }

    // botella y un par de cosas tiradas al lado
    var bot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 8), new THREE.MeshLambertMaterial({ color: 0x8a9a7a }));
    bot.position.set(-0.5, 0.11, 0.1); bot.rotation.z = 1.5; g.add(bot);

    // "zZz" flotando: sprite, siempre mira a cámara
    var zzz = new THREE.Group();
    [[0, 0.95, 1.0], [0.16, 1.12, 0.75], [0.3, 1.26, 0.52]].forEach(function (cfg) {
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: zzzTex(), transparent: true, depthWrite: false, opacity: 0.9
      }));
      sp.position.set(cfg[0], cfg[1], 0);
      sp.scale.setScalar(0.3 * cfg[2]);
      zzz.add(sp);
    });
    g.add(zzz);

    g.userData = { w: 1.5, h: 0.72, zHalf: 1.0, kind: 'solid', zzz: zzz };
    return g;
  }

  // textura de la letra "Z" para el sueño
  var _zzzCanvas = null;
  function zzzTex() {
    if (_zzzCanvas) return _zzzCanvas;
    var c = cvs(64, 64), x = c.getContext('2d');
    x.clearRect(0, 0, 64, 64);
    x.strokeStyle = '#dff0ff';
    x.lineWidth = 9; x.lineCap = 'round'; x.lineJoin = 'round';
    x.globalAlpha = 0.95;
    x.beginPath();
    x.moveTo(16, 18); x.lineTo(48, 18); x.lineTo(16, 46); x.lineTo(48, 46);
    x.stroke();
    _zzzCanvas = new THREE.CanvasTexture(c);
    _zzzCanvas.colorSpace = THREE.SRGBColorSpace;
    return _zzzCanvas;
  }

  var OB_FACTORY = { barricade: obBarricade, banner: obBanner, cart: obCart, bus: obBus, bin: obBin, barrel: obBarrel, tent: obTent, sleeper: obSleeper };
  var obstacles = [];
  (function () {
    var counts = { barricade: 7, banner: 7, cart: 5, bus: 4, bin: 5, barrel: 6, tent: 4, sleeper: 6 };
    Object.keys(counts).forEach(function (k) {
      for (var i = 0; i < counts[k]; i++) {
        var m = OB_FACTORY[k]();
        m.visible = false;
        world.add(m);
        obstacles.push({ mesh: m, type: k, active: false, lane: 1, x: 0, z: 0, u: m.userData, hit: false, near: false, spin: 0 });
      }
    });
  })();

  function spawnObstacle(type, lane, z) {
    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      if (o.type === type && !o.active) {
        o.active = true; o.lane = lane; o.z = z;
        o.x = CFG.laneX[lane];
        o.hit = false; o.near = false; o.spin = 0;
        o.mesh.position.set(o.x, 0, z);
        o.mesh.rotation.set(0, 0, 0);
        o.mesh.scale.set(1, 1, 1);
        o.mesh.visible = true;
        if (o.u.rolling) o.mesh.rotation.y = 0;
        return o;
      }
    }
    return null;
  }

  /* =========================================================================
     8. TUCAS (instanciadas) + PARTÍCULAS
     ========================================================================= */
  var TUCAS = 220;
  // MODELO: NUECES DE CIGARRILLO (no tucas): cilindro blanco + filtro naranja + brasa
  var tucaGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.46, 8);
  tucaGeo.rotateZ(Math.PI / 2);
  var tucaMesh = new THREE.InstancedMesh(tucaGeo, new THREE.MeshLambertMaterial({ color: 0xf2efe4 }), TUCAS);
  // filtro: cilindro naranja, desplazado al extremo del cigarrillo
  var pimGeo = new THREE.CylinderGeometry(0.057, 0.057, 0.12, 8);
  pimGeo.rotateZ(Math.PI / 2);
  pimGeo.translate(0.17, 0, 0);
  var pimMesh = new THREE.InstancedMesh(pimGeo, new THREE.MeshLambertMaterial({ color: 0xd9761f, emissive: 0x3a1c04, emissiveIntensity: 0.4 }), TUCAS);
  var slots = [];
  for (var i = 0; i < TUCAS; i++) slots.push({ active: false, x: 0, y: 0.3, z: 0, pop: 0, vy: 0, vx: 0, vz: 0 });
  tucaMesh.frustumCulled = false; pimMesh.frustumCulled = false;
  tucaMesh.castShadow = false;
  world.add(tucaMesh); world.add(pimMesh);

  var SPARKS = 90;
  var sparkGeo = new THREE.OctahedronGeometry(0.12, 0);
  var sparkMesh = new THREE.InstancedMesh(sparkGeo, new THREE.MeshLambertMaterial({ color: 0xffe27a, emissive: 0x998800, emissiveIntensity: 0.8 }), SPARKS);
  sparkMesh.frustumCulled = false;
  var sparks = [];
  for (var i2 = 0; i2 < SPARKS; i2++) sparks.push({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 0, s: 1 });
  world.add(sparkMesh);
  var sparkCur = 0;
  function burst(x, y, z, n, col, spread) {
    for (var i = 0; i < n; i++) {
      var s = sparks[sparkCur = (sparkCur + 1) % SPARKS];
      s.life = rnd(0.4, 0.85); s.x = x; s.y = y; s.z = z;
      s.vx = rnd(-spread, spread); s.vy = rnd(1.5, 5.5) * (col === 'wood' ? 1 : 0.7); s.vz = rnd(-spread, spread);
      s.r = rnd(0, TAU); s.s = rnd(0.7, 1.5);
    }
  }

  // escombros (romper obstáculos)
  var DEBRIS = 34;
  var debrisMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshLambertMaterial({ color: 0xa9784a }), DEBRIS);
  debrisMesh.frustumCulled = false;
  var debris = [];
  for (var i3 = 0; i3 < DEBRIS; i3++) debris.push({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, s: 1 });
  var debrisCur = 0;
  world.add(debrisMesh);

  /* =========================================================================
     9. POWER-UPS
     ========================================================================= */
  var POWERS = {
    bat: { name: '¡A LA BATUTA!', time: 8, color: '#ff8c42', icon: '🏏' },
    turbo: { name: '¡TURBO!', time: 7, color: '#35d6ff', icon: '⚡' },
    magnet: { name: '¡IMÁN DE CIGARRILLOS!', time: 11, color: '#ff2d78', icon: '🧲' },
    silence: { name: '¡SILENCIO! DI LOLLO SE QUEDA CALLADO', time: 6, color: '#a6ff5a', icon: '🔇' }
  };
  function makePowerIcon(kind) {
    var g = new THREE.Group();
    var glow = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 }));
    g.add(glow);
    var m;
    if (kind === 'bat') {
      m = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.16, 1.25, 8), new THREE.MeshLambertMaterial({ color: 0xe0c48d }));
      m.rotation.z = 0.5; m.position.y = 0.1; g.add(m);
    } else if (kind === 'turbo') {
      m = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.95, 4), new THREE.MeshLambertMaterial({ color: 0x35d6ff, emissive: 0x0a5f7a, emissiveIntensity: 0.8 }));
      m.position.y = 0.1; g.add(m);
    } else if (kind === 'magnet') {
      var a = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.11, 8, 12, Math.PI), new THREE.MeshLambertMaterial({ color: 0xff2d78 }));
      a.position.y = 0.15; g.add(a);
      var l = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.34, 0.22), mkMat(0xdddddd)); l.position.set(-0.3, -0.1, 0); g.add(l);
      var r2 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.34, 0.22), mkMat(0xdddddd)); r2.position.set(0.3, -0.1, 0); g.add(r2);
    } else {
      var sp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.35), mkMat(0x3a3a44)); sp.position.y = 0.05; g.add(sp);
      var cone2 = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.4, 10), mkMat(0x22222a));
      cone2.rotation.x = Math.PI; cone2.position.set(0.2, 0.1, 0); g.add(cone2);
      var x1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.1), mkMat(0xff4d4d)); x1.position.z = 0.2; g.add(x1);
      var x2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.1), mkMat(0xff4d4d)); x2.position.z = 0.2; g.add(x2);
    }
    return g;
  }
  var powerSlots = [];
  (function () {
    for (var i = 0; i < 4; i++) {
      var slot = new THREE.Group();
      var icons = {};
      Object.keys(POWERS).forEach(function (k) {
        var ic = makePowerIcon(k);
        ic.visible = false; slot.add(ic); icons[k] = ic;
      });
      slot.visible = false;
      world.add(slot);
      powerSlots.push({ slot: slot, icons: icons, kind: null, active: false, x: 0, y: 1.3, z: 0 });
    }
  })();
  function spawnPower(kind, x, z) {
    for (var i = 0; i < powerSlots.length; i++) {
      var p = powerSlots[i];
      if (!p.active) {
        p.active = true; p.kind = kind; p.x = x; p.z = z;
        Object.keys(p.icons).forEach(function (k) { p.icons[k].visible = (k === kind); });
        p.slot.position.set(x, p.y, z);
        p.slot.visible = true;
        return p;
      }
    }
    return null;
  }

  /* =========================================================================
     10. PERSONAJES
     ========================================================================= */
  /* ---- TUNG TUNG SAHUR ---- */
  function makeTung() {
    var root = new THREE.Group();
    var tilt = new THREE.Group(); root.add(tilt);          // inclinaciones
    var body = new THREE.Group(); tilt.add(body);

    var woodM = new THREE.MeshLambertMaterial({ map: woodTex });
    var log = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.44, 1.1, 14), woodM);
    log.position.y = 0.78; log.castShadow = true; body.add(log);
    var topCap = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.06, 14), new THREE.MeshLambertMaterial({ color: 0xd9a768 }));
    topCap.position.y = 1.33; body.add(topCap);
    // aro inferior
    var botCap = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.07, 14), new THREE.MeshLambertMaterial({ color: 0x8a5a2b }));
    botCap.position.y = 0.22; body.add(botCap);

    // cara
    var face = new THREE.Group(); face.position.set(0, 0.86, 0); body.add(face);
    var eyeW = new THREE.MeshLambertMaterial({ color: 0xffffff });
    var eyeB = new THREE.MeshLambertMaterial({ color: 0x141018 });
    var eyes = [];
    [-0.15, 0.15].forEach(function (x) {
      var e = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 10), eyeW);
      e.position.set(x, 0.1, -0.34); e.scale.z = 0.7; e.castShadow = false; face.add(e);
      var p = new THREE.Mesh(new THREE.SphereGeometry(0.062, 8, 6), eyeB);
      p.position.set(x, 0.09, -0.42); p.scale.z = 0.6; face.add(p);
      var br = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.03), new THREE.MeshLambertMaterial({ color: 0x4a2c12 }));
      br.position.set(x, 0.27, -0.4); br.rotation.z = x > 0 ? -0.25 : 0.25; face.add(br);
      eyes.push({ w: e, p: p });
    });
    // boca: hueco oscuro con dientes arriba y abajo
    var mouthGrp = new THREE.Group();
    mouthGrp.position.set(0, -0.17, -0.33);
    var mouth = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.26, 0.1), new THREE.MeshLambertMaterial({ color: 0x2a1410 }));
    mouthGrp.add(mouth);
    var teethT = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.11), new THREE.MeshLambertMaterial({ color: 0xfdfdfd }));
    teethT.position.set(0, 0.1, -0.01); mouthGrp.add(teethT);
    var teethB = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.07, 0.1), new THREE.MeshLambertMaterial({ color: 0xfdfdfd }));
    teethB.position.set(0, -0.1, -0.01); mouthGrp.add(teethB);
    var tongue = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.05, 0.08), new THREE.MeshLambertMaterial({ color: 0xe2554f }));
    tongue.position.set(0, -0.07, -0.05); mouthGrp.add(tongue);
    face.add(mouthGrp);

    // brazos: con codo real (grupo intermedio) para que no se vean rectos/raros
    var armM = new THREE.MeshLambertMaterial({ color: 0xa9713c });
    var armLM = new THREE.MeshLambertMaterial({ color: 0xc98f4e });
    var handM = new THREE.MeshLambertMaterial({ color: 0xe0b183 });
    var armL = new THREE.Group(); armL.position.set(-0.47, 1.04, 0); body.add(armL);
    var armR = new THREE.Group(); armR.position.set(0.47, 1.04, 0); body.add(armR);
    var armBends = [];
    [armL, armR].forEach(function (a, i) {
      var up = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, 0.16), i ? armM : armLM);
      up.position.y = -0.17; up.castShadow = true; a.add(up);
      // codo
      var elbow = new THREE.Group(); elbow.position.y = -0.34; a.add(elbow);
      var fore = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.32, 0.14), i ? armM : armLM);
      fore.position.y = -0.16; fore.castShadow = true; elbow.add(fore);
      var hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), handM);
      hand.position.y = -0.35; elbow.add(hand);
      armBends.push(elbow);
    });
    // bate en la mano derecha, siempre visible desde atrás
    var bat = new THREE.Group(); bat.position.set(0, -0.35, 0); armBends[1].add(bat);
    var batBody = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.095, 1.3, 8), new THREE.MeshLambertMaterial({ color: 0xe0c48d }));
    batBody.position.y = -0.34; batBody.castShadow = true; bat.add(batBody);
    var batKnob = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshLambertMaterial({ color: 0xc9a76e }));
    batKnob.position.y = 0.33; bat.add(batKnob);
    var batTape = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.24, 8), new THREE.MeshLambertMaterial({ color: 0x33333a }));
    batTape.position.y = 0.06; bat.add(batTape);

    // banderita_TIMEOUT
    var flag = new THREE.Group(); flag.position.set(0.05, 1.2, 0.4); body.add(flag);
    var stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.55, 6), new THREE.MeshLambertMaterial({ color: 0x5b3a1c }));
    stick.position.y = 0.1; flag.add(stick);
    var fl = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.17), new THREE.MeshLambertMaterial({ color: 0xe63946, side: THREE.DoubleSide }));
    fl.position.set(0.14, 0.3, 0); flag.add(fl);
    var flW = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.09), new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    flW.position.set(0.14, 0.33, 0.005); flag.add(flW);

    // patitas + zapatillas (Di Lollo se las lleva al atraparlo)
    var feet = [], shoes = [];
    var shoeM = new THREE.MeshLambertMaterial({ color: 0xf0e8d8 });
    var soleM = new THREE.MeshLambertMaterial({ color: 0x2a2a32 });
    var stripeM = new THREE.MeshLambertMaterial({ color: 0xd8232a });
    [-0.16, 0.16].forEach(function (x, i) {
      var f = new THREE.Group(); f.position.set(x, 0.16, 0); body.add(f);
      var leg = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.18, 0.13), new THREE.MeshLambertMaterial({ color: 0x7d4f26 }));
      leg.position.y = -0.08; f.add(leg);
      // zapatilla: capellada + suela + franja
      var shoe = new THREE.Group();
      shoe.userData.x0 = x;
      shoe.position.set(0, -0.19, -0.05);
      var cap2 = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.11, 0.28), shoeM);
      cap2.castShadow = true; shoe.add(cap2);
      var sole = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.29), soleM);
      sole.position.y = -0.07; shoe.add(sole);
      var str = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.035, 0.06), stripeM);
      str.position.set(0, 0.015, -0.06); shoe.add(str);
      f.add(shoe);
      feet.push(f); shoes.push(shoe);
    });

    return { root: root, tilt: tilt, body: body, face: face, mouthGrp: mouthGrp, armL: armL, armR: armR, elbowL: armBends[0], elbowR: armBends[1], bat: bat, flag: flag, feet: feet, shoes: shoes, eyes: eyes };
  }

  /* ---- DI LOLLO (Lauti, "el Cara Larga") ---- */
  function makePity() {
    var root = new THREE.Group();
    var hip = new THREE.Group(); root.add(hip);
    var torso = new THREE.Group(); hip.add(torso);

    var skinM = new THREE.MeshLambertMaterial({ color: 0x7a5638 });   // para que combine con la foto
    var shirt = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.6, 0.32), new THREE.MeshLambertMaterial({ color: 0x1f1f28 }));
    shirt.position.y = 1.02; shirt.castShadow = true; torso.add(shirt);
    var stripe = new THREE.Mesh(new THREE.BoxGeometry(0.59, 0.12, 0.33), new THREE.MeshLambertMaterial({ color: 0xf0e8d0 }));
    stripe.position.y = 1.14; torso.add(stripe);
    var belt = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.09, 0.34), new THREE.MeshLambertMaterial({ color: 0x14141a }));
    belt.position.y = 0.73; torso.add(belt);

    /* ---- cabeza: la referencia (gorra blanca, ojo amarillo, boca abierta) ---- */
    var head = new THREE.Group(); head.position.y = 1.36; torso.add(head);
    var skull = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 14), skinM);
    skull.scale.set(1, 1.02, 0.94); skull.castShadow = true; head.add(skull);

    // FOTO fotorrealista pegada en la cara: parche esférico en el frente (-Z)
    // theta más alto (bajo) para que quede bajo la gorra
    // FOTO: parche esférico en el frente (-Z), centrado en la cabeza
    var photoPatch = new THREE.Mesh(
      new THREE.SphereGeometry(0.307, 44, 44, -Math.PI / 2 - 0.95, 1.9, 0.48, 1.5),
      faceTexMat
    );
    photoPatch.scale.set(1, 1.02, 0.97);
    photoPatch.renderOrder = 2;
    head.add(photoPatch);
    // LA CARA ES LA FOTO: no hay ojos, nariz, boca ni dientes modelados.
    // solo orejas (a los costados, no tapan la foto)
    [-1, 1].forEach(function (s) {
      var ear = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), skinM);
      ear.position.set(s * 0.29, -0.04, 0.01); ear.scale.x = 0.55; head.add(ear);
    });

    // (sin gorra: la foto de la cara queda al descubierto y centrada)

    // Sin rasgos 3D en la cara: la foto fotorrealista los reemplaza todos.
    // (los arrays vacíos mantienen la API de updatePity sin romper)

    // brazos (peldaños saludando / agarrando)
    var arms = [];
    [-1, 1].forEach(function (s) {
      var a = new THREE.Group(); a.position.set(s * 0.35, 1.24, 0); torso.add(a);
      var up = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.36, 0.13), new THREE.MeshLambertMaterial({ color: 0x1f1f28 }));
      up.position.y = -0.18; up.castShadow = true; a.add(up);
      var el = new THREE.Group(); el.position.y = -0.36; a.add(el);
      var fo = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.32, 0.12), skinM); fo.position.y = -0.16; el.add(fo);
      var hand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), skinM); hand.position.y = -0.34; el.add(hand);
      arms.push({ g: a, elbow: el, side: s });
    });

    // piernas con cadera + rodilla (para que corra bien, no " Naruto")
    var legs = [];
    [-1, 1].forEach(function (s) {
      var l = new THREE.Group(); l.position.set(s * 0.15, 0.7, 0); hip.add(l);
      var th = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.4, 0.21), new THREE.MeshLambertMaterial({ color: 0x2a2a34 }));
      th.position.y = -0.2; th.castShadow = true; l.add(th);
      var kn = new THREE.Group(); kn.position.y = -0.4; l.add(kn);
      var sh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.34, 0.18), new THREE.MeshLambertMaterial({ color: 0x2a2a34 }));
      sh.position.y = -0.17; sh.castShadow = true; kn.add(sh);
      var ft = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.3), new THREE.MeshLambertMaterial({ color: 0xf0ece0 }));
      ft.position.set(0, -0.36, -0.05); kn.add(ft);
      legs.push({ g: l, knee: kn, side: s });
    });

    // aura de rabia
    var aura = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.15, 20), new THREE.MeshBasicMaterial({ color: 0xff2040, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    aura.rotation.x = -Math.PI / 2; aura.position.y = 0.06; aura.visible = false;
    root.add(aura);

    // estrellitas de aturdido
    var stars = new THREE.Group(); stars.visible = false; stars.position.y = 1.9; root.add(stars);
    for (var s2 = 0; s2 < 4; s2++) {
      var st = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), new THREE.MeshBasicMaterial({ color: 0xffe27a }));
      stars.add(st);
    }

    return { root: root, hip: hip, torso: torso, head: head, arms: arms, legs: legs, eyes: [], mouth: null, aura: aura, stars: stars, skin: skinM };
  }

  var tung = makeTung();
  scene.add(tung.root);
  var pity = makePity();
  scene.add(pity.root);

  /* =========================================================================
     11. ESTADO DE JUEGO
     ========================================================================= */
  var G = {
    mode: 'title',          // title | play | pause | over | caught
    diff: DIFFS.normal,
    t: 0,
    score: 0, tucas: 0, dist: 0,
    playTime: 0,
    speed: CFG.startSpeed,
    energy: 100,
    gap: 30,
    combo: 0, comboT: 0,
    mult: 1,
    lane: 1, x: 0, y: 0, vy: 0,
    state: 'run',            // run | air | slide
    slideT: 0, stumbleT: 0,
    glanceT: 4, glancePh: 0,
    stepT: 0, lastStep: 0,
    starving: false,
    frontZ: CFG.farZ + 40,
    nextGap: 40,
    starterSpawned: true,
    pow: { bat: 0, turbo: 0, magnet: 0, silence: 0 },
    powT: { bat: 0, turbo: 0, magnet: 0, silence: 0 },
    shake: 0,
    hitFlash: 0,
    deathT: 0,
    shoeT: 0,
    shoesTaken: false,
    milestone: 250,
    hits: 0,
    fps: 60, frameAvg: 16
  };

  function reset() {
    G.score = 0; G.tucas = 0; G.dist = 0; G.playTime = 0;
    G.speed = CFG.startSpeed;
    G.energy = 100;
    G.gap = G.diff.gap;
    G.combo = 0; G.comboT = 0; G.mult = 1;
    G.lane = 1; G.x = 0; G.y = 0; G.vy = 0;
    G.state = 'run'; G.slideT = 0; G.stumbleT = 0;
    G.glanceT = 4.5; G.glancePh = 0;
    G.stepT = 0; G.lastStep = 0;
    G.starving = false;
    G.frontZ = CFG.farZ + 70;
    G.nextGap = 42;
    G.starterSpawned = false;
    G.pow.bat = G.pow.turbo = G.pow.magnet = G.pow.silence = 0;
    G.powT.bat = G.powT.turbo = G.powT.magnet = G.powT.silence = 0;
    G.shake = 0; G.hitFlash = 0; G.deathT = 0; G.milestone = 250; G.hits = 0;
    G.shoeT = 0; G.shoesTaken = false;
    G.submitted = false;
    el.hud.style.opacity = '';
    if (stRank) stRank.textContent = '';
    // restaurar zapatillas
    tung.shoes.forEach(function (sh) {
      sh.visible = true;
      sh.position.set(0, -0.19, -0.05);
      sh.rotation.set(0, 0, 0);
      sh.scale.setScalar(1);
    });
    pity.root.position.x = 0;
    pity.root.rotation.set(0, 0, 0);
    obstacles.forEach(function (o) { o.active = false; o.mesh.visible = false; });
    slots.forEach(function (s) { s.active = false; s.pop = 0; });
    powerSlots.forEach(function (p) { p.active = false; p.slot.visible = false; });
    props.forEach(function (p) { refreshProp(p); });
    tung.root.position.set(0, 0, 0);
    tung.root.rotation.set(0, 0, 0);
    tung.root.visible = true;                 // por si quedó apagado en un test
    pity.root.visible = true;
    pity.root.position.set(0, 0, G.gap);
    camera.position.set(0, 4.1, 9.4);
    updateInstances();
  }

  /* =========================================================================
     12. GENERACIÓN DE OLAS
     ========================================================================= */
  var TUC = 0;
  function spawnTucas(lane, z0, n, arc) {
    for (var i = 0; i < n; i++) {
      var s = nextSlot();
      if (!s) return;
      s.active = true;
      s.x = CFG.laneX[lane];
      s.z = z0 - i * 2.3;
      s.y = 0.3 + (arc ? Math.sin(i / Math.max(1, n - 1) * Math.PI) * 1.9 : 0);
      s.pop = 0; TUC++;
    }
  }
  function nextSlot() {
    for (var i = 0; i < slots.length; i++) {
      var idx = (TUC + i) % slots.length;
      if (!slots[idx].active) { TUC = (idx + 1) % slots.length; return slots[idx]; }
    }
    return null;
  }

  function generateWave() {
    var spdN = progress();
    var z = CFG.farZ;           // todo aparece en la línea del horizonte (negativo = lejos)
    var blocked = [false, false, false];
    var pattern, r = Math.random();

    if (r < 0.16) {
      // colectivo: tapa dos carriles, siempre queda uno libre
      pattern = 'bus';
      var left = Math.random() < 0.5;                 // true = tapar carriles 0 y 1
      var bus = spawnObstacle('bus', 1, z);
      if (bus) {
        bus.x = left ? -1.2 : 1.2;
        bus.lane = left ? -1 : 1;
        bus.mesh.position.x = bus.x;
      }
      blocked[left ? 0 : 1] = true; blocked[left ? 1 : 2] = true;
      var freeLane = left ? 2 : 0;
      if (Math.random() < 0.85) spawnTucas(freeLane, z - 6, 5, false);
    } else if (r < 0.32) {
      pattern = 'barrels';
      var lanes = [0, 1, 2].sort(function () { return Math.random() - 0.5; }).slice(0, rndi(1, 2));
      for (var bi = 0; bi < lanes.length; bi++) {
        var o = spawnObstacle('barrel', lanes[bi], z - bi * 5);
        if (o) { o.z = z - bi * 5; o.mesh.position.z = o.z; blocked[lanes[bi]] = true; }
      }
      var free2 = [0, 1, 2].filter(function (l) { return !blocked[l]; })[0];
      if (free2 != null) spawnTucas(free2, z - 3, 5, true);
    } else {
      pattern = 'row';
      var order = [0, 1, 2].sort(function () { return Math.random() - 0.5; });
      var nBlocks = Math.random() < 0.45 ? 1 : 2;
      var jumpable = false;
      for (var ri = 0; ri < nBlocks; ri++) {
        var l = order[ri];
        var kind = ri === 0
          ? pick(['cart', 'bin', 'tent', 'cart', 'tent', 'sleeper'])
          : pick(['barricade', 'banner', 'barrel', 'cart', 'barricade', 'sleeper']);
        if (spawnObstacle(kind, l, z)) {
          blocked[l] = true;
          if (kind === 'barricade' || kind === 'barrel') jumpable = true;
        }
      }
      var free3 = [0, 1, 2].filter(function (l) { return !blocked[l]; });
      if (free3.length) {
        var fl = pick(free3);
        spawnTucas(fl, z - 4, jumpable ? 7 : 6, jumpable);
        // segunda tirada en otro carril libre, más adelante
        var other = free3.filter(function (l) { return l !== fl; });
        if (other.length && Math.random() < 0.6) {
          spawnTucas(pick(other), z - 22, rndi(3, 5), false);
        }
      } else {
        spawnTucas(rndi(0, 2), z - 4, 6, false);
      }
    }

    // power-up ocasional en un carril libre
    if (Math.random() < 0.13) {
      var free4 = [0, 1, 2].filter(function (l) { return !blocked[l]; });
      if (free4.length) spawnPower(pick(['bat', 'bat', 'turbo', 'magnet', 'silence']), CFG.laneX[pick(free4)], z - 10);
    }

    G.nextGap = clamp(48 - spdN * 15 - (pattern === 'bus' ? 7 : 0) + rnd(-4, 6), 26, 54);
  }

  /* =========================================================================
     13. UPDATE
     ========================================================================= */
  var dummy = new THREE.Object3D();
  var HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

  function updateInstances(dt) {
    dt = dt || 0.016;
    var tucaSlot = false;
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i];
      if (!s.active && s.pop <= 0) { tucaMesh.setMatrixAt(i, HIDDEN); pimMesh.setMatrixAt(i, HIDDEN); continue; }
      if (s.active) {
        dummy.position.set(s.x, s.y + Math.sin(G.t * 4 + i) * 0.05, s.z);
        dummy.rotation.set(0, G.t * 3.2 + i, 0.25);
        dummy.scale.setScalar(1);
      } else {
        var k = clamp(s.pop / 0.35, 0, 1);
        dummy.position.set(s.x, s.y + (1 - k) * 1.2, s.z);
        dummy.rotation.set(0, G.t * 12, 0);
        dummy.scale.setScalar(Math.max(0, k * 1.5));
      }
      dummy.updateMatrix();
      tucaMesh.setMatrixAt(i, dummy.matrix);
      pimMesh.setMatrixAt(i, dummy.matrix);
    }
    tucaMesh.instanceMatrix.needsUpdate = true;
    pimMesh.instanceMatrix.needsUpdate = true;

    for (var j = 0; j < sparks.length; j++) {
      var p = sparks[j];
      if (p.life <= 0) { sparkMesh.setMatrixAt(j, HIDDEN); continue; }
      p.life -= dt;
      p.vy -= 22 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.r += 6 * dt;
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.r, p.r * 0.7, 0);
      dummy.scale.setScalar(Math.max(0, p.life * p.s));
      dummy.updateMatrix();
      sparkMesh.setMatrixAt(j, dummy.matrix);
    }
    sparkMesh.instanceMatrix.needsUpdate = true;

    for (var k2 = 0; k2 < debris.length; k2++) {
      var d = debris[k2];
      if (d.life <= 0) { debrisMesh.setMatrixAt(k2, HIDDEN); continue; }
      d.life -= dt;
      d.vy -= 30 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      d.rx += 12 * dt;
      if (d.y < 0.1) { d.y = 0.1; d.vy *= -0.35; d.vx *= 0.7; d.vz *= 0.7; }
      dummy.position.set(d.x, d.y, d.z);
      dummy.rotation.set(d.rx, d.rx * 0.5, d.rx * 0.3);
      dummy.scale.setScalar(clamp(d.life * 1.6, 0, 1));
      dummy.updateMatrix();
      debrisMesh.setMatrixAt(k2, dummy.matrix);
    }
    debrisMesh.instanceMatrix.needsUpdate = true;
  }

  function smashAt(x, z, big) {
    burst(x, 1.0, z, big ? 16 : 9, 'wood', big ? 7 : 4.5);
    for (var i = 0; i < (big ? 12 : 7); i++) {
      var d = debris[debrisCur = (debrisCur + 1) % DEBRIS];
      d.life = rnd(0.7, 1.3); d.x = x + rnd(-0.4, 0.4); d.y = rnd(0.6, 1.4); d.z = z + rnd(-0.3, 0.3);
      d.vx = rnd(-6, 6) * (big ? 1.5 : 1); d.vy = rnd(3, 8); d.vz = rnd(-3, 6);
      d.rx = rnd(0, TAU);
    }
    Snd.smash();
    G.shake = Math.max(G.shake, big ? 0.55 : 0.3);
  }

  function collectTuca(s, i) {
    s.active = false; s.pop = 0.35;
    G.tucas++;
    G.combo++; G.comboT = 2.2;
    G.energy = clamp(G.energy + 7, 0, 100);
    G.gap = clamp(G.gap + 0.5, 0, 52);
    G.score += 15 * G.mult;
    burst(s.x, s.y, s.z, 3, 'tuca', 2);
    Snd.tuca(G.combo);
    if (G.combo > 0 && G.combo % 25 === 0) {
      G.mult = Math.min(G.mult + 0.5, 4);
      G.score += 150;
      toast('¡x' + G.combo + ' CIGARRILLOS SEGUIDOS!  multiplicador x' + G.mult.toFixed(1), 'good');
    }
  }

  function grantPower(kind) {
    G.pow[kind] = 1; G.powT[kind] = POWERS[kind].time;
    if (kind === 'bat') { toast('¡MURCIÉLAGO! ROMPE TODO', 'good'); }
    if (kind === 'turbo') { G.energy = 100; G.gap = clamp(G.gap + 16, 0, 52); toast('¡TURBO! L AUTI SE QUEDA ATRÁS', 'good'); }
    if (kind === 'magnet') toast('¡IMÁN! LOS CIGARRILLOS VIENEN A TI', 'good');
    if (kind === 'silence') { G.gap = clamp(G.gap + 20, 0, 52); toast('¡SILENCIO! LAUTI SE QUEDA MUDO', 'good'); }
    Snd.power();
  }

  function toast(txt, cls) {
    var box = document.getElementById('toast');
    var d = document.createElement('div');
    d.className = 'toastItem ' + (cls || '');
    d.textContent = txt;
    box.appendChild(d);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 1100);
  }

  function updatePlayer(dt) {
    // carriles
    if (G.stumbleT > 0) {
      G.stumbleT -= dt;
    } else {
      var tx = CFG.laneX[G.lane];
      var d = tx - G.x;
      var mv = clamp(d, -CFG.laneSpeed * dt, CFG.laneSpeed * dt);
      G.x += mv;
    }
    // vertical
    if (G.state === 'slide') {
      G.slideT -= dt;
      G.y = damp(G.y, 0, 18, dt);
      if (G.slideT <= 0) G.state = 'run';
    } else if (G.y > 0 || G.vy > 0) {
      G.vy += CFG.gravity * dt;
      G.y += G.vy * dt;
      if (G.y <= 0) {
        G.y = 0; G.vy = 0; G.state = 'run';
        Snd.land();
        G.shake = Math.max(G.shake, 0.14);
      } else G.state = 'air';
    }

    // animación
    var spd = G.speed / 13;
    G.stepT += dt * spd * 2.4;
    var run = G.stepT;

    if (G.state === 'air') {
      var k = clamp(G.vy / CFG.jumpV, -1, 1);
      tung.tilt.rotation.x = lerp(tung.tilt.rotation.x, -0.16 - k * 0.18, 0.2);
      tung.body.position.y = damp(tung.body.position.y, 0.06, 12, dt);
      // brazos arriba, codos doblados
      tung.armL.rotation.x = lerp(tung.armL.rotation.x, -1.5, 0.25);
      tung.armR.rotation.x = lerp(tung.armR.rotation.x, -1.2, 0.25);
      tung.elbowL.rotation.x = lerp(tung.elbowL.rotation.x, -0.8, 0.25);
      tung.elbowR.rotation.x = lerp(tung.elbowR.rotation.x, -0.5, 0.25);
      tung.armL.rotation.z = lerp(tung.armL.rotation.z, 0.5, 0.2);
      tung.armR.rotation.z = lerp(tung.armR.rotation.z, -0.35, 0.2);
      tung.feet[0].rotation.x = lerp(tung.feet[0].rotation.x, -0.9, 0.2);
      tung.feet[1].rotation.x = lerp(tung.feet[1].rotation.x, -0.5, 0.2);
      tung.tilt.rotation.z = Math.sin(run * 3) * 0.06;
      var open = clamp(-G.vy / 8, 0, 1);
      tung.mouthGrp.scale.y = lerp(tung.mouthGrp.scale.y, 1 + open * 0.7, 0.25);
    } else if (G.state === 'slide') {
      var sk = clamp(G.slideT / CFG.slideTime, 0, 1);
      tung.tilt.rotation.x = lerp(tung.tilt.rotation.x, -1.15, 0.3);
      tung.body.position.y = damp(tung.body.position.y, 0.42 + sk * 0.1, 20, dt);
      // brazos atrás, como en un slide de béisbol
      tung.armL.rotation.x = lerp(tung.armL.rotation.x, 1.3, 0.25);
      tung.armR.rotation.x = lerp(tung.armR.rotation.x, 1.0, 0.25);
      tung.elbowL.rotation.x = lerp(tung.elbowL.rotation.x, -0.35, 0.25);
      tung.elbowR.rotation.x = lerp(tung.elbowR.rotation.x, -0.3, 0.25);
      tung.armL.rotation.z = lerp(tung.armL.rotation.z, -0.3, 0.2);
      tung.armR.rotation.z = lerp(tung.armR.rotation.z, 0.3, 0.2);
      tung.feet[0].rotation.x = lerp(tung.feet[0].rotation.x, -1.2, 0.25);
      tung.feet[1].rotation.x = lerp(tung.feet[1].rotation.x, -1.0, 0.25);
      tung.mouthGrp.scale.y = lerp(tung.mouthGrp.scale.y, 1.3, 0.2);
      tung.tilt.rotation.z = Math.sin(run * 6) * 0.03;
    } else {
      var bob = Math.abs(Math.sin(run * Math.PI)) * 0.07;
      tung.tilt.rotation.x = lerp(tung.tilt.rotation.x, 0.12 + spd * 0.06, 0.2);
      tung.body.position.y = damp(tung.body.position.y, bob, 22, dt);
      var sw = Math.sin(run * TAU);
      // carrera: brazos al ritmo, codosnaturales
      tung.armL.rotation.x = lerp(tung.armL.rotation.x, sw * 0.85, 0.3);
      tung.armR.rotation.x = lerp(tung.armR.rotation.x, -sw * 0.5 - 0.25, 0.3);
      tung.elbowL.rotation.x = lerp(tung.elbowL.rotation.x, -0.75 - Math.max(0, -sw) * 0.4, 0.3);
      tung.elbowR.rotation.x = lerp(tung.elbowR.rotation.x, -0.95, 0.3);
      tung.armL.rotation.z = lerp(tung.armL.rotation.z, 0.34, 0.2);
      tung.armR.rotation.z = lerp(tung.armR.rotation.z, -0.3, 0.2);
      tung.feet[0].rotation.x = lerp(tung.feet[0].rotation.x, -sw * 0.9, 0.35);
      tung.feet[1].rotation.x = lerp(tung.feet[1].rotation.x, sw * 0.9, 0.35);
      tung.mouthGrp.scale.y = lerp(tung.mouthGrp.scale.y, 1 + Math.abs(sw) * 0.28, 0.2);
      tung.tilt.rotation.z = Math.sin(run * TAU) * 0.05;
      // patitas: sonido
      var sIdx = Math.floor(run * 2);
      if (sIdx !== G.lastStep && G.y <= 0.001) {
        G.lastStep = sIdx;
        Snd.step();
        if (Math.random() < 0.18) Snd.tung(0.16);
      }
    }

    if (G.stumbleT > 0) {
      tung.tilt.rotation.z = lerp(tung.tilt.rotation.z, Math.sin(G.t * 40) * 0.35, 0.4);
    } else {
      var lean = clamp((CFG.laneX[G.lane] - G.x) * -0.16, -0.4, 0.4);
      tung.tilt.rotation.z = lerp(tung.tilt.rotation.z, lean, 0.2);
    }

    // mirar atrás de vez en cuando (solo jugando)
    if (G.deathT > 0) { G.glanceT = 9; G.glancePh = 0; }
    if (G.glanceT > 0) {
      G.glanceT -= dt;
      if (G.glanceT <= 0) { G.glancePh = 1; G.glanceT = rnd(5, 9); }
    }
    if (G.glancePh > 0) {
      G.glancePh -= dt;
      if (G.glancePh <= 0.4) tung.root.rotation.y = damp(tung.root.rotation.y, 0, 8, dt);
      else if (G.glancePh <= 1.0) tung.root.rotation.y = damp(tung.root.rotation.y, Math.PI * 0.85, 14, dt);
      else tung.root.rotation.y = damp(tung.root.rotation.y, Math.PI * 0.85, 6, dt);
    }

    // transformations de poder
    var scaleBat = G.pow.bat ? 1.08 : 1;
    tung.root.scale.setScalar(damp(tung.root.scale.x, scaleBat, 8, dt));
    tung.eyes.forEach(function (e) { e.p.material = tungEyeMat; });
    // durante la muerte la cámara maneja su posición aparte
    if (G.deathT <= 0) tung.root.position.set(G.x, G.y, 0);
    if (G.pow.magnet && G.deathT <= 0) {
      // pequeñas chispas de atracción
      if (Math.random() < 0.3) burst(G.x, 0.5 + Math.random() * 0.6, 0, 1, 'tuca', 1.5);
    }
  }

  var tungEyeMat = new THREE.MeshLambertMaterial({ color: 0x141018 });

  function updatePity(dt) {
    if (G.deathT <= 0) pity.root.position.z = damp(pity.root.position.z, G.gap, 6, dt);
    var rabbit = G.starving && G.pow.silence <= 0;
    var stun = G.pow.silence > 0;
    var cycle = G.t * (rabbit ? 13 : 9.5);

    // piernas: ciclo de carrera real (rodilla flexiona hacia atrás)
    pity.legs.forEach(function (l) {
      var ph = l.side > 0 ? 0 : Math.PI;
      var amp = stun ? 0.12 : (rabbit ? 1.05 : 0.85);
      // muslo: adelante-atrás
      l.g.rotation.x = Math.sin(cycle + ph) * amp;
      // rodilla: solo flexiona cuando la pierna va atrás (nunca hacia adelante)
      var back = Math.max(0, -Math.sin(cycle + ph));
      l.knee.rotation.x = -back * 1.5 * amp;
    });
    // cadera sube-baja y rota levemente
    pity.hip.position.y = Math.abs(Math.sin(cycle)) * 0.06;
    pity.hip.rotation.z = Math.sin(cycle) * 0.05;
    pity.torso.rotation.y = Math.sin(cycle * 0.5) * 0.16;

    if (stun) {
      pity.torso.rotation.z = Math.sin(G.t * 6) * 0.22;
      pity.head.rotation.y = Math.sin(G.t * 9) * 0.5;
      pity.head.rotation.z = Math.sin(G.t * 5) * 0.3;
      pity.arms.forEach(function (a) {
        a.g.rotation.x = lerp(a.g.rotation.x, -0.4, 0.15);
        a.g.rotation.z = lerp(a.g.rotation.z, a.side * 1.1, 0.15);
        a.elbow.rotation.x = lerp(a.elbow.rotation.x, -0.6, 0.15);
      });
      pity.stars.visible = true;
      pity.stars.children.forEach(function (s, i) {
        var a = G.t * 3 + i * (TAU / 4);
        s.position.set(Math.cos(a) * 0.34, Math.sin(a * 1.7) * 0.1, Math.sin(a) * 0.34);
        s.rotation.set(a, a, 0);
      });
    } else if (G.deathT > 0) {
      // DI LOLLO te atrapa, se agacha y te saca las zapatillas.
      // Se gira de frente a la cámara para que se le vea la cara de cerca.
      var d = G.deathT;
      // gira hacia la cámara (de 0 a ~PI es mirando al -Z; la cámara está en +Z)
      pity.root.rotation.y = damp(pity.root.rotation.y, Math.PI, 3.5, dt);
      pity.root.position.x = damp(pity.root.position.x, 0.6, 3, dt);
      pity.root.position.z = damp(pity.root.position.z, 1.32, 3.2, dt);

      // se agacha a lo largo del tiempo
      var crouch = clamp((d - 0.35) / 0.8, 0, 1);
      pity.torso.rotation.x = lerp(pity.torso.rotation.x, 0.5 * crouch, 0.08);
      pity.hip.position.y = lerp(pity.hip.position.y, -0.22 * crouch, 0.08);
      pity.head.rotation.x = lerp(pity.head.rotation.x, 0.1 * crouch, 0.08);   // apenas baja la mirada

      // agarra las zapatillas (brazos bajados, hacia Tung)
      var grab = clamp((d - 0.7) / 0.7, 0, 1);
      pity.arms.forEach(function (a) {
        a.g.rotation.x = lerp(a.g.rotation.x, -0.35 - grab * 0.25, 0.1);
        a.g.rotation.z = lerp(a.g.rotation.z, a.side * (0.3 - grab * 0.12), 0.1);
        a.elbow.rotation.x = lerp(a.elbow.rotation.x, -0.55 - grab * 0.3, 0.1);
      });
      pity.stars.visible = false;

      // sacude un poco la cabeza mientras se agacha (más vida)
      pity.head.rotation.z = Math.sin(d * 11) * 0.09 * crouch;

      // las zapatillas salen volando hacia las manos de Di Lollo
      G.shoeT += dt;
      if (G.shoeT > 1.25 && !G.shoesTaken) {
        G.shoesTaken = true;
        Snd.shoes();
        toast('¡TE SACÓ LAS ZAPATILLAS!', 'bad');
      }
      if (G.shoesTaken) {
        for (var si = 0; si < tung.shoes.length; si++) {
          var sh = tung.shoes[si];
          var k = clamp((G.shoeT - 1.25 - si * 0.22) / 0.55, 0, 1);
          // van a parar cerca de las manos, en espacio local de Di Lollo
          var tgt = pity.arms[si].g.position;
          sh.position.set(
            lerp(sh.userData.x0, tgt.x + (si ? 0.2 : -0.2), k),
            lerp(-0.19, tgt.y - 0.55, k),
            lerp(-0.05, tgt.z - 0.2 + 1.35, k));
          sh.rotation.set(k * 3.4, k * 5.1, k * 2.2);
        }
      }

      // al final se levanta y mira a la cámara (el guiño a Di Lollo)
      if (d > 2.3) {
        var rise = clamp((d - 2.3) / 0.9, 0, 1);
        pity.torso.rotation.x = lerp(pity.torso.rotation.x, 0, 0.06);
        pity.hip.position.y = lerp(pity.hip.position.y, 0, 0.06);
        pity.head.rotation.x = lerp(pity.head.rotation.x, -0.1 * rise, 0.06);
        pity.head.rotation.y = Math.sin(G.t * 5) * 0.22 * rise;
      }
    } else if (rabbit) {
      // modo rabia: dance del diablo
      pity.arms.forEach(function (a, i) {
        var ph = i ? 0 : Math.PI;
        a.g.rotation.x = Math.sin(cycle * 1.1 + ph) * 1.5 - 0.5;
        a.g.rotation.z = a.side * (0.6 + Math.sin(cycle + ph) * 0.4);
        a.elbow.rotation.x = -0.9 + Math.sin(cycle * 1.4 + ph) * 0.6;
      });
      pity.head.rotation.y = Math.sin(G.t * 8) * 0.4;
      pity.head.rotation.z = Math.sin(G.t * 10) * 0.15;
      pity.torso.rotation.z = Math.sin(G.t * 10) * 0.14;
      pity.stars.visible = false;
    } else {
      // chase normal
      pity.arms.forEach(function (a, i) {
        var ph = i ? 0 : Math.PI;
        a.g.rotation.x = Math.sin(cycle + ph) * 1.15 - 0.35;
        a.g.rotation.z = a.side * 0.28;
        a.elbow.rotation.x = -0.75 - Math.max(0, Math.sin(cycle + ph)) * 0.5;
      });
      pity.head.rotation.y = Math.sin(G.t * 4) * 0.16;
      pity.head.rotation.z = 0;
      pity.stars.visible = false;
    }

    pity.aura.visible = rabbit;
    if (rabbit) {
      pity.aura.scale.setScalar(1 + Math.sin(G.t * 7) * 0.12);
      pity.aura.material.opacity = 0.35 + Math.sin(G.t * 9) * 0.18;
    }
  }

  function updateWorld(dt) {
    // desplazar la textura hacia la cámara (offset creciente = mundo avanzando)
    roadTex.offset.y += (G.speed * dt) / CFG.dashWorld;
    walkTex.offset.y += (G.speed * dt) / 6;

    // edificios (reciclado con el espaciado correcto por fila)
    for (var i = 0; i < buildings.length; i++) {
      var b = buildings[i];
      b.position.z += G.speed * dt;
      if (b.position.z > CFG.killZ + 20) {
        b.position.z -= b.userData.span;
        b.rotation.y = (b.position.x > 0 ? Math.PI : 0) + rnd(-0.06, 0.06);
      }
    }
    // props
    for (var j = 0; j < props.length; j++) {
      var p = props[j];
      p.z += G.speed * dt;
      if (p.z > CFG.killZ + 6) {
        p.z -= 8 * 40;
        refreshProp(p);
      }
    }
    // cables y banderines
    for (var k = 0; k < buntings.length; k++) {
      var bu = buntings[k];
      bu.z += G.speed * dt;
      bu.g.position.z = bu.z;
      if (bu.z > 20) { bu.z -= 9 * 34; }
      bu.g.rotation.z = Math.sin(G.t * 1.5 + k) * 0.02;
    }
    for (var cb = 0; cb < cables.length; cb++) {
      var cg = cables[cb];
      cg.z += G.speed * dt;
      cg.g.position.z = cg.z;
      if (cg.z > 20) cg.z -= 18 * 17;
    }
    updatePedestrians(dt);
    skyline.rotation.y += dt * 0.006;
    sky.position.set(camera.position.x, 0, camera.position.z);
  }

  function updateObstacles(dt) {
    var dz = G.speed * dt;
    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      if (!o.active) continue;
      // los "zZz" del durmiente flotan y se desvanecen
      if (o.u.zzz) {
        for (var zi = 0; zi < o.u.zzz.children.length; zi++) {
          var zsp = o.u.zzz.children[zi];
          var ph = (G.t * 0.5 + zi * 0.33) % 1;
          zsp.position.y = 0.92 + ph * 0.55;
          zsp.position.x = Math.sin(ph * 3) * 0.08 + zi * 0.13;
          zsp.material.opacity = 0.95 * (1 - ph) * (1 - ph);
          zsp.visible = zsp.material.opacity > 0.05;
        }
      }
      var mul = o.u.rolling ? 1.5 : 1;
      o.z += dz * mul;
      o.mesh.position.z = o.z;
      if (o.u.rolling) { o.spin += dt * 9; o.mesh.rotation.x = o.spin; }
      if (o.z > CFG.killZ) { o.active = false; o.mesh.visible = false; continue; }

      // colisión
      var dz2 = Math.abs(o.z - 0);
      if (dz2 < o.u.zHalf + 0.55) {
        var px = G.x, py = G.y;
        var pHalfW = 0.36, pH = G.state === 'slide' ? 0.72 : 1.62;
        var xOverlap = Math.abs(o.x - px) < o.u.w / 2 + pHalfW;
        var yOverlap = o.u.yMin != null
          ? (pH > o.u.yMin)
          : (py < o.u.h);
        if (xOverlap && yOverlap && !o.hit) {
          if (G.pow.bat && !o.u.noSmash) {
            o.hit = true;
            smashAt(o.x, o.z, true);
            G.score += 150 * G.mult;
            toast('¡A LA BATUTA!', 'good');
          } else if (!o.u.noSmash) {
            o.hit = true;
            smashAt(o.x, o.z, false);
            hitPlayer();
          } else {
            hitPlayer(true);
          }
        }
      }
      // casi-esquive
      if (!o.near && !o.hit && Math.abs(o.z - 2.5) < 0.5) {
        var dx = Math.abs(o.x - G.x);
        if (dx < o.u.w / 2 + 0.95 && dx > o.u.w / 2 + 0.3) {
          o.near = true;
          G.score += 60 * G.mult;
          toast('¡POR POCO!', 'good');
        }
      }
    }
  }

  function updatePickups(dt) {
    var magnet = G.pow.magnet > 0;
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i];
      if (!s.active) { if (s.pop > 0) s.pop -= dt; continue; }
      s.z += G.speed * dt;
      if (s.z > CFG.killZ + 6) { s.active = false; continue; }
      if (magnet) {
        var ddx = G.x - s.x, ddz = (0) - s.z, dd = Math.sqrt(ddx * ddx + ddz * ddz);
        if (dd < 9) {
          var pull = Math.min(1, 12 * dt / Math.max(0.6, dd));
          s.x += ddx * pull;
          s.z += ddz * pull;
          s.y = lerp(s.y, 0.7, pull * 0.5);
        }
      }
      // collection: caja generosa en X y Z, tolerante en Y (sirve para arcos en el salto)
      var dz3 = Math.abs(s.z), dx3 = Math.abs(s.x - G.x);
      if (dz3 < 1.05 && dx3 < 1.0) {
        var dy3 = Math.abs(s.y - (G.y + 0.7));
        if (dy3 < 1.15 || G.state === 'air' && dy3 < 2.1) collectTuca(s, i);
      }
    }
    for (var j = 0; j < powerSlots.length; j++) {
      var p = powerSlots[j];
      if (!p.active) continue;
      p.z += G.speed * dt;
      p.slot.position.set(p.x, p.y + Math.sin(G.t * 3) * 0.12, p.z);
      p.slot.rotation.y += dt * 1.6;
      if (p.z > CFG.killZ + 6) { p.active = false; p.slot.visible = false; continue; }
      if (Math.abs(p.z - 0) < 1.2 && Math.abs(p.x - G.x) < 1.0 && Math.abs(p.y - (G.y + 0.8)) < 1.4) {
        p.active = false; p.slot.visible = false;
        grantPower(p.kind);
      }
    }
  }

  function hitPlayer(heavy) {
    if (G.deathT > 0) return;
    G.hits++;
    G.stumbleT = heavy ? 0.85 : 0.55;
    G.energy = clamp(G.energy - (heavy ? 20 : 13), 0, 100);
    G.gap = clamp(G.gap - (heavy ? 8 : 5.5), 0, 52);
    G.speed *= heavy ? 0.42 : 0.58;
    G.shake = 1;
    G.hitFlash = 1;
    G.combo = 0;
    toast(heavy ? '¡CHOCASTE CON EL COLECTIVO!' : '¡AUCH!', 'bad');
    Snd.hit();
  }

  function updateChase(dt) {
    var spdN = progress();
    // energía
    var drain = (1.9 + G.speed * 0.115) * G.diff.drain;
    G.energy = clamp(G.energy - drain * dt, 0, 100);
    if (G.energy <= 0) G.starving = true;
    if (G.energy > 26) G.starving = false;

    // powers
    ['bat', 'turbo', 'magnet', 'silence'].forEach(function (k) {
      if (G.powT[k] > 0) {
        G.powT[k] -= dt;
        if (G.powT[k] <= 0) { G.powT[k] = 0; G.pow[k] = 0; }
      }
    });

    // velocidad: sube con los metros recorridos
    var base = CFG.startSpeed + spdN * (CFG.maxSpeed - CFG.startSpeed);
    var target = base * (G.pow.turbo ? 1.42 : 1);
    if (G.stumbleT > 0) target *= 0.6;
    G.speed = damp(G.speed, target, 1.6, dt);

    /* ---- la persecución: DI LOLLO SIEMPRE avanza, fumar es lo que lo frena ---- */
    var closeRate = (0.9 + spdN * 1.6) * (G.starving ? 2.7 : 1);
    if (G.pow.silence) closeRate *= 0.12;          // el poder lo deja mudo
    else if (G.diff.pity > 1) closeRate *= 1.5;    // dificultad MALVADO
    G.gap -= closeRate * dt;
    if (G.energy > 45 && G.pow.silence <= 0) G.gap += 0.5 * dt;   // con el estómago lleno aguantas
    G.gap = clamp(G.gap, 0, 52);

    // pista de cigarrillos inicial (una sola vez, al empezar la partida)
    if (!G.starterSpawned) { G.starterSpawned = true; spawnTucas(1, -34, 8, false); }

    // tiempo jugado (se manda al ranking online para validar el puntaje)
    G.playTime += dt;

    // puntuación por distancia
    G.dist += G.speed * dt * 0.55;
    G.score += G.speed * dt * 0.35 * G.mult;
    if (G.dist > G.milestone) {
      G.milestone += 250;
      toast('¡' + Math.floor(G.milestone - 250) + ' m! SIGUE ASÍ', '');
      Snd.power();
    }

    if (G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) { G.combo = 0; G.mult = 1; } }

    if (G.gap <= 3.2) caught();
  }

  function caught() {
    if (G.deathT > 0) return;
    G.mode = 'caught';
    G.deathT = 0.0001;
    G.shoeT = 0;          // progreso del robo de zapatillas
    G.shoesTaken = false;
    //tapamos el HUD para que no estorbe la escena
    el.hud.style.opacity = '0';
    Snd.caught();
    Snd.setIntensity(0);
  }

  function doActions() {
    // carriles
    if (G.stumbleT > 0) return;
    if (action.lane !== 0) {
      var nl = clamp(G.lane + action.lane, 0, 2);
      if (nl !== G.lane) { G.lane = nl; Snd.whoosh(); }
    }
    if (action.jump && G.state !== 'slide') {
      if (G.y <= 0.001 && G.stumbleT <= 0) {
        G.vy = CFG.jumpV; G.y = 0.01; G.state = 'air';
        Snd.jump();
        Snd.maybeFart();   // 30% de chance al saltar
        action.jump = false;
      }
    }
    if (action.slide) {
      if (G.y <= 0.001) {
        G.state = 'slide'; G.slideT = CFG.slideTime;
        Snd.whoosh();
      }
      action.slide = false;
    }
    action.lane = 0; action.jump = false;
  }

  var action = { lane: 0, jump: false, slide: false };

  /* =========================================================================
     14. FASE DE AMBIENTE
     ========================================================================= */
  var phaseIdx = 1, phaseCur = 1;
  var colTop = new THREE.Color(PHASES[1].top), colBot = new THREE.Color(PHASES[1].bot);
  var tmpA = new THREE.Color(), tmpB = new THREE.Color();
  var tmpV = new THREE.Vector3();
  function updatePhase(dt) {
    var want = Math.floor(G.dist / 700) % PHASES.length;
    var P = PHASES[want];
    var l = 1 - Math.exp(-1.4 * dt);
    colTop.lerp(tmpA.setHex(P.top), l);
    colBot.lerp(tmpB.setHex(P.bot), l);
    skyMat.uniforms.top.value.copy(colTop);
    skyMat.uniforms.bot.value.copy(colBot);
    skyMat.uniforms.sunCol.value.lerp(tmpB.setHex(P.sun), l);
    skyMat.uniforms.sunI.value = lerp(skyMat.uniforms.sunI.value, P.sunI, l);
    skyMat.uniforms.sunDir.value.lerp(tmpV.set(P.sunDir[0], P.sunDir[1], P.sunDir[2]).normalize(), l);
    scene.fog.color.lerp(tmpA.setHex(P.fog), l);
    hemi.color.lerp(tmpA.setHex(P.hemiS), l);
    hemi.groundColor.lerp(tmpA.setHex(P.hemiG), l);
    amb.intensity = lerp(amb.intensity, P.amb, l);
    sun.color.lerp(tmpA.setHex(P.light), l);
    sun.intensity = lerp(sun.intensity, P.lI, l);
    var sd = skyMat.uniforms.sunDir.value;
    sun.position.set(sd.x * 18, Math.max(6, sd.y * 22), sd.z * 14 + 12);
    lampGlowMat.emissiveIntensity = lerp(lampGlowMat.emissiveIntensity, 0.15 + P.lamps * 1.9, l);
    signMats.forEach(function (m) { m.emissiveIntensity = lerp(m.emissiveIntensity, 0.2 + P.lamps * 1.1, l); });
  }

  /* =========================================================================
     15. HUD
     ========================================================================= */
  var el = {
    score: document.getElementById('score'), tucas: document.getElementById('tucas'),
    dist: document.getElementById('dist'), mult: document.getElementById('multTxt'),
    gapFill: document.getElementById('gapFill'), pityIco: document.getElementById('pityIco'),
    gapM: document.getElementById('gapMeters'), gapState: document.getElementById('gapState'),
    energyFill: document.getElementById('energyFill'), energyBar: document.getElementById('energyBar'),
    warn: document.getElementById('warn'), powerups: document.getElementById('powerups'),
    hud: document.getElementById('hud'), mirror: document.getElementById('mirrorFrame'),
    gapBar: document.getElementById('gapBar')
  };
  var chipEls = {};
  Object.keys(POWERS).forEach(function (k) {
    var d = document.createElement('div');
    d.className = 'chip ' + k;
    d.innerHTML = '<div class="ring"><span class="t">' + POWERS[k].icon + '</span></div>' +
      '<div class="bar"><i></i></div>';
    d.style.display = 'none';
    el.powerups.appendChild(d);
    chipEls[k] = d;
  });

  function fmt(n) { return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

  function updateHUD() {
    el.score.textContent = fmt(G.score);
    el.tucas.textContent = fmt(G.tucas);
    el.dist.textContent = fmt(G.dist);
    el.mult.textContent = 'x' + G.mult.toFixed(1);
    el.mult.style.color = G.mult > 1 ? '#c8ff7a' : '#ffd9a0';

    var gapPct = clamp(G.gap / 52, 0, 1);
    el.gapFill.style.width = (gapPct * 100) + '%';
    el.pityIco.style.left = (2 + gapPct * 84) + 'px';
    el.gapM.textContent = Math.max(0, G.gap).toFixed(0) + ' m';
    el.gapState.textContent = G.pow.silence ? 'DI LOLLO ESTÁ CALLADO'
      : G.starving ? '¡TE ALCANZA!' : G.gap < 14 ? 'TE PISA LOS TALONES' : 'TODO BIEN';
    el.gapState.style.color = G.starving ? '#ff6b6b' : G.gap < 14 ? '#ffc7a0' : '#9c93b5';
    el.energyFill.style.width = G.energy + '%';
    el.energyBar.className = G.energy < 30 ? 'low' : '';
    el.warn.className = (G.starving && G.pow.silence <= 0) ? 'on' : '';

    Object.keys(POWERS).forEach(function (k) {
      var c = chipEls[k];
      if (G.powT[k] > 0) {
        c.style.display = 'flex';
        c.querySelector('i').style.width = (G.powT[k] / POWERS[k].time * 100) + '%';
      } else c.style.display = 'none';
    });
  }

  /* =========================================================================
     16. PANTALLAS / FLUJO
     ========================================================================= */
  var screens = {
    title: document.getElementById('scTitle'),
    pause: document.getElementById('scPause'),
    over: document.getElementById('scOver'),
    board: document.getElementById('scBoard')
  };
  function show(name) {
    Object.keys(screens).forEach(function (k) { screens[k].className = 'screen' + (k === name ? ' on' : ''); });
    // el HUD solo se ve mientras se juega o en pausa
    var playing = (name === null || name === 'pause');
    el.hud.className = 'layer' + (playing ? ' on' : '');
    el.hud.style.opacity = playing ? '' : '0';
  }

  // selección de dificultad
  var diffSel = 'normal';
  var diffBox = document.getElementById('diffs');
  Object.keys(DIFFS).forEach(function (k) {
    var d = document.createElement('div');
    d.className = 'diff' + (k === 'normal' ? ' sel' : '');
    d.innerHTML = '<b>' + DIFFS[k].name + '</b><span>' + DIFFS[k].label + '</span>';
    d.onclick = function () {
      diffSel = k;
      [].forEach.call(diffBox.children, function (c) { c.className = 'diff'; });
      d.className = 'diff sel';
      Snd.click();
    };
    diffBox.appendChild(d);
  });

  function startGame() {
    Snd.init(); Snd.resume(); Snd.click(); Snd.initMusic(); Snd.initFart(); Snd.initChase();
    G.diff = DIFFS[diffSel];
    reset();
    G.mode = 'play';
    show(null);
    Snd.setTempo(92);
    if (isTouch) document.getElementById('touch').className = 'on';
    toast('¡CORRÉ Y FUMÁ!', 'good');
  }

  function pauseGame() {
    if (G.mode !== 'play') return;
    G.mode = 'pause';
    show('pause');
    Snd.setIntensity(0);
    if (Snd.musicOn()) Snd.pause();
  }
  function resumeGame() {
    if (G.mode !== 'pause') return;
    G.mode = 'play';
    show(null);
    Snd.unpause();
  }
  function quitToMenu() {
    G.mode = 'title';
    reset();
    show('title');
    Snd.setIntensity(0);
  }

  function endGame() {
    G.mode = 'over';
    var best = +(localStorage.getItem('dilollorunner.best') || 0);
    var sc = Math.floor(G.score);
    if (sc > best) { best = sc; localStorage.setItem('dilollorunner.best', best); }
    document.getElementById('stScore').textContent = fmt(sc);
    document.getElementById('stDist').textContent = fmt(G.dist);
    document.getElementById('stTucas').textContent = fmt(G.tucas);
    document.getElementById('stBest').textContent = 'RÉCORD: ' + fmt(best);
    var t = document.getElementById('goTitle');
    if (G.gap <= 3.2) {
      t.className = '';
      t.textContent = '¡DI LOLLO TE ATRAPÓ!';
      document.getElementById('goMsg').textContent = G.starving
        ? 'Te quedaste sin Coco y Lauti te hizo su dance. Fumá más la próxima.'
        : 'El Cara Larga te llegó por la espalda y se quedó con tus zapatillas.';
    } else {
      t.className = 'win';
      t.textContent = '¡TE ESCAPASTE POR POCO!';
      document.getElementById('goMsg').textContent = 'Pero igual te sacó las zapatillas antes de que te liberes. Corré más, Tung Tung.';
    }
    show('over');
    el.hud.style.opacity = '';
    Snd.setIntensity(0);

    // mandar el puntaje al ranking (online si está configurado, local si no)
    if (!G.submitted && sc > 0) {
      G.submitted = true;
      sendScore(sc);
    }
  }

  var stRank = document.getElementById('stRank');
  function sendScore(sc) {
    if (typeof LB === 'undefined') return;
    LB.submit(sc, G.dist, G.tucas, G.playTime, G.diff ? G.diff.id : 'normal').then(function (r) {
      var lvl = DIFFS[r.difficulty || 'normal'] ? DIFFS[r.difficulty || 'normal'].name : 'NORMAL';
      if (r.online && r.rank) {
        stRank.textContent = 'EN LA TABLA ' + lvl + ': #' + r.rank;
        toast('PUNTAJE GUARDADO — #' + r.rank, 'good');
      } else if (r.rank) {
        stRank.textContent = 'RÉCORD LOCAL ' + lvl;
      } else {
        stRank.textContent = '';
        if (r.error) console.info('[ranking] no se pudo guardar online:', r.error);
      }
    }).catch(function () { stRank.textContent = ''; });
  }

  document.getElementById('btnPlay').onclick = startGame;
  document.getElementById('btnRetry').onclick = startGame;
  document.getElementById('btnResume').onclick = function () { Snd.click(); resumeGame(); };
  document.getElementById('btnQuit').onclick = function () { Snd.click(); quitToMenu(); };
  document.getElementById('btnMenu').onclick = function () { Snd.click(); quitToMenu(); };
  document.getElementById('btnPause').onclick = function () { G.mode === 'play' ? pauseGame() : resumeGame(); };

  /* ---------------- ranking ---------------- */
  // sincroniza los dos campos de nombre (menú y ranking)
  function setNameEverywhere(v) {
    if (typeof LB !== 'undefined') LB.setPlayerName(v);
    ['nameMain', 'nameInput'].forEach(function (id) {
      var elx = document.getElementById(id);
      if (elx && elx.value !== v) elx.value = v;
    });
  }
  function bindNameInput(id) {
    var inp = document.getElementById(id);
    if (!inp) return;
    inp.addEventListener('input', function () {
      var v = this.value;
      if (typeof LB !== 'undefined') LB.setPlayerName(v);
      var other = document.getElementById(id === 'nameMain' ? 'nameInput' : 'nameMain');
      if (other && other.value !== v) other.value = v;
      updateNameHint();
    });
    inp.addEventListener('focus', function () { this.select(); });
  }
  function updateNameHint() {
    var h = document.getElementById('nameHint');
    if (!h || typeof LB === 'undefined') return;
    var n = LB.playerName();
    h.textContent = (n && n !== 'Jugador') ? 'queda guardado en este navegador' : 'sin nombre, vas a figurar como "Jugador"';
    h.style.color = (n && n !== 'Jugador') ? '#7cc63f' : '#ffb347';
  }
  (function () {
    bindNameInput('nameMain');
    bindNameInput('nameInput');
    var m = document.getElementById('nameMain');
    if (m && typeof LB !== 'undefined') m.value = LB.playerName();
    updateNameHint();
  })();

  var boardFrom = 'title';
  function openBoard(from) {
    boardFrom = from || 'title';
    show('board');
    el.hud.style.opacity = '0';
    var inp = document.getElementById('nameInput');
    if (inp) inp.value = (typeof LB !== 'undefined') ? LB.playerName() : '';
    updateNameHint();
    // si venís de terminar una partida, abrís el ranking de esa dificultad
    boardDiff = (G.diff && G.diff.id) || boardDiff;
    renderBoardTabs();
    loadBoard();
  }

  /* --------- pestañas: un ranking por dificultad --------- */
  var boardDiff = 'normal';
  function renderBoardTabs() {
    var box = document.getElementById('boardTabs');
    if (!box) return;
    box.innerHTML = '';
    Object.keys(DIFFS).forEach(function (k) {
      var b = document.createElement('button');
      b.className = 'diffTab' + (k === boardDiff ? ' sel' : '');
      b.innerHTML = '<b>' + DIFFS[k].name + '</b>' +
        '<span class="dtMy">tu récord: ' +
        (typeof LB !== 'undefined' ? LB.localBest(k) : 0) + '</span>';
      b.onclick = function () {
        if (boardDiff === k) return;
        Snd.click();
        boardDiff = k;
        renderBoardTabs();
        loadBoard();
      };
      box.appendChild(b);
    });
  }

  function loadBoard() {
    var list = document.getElementById('boardList');
    var msg = document.getElementById('boardMsg');
    var note = document.getElementById('boardNote');
    if (!list) return;
    var diff = boardDiff;
    list.innerHTML = '<div class="bEmpty">Cargando…</div>';
    if (msg) msg.textContent = '';

    if (typeof LB === 'undefined') {
      list.innerHTML = '<div class="bEmpty">Ranking no disponible.</div>';
      return;
    }
    LB.top((window.TTR_CONFIG || {}).TOP_N || 50, diff).then(function (r) {
      // el usuario puede haber cambiado de pestaña mientras cargaba
      if (r.difficulty !== boardDiff) return;

      var rows = r.list || [];
      if (!rows.length) {
        list.innerHTML = '<div class="bEmpty">Todavía no hay puntajes en ' +
          DIFFS[r.difficulty].name + '.<br>¡Sé el primero en hacerse famous!</div>';
      } else {
        var myId = r.mine || '';
        var myName = LB.playerName();
        list.innerHTML = rows.map(function (e) {
          var isMe = (e.name === myName && myId);
          return '<div class="bRow' + (e.rank <= 3 ? ' top' + e.rank : '') + (isMe ? ' me' : '') + '">' +
            '<span class="pos">' + e.rank + '</span>' +
            '<span class="who">' + escapeHtml(e.name || 'Jugador') +
            '<small>' + e.dist + ' m · 🚬 ' + e.cigarettes + '</small></span>' +
            '<span class="pts">' + e.score + '</span>' +
            '</div>';
        }).join('');
      }
      if (msg) {
        msg.textContent = r.online
          ? 'Tabla global en línea · ' + DIFFS[r.difficulty].name
          : 'Tabla local (no configurada la online todavía)';
      }
      if (note) {
        note.innerHTML = r.online
          ? 'Se guarda automáticamente al terminar cada partida. Un solo puntaje por jugador y dificultad: si superás tu récord, reemplaza el anterior.'
          : 'Completá <b>config.js</b> con tu URL y anon key de Supabase para activar la tabla global.';
      }
    });
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  document.getElementById('btnBoard').onclick = function () { Snd.click(); openBoard('title'); };
  document.getElementById('btnBoard2').onclick = function () { Snd.click(); openBoard('over'); };
  document.getElementById('btnBoardRefresh').onclick = function () { Snd.click(); loadBoard(); };
  document.getElementById('btnBoardOk').onclick = function () {
    Snd.click();
    if (boardFrom === 'over') show('over'); else show('title');
  };
  document.getElementById('btnSound').onclick = function () {
    Snd.init(); var m = Snd.toggle();
    document.querySelector('#icoSound path').setAttribute('stroke', m ? '#666' : '#ffd9a0');
    this.style.opacity = m ? 0.6 : 1;
  };
  // slider de volumen: afecta SOLO a la música; los SFX siempre suenan
  (function () {
    var sl = document.getElementById('volSlider');
    if (!sl) return;
    var apply = function () {
      var v = sl.value / 100;
      sl.style.setProperty('--p', sl.value + '%');
      Snd.setMusicVol(v);
    };
    sl.addEventListener('input', apply);
    // atajos: [ y ]
    document.addEventListener('keydown', function (e) {
      var k = e.key.toLowerCase();
      if (k === '[' || k === ']') {
        var d = k === '[' ? -5 : 5;
        sl.value = clamp(parseInt(sl.value, 10) + d, 0, 100);
        apply();
        Snd.click();
      }
    });
    sl.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    apply();
  })();

  document.addEventListener('visibilitychange', function () { if (document.hidden) pauseGame(); });

  /* =========================================================================
     17. INPUT
     ========================================================================= */
  var isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  document.addEventListener('keydown', function (e) {
    var k = e.key.toLowerCase();
    if (e.code === 'Space' || k.indexOf('arrow') === 0) e.preventDefault();
    if (G.mode === 'title' && (k === ' ' || k === 'enter')) { startGame(); return; }
    if (k === 'p' || k === 'escape') {
      if (G.mode === 'play') pauseGame(); else if (G.mode === 'pause') resumeGame();
      return;
    }
    if (G.mode === 'over' && (k === ' ' || k === 'enter')) { startGame(); return; }
    if (G.mode !== 'play') return;
    if (k === 'arrowleft' || k === 'a') action.lane = -1;
    else if (k === 'arrowright' || k === 'd') action.lane = 1;
    else if (k === 'arrowup' || k === 'w' || k === ' ') action.jump = true;
    else if (k === 'arrowdown' || k === 's') action.slide = true;
  });

  var px0 = 0, py0 = 0, pt0 = 0, moved = false;
  var dom = renderer.domElement;
  dom.addEventListener('pointerdown', function (e) {
    if (G.mode !== 'play') return;
    px0 = e.clientX; py0 = e.clientY; pt0 = performance.now(); moved = false;
    dom.setPointerCapture(e.pointerId);
  });
  dom.addEventListener('pointermove', function (e) {
    if (G.mode !== 'play' || moved) return;
    var dx = e.clientX - px0, dy = e.clientY - py0;
    if (Math.abs(dx) > 26 && Math.abs(dx) > Math.abs(dy)) { action.lane = dx > 0 ? 1 : -1; moved = true; }
    else if (Math.abs(dy) > 26 && Math.abs(dy) > Math.abs(dx)) { action.slide = dy > 0; moved = true; }
  });
  dom.addEventListener('pointerup', function (e) {
    if (G.mode !== 'play') return;
    if (!moved && performance.now() - pt0 < 240) action.jump = true;
  });

  function bindHold(id, fn) {
    var n = document.getElementById(id);
    n.addEventListener('pointerdown', function (e) { e.preventDefault(); if (G.mode === 'play') fn(); });
  }
  bindHold('tL', function () { action.lane = -1; });
  bindHold('tR', function () { action.lane = 1; });
  bindHold('tU', function () { action.jump = true; });
  bindHold('tD', function () { action.slide = true; });

  /* =========================================================================
     18. RENDER / LOOP
     ========================================================================= */
  var mirrorOn = true;
  document.getElementById('btnMirror').onclick = function () {
    mirrorOn = !mirrorOn;
    this.innerHTML = '<b>RETROVISOR</b> ' + (mirrorOn ? 'activado' : 'apagado');
    Snd.click();
  };

  function onResize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', onResize);

  function render() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, w, h);
    renderer.clear();
    renderer.render(scene, camera);

    if (mirrorOn && (G.mode === 'play' || G.mode === 'caught')) {
      var r = el.mirror.getBoundingClientRect();
      if (r.width > 4) {
        // OJO: setViewport/setScissor ya multiplican por el pixelRatio internamente
        var gx = Math.round(r.left), gy = Math.round(h - r.bottom);
        var gw = Math.round(r.width), gh = Math.round(r.height);
        mirrorCam.position.set(G.x * 0.6, 1.62, -0.5);
        mirrorCam.lookAt(G.x * 0.25, 1.0, Math.max(6, G.gap));
        mirrorCam.aspect = r.width / r.height;
        mirrorCam.updateProjectionMatrix();
        mirrorCam.projectionMatrix.elements[0] *= -1;
        renderer.setViewport(gx, gy, gw, gh);
        renderer.setScissor(gx, gy, gw, gh);
        renderer.setScissorTest(true);
        renderer.clearDepth();
        renderer.render(scene, mirrorCam);
        renderer.setScissorTest(false);
      }
    }
  }

  var last = performance.now();
  var frameCount = 0, frameTimer = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = (now - last) / 1000;
    last = now;
    if (dt > 0.06) dt = 0.06;
    if (dt <= 0) dt = 0.016;
    G.t += dt;

    // auto-degradar si va lento
    G.frameAvg = G.frameAvg * 0.94 + (dt * 1000) * 0.06;
    frameTimer += dt; frameCount++;
    if (frameTimer > 3) {
      if (mirrorOn && G.frameAvg > 30) { mirrorOn = false; document.getElementById('btnMirror').innerHTML = '<b>RETROVISOR</b> apagado (auto)'; }
      frameTimer = 0; frameCount = 0;
    }

    if (G.mode === 'play') {
      doActions();
      updatePlayer(dt);
      updateObstacles(dt);
      updatePickups(dt);
      updateWorld(dt);
      updatePity(dt);
      updateChase(dt);
      // cursor de aparición: avanza con el mundo y suelta una ola cuando hay hueco
      G.frontZ += G.speed * dt;
      if (G.frontZ >= CFG.farZ + G.nextGap) {
        generateWave();
        G.frontZ = CFG.farZ;
      }

      // cámara
      var camX = G.x * 0.62;
      var camY = 3.25 + G.y * 0.4 + (G.state === 'slide' ? -0.3 : 0);
      camera.position.x = damp(camera.position.x, camX, 7, dt);
      camera.position.y = damp(camera.position.y, camY, 6, dt);
      camera.position.z = damp(camera.position.z, 6.9 + (G.pow.turbo ? -0.5 : 0) + (G.gap < 12 ? 0.9 : 0), 4, dt);
      var lookY = 1.15 + G.y * 0.45;
      camera.lookAt(G.x * 0.35, lookY, -11);

      // shake
      if (G.shake > 0) {
        G.shake = Math.max(0, G.shake - dt * 2.4);
        var s = G.shake * 0.5;
        camera.position.x += rnd(-s, s);
        camera.position.y += rnd(-s, s);
      }
      // flash
      if (G.hitFlash > 0) {
        G.hitFlash -= dt * 2.5;
        document.body.style.filter = 'brightness(' + (1 + Math.max(0, G.hitFlash) * 0.8) + ') saturate(' + (1 + Math.max(0, G.hitFlash) * 0.7) + ')';
      } else if (document.body.style.filter) document.body.style.filter = '';

      // cumbia: sube el tempo con la velocidad y se desespera si tenés hambre
      Snd.setIntensity(G.starving ? 1 : 0);
      Snd.setTempo(92 + (G.speed - CFG.startSpeed) * 2.0 + (G.starving ? 30 : 0));
      Snd.schedule();
      // audio de persecución: más fuerte cuanto más cerca esté Di Lollo (máx 100%)
      Snd.updateChaseVol(G.gap, 30);
      updatePhase(dt);
      updateHUD();
      updateInstances(dt);
    } else if (G.mode === 'caught') {
      G.deathT += dt;
      updatePlayer(dt);
      updateWorld(dt * 0.35);
      updatePity(dt);
      // cámara dramática: acerca al plano de la cara de Di Lollo, de frente
      // (su cabeza queda en y≈1.36, z≈1.35)
      var k2 = clamp(G.deathT / 2.0, 0, 1);
      var e = k2 * k2 * (3 - 2 * k2);
      // de la cámara de juego a un primer plano frontal a la altura de sus ojos
      var tx = lerp(0, 0.6, e);
      var ty = lerp(3.5, 1.42, e);
      var tz = lerp(7.4, 2.15, e);
      camera.position.x = damp(camera.position.x, tx, 3.2, dt);
      camera.position.y = damp(camera.position.y, ty, 3.2, dt);
      camera.position.z = damp(camera.position.z, tz, 3.2, dt);
      // el punto de mira queda a la altura de sus ojos (y≈1.3)
      var ly = lerp(0.9, 1.28, e);
      var lz = lerp(5, 1.32, e);
      camera.lookAt(0.6 * e, ly, lz);
      // Tung queda al costado, mirando la escena
      tung.root.position.x = damp(tung.root.position.x, -1.15, 3, dt);
      tung.root.position.z = damp(tung.root.position.z, 0.3, 3, dt);
      tung.root.rotation.y = damp(tung.root.rotation.y, 0.9, 3, dt);
      updateInstances(dt);
      if (G.deathT > 4.2) endGame();
    } else if (G.mode === 'title' || G.mode === 'over' || G.mode === 'pause') {
      // cámara de presentación orbitando
      var ang = G.t * 0.16;
      var mode3 = G.mode === 'over' ? 1 : 0;
      var r1 = mode3 ? 5.5 : 6.4;
      camera.position.x = Math.sin(ang) * r1;
      camera.position.y = 2.5 + Math.sin(ang * 0.7) * 0.5;
      camera.position.z = 3.2 + Math.cos(ang) * r1;
      camera.lookAt(0, 1.15, 0.2);
      tung.root.position.set(0, 0, 0);
      tung.root.rotation.y = Math.sin(G.t * 0.7) * 0.35;
      tung.body.position.y = Math.abs(Math.sin(G.t * 3)) * 0.08;
      tung.armL.rotation.x = Math.sin(G.t * 3) * 0.9;
      tung.armR.rotation.x = -Math.sin(G.t * 3) * 0.6 - 0.5;
      tung.armL.rotation.z = 0.5;
      tung.armR.rotation.z = -0.5;
      tung.mouthGrp.scale.y = 1 + Math.abs(Math.sin(G.t * 3)) * 0.35;
      tung.feet[0].rotation.x = Math.sin(G.t * 3) * 0.7;
      tung.feet[1].rotation.x = -Math.sin(G.t * 3) * 0.7;
      if (G.mode === 'pause') { /* congelado: no mover anim */ }
      else {
        var bx = 1.5, bz = 1.4;
        pity.root.position.set(bx, 0, bz);
        pity.root.rotation.y = -0.5 + Math.sin(G.t * 4) * 0.2;
        pity.hip.position.y = Math.abs(Math.sin(G.t * 5)) * 0.08;
        pity.legs.forEach(function (l) {
          var ph = l.side > 0 ? 0 : Math.PI;
          l.g.rotation.x = Math.sin(G.t * 5 + ph) * 0.6;
          l.knee.rotation.x = Math.max(0, Math.sin(G.t * 5 + ph + 1)) * 0.7;
        });
        pity.arms.forEach(function (a, i) {
          var ph = i ? 0 : Math.PI;
          a.g.rotation.x = Math.sin(G.t * 5 + ph) * 1.2 - 0.3;
          a.g.rotation.z = a.side * 0.4;
          a.elbow.rotation.x = -0.8;
        });
        pity.head.rotation.y = Math.sin(G.t * 4) * 0.3;
        pity.head.rotation.z = Math.sin(G.t * 6) * 0.2;
        pity.stars.visible = false;
      }
      Snd.schedule();
      updateInstances(dt);
    }

    render();
  }

  // enganche opcional de depuración (window.TTR) — no afecta al juego
  window.TTR = {
    G: G, tung: tung, pity: pity, camera: camera, scene: scene, renderer: renderer,
    start: startGame, action: action, obstacles: obstacles, CFG: CFG,
    snd: Snd
  };

  /* ---- arranque ---- */
  (function boot() {
    onResize();
    props.forEach(refreshProp);
    reset();
    tung.root.position.set(0, 0, 0);
    tung.root.rotation.set(0, 0, 0);
    tung.root.scale.setScalar(1);
    pity.root.position.set(1.6, 0, 1.6);
    pity.root.rotation.set(0, 0, 0);
    pity.torso.rotation.set(0, 0, 0);
    pity.head.rotation.set(0, 0, 0);
    pity.hip.rotation.set(0, 0, 0);
    pity.hip.position.y = 0;
    pity.aura.visible = false;
    pity.stars.visible = false;
    document.body.style.filter = '';
    if (isTouch) document.getElementById('touch').className = 'on';
    show('title');
    document.getElementById('load').style.display = 'none';
    requestAnimationFrame(function (n) { last = n; loop(n); });
  })();

})();