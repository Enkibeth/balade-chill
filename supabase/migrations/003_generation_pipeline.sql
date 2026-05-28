-- ============================================================
-- Optional two-stage generation pipeline config (per user).
-- The primary ai_provider/ai_model/ai_api_key columns draft the balade
-- with a cheap model; this jsonb holds an optional "refine" pass that lets
-- a stronger model (e.g. Sonnet) re-check key parts and return corrections.
-- Nullable: when absent, generation behaves as a single cheap-model call.
-- ============================================================

alter table public.user_settings
  add column if not exists generation_pipeline jsonb;
