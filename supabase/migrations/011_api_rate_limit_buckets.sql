create table if not exists public.api_rate_limit_buckets (
  key text primary key,
  tokens double precision not null,
  capacity double precision not null,
  refill_per_second double precision not null,
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'api_rate_limit_buckets_capacity_check'
  ) then
    alter table public.api_rate_limit_buckets
      add constraint api_rate_limit_buckets_capacity_check
      check (capacity > 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'api_rate_limit_buckets_tokens_check'
  ) then
    alter table public.api_rate_limit_buckets
      add constraint api_rate_limit_buckets_tokens_check
      check (tokens >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'api_rate_limit_buckets_refill_check'
  ) then
    alter table public.api_rate_limit_buckets
      add constraint api_rate_limit_buckets_refill_check
      check (refill_per_second >= 0);
  end if;
end $$;

create index if not exists api_rate_limit_buckets_updated_at_idx
  on public.api_rate_limit_buckets (updated_at);

alter table public.api_rate_limit_buckets enable row level security;

drop policy if exists "service role manages api rate limit buckets" on public.api_rate_limit_buckets;
create policy "service role manages api rate limit buckets"
  on public.api_rate_limit_buckets
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create or replace function public.consume_api_rate_limit_tokens(p_buckets jsonb)
returns table (
  bucket_key text,
  allowed boolean,
  tokens_remaining double precision,
  retry_after_seconds integer
)
language sql
security definer
set search_path = public
as $$
  with params as (
    select clock_timestamp() as checked_at
  ),
  incoming as (
    select distinct on (bucket_key)
      bucket_key,
      capacity,
      refill_per_second,
      cost
    from (
      select
        left(trim(bucket->>'key'), 256) as bucket_key,
        least(greatest(coalesce(nullif(bucket->>'capacity', '')::double precision, 1), 1), 1000000) as capacity,
        least(greatest(coalesce(nullif(bucket->>'refill_per_second', '')::double precision, 0), 0), 1000000) as refill_per_second,
        least(greatest(coalesce(nullif(bucket->>'cost', '')::double precision, 1), 0.000001), 1000000) as cost
      from jsonb_array_elements(
        case
          when jsonb_typeof(p_buckets) = 'array' then p_buckets
          else '[]'::jsonb
        end
      ) as bucket
    ) parsed
    where bucket_key <> ''
    order by bucket_key
  ),
  upserted as (
    insert into public.api_rate_limit_buckets (
      key,
      tokens,
      capacity,
      refill_per_second,
      updated_at
    )
    select
      incoming.bucket_key,
      incoming.capacity,
      incoming.capacity,
      incoming.refill_per_second,
      params.checked_at
    from incoming
    cross join params
    order by incoming.bucket_key
    on conflict (key) do update
      set
        tokens = least(
          excluded.capacity,
          public.api_rate_limit_buckets.tokens
            + greatest(
              0,
              extract(epoch from (
                (select checked_at from params)
                - public.api_rate_limit_buckets.updated_at
              ))
            ) * public.api_rate_limit_buckets.refill_per_second
        ),
        capacity = excluded.capacity,
        refill_per_second = excluded.refill_per_second,
        updated_at = (select checked_at from params)
    returning key, tokens
  ),
  current_state as (
    select
      incoming.bucket_key,
      incoming.capacity,
      incoming.refill_per_second,
      incoming.cost,
      upserted.tokens
    from incoming
    join upserted on upserted.key = incoming.bucket_key
  ),
  limits as (
    select
      bucket_key,
      capacity,
      refill_per_second,
      cost,
      tokens,
      tokens >= cost as bucket_allowed,
      case
        when tokens >= cost then 0
        when refill_per_second <= 0 then 60
        else greatest(1, ceil((cost - tokens) / refill_per_second)::integer)
      end as bucket_retry_after
    from current_state
  ),
  summary as (
    select
      coalesce(bool_and(bucket_allowed), true) as all_allowed,
      coalesce(max(bucket_retry_after), 0) as retry_after
    from limits
  ),
  consumed as (
    update public.api_rate_limit_buckets bucket
      set
        tokens = greatest(0, bucket.tokens - limits.cost),
        updated_at = (select checked_at from params)
    from limits
    where bucket.key = limits.bucket_key
      and (select all_allowed from summary)
    returning bucket.key, bucket.tokens
  )
  select
    limits.bucket_key,
    (select all_allowed from summary) as allowed,
    case
      when (select all_allowed from summary) then coalesce(consumed.tokens, limits.tokens)
      else limits.tokens
    end as tokens_remaining,
    case
      when (select all_allowed from summary) then 0
      else (select retry_after from summary)
    end as retry_after_seconds
  from limits
  left join consumed on consumed.key = limits.bucket_key
  order by limits.bucket_key;
$$;

revoke all on function public.consume_api_rate_limit_tokens(jsonb) from public;
grant execute on function public.consume_api_rate_limit_tokens(jsonb) to service_role;
