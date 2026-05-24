create table if not exists public.auth_handoff_consumptions (
  nonce text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  flow text not null check (flow = 'recovery'),
  consumed_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists auth_handoff_consumptions_user_id_idx
  on public.auth_handoff_consumptions(user_id);

alter table public.auth_handoff_consumptions enable row level security;

drop policy if exists "service role manages auth handoff consumptions" on public.auth_handoff_consumptions;
create policy "service role manages auth handoff consumptions"
  on public.auth_handoff_consumptions
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
