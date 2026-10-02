/* =============================================================================
   CONFIGURACIÓN DE EJEMPLO — copiá esto como config.js y completalo
   =============================================================================

   1. Creá el proyecto en https://supabase.com
   2. Corré supabase-schema.sql en el SQL Editor
   3. Copiá Project URL y anon public key de Settings > Data API
   4. Pegalos abajo y guardá como config.js
   ============================================================================= */

window.TTR_CONFIG = {
  // Ej: https://tuproyecto.supabase.co
  // (puede venir con /rest/v1 al final, el juego lo normaliza)
  SUPABASE_URL: '',

  // La anon / publishable key. Va en el navegador a proposito: es publica.
  // OJO: nunca pongas aca la service_role, esa es un administrador de la base.
  SUPABASE_ANON_KEY: '',

  // Cuántos puntajes mostrar en la tabla
  TOP_N: 10,

  // false = solo ranking local, sin llamadas a la red
  ENABLE_ONLINE: true
};