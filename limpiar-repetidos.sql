-- =========================================================================
--  Deja UN solo registro por nombre y dificultad (el mejor puntaje),
--  y borra las filas de prueba.
--  No corre la migración entera: solo el cleanup.
-- =========================================================================

-- 1) borra las filas de prueba que creamos al verificar
delete from public.leaderboard
where name in ('ZZTest','ZZFix','ZZCheck','ZZVerif');

-- 2) colapsa los repetidos que dejó la versión vieja del juego.
--    Las filas viejas no tienen player_id (NULL), así que se agrupan por
--    nombre, que es lo único con lo que se puede identificar a esos jugadores.
delete from public.leaderboard
where id in (
  select id from (
    select id,
           row_number() over (
             partition by difficulty, name
             order by score desc, created_at asc
           ) as rn
    from public.leaderboard
  ) t where t.rn > 1
);

-- 3) ver qué quedó: un jugador = una fila
select difficulty, name, score from public.leaderboard order by score desc;
select count(*) as filas_totales from public.leaderboard;
