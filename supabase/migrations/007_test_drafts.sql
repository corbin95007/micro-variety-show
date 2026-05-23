create table if not exists public.test_drafts (
  user_id uuid references auth.users on delete cascade primary key,
  draft jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.test_drafts enable row level security;

drop policy if exists "test_drafts_select_own" on public.test_drafts;
create policy "test_drafts_select_own" on public.test_drafts
  for select using (auth.uid() = user_id);

drop policy if exists "test_drafts_insert_own" on public.test_drafts;
create policy "test_drafts_insert_own" on public.test_drafts
  for insert with check (auth.uid() = user_id);

drop policy if exists "test_drafts_update_own" on public.test_drafts;
create policy "test_drafts_update_own" on public.test_drafts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "test_drafts_delete_own" on public.test_drafts;
create policy "test_drafts_delete_own" on public.test_drafts
  for delete using (auth.uid() = user_id);
