// config.js
//
// Supabase's "anon" key is a PUBLIC key by design — it's meant to be shipped
// to the browser. It only grants the access your Row Level Security (RLS)
// policies allow (see supabase/schema.sql). Do NOT put your Supabase
// "service_role" key here — that one is secret and must never reach the
// browser.
//
// Find these values in your Supabase project: Project Settings > API.

window.SUPABASE_CONFIG = {
  url: 'https://zbicyxpfhniqfyiasfqo.supabase.co',
  anonKey: 'sb_publishable_cB6mFRR7o93N3yqRXeyjyQ_6uWA-zLt',
};
