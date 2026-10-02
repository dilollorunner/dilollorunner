# 🪵 DI LOLLO RUNNER

Un juego web tipo *endless runner* (al estilo Subway Surfers). Sos **Tung Tung Sahur** y
tenés que sobrevivir en los pasillos de una villa: saltás, te deslizás y **fumás los
cigarrillos del piso** para no quedarte sin Coco.

Si se te acaba, **Di Lollo** (Lauti, "el Cara Larga") te alcanza por la espalda y te saca
las zapatillas. Mirá el **retrovisor** para ver cuánto se está acercando.

## Cómo jugar

Abre `index.html` en cualquier navegador moderno. **No necesita internet ni instalación.**

Si tu navegador restringe `file://`, sírvelo con cualquier servidor estático:

```bash
python3 -m http.server 8000
# luego abre http://localhost:8000
```

### Controles

| Acción | Teclado | Táctil |
|---|---|---|
| Cambiar carril | `←` `→` o `A` `D` | desliza a los lados |
| Saltar | `↑` `W` `Espacio` | desliza hacia arriba o toca |
| Deslizar | `↓` o `S` | desliza hacia abajo |
| Pausa | `P` o `Esc` | botón ❚❚ |
| Volumen de música | `[` y `]` | slider en pantalla |

### Reglas

- **Hambre (barra amarilla):** baja sola con el tiempo. Cada cigarrillo que levantás del
  piso la repone. Si llega a cero, te quedás sin Coco: **Di Lollo** acelera y te alcanza.
- **Di Lollo (barra roja):** siempre te sigue por la espalda. Cada cigarrillo también lo
  frena un poco. Míralo en el **retrovisor** de arriba — cuando la barra se pone roja y
  dice *TE PISA LOS TALONES*, viene derecho.
- **Multiplicador:** encadená cigarrillos sin fallar para subir x1 → x4.
- **Power-ups:**
  - 🏏 **Murciélago** — rompe todos los obstáculos (8 s)
  - ⚡ **Turbo** — corrés mucho más rápido y Di Lollo se queda atrás (7 s)
  - 🧲 **Imán** — atrae todos los cigarrillos (11 s)
  - 🔇 **Silencio** — Di Lollo se queda mudo y no avanza (6 s)
- **Volumen:** el slider afecta **solo a la música**. Los efectos nunca se apagan.
  El audio de persecución sube solo (hasta 100%) a medida que se acerca.
- **El final:** cuando te agarra, la cámara hace un primer plano de su cara y te saca las
  zapatillas una por una.

### Dificultad

- **Tranqui** — Lauti va de paseo, para aprender los controles
- **Normal** — el juego justo
- **Malvado** — Di Lollo corre el doble y tenés que correr más

## Estructura

```
index.html           — interfaz, HUD, pantallas, estilos
game.js              — todo el juego (motor, personajes, IA de obstáculos)
config.js            — credenciales de Supabase (lo único que completás)
leaderboard.js       — módulo del ranking (online + fallback local)
supabase-schema.sql  — SQL para correr una vez en Supabase
vendor/three.min.js  — three.js r160 (MIT), local para jugar sin internet
audio/
  01-la-bebecita.mp3   — pista (loop, orden aleatorio)
  02-pala-ancha.mp3    — pista (loop, orden aleatorio)
  sfx-perfect-fart.mp3 — 30% de chance en cada salto
  sfx-persecucion.mp3  — volumen según lo cerca que esté Di Lollo (0 → 100%)
img/
  pity-face.jpg        — tu foto, pegada fotorrealista en la cara del villano
```

Casi todo es procedural: las texturas (crudo, chapa, cemento, tierra, letreros, grafitis),
los modelos 3D, el cielo y los efectos de sonido se generan por código con Canvas y WebAudio.
Lo único que son archivos reales es el audio y tu foto.

## El villano

**Di Lollo** (Lauti, "el Cara Larga") lleva tu foto pegada como textura sobre un parche
esférico —curvo, no plano— en el frente de la cabeza, con máscara ovalada de bordes
suaves para que se funda con el cráneo. **No hay ningún rasgo 3D en la cara**: ojos,
nariz, boca y dientes se eliminaron, la foto los reemplaza todos.

