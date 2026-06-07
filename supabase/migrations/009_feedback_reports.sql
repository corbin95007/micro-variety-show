create table if not exists public.feedback_reports (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users on delete cascade not null,
  email text,
  nickname text,
  invite_code text,
  message text not null,
  page_url text,
  user_agent text,
  email_status text not null default 'pending',
  email_error text,
  email_message_id text,
  email_sent_at timestamptz,
  handling_status text not null default 'open',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'feedback_reports_message_length_check'
  ) then
    alter table public.feedback_reports
      add constraint feedback_reports_message_length_check
      check (char_length(trim(message)) between 10 and 1000);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'feedback_reports_email_status_check'
  ) then
    alter table public.feedback_reports
      add constraint feedback_reports_email_status_check
      check (email_status in ('pending', 'sent', 'failed'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'feedback_reports_handling_status_check'
  ) then
    alter table public.feedback_reports
      add constraint feedback_reports_handling_status_check
      check (handling_status in ('open', 'reviewing', 'resolved', 'ignored'));
  end if;
end $$;

create index if not exists feedback_reports_user_created_at_idx
  on public.feedback_reports (user_id, created_at desc);

create index if not exists feedback_reports_email_status_idx
  on public.feedback_reports (email_status, created_at desc);

create or replace function public.touch_feedback_reports_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_feedback_reports_updated_at on public.feedback_reports;
create trigger touch_feedback_reports_updated_at
  before update on public.feedback_reports
  for each row execute function public.touch_feedback_reports_updated_at();

alter table public.feedback_reports enable row level security;

drop policy if exists "feedback_reports_select_own" on public.feedback_reports;
create policy "feedback_reports_select_own" on public.feedback_reports
  for select using (auth.uid() = user_id);

drop policy if exists "feedback_reports_insert_own" on public.feedback_reports;
create policy "feedback_reports_insert_own" on public.feedback_reports
  for insert with check (
    auth.uid() = user_id
    and email_status = 'pending'
    and handling_status = 'open'
  );
