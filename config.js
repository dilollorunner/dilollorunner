/* =============================================================================
   CONFIGURACIÓN — acá va lo único que tenés que completar
   =============================================================================

   Pasos:
   1. Creá el proyecto en https://supabase.com
   2. Andá a Settings > API (o "Data API") y copiá:
        - Project URL   → va en SUPABASE_URL
        - anon public key → va en SUPABASE_ANON_KEY
   3. En el SQL Editor corré el contenido de supabase-schema.sql
   4. Guardá este archivo y listo.

   Mientras la URL esté vacía el juego funciona igual, usando el récord local
   del navegador (localStorage). No se rompe nada.
   ============================================================================= */

window.TTR_CONFIG = {
  SUPABASE_URL: 'https://cwepuyjsqwoarxzvwztc.supabase.co',

  // Key pública/anon: está pensada para ir en el navegador.
  // OJO: esta NO es la service_role (esa nunca va en un cliente).
  SUPABASE_ANON_KEY: 'sb_publishable_yjMH9apmCruLu3s7wYVYpw_VC8vSzIH',

  // Cuántos puntajes mostrar en la tabla (máximo 50)
  TOP_N: 50,

  // Si es true, manda el puntaje a Supabase al terminar cada partida.
  // Ponelo en false si solo querés probar en local.
  ENABLE_ONLINE: true
};