-- Arregla la posición que devuelve submit_score (solo esto, no borra nada)
drop function if exists public.submit_score(text, integer, integer, integer, real, text, text);

create or replace function public.submit_score(
  p_name        text,
  p_score       integer,
  p_dist        integer,
  p_cigarettes  integer,
  p_duration    real,
  p_difficulty  text default 'normal',
  p_player_id   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clean    text;
  v_diff     text;
  v_pid      text;
  v_hdr      text;
  v_ip       text;
  v_iphash   text;
  v_max      integer;
  v_min_t    real;
  v_rank     integer;
  v_me_id    bigint;
  v_me_score integer;
begin
  -- ---------- dificultad ----------
  v_diff := lower(trim(coalesce(p_difficulty, 'normal')));
  if v_diff not in ('facil', 'normal', 'malvado') then
    v_diff := 'normal';
  end if;

  -- ---------- nombre ----------
  v_clean := left(
    regexp_replace(coalesce(p_name, ''), '[^a-zA-Z0-9 _\-]', '', 'g'),
    16
  );
  if length(trim(v_clean)) = 0 then
    v_clean := 'Jugador';
  end if;

  -- ---------- id del navegador ----------
  v_pid := left(regexp_replace(coalesce(p_player_id, ''), '[^a-zA-Z0-9]', '', 'g'), 40);
  if length(v_pid) = 0 then
    v_pid := null;      -- sin id: sólo deduplica por IP
  end if;

  -- ---------- IP del cliente (para deduplicar) ----------
  --  PostgREST deja los headers de la request en request.headers.
  --  md5() es nativo de Postgres, no hace falta instalar ninguna extensión.
  v_hdr := nullif(current_setting('request.headers', true), '');
  if v_hdr is not null then
    begin
      v_ip := split_part(
        coalesce(
          (v_hdr::json ->> 'x-forwarded-for'),
          (v_hdr::json ->> 'x-real-ip'),
          ''
        ), ',', 1);
    exception when others then
      v_ip := null;     -- si el cast falla, seguimos sin dedupe por IP
    end;
  end if;
  v_ip := nullif(trim(coalesce(v_ip, '')), '');
  if v_ip is not null then
    -- el salt es para que el hash no sea reversible a una IP con tablas precalculadas
    v_iphash := md5(v_ip || 'dilollorunner-v2');
  end if;

  -- ---------- anti-trampa ----------
  if p_score is null or p_score < 0 then
    raise exception 'score invalido';
  end if;

  -- No se puede recorrer más rápido que la velocidad máxima del juego.
  -- La distancia se suma a velocidad * dt * 0.55, velocidad tope 30 => 16.5 m/s.
  v_min_t := greatest(coalesce(p_dist, 0) / 14.0, 3.0);
  if coalesce(p_duration, 0) < v_min_t then
    raise exception 'duracion imposible';
  end if;

  v_max := 800 + coalesce(p_dist, 0) * 50 + coalesce(p_cigarettes, 0) * 150;
  if p_score > v_max then
    raise exception 'score no plausible';
  end if;

  -- ---------- una sola fila: buscamos la de este jugador / esta IP ----------
  select l.id, l.score into v_me_id, v_me_score
  from public.leaderboard l
  where l.difficulty = v_diff
    and (
      (v_pid is not null and l.player_id = v_pid)
      or (v_iphash is not null and l.ip_hash = v_iphash)
    )
  order by l.score desc
  limit 1
  for update;          -- bloquea la fila para que dos partidas a la vez no se pisen

  if v_me_id is not null then
    if p_score <= v_me_score then
      -- ya tiene un puntaje mejor o igual: no se toca nada
      null;
    else
      update public.leaderboard
      set name       = v_clean,
          score      = p_score,
          dist       = coalesce(p_dist, 0),
          cigarettes = coalesce(p_cigarettes, 0),
          duration   = coalesce(p_duration, 0),
          difficulty = v_diff,
          player_id  = coalesce(v_pid, player_id),
          ip_hash    = coalesce(v_iphash, ip_hash),
          updated_at = now()
      where id = v_me_id;

      -- si antes venía identificado por IP y ahora también por navegador,
      -- lo rellenamos para que siga deduplicando bien
      update public.leaderboard
      set player_id = v_pid
      where id = v_me_id and player_id is null and v_pid is not null;
    end if;
  else
    insert into public.leaderboard
      (name, score, dist, cigarettes, duration, difficulty, player_id, ip_hash)
    values
      (v_clean, p_score, coalesce(p_dist, 0), coalesce(p_cigarettes, 0),
       coalesce(p_duration, 0), v_diff, v_pid, v_iphash)
    returning id into v_me_id;
  end if;

  -- La fila guardada tiene el puntaje guardado (el mejor de los dos, no el
  -- que mandamos). Hay que releerlo: si no, la posición que devolvemos sería
  -- la del puntaje viejo.
  select l.score into v_me_score
  from public.leaderboard l
  where l.id = v_me_id;

  -- ---------- posición en el ranking de esa dificultad ----------
  select count(*) + 1 into v_rank
  from public.leaderboard l
  where l.difficulty = v_diff and l.score > v_me_score;

  return jsonb_build_object(
    'ok',         true,
    'rank',       v_rank,
    'name',       v_clean,
    'score',      v_me_score,
    'difficulty', v_diff
  );
end;
$$;

grant execute on function public.submit_score(text, integer, integer, integer, real, text, text)
  to anon, authenticated;

-- 6) Vista del ranking, con rank calculado POR dificultad --------------------
drop view if exists public.top_scores;
create view public.top_scores
  as
  select
    row_number() over (
      partition by difficulty
      order by score desc, created_at asc
    ) as rank,
    difficulty,
    name,
    score,
    dist,
    cigarettes,
    created_at
  from public.leaderboard;

grant select on public.top_scores to anon, authenticated;

-- =============================================================================
--  Verificación (opcional): corré esto en el SQL Editor
--
--  -- mando dos puntajes del mismo jugador: el segundo NO debe duplicar la fila
--  select * from public.submit_score('Prueba', 1234, 300, 40, 30, 'normal', 'jugador1');
--  select * from public.submit_score('Prueba', 999, 250, 30, 26, 'normal', 'jugador1');
--  select * from public.submit_score('Otro', 4321, 500, 60, 40, 'malvado', 'jugador2');
--  select count(*) from public.leaderboard;   -- esperado: 2 filas
--
--  select * from public.top_scores where difficulty = 'normal' order by rank limit 50;
-- =============================================================================
-- =========================================================================
--  AUTORIZACIÓN: corré esto abajo. Si 'score' viene con número (y no null)
--  el arreglo quedó aplicado. Si viene null, avisame y lo vemos.
-- =========================================================================
select * from public.submit_score('ZZCheck', 3000, 350, 45, 32, 'normal', 'zzcheck01');
select * from public.submit_score('ZZCheck', 9000, 600, 70, 45, 'normal', 'zzcheck01');
select '--- fila guardada ---' as info;
select difficulty, score from public.leaderboard where name = 'ZZCheck';
