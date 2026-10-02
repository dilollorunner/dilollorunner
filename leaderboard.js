/* =============================================================================
   LEADERBOARD — puntajes en línea (Supabase) con fallback a localStorage
   ============================================================================= */
(function () {
  'use strict';

  var CFG = window.TTR_CONFIG || {};
  var LS_SCORES = 'dilollorunner.scores';
  var LS_NAME = 'dilollorunner.name';
  var LS_ID = 'dilollorunner.pid';

  // Aceptamos la URL como venga: con o sin /rest/v1 al final.
  var url = (CFG.SUPABASE_URL || '')
    .trim()
    .replace(/\/+$/, '')                 // sin barra al final
    .replace(/\/rest\/v1$/i, '');        // sin /rest/v1 (lo agrega cada llamada)
  var key = CFG.SUPABASE_ANON_KEY || '';
  var enabled = !!(url && key && CFG.ENABLE_ONLINE !== false);

  /* ---------------------------------------------------------------- cliente */
  function headers() {
    return {
      'apikey': key,
      'Authorization': 'Bearer ' + key,
      'Content-Type': 'application/json'
    };
  }

  function withTimeout(ms) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, ms);
    return {
      signal: ctl ? ctl.signal : undefined,
      done: function () { clearTimeout(t); }
    };
  }

  /* --------------------------------------------------------------- local */
  function readLocal() {
    try { return JSON.parse(localStorage.getItem(LS_SCORES) || '[]'); }
    catch (e) { return []; }
  }
  function writeLocal(list) {
    try { localStorage.setItem(LS_SCORES, JSON.stringify(list.slice(0, 50))); } catch (e) { }
  }
  function localBest() {
    var l = readLocal();
    return l.length ? Math.max.apply(null, l.map(function (s) { return s.score || 0; })) : 0;
  }

  /* ------------------------------------------------------------- nombre */
  function playerName() {
    var n = '';
    try { n = localStorage.getItem(LS_NAME) || ''; } catch (e) { }
    return n.trim() || 'Jugador';
  }
  function setPlayerName(n) {
    try { localStorage.setItem(LS_NAME, String(n || '').slice(0, 16)); } catch (e) { }
  }
  // id anónimo por navegador, para poder resaltar "tu" posición
  function playerId() {
    var id = '';
    try { id = localStorage.getItem(LS_ID) || ''; } catch (e) { }
    if (!id) {
      id = 'p' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
      try { localStorage.setItem(LS_ID, id); } catch (e) { }
    }
    return id;
  }

  /* ------------------------------------------------- validación de plausibilidad
     Espejo rápido del chequeo del servidor, para no gastar requests con
     puntajes que el propio servidor va a rechazar igual. */
  var SPEED_FACTOR = 0.55;    // Game.js: dist += speed * dt * SPEED_FACTOR
  var MIN_TIME_PER_METER = 1 / 14.0;   // margen sobre la velocidad máxima real
  var MIN_RUN = 3;            // segundos

  function looksLegit(d) {
    var dist = Math.max(0, d.dist | 0);
    var cig = Math.max(0, d.cigarettes | 0);
    var dur = Number(d.duration) || 0;
    if (!isFinite(d.score) || d.score < 0) return false;
    if (dur < Math.max(dist * MIN_TIME_PER_METER, MIN_RUN)) return false;
    if (d.score > 800 + dist * 50 + cig * 150) return false;
    return true;
  }

  /* -------------------------------------------------------------- envío */
  function submit(score, dist, cigarettes, duration) {
    var entry = {
      score: Math.floor(score) || 0,
      dist: Math.floor(dist) || 0,
      cigarettes: Math.floor(cigarettes) || 0,
      duration: Number(duration) || 0,
      name: playerName(),
      mine: true
    };
    var legit = looksLegit(entry);

    // siempre guardamos en local
    entry.date = Date.now();
    var list = readLocal();
    list.push(entry);
    list.sort(function (a, b) { return b.score - a.score; });
    writeLocal(list);

    if (!enabled) {
      // sin backend configurado: se guarda local y se informa si igual
      // parece tramposo, así se puede ver el chequeo funcionando
      return Promise.resolve({
        ok: true, local: true, legit: legit,
        rank: localTop().length ? (localTop().findIndex(function (e) {
          return e.score === entry.score;
        }) + 1) : null
      });
    }
    if (!legit) {
      return Promise.resolve({ ok: false, local: true, error: 'puntaje no plausible' });
    }

    var to = withTimeout(7000);
    return fetch(url + '/rest/v1/rpc/submit_score', {
      method: 'POST',
      headers: headers(),
      signal: to.signal,
      body: JSON.stringify({
        p_name: entry.name,
        p_score: entry.score,
        p_dist: entry.dist,
        p_cigarettes: entry.cigarettes,
        p_duration: entry.duration
      })
    }).then(function (res) {
      to.done();
      if (!res.ok) {
        return res.text().then(function (t) {
          // el servidor devuelve el motivo del rechazo en el cuerpo
          return { ok: false, local: true, error: extractMsg(t) };
        });
      }
      return res.json().then(function (j) {
        return { ok: true, online: true, rank: j && j.rank ? j.rank : null };
      });
    }).catch(function () {
      to.done();
      return { ok: false, local: true, error: 'sin conexión con el servidor' };
    });
  }

  function extractMsg(t) {
    try {
      var j = JSON.parse(t);
      if (j.message) return j.message;
      if (j.error) return j.error;
    } catch (e) { }
    return (t || 'error del servidor').slice(0, 60);
  }

  /* ------------------------------------------------------------- lectura */
  function top(limit) {
    var n = Math.min(limit || CFG.TOP_N || 10, 50);

    if (!enabled) {
      return Promise.resolve({ online: false, list: localTop(), mine: playerId() });
    }
    var to = withTimeout(7000);
    return fetch(url + '/rest/v1/top_scores?select=rank,name,score,dist,cigarettes,created_at'
      + '&order=rank.asc&limit=' + n, {
      headers: headers(), signal: to.signal
    }).then(function (res) {
      to.done();
      if (!res.ok) throw new Error('no se pudo leer la tabla');
      return res.json();
    }).then(function (rows) {
      return {
        online: true,
        mine: playerId(),
        list: (rows || []).map(function (r) {
          return {
            rank: r.rank, name: r.name, score: r.score,
            dist: r.dist, cigarettes: r.cigarettes, date: r.created_at
          };
        })
      };
    }).catch(function () {
      to.done();
      return { online: false, list: localTop(), mine: playerId(), error: 'offline' };
    });
  }

  function localTop() {
    return readLocal().slice(0, 20).map(function (e, i) {
      return {
        rank: i + 1, name: e.name || 'Jugador', score: e.score,
        dist: e.dist, cigarettes: e.cigarettes, date: e.date
      };
    });
  }

  /* --------------------------------------------------------------- API */
  window.LB = {
    enabled: enabled,
    submit: submit,
    top: top,
    localBest: localBest,
    playerName: playerName,
    setPlayerName: setPlayerName,
    playerId: playerId,
    isOnline: function () { return enabled; },
    // expuesto para poder probar el anti-cheat a mano:
    // LB.looksLegit({score:999999, dist:100, cigarettes:10, duration:1}) -> false
    looksLegit: looksLegit
  };
})();