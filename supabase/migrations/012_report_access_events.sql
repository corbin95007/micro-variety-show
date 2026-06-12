-- 授权账本：所有账号级报告解锁写入必须先留下事件，再原子更新 user_report_access。

create table if not exists public.report_access_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users on delete cascade not null,
  source text not null,
  method text not null,
  action text not null,
  report_unlocked boolean not null,
  request_id text,
  actor text,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint report_access_events_source_check check (
    source in ('payment', 'referral', 'episode_one_aired', 'manual', 'auto')
  ),
  constraint report_access_events_method_check check (
    method in ('payment', 'referral', 'auto', 'manual')
  ),
  constraint report_access_events_action_check check (
    action in ('grant', 'revoke')
  )
);

create index if not exists report_access_events_user_created_idx
  on public.report_access_events (user_id, created_at desc);

alter table public.report_access_events enable row level security;

drop policy if exists "report_access_events_select_own" on public.report_access_events;
create policy "report_access_events_select_own" on public.report_access_events
  for select using (auth.uid() = user_id);

create or replace function public.grant_report_access_with_event(
  p_user_id uuid,
  p_report_unlocked boolean,
  p_method text default null,
  p_source text default null,
  p_action text default null,
  p_request_id text default null,
  p_actor text default null,
  p_context jsonb default '{}'::jsonb
)
returns table (
  user_id uuid,
  report_unlocked boolean,
  note text,
  event_id bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_method text := lower(coalesce(nullif(trim(p_method), ''), 'manual'));
  v_source text := lower(coalesce(nullif(trim(p_source), ''), v_method));
  v_action text := lower(coalesce(nullif(trim(p_action), ''), case when p_report_unlocked then 'grant' else 'revoke' end));
  v_expected_action text := case when p_report_unlocked is true then 'grant' else 'revoke' end;
  v_context jsonb := coalesce(p_context, '{}'::jsonb);
  v_event_id bigint;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  if p_report_unlocked is null then
    raise exception 'p_report_unlocked is required';
  end if;

  if v_method not in ('payment', 'referral', 'auto', 'manual') then
    raise exception 'unsupported report access method';
  end if;

  if v_source not in ('payment', 'referral', 'episode_one_aired', 'manual', 'auto') then
    raise exception 'unsupported report access source';
  end if;

  if v_action not in ('grant', 'revoke') then
    raise exception 'unsupported report access action';
  end if;

  if v_action <> v_expected_action then
    raise exception 'report access action must match p_report_unlocked';
  end if;

  insert into public.report_access_events (
    user_id,
    source,
    method,
    action,
    report_unlocked,
    request_id,
    actor,
    context
  )
  values (
    p_user_id,
    v_source,
    v_method,
    v_action,
    p_report_unlocked,
    nullif(trim(coalesce(p_request_id, '')), ''),
    nullif(trim(coalesce(p_actor, '')), ''),
    v_context
  )
  returning id into v_event_id;

  insert into public.user_report_access (
    user_id,
    report_unlocked,
    note
  )
  values (
    p_user_id,
    p_report_unlocked,
    v_method
  )
  on conflict (user_id) do update
  set
    report_unlocked = excluded.report_unlocked,
    note = excluded.note;

  return query
  select
    ura.user_id,
    ura.report_unlocked,
    ura.note,
    v_event_id as event_id
  from public.user_report_access ura
  where ura.user_id = p_user_id;
end;
$$;

revoke all on function public.grant_report_access_with_event(
  uuid,
  boolean,
  text,
  text,
  text,
  text,
  text,
  jsonb
) from public;

grant execute on function public.grant_report_access_with_event(
  uuid,
  boolean,
  text,
  text,
  text,
  text,
  text,
  jsonb
) to service_role;
