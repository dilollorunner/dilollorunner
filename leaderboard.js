/* =============================================================================
   LEADERBOARD — puntajes en línea (Supabase) con fallback a localStorage
   ============================================================================= */
(function () {
  'use strict';

  var CFG = window.TTR_CONFIG || {};
  var LS_SCORES = 'dilollorunner.scores';
  var LS_NAME = 'dilollorunner.name';
  var LS_ID = 'dilollorunner.pid';

  // difficulties válidas: cada una tiene su propio ranking
  var DIFFS = ['facil', 'normal', 'malvado'];
  function normDiff(d) {
    d = String(d || '').toLowerCase().trim();
    return DIFFS.indexOf(d) >= 0 ? d : 'normal';
  }
  function diffLabel(d) {
    return { facil: 'TRANQUI', normal: 'NORMAL', malvado: 'MALVADO' }[normDiff(d)];
  }

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

  /* --------------------------------------------------------------- local
     Guardamos un solo puntaje por dificultad (el mejor), igual que el
     servidor: así el ranking local y el global se parecen. */
  function readAll() {
    try {
      var l = JSON.parse(localStorage.getItem(LS_SCORES) || '[]');
      return Array.isArray(l) ? l : [];
    } catch (e) { return []; }
  }
  function writeAll(list) {
    try { localStorage.setItem(LS_SCORES, JSON.stringify(list)); } catch (e) { }
  }
  function readLocal(d) {
    d = normDiff(d);
    return readAll().filter(function (s) { return normDiff(s.difficulty) === d; });
  }
  // deja sólo el mejor de cada dificultad
  function collapseLocal() {
    var best = {};
    readAll().forEach(function (s) {
      var d = normDiff(s.difficulty);
      if (!best[d] || (s.score || 0) > (best[d].score || 0)) best[d] = s;
    });
    return best;
  }
  function saveLocalBest(d, entry) {
    var best = collapseLocal();
    var k = normDiff(d);
    // sólo reemplaza si el puntaje nuevo es MEJOR: una partida mala nunca
    // debe pisar el récord que ya tenías
    if (!best[k] || (entry.score || 0) > (best[k].score || 0)) best[k] = entry;
    writeAll(Object.keys(best).map(function (x) { return best[x]; }));
  }
  function localBest(d) {
    var l = readLocal(d);
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
  function submit(score, dist, cigarettes, duration, difficulty) {
    var diff = normDiff(difficulty);
    var entry = {
      score: Math.floor(score) || 0,
      dist: Math.floor(dist) || 0,
      cigarettes: Math.floor(cigarettes) || 0,
      duration: Number(duration) || 0,
      name: playerName(),
      difficulty: diff,
      mine: true
    };
    var legit = looksLegit(entry);

    // siempre guardamos en local (un solo puntaje por dificultad)
    entry.date = Date.now();
    saveLocalBest(diff, entry);

    if (!enabled) {
      // sin backend configurado: se guarda local y se informa si igual
      // parece tramposo, así se puede ver el chequeo funcionando
      return Promise.resolve({
        ok: true, local: true, legit: legit, difficulty: diff,
        rank: localRank(diff, entry.score)
      });
    }
    if (!legit) {
      return Promise.resolve({ ok: false, local: true, difficulty: diff, error: 'puntaje no plausible' });
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
        p_duration: entry.duration,
        p_difficulty: diff,
        p_player_id: playerId()
      })
    }).then(function (res) {
      to.done();
      if (!res.ok) {
        return res.text().then(function (t) {
          // el servidor devuelve el motivo del rechazo en el cuerpo
          return { ok: false, local: true, difficulty: diff, error: extractMsg(t) };
        });
      }
      return res.json().then(function (j) {
        return {
          ok: true, online: true, difficulty: diff,
          rank: j && j.rank ? j.rank : null,
          score: j && j.score != null ? j.score : entry.score
        };
      });
    }).catch(function () {
      to.done();
      return { ok: false, local: true, difficulty: diff, error: 'sin conexión con el servidor' };
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
  function top(limit, difficulty) {
    var diff = normDiff(difficulty);
    var n = Math.min(limit || CFG.TOP_N || 50, 50);

    if (!enabled) {
      return Promise.resolve({ online: false, difficulty: diff, list: localTop(diff), mine: playerId() });
    }
    var to = withTimeout(7000);
    return fetch(url + '/rest/v1/top_scores?select=rank,name,score,dist,cigarettes,created_at'
      + '&difficulty=eq.' + encodeURIComponent(diff)
      + '&order=rank.asc&limit=' + n, {
      headers: headers(), signal: to.signal
    }).then(function (res) {
      to.done();
      if (!res.ok) throw new Error('no se pudo leer la tabla');
      return res.json();
    }).then(function (rows) {
      return {
        online: true,
        difficulty: diff,
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
      return {
        online: false, difficulty: diff, list: localTop(diff),
        mine: playerId(), error: 'offline'
      };
    });
  }

  function localTop(d) {
    var list = readLocal(d).slice().sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
    return list.slice(0, 50).map(function (e, i) {
      return {
        rank: i + 1, name: e.name || 'Jugador', score: e.score,
        dist: e.dist, cigarettes: e.cigarettes, date: e.date
      };
    });
  }

  // posición en la tabla local de esa dificultad
  function localRank(d, score) {
    var l = localTop(d);
    var i = l.findIndex(function (e) { return e.score === score; });
    return i >= 0 ? i + 1 : null;
  }

  /* --------------------------------------------------------------- API */
  window.LB = {
    enabled: enabled,
    submit: submit,
    top: top,
    localBest: localBest,
    localRank: localRank,
    playerName: playerName,
    setPlayerName: setPlayerName,
    playerId: playerId,
    isOnline: function () { return enabled; },
    DIFFS: DIFFS,
    normDiff: normDiff,
    diffLabel: diffLabel,
    // expuesto para poder probar el anti-cheat a mano:
    // LB.looksLegit({score:999999, dist:100, cigarettes:10, duration:1}) -> false
    looksLegit: looksLegit
  };
})();