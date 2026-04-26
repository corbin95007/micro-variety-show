-- 为每个账号维护一份可手动开关的结果报告权限

create table if not exists public.user_report_access (
  user_id uuid references auth.users on delete cascade primary key,
  report_unlocked boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_user_report_access_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_user_report_access_updated_at on public.user_report_access;
create trigger touch_user_report_access_updated_at
  before update on public.user_report_access
  for each row execute function public.touch_user_report_access_updated_at();

insert into public.user_report_access (user_id)
select id
from auth.users
on conflict (user_id) do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nickname)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nickname', '新用户')
  )
  on conflict (id) do nothing;

  insert into public.user_report_access (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

alter table public.user_report_access enable row level security;

drop policy if exists "user_report_access_select_own" on public.user_report_access;
create policy "user_report_access_select_own" on public.user_report_access
  for select using (auth.uid() = user_id);
