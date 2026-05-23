-- ============================================================
-- 微综艺测试网站 - 完整数据库 Schema
-- 注意: 所有函数均使用 security definer 以避免 RLS 权限导致 500 错误
-- ============================================================

-- ============ 1. profiles 表 ============
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  nickname text,
  invite_code text unique not null,
  created_at timestamptz default now()
);

-- ============ 2. tests 题库表 ============
create table if not exists public.tests (
  id bigint generated always as identity primary key,
  question_text text not null,
  sort_order int default 0,
  dimension1 text,
  weight1 int default 1,
  dimension2 text,
  weight2 int default 1,
  tag_strongly_agree text,    -- 选5时触发的标签，格式 "标签名:+1, 标签名:+1"
  tag_agree text,             -- 选4时触发
  tag_neutral text,           -- 选3时触发
  tag_disagree text,          -- 选2时触发
  tag_strongly_disagree text, -- 选1时触发
  created_at timestamptz default now()
);

-- ============ 3. test_results 测试结果表 ============
create table if not exists public.test_results (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users on delete cascade not null,
  dim_female_male int default 0,
  dim_local_international int default 0,
  dim_accel_reform int default 0,
  dim_equal_merit int default 0,
  tags text[] default '{}',
  is_unlocked boolean default false,
  unlock_method text,         -- 'auto' | 'referral' | 'payment'
  unlocked_at timestamptz,
  created_at timestamptz default now()
);

-- ============ 4. referrals 邀请记录表 ============
create table if not exists public.referrals (
  id bigint generated always as identity primary key,
  inviter_id uuid references auth.users on delete cascade not null,
  invitee_id uuid references auth.users on delete cascade not null,
  created_at timestamptz default now(),
  unique(inviter_id, invitee_id)  -- 同一对只能记录一次
);

-- ============ 5. payments 支付记录表 ============
create table if not exists public.payments (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users on delete cascade not null,
  status text default 'pending',  -- 'pending' | 'success' | 'failed'
  amount int,
  created_at timestamptz default now()
);

-- ============ 6. 函数和触发器 ============

-- 邀请码自动生成函数
create or replace function public.generate_invite_code()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.invite_code is null then
    new.invite_code := substr(md5(random()::text), 1, 8);
  end if;
  return new;
end;
$$;

-- 新用户注册时自动创建 profile（security definer 防止 RLS 500 错误）
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
  );
  return new;
end;
$$;

-- ============ 7. 触发器绑定（先删后建，确保幂等） ============

drop trigger if exists set_invite_code on public.profiles;
create trigger set_invite_code
  before insert on public.profiles
  for each row execute function public.generate_invite_code();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ 8. RLS 策略 ============

-- profiles: 所有人可读（邀请追踪需要通过invite_code查找任意用户），但只能更新自己
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_by_invite_code" on public.profiles;
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles
  for select using (true);
-- 注意：profiles表只暴露 id/nickname/invite_code，不含敏感信息，允许公开读取

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- tests: 所有人可读（题库是公开的）
alter table public.tests enable row level security;

drop policy if exists "tests_select_all" on public.tests;
create policy "tests_select_all" on public.tests
  for select using (true);

-- test_results: 用户只能读写自己的结果
alter table public.test_results enable row level security;

drop policy if exists "results_select_own" on public.test_results;
create policy "results_select_own" on public.test_results
  for select using (auth.uid() = user_id);

drop policy if exists "results_insert_own" on public.test_results;
create policy "results_insert_own" on public.test_results
  for insert with check (auth.uid() = user_id);

drop policy if exists "results_update_own" on public.test_results;
create policy "results_update_own" on public.test_results
  for update using (auth.uid() = user_id);

-- referrals: 用户可以查看自己发出的邀请，可以插入新邀请
alter table public.referrals enable row level security;

drop policy if exists "referrals_select_own" on public.referrals;
create policy "referrals_select_own" on public.referrals
  for select using (auth.uid() = inviter_id);

drop policy if exists "referrals_insert" on public.referrals;
create policy "referrals_insert" on public.referrals
  for insert with check (auth.uid() = invitee_id);

-- payments: 用户只能查看自己的支付记录
alter table public.payments enable row level security;

drop policy if exists "payments_select_own" on public.payments;
create policy "payments_select_own" on public.payments
  for select using (auth.uid() = user_id);
