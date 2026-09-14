// supabaseClient.js
// Creates one shared Supabase client, used by both auth.js and app.js.
// Requires config.js (window.SUPABASE_CONFIG) and the Supabase CDN script
// to be loaded first — see the <script> order in index.html.

(() => {
  const { url, anonKey } = window.SUPABASE_CONFIG || {};

  if (!url || url.includes('YOUR-PROJECT-REF') || !anonKey || anonKey.includes('YOUR-ANON')) {
    console.warn(
      '[Codey] config.js still has placeholder Supabase values. ' +
      'Edit public/config.js with your real Supabase URL and anon key.'
    );
  }

  window.db = window.supabase.createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
})();
