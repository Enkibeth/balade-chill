-- ============================================================
-- Allow 'google' (Gemini) as an AI provider on user_settings.
-- ============================================================

alter table public.user_settings
  drop constraint if exists user_settings_ai_provider_check;

alter table public.user_settings
  add constraint user_settings_ai_provider_check
  check (ai_provider in ('anthropic', 'openai', 'nvidia', 'groq', 'google'));
