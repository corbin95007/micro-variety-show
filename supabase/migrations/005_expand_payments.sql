alter table public.payments
  add column if not exists provider text,
  add column if not exists product_code text,
  add column if not exists currency text,
  add column if not exists provider_order_no text,
  add column if not exists provider_trade_no text,
  add column if not exists checkout_url text,
  add column if not exists buyer_id text,
  add column if not exists buyer_logon_id text,
  add column if not exists paid_at timestamptz,
  add column if not exists notify_payload jsonb,
  add column if not exists failure_reason text,
  add column if not exists updated_at timestamptz default now();

update public.payments
set
  provider = coalesce(provider, 'alipay'),
  product_code = coalesce(product_code, 'report_unlock'),
  currency = coalesce(currency, 'CNY'),
  provider_order_no = coalesce(provider_order_no, 'LEGACY-' || id::text),
  status = coalesce(status, 'pending'),
  updated_at = coalesce(updated_at, now())
where
  provider is null
  or product_code is null
  or currency is null
  or provider_order_no is null
  or status is null
  or updated_at is null;

alter table public.payments
  alter column provider set default 'alipay',
  alter column provider set not null,
  alter column product_code set default 'report_unlock',
  alter column product_code set not null,
  alter column currency set default 'CNY',
  alter column currency set not null,
  alter column provider_order_no set not null,
  alter column status set default 'pending',
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'payments_status_check'
  ) then
    alter table public.payments
      add constraint payments_status_check
      check (status in ('pending', 'success', 'failed', 'refunded'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'payments_provider_check'
  ) then
    alter table public.payments
      add constraint payments_provider_check
      check (provider in ('alipay', 'wechat', 'stripe', 'lemonsqueezy', 'paddle', 'paypal'));
  end if;
end $$;

create unique index if not exists payments_provider_order_no_key
  on public.payments (provider, provider_order_no);

create unique index if not exists payments_provider_trade_no_key
  on public.payments (provider, provider_trade_no)
  where provider_trade_no is not null;

create index if not exists payments_user_status_idx
  on public.payments (user_id, status);
