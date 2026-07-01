-- ============================================================
-- Parcours — mode « visite » (migration 005)
-- Table pour synchroniser les parcours entre appareils. Mêmes conventions
-- que public.balades : ligne JSONB autonome, RLS « own + partner ».
-- ============================================================

create table if not exists public.parcours (
  id                     uuid primary key default gen_random_uuid(),
  created_by             uuid not null references public.users(id) on delete cascade,
  created_at             timestamptz not null default now(),
  title                  text not null,
  city                   text not null,
  country                text not null,
  intro                  text not null default '',
  stops                  jsonb not null default '[]'::jsonb,
  google_maps_urls       jsonb not null default '[]'::jsonb,
  unresolved             jsonb not null default '[]'::jsonb,
  distance_km            numeric(6,1) not null default 0,
  estimated_duration_min int not null default 0,
  is_loop                boolean not null default true,
  html                   text not null default ''
);

create index if not exists parcours_created_by_idx
  on public.parcours(created_by, created_at desc);

-- ============================================================
-- Row Level Security (mirror public.balades)
-- Policies are dropped-then-created so this file stays idempotent: it can be
-- replayed on a database where the table already exists (e.g. applied once via
-- the dashboard and again by the Supabase branching integration on merge).
-- ============================================================
alter table public.parcours enable row level security;

drop policy if exists "parcours read own and partner" on public.parcours;
create policy "parcours read own and partner"
  on public.parcours for select
  using (created_by = auth.uid() or created_by = public.my_partner_id());

drop policy if exists "parcours insert own" on public.parcours;
create policy "parcours insert own"
  on public.parcours for insert
  with check (created_by = auth.uid());

drop policy if exists "parcours update own" on public.parcours;
create policy "parcours update own"
  on public.parcours for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists "parcours delete own" on public.parcours;
create policy "parcours delete own"
  on public.parcours for delete
  using (created_by = auth.uid());
