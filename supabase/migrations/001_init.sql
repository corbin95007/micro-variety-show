-- profiles: 用户扩展信息
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  nickname text,
  invite_code text unique not null,
  created_at timestamptz default now()
);

alter table profiles enable row level security;
create policy "Users can read own profile"
  on profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

-- tests: 题库（权重计分系统）
create table tests (
  id serial primary key,
  question_text text not null,
  dimension1 text,
  weight1 int,
  dimension2 text,
  weight2 int,
  tag_strongly_agree text,
  tag_agree text,
  tag_neutral text,
  tag_disagree text,
  tag_strongly_disagree text,
  sort_order int not null default 0
);

alter table tests enable row level security;
create policy "Anyone can read questions"
  on tests for select using (true);

-- test_results: 答题结果（-100到100分数范围）
create table test_results (
  id serial primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  dim_local_international int default 0,
  dim_female_male int default 0,
  dim_equal_merit int default 0,
  dim_accel_reform int default 0,
  tags text[] default '{}',
  is_unlocked boolean default false,
  unlock_method text,
  created_at timestamptz default now(),
  unlocked_at timestamptz
);

alter table test_results enable row level security;
create policy "Users can read own results"
  on test_results for select using (auth.uid() = user_id);
create policy "Users can insert own results"
  on test_results for insert with check (auth.uid() = user_id);
create policy "Users can update own results"
  on test_results for update using (auth.uid() = user_id);

-- referrals: 裂变追踪
create table referrals (
  id serial primary key,
  inviter_id uuid references profiles(id) not null,
  invitee_id uuid references profiles(id) not null,
  created_at timestamptz default now()
);

alter table referrals enable row level security;
create policy "Users can read own referrals"
  on referrals for select using (auth.uid() = inviter_id);

-- payments: 付费记录
create table payments (
  id serial primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  amount decimal not null,
  status text default 'pending' check (status in ('pending', 'success', 'failed')),
  created_at timestamptz default now()
);

alter table payments enable row level security;
create policy "Users can read own payments"
  on payments for select using (auth.uid() = user_id);

-- 自动生成邀请码的触发器
create or replace function generate_invite_code()
returns trigger as $$
begin
  new.invite_code := substr(md5(random()::text), 1, 8);
  return new;
end;
$$ language plpgsql;

create trigger set_invite_code
  before insert on profiles
  for each row execute function generate_invite_code();

-- 注册时自动创建 profile 的触发器
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, nickname)
  values (new.id, new.raw_user_meta_data->>'nickname');
  return new;
end;
$$ language plpgsql;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
