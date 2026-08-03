/* ==========================================================
   supabase-client.js
   Inicializa o cliente Supabase a partir de assets/js/config.js.
   Deve ser carregado depois do config.js e do SDK oficial
   (@supabase/supabase-js), e antes de main.js.
   ========================================================== */

(function () {
  const cfg = window.SM_CONFIG || {};
  const isConfigured = cfg.SUPABASE_URL
    && cfg.SUPABASE_ANON_KEY
    && !cfg.SUPABASE_URL.includes('SEU-SUPABASE')
    && !cfg.SUPABASE_ANON_KEY.includes('SUBSTITUA');

  if (!isConfigured) {
    console.warn(
      '[Colégio São Marcos] Supabase não configurado. Edite assets/js/config.js ' +
      'com a URL e a anon key da sua instância self-hosted.'
    );
    window.SMClient = null;
    return;
  }

  if (!window.supabase || !window.supabase.createClient) {
    console.error('[Colégio São Marcos] SDK do Supabase não carregado.');
    window.SMClient = null;
    return;
  }

  window.SMClient = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
})();
