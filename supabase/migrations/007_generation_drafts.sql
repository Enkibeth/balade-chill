-- ============================================================
-- Brouillon du formulaire de génération : une ligne par utilisateur,
-- écrasée à chaque auto-sauvegarde. Permet de reprendre ses réglages
-- (ville, instructions, quiz…) sur n'importe quel appareil si la
-- génération échoue ou que la page se ferme. Purgé au succès.
-- ============================================================

create table public.generation_drafts (
  user_id    uuid primary key references public.users(id) on delete cascade,
  payload    jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.generation_drafts enable row level security;

-- Only the owner can read / write their own draft row.
create policy "drafts read self"
  on public.generation_drafts for select
  using (user_id = auth.uid());

create policy "drafts insert self"
  on public.generation_drafts for insert
  with check (user_id = auth.uid());

create policy "drafts update self"
  on public.generation_drafts for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "drafts delete self"
  on public.generation_drafts for delete
  using (user_id = auth.uid());