Para cambiar la foto, reemplazá `img/pity-face.jpg` por otra (idealmente con la cara
centrada y de frente) y listo. El mismo archivo se usa en el menú y en el juego.

## Ranking en línea (Supabase)

El juego guarda el récord local siempre, y si configurás Supabase manda los puntajes a una
tabla global.

### Publicarlo en GitHub Pages

1. Subí el repo.
2. **Settings → Pages → Source: `main` / `root` → Save.**

El marcador global funciona en GitHub Pages: todas las rutas del proyecto son relativas
(así que sirve tanto en `usuario.github.io` como en `usuario.github.io/repo/`), y tanto el
sitio como Supabase van por HTTPS, así que no hay problema de contenido mixto.

**`config.js` sí se sube al repo, a propósito.** La key anon/publishable de Supabase está
diseñada para ir en el navegador: no es un secreto. Lo que protege los datos es el RLS de la
base, que impide escribir sin pasar por `submit_score`.

> **Nunca** pongas en `config.js` la `service_role` key (empieza con `eyJ` y dice
> `service_role`, o es la `sb_secret_...`). Esa es el administrador de la base de datos. Si
> alguna vez la subís, regenerala de inmediato.

Si alguien quiere jugar tu juego con su propia base, copia `config.ejemplo.js` como
`config.js` y pega sus credenciales.

### Configuración

**1. Creá el proyecto** en [supabase.com](https://supabase.com)

**2. Corré el SQL.** En el Supabase Studio: *SQL Editor → New query*, pegá el contenido de
`supabase-schema.sql` y dale *Run*. Crea la tabla, la vista `top_scores` y la función
`submit_score` (la que valida que el puntaje sea real).

**3. Copiá las credenciales.** En *Settings → Data API*: el **Project URL** y la **anon
public key**.

**4. Pegalas** en `config.js`.

No hay nada más que tocar.

### Qué hace el SQL

- Nadie puede escribir en la tabla desde el navegador (no hay policies de insert).
- La única vía de escritura es `submit_score`, que **rechaza puntajes imposibles**:
  - no podés recorrer más rápido que la velocidad máxima del juego
  - hay un techo de puntos plausible para la distancia y los cigarrillos
  - limpia el nombre de caracteres raros
- Devuelve tu posición en el ranking al instante.

### Probarlo

En el SQL Editor:
```sql
select * from public.submit_score('Prueba', 1234, 300, 40, 30);
select * from public.top_scores limit 10;
```

### Si no querés usar Supabase

Dejá las dos líneas de `config.js` vacías y el juego sigue funcionando con el ranking local.
No se rompe nada.

### Anti-trampas

El score sale del cliente, así que siempre se puede falsear desde la consola. Las barreras
que puse, de menor a mayor esfuerzo:

| Barrera | Qué frena |
|---|---|
| Chequeo de plausibilidad en cliente | el 90% de los tramposos, sin gastar requests |
| Validación en `submit_score` (Postgres) | igual, pero del lado del servidor |
| RLS sin policies de escritura | no se puede insertar ni borrar directo |

Lo que **no** alcanza: alguien que modifique `game.js` para que el chequeo pase. Para eso
hace falta partida firmada o replay en servidor. Si el ranking se pone competitivo, ese es
el siguiente paso.

## Detalles técnicos

- Render 3D con three.js/WebGL, ~165 draw calls y 48k triángulos: va fluido a 60 fps.
- Contenedores con recycled pool (edificios, props, obstáculos, partículas) para no crear basura.
- Cigarrillos, chispas y escombros usan `InstancedMesh` (una sola llamada de dibujo cada uno).
- El retrovisor es un segundo render con scissor + matriz de proyección espejada.
- Sombras dinámicas, niebla y un ciclo de 4 fases de iluminación (amanecer → día → atardecer → noche).
- El juego se auto-degrada (apaga el retrovisor) si detecta FPS bajos.

## Créditos

Homenaje de fan al meme de **Tung Tung Tung Sahur** y a **Di Lollo / Cara Larga**.
Gráficos y sonido generados por procedimiento. three.js bajo licencia MIT.
Audio provisto por el usuario.