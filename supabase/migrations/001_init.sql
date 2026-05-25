-- ============================================================
-- Balades — initial schema (migration 001)
-- Tables, partner-linking triggers, indexes, and RLS policies.
-- ============================================================

-- ---------- users (extends auth.users) ----------
create table public.users (
  id                    uuid primary key references auth.users(id) on delete cascade,
  email                 text unique not null,
  display_name          text not null,
  partner_id            uuid references public.users(id) on delete set null,
  pending_partner_email text,
  created_at            timestamptz not null default now()
);

-- ---------- balades ----------
-- theme_color + etapes are stored as JSONB so a balade is a single
-- self-contained, offline-ready row (matches the Balade TS type).
create table public.balades (
  id                     uuid primary key default gen_random_uuid(),
  title                  text not null,
  city                   text not null,
  country                text not null,
  theme_color            jsonb not null,
  difficulty             text not null check (difficulty in ('facile','moyen','difficile','boss')),
  status                 text not null default 'draft' check (status in ('draft','validated','completed','archived')),
  created_by             uuid not null references public.users(id) on delete cascade,
  created_at             timestamptz not null default now(),
  estimated_duration_min int not null default 0,
  distance_km            numeric(5,1) not null default 0,
  html_content           text not null default '',
  etapes                 jsonb not null default '[]'::jsonb,
  medical_specs          text[] not null default '{}',
  story_context          text not null default '',
  prologue               text not null default '',
  epilogue               text not null default '',
  centroid_lat           numeric(9,6),
  centroid_lng           numeric(9,6)
);

-- ---------- balade_sessions (one per user per balade) ----------
create table public.balade_sessions (
  id             uuid primary key default gen_random_uuid(),
  balade_id      uuid not null references public.balades(id) on delete cascade,
  user_id        uuid not null references public.users(id) on delete cascade,
  started_at     timestamptz not null default now(),
  completed_at   timestamptz,
  current_etape  int not null default 0,
  enigme_scores  jsonb not null default '{}'::jsonb,
  medical_scores jsonb not null default '{}'::jsonb,
  mission_scores jsonb not null default '{}'::jsonb,
  total_score    int not null default 0,
  notes          text not null default '',
  unique (balade_id, user_id)
);

-- ============================================================
-- Functions
-- ============================================================

-- Returns the caller's partner id without recursing through RLS.
create or replace function public.my_partner_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select partner_id from public.users where id = auth.uid();
$$;

-- On signup: create the public.users row and resolve partner linking
-- in both directions (handles the partner registering before or after).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display text;
  v_pending text;
  v_partner uuid;
begin
  v_display := coalesce(nullif(new.raw_user_meta_data->>'display_name',''),
                        split_part(new.email,'@',1));
  v_pending := lower(nullif(new.raw_user_meta_data->>'pending_partner_email',''));

  if v_pending is not null then
    select id into v_partner from public.users where email = v_pending;
  end if;

  if v_partner is null then
    select id into v_partner from public.users
      where pending_partner_email = lower(new.email) and partner_id is null
      limit 1;
  end if;

  insert into public.users (id, email, display_name, partner_id, pending_partner_email)
  values (new.id, new.email, v_display, v_partner, v_pending);

  if v_partner is not null then
    update public.users set partner_id = new.id where id = v_partner;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Indexes
-- ============================================================
create index balades_created_by_idx       on public.balades(created_by);
create index balades_status_idx           on public.balades(status);
create index balade_sessions_user_id_idx  on public.balade_sessions(user_id);
create index balade_sessions_balade_id_idx on public.balade_sessions(balade_id);

-- ============================================================
-- Row Level Security
-- The service_role key bypasses RLS automatically (used by API routes).
-- ============================================================
alter table public.users           enable row level security;
alter table public.balades         enable row level security;
alter table public.balade_sessions enable row level security;

-- users: read self + partner, write self
create policy "users read self and partner"
  on public.users for select
  using (id = auth.uid() or id = public.my_partner_id());

create policy "users insert self"
  on public.users for insert
  with check (id = auth.uid());

create policy "users update self"
  on public.users for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- balades: read own + partner's, write/update own
create policy "balades read own and partner"
  on public.balades for select
  using (created_by = auth.uid() or created_by = public.my_partner_id());

create policy "balades insert own"
  on public.balades for insert
  with check (created_by = auth.uid());

create policy "balades update own"
  on public.balades for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy "balades delete own"
  on public.balades for delete
  using (created_by = auth.uid());

-- sessions: read own + partner's, write/update own
create policy "sessions read own and partner"
  on public.balade_sessions for select
  using (user_id = auth.uid() or user_id = public.my_partner_id());

create policy "sessions insert own"
  on public.balade_sessions for insert
  with check (user_id = auth.uid());

create policy "sessions update own"
  on public.balade_sessions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "sessions delete own"
  on public.balade_sessions for delete
  using (user_id = auth.uid());
