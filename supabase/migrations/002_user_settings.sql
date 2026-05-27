-- ============================================================
-- User-controlled settings: AI provider/model/key + Mapbox token
-- Stored per user with strict RLS (owner-only).
-- ============================================================

create table public.user_settings (
  user_id      uuid primary key references public.users(id) on delete cascade,
  ai_provider  text not null default 'anthropic'
               check (ai_provider in ('anthropic','openai','nvidia','groq')),
  ai_model     text not null default 'claude-sonnet-4-6',
  ai_api_key   text,
  mapbox_token text,
  updated_at   timestamptz not null default now()
);

alter table public.user_settings enable row level security;

-- Only the owner can read / write their own settings row.
create policy "settings read self"
  on public.user_settings for select
  using (user_id = auth.uid());

create policy "settings insert self"
  on public.user_settings for insert
  with check (user_id = auth.uid());

create policy "settings update self"
  on public.user_settings for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "settings delete self"
  on public.user_settings for delete
  using (user_id = auth.uid());
