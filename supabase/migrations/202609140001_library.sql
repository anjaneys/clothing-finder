-- Hosted PostgreSQL only. Apply in the Supabase SQL editor or with the Supabase CLI.
-- App reads/writes use a publishable key + the signed-in user's JWT, never service_role.
begin;

create table public.cf_saved_searches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  query text not null check (length(query) between 2 and 180),
  lane text not null check (lane in ('legit','reps')),
  target_fields jsonb not null default '{}' check (jsonb_typeof(target_fields) = 'object' and octet_length(target_fields::text) <= 4000),
  fingerprint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id,id), unique(owner_id,id,lane), unique(owner_id,fingerprint)
);
create table public.cf_search_runs (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  search_id uuid not null,
  origin text not null default 'session_import' check (origin = 'session_import'),
  created_at timestamptz not null default now(),
  unique(owner_id,search_id,id),
  foreign key(owner_id,search_id) references public.cf_saved_searches(owner_id,id) on delete cascade
);

-- These checks also run for direct REST/RPC callers, not only the application normalizer.
create function public.cf_valid_snapshot(s jsonb) returns boolean
language plpgsql stable set search_path = '' as $$
declare l jsonb; e jsonb; k text; v jsonb; o jsonb;
begin
  if jsonb_typeof(s) is distinct from 'object' or not (s ? 'listing') or octet_length(s::text) > 100000 or
    (s - array['listing','trustScore','trustCoverage','scoringVersion']) <> '{}'::jsonb then return false; end if;
  l := s->'listing'; e := l->'evidence';
  if jsonb_typeof(l) is distinct from 'object' or jsonb_typeof(e) is distinct from 'object' or
    (l - array['id','sourceId','sourceItemId','title','platform','url','image','price','currency','shipping','size','condition','lane','seller','evidence','availability','match','source','checkedAt','observedAt','expiresAt','provenance','notes','authenticity','observations','comparison','matchAssessment']) <> '{}'::jsonb then return false; end if;
  if not (l ?& array['id','title','platform','url','price','shipping','currency','lane','seller','evidence','availability','observedAt','provenance','size','condition','match','source','checkedAt','notes','authenticity']) then return false; end if;
  foreach k in array array['id','title','platform','url','currency','lane','seller','availability','observedAt','provenance','size','condition','match','source','checkedAt','notes','authenticity'] loop
    if jsonb_typeof(l->k) is distinct from 'string' then return false; end if;
  end loop;
  if length(l->>'id') not between 1 and 500 or length(l->>'seller') > 500 or length(l->>'size') > 100 or length(l->>'condition') > 500 or length(l->>'notes') > 20000 or length(l->>'authenticity') > 1000 or (l->>'match') not in ('close','related') or (l->>'source') not in ('research','live','manual') then return false; end if;
  if l ? 'sourceId' and jsonb_typeof(l->'sourceId') is distinct from 'string' then return false; end if;
  if l ? 'sourceItemId' and l->'sourceItemId' <> 'null'::jsonb and jsonb_typeof(l->'sourceItemId') is distinct from 'string' then return false; end if;
  if length(l->>'title') not between 1 and 1000 or length(l->>'platform') not between 1 and 100 or
    length(l->>'url') > 2048 or (l->>'url') !~ '^https://[^/@[:space:]]+/' or
    (l->>'currency') !~ '^[A-Z]{3}$' or
    (l->>'lane') not in ('legit','reps') or
    (l->>'availability') not in ('available','unknown','sold-out','stale') or
    (l->>'provenance') not in ('live_api','indexed_page','public_page','manual_input','reference_snapshot') then return false; end if;
  if l ? 'image' and (jsonb_typeof(l->'image') <> 'string' or length(l->>'image') > 2048 or (l->>'image') !~ '^https://[^/@[:space:]]+/') then return false; end if;
  if length(coalesce(l->>'sourceId','')) > 100 or length(coalesce(l->>'sourceItemId','')) > 1000 then return false; end if;
  if (s::text) ~* '(data:image/|"imageBase64"|"continuation"|"next_max_id"|"access_token"|"refresh_token")' then return false; end if;
  foreach k in array array['price','shipping'] loop
    v := l->k;
    if v <> 'null'::jsonb and (jsonb_typeof(v) <> 'number' or (v::text)::numeric < 0 or (v::text)::numeric > 1000000000) then return false; end if;
  end loop;
  if not (e ?& array['sold','active','reviews','positiveRate','accountAgeDays','photos']) or
    (e - array['sold','active','reviews','feedbackScore','positiveRate','accountAgeDays','photos']) <> '{}'::jsonb then return false; end if;
  foreach k in array array['sold','active','reviews','accountAgeDays','feedbackScore','positiveRate'] loop
    v := e->k;
    if v is not null and v <> 'null'::jsonb then
      if jsonb_typeof(v) <> 'number' or abs((v::text)::numeric) > 1000000000 then return false; end if;
      if k <> 'feedbackScore' and (v::text)::numeric < 0 then return false; end if;
      if k = 'positiveRate' and (v::text)::numeric > 1 then return false; end if;
      if k <> 'positiveRate' and trunc((v::text)::numeric) <> (v::text)::numeric then return false; end if;
    end if;
  end loop;
  if e->'photos' <> 'null'::jsonb and (e->>'photos') not in ('original','stock','copied') then return false; end if;
  if not (s ?& array['trustScore','trustCoverage','scoringVersion']) or s->>'scoringVersion' <> 'seller-v1' then return false; end if;
  if s->'trustScore' <> 'null'::jsonb and (jsonb_typeof(s->'trustScore') <> 'number' or (s->>'trustScore')::numeric not between 0 and 100) then return false; end if;
  if jsonb_typeof(s->'trustCoverage') <> 'number' or (s->>'trustCoverage')::numeric not between 0 and 1 then return false; end if;
  if (l->>'observedAt')::timestamptz > now() + interval '1 day' or (l->>'observedAt')::timestamptz < '2000-01-01'::timestamptz then return false; end if;
  perform (l->>'checkedAt')::timestamptz;
  if l ? 'expiresAt' and l->'expiresAt' <> 'null'::jsonb then
    if jsonb_typeof(l->'expiresAt') is distinct from 'string' then return false; end if;
    perform (l->>'expiresAt')::timestamptz;
  end if;
  if l ? 'observations' and (jsonb_typeof(l->'observations') <> 'array' or jsonb_array_length(l->'observations') > 128) then return false; end if;
  for o in select value from jsonb_array_elements(coalesce(l->'observations','[]'::jsonb)) loop
    if jsonb_typeof(o) is distinct from 'object' or not (o ?& array['field','state','rawValue','value','sourceUrl','observedAt','expiresAt','method','meaning']) then return false; end if;
    foreach k in array array['field','state','sourceUrl','observedAt','method','meaning'] loop
      if jsonb_typeof(o->k) is distinct from 'string' or length(o->>k) > 2048 then return false; end if;
    end loop;
    if o->>'state' not in ('observed','unknown') or o->>'method' not in ('live_api','indexed_page','public_page','manual_input','reference_snapshot') or (o->>'sourceUrl') !~ '^https://[^/@[:space:]]+/' then return false; end if;
    foreach k in array array['value','rawValue'] loop
      if jsonb_typeof(o->k) not in ('null','string','number') or length(o->>k) > 1000 then return false; end if;
    end loop;
    perform (o->>'observedAt')::timestamptz;
    if o->'expiresAt' <> 'null'::jsonb then perform (o->>'expiresAt')::timestamptz; end if;
  end loop;
  if l ? 'comparison' then
    o := l->'comparison';
    if jsonb_typeof(o) is distinct from 'object' or not(o ?& array['median','count']) or jsonb_typeof(o->'count') is distinct from 'number' or (o->>'count')::numeric not between 0 and 1000000000 then return false; end if;
    if o->'median' <> 'null'::jsonb and (jsonb_typeof(o->'median') is distinct from 'number' or (o->>'median')::numeric not between 0 and 1000000000) then return false; end if;
  end if;
  if l ? 'matchAssessment' then
    o := l->'matchAssessment';
    if jsonb_typeof(o) is distinct from 'object' or not(o ?& array['version','kind','label','rank','reasons','missing']) or o->>'version' <> 'identity-v1' or o->>'kind' not in ('code_match','model_match','variant_mismatch','unverified') or jsonb_typeof(o->'label') is distinct from 'string' or jsonb_typeof(o->'rank') is distinct from 'number' or jsonb_typeof(o->'reasons') is distinct from 'array' or jsonb_typeof(o->'missing') is distinct from 'array' then return false; end if;
    for v in select value from jsonb_array_elements((o->'reasons') || (o->'missing')) loop
      if jsonb_typeof(v) is distinct from 'string' or length(v#>>'{}') > 1000 then return false; end if;
    end loop;
  end if;
  return true;
exception when others then return false;
end $$;

create table public.cf_listing_observations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  search_id uuid not null,
  run_id uuid not null,
  snapshot jsonb not null check (public.cf_valid_snapshot(snapshot)),
  listing_key text generated always as (md5(coalesce(snapshot#>>'{listing,sourceId}','') || ':' || coalesce(snapshot#>>'{listing,sourceItemId}',snapshot#>>'{listing,url}'))) stored,
  fingerprint text generated always as (md5(snapshot::text)) stored,
  observed_at timestamptz not null,
  imported_at timestamptz not null default clock_timestamp(),
  price numeric generated always as ((snapshot#>>'{listing,price}')::numeric) stored,
  currency text generated always as (snapshot#>>'{listing,currency}') stored,
  platform text generated always as (snapshot#>>'{listing,platform}') stored,
  lane text generated always as (snapshot#>>'{listing,lane}') stored,
  availability text generated always as (snapshot#>>'{listing,availability}') stored,
  trust_score numeric generated always as ((snapshot->>'trustScore')::numeric) stored,
  check ((observed_at = (snapshot#>>'{listing,observedAt}')::timestamptz) is true),
  foreign key(owner_id,search_id,run_id) references public.cf_search_runs(owner_id,search_id,id) on delete cascade,
  foreign key(owner_id,search_id,lane) references public.cf_saved_searches(owner_id,id,lane) on delete cascade,
  unique(owner_id,run_id,listing_key,fingerprint)
);
create index cf_observations_latest on public.cf_listing_observations(owner_id,search_id,listing_key,observed_at desc,imported_at desc,id);
create index cf_observations_filters on public.cf_listing_observations(owner_id,lane,currency,platform);
create index cf_searches_recent on public.cf_saved_searches(owner_id,updated_at desc,id);

alter table public.cf_saved_searches enable row level security;
alter table public.cf_search_runs enable row level security;
alter table public.cf_listing_observations enable row level security;
create policy cf_searches_owner on public.cf_saved_searches for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy cf_runs_owner on public.cf_search_runs for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy cf_observations_owner on public.cf_listing_observations for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
revoke all on public.cf_saved_searches, public.cf_search_runs, public.cf_listing_observations from public, anon, authenticated;
grant select, insert, delete on public.cf_saved_searches to authenticated;
grant update(updated_at) on public.cf_saved_searches to authenticated;
grant select, insert on public.cf_search_runs, public.cf_listing_observations to authenticated;

create function public.cf_save_search(p_run_id uuid,p_query text,p_lane text,p_fields jsonb,p_snapshots jsonb,p_sources jsonb default '[]') returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_search uuid; v_existing uuid; v_snapshot jsonb; v_added integer := 0; v_count integer; v_key text; v_value jsonb;
begin
  if v_owner is null then raise exception 'Sign in required'; end if;
  if p_run_id is null or p_query is null or p_lane is null or p_fields is null or p_snapshots is null or p_lane not in ('legit','reps') or length(trim(p_query)) not between 2 and 180 or jsonb_typeof(p_fields) <> 'object' or octet_length(p_fields::text) > 4000 or jsonb_typeof(p_snapshots) <> 'array' or jsonb_array_length(p_snapshots) not between 1 and 100 then raise exception 'Invalid import'; end if;
  for v_key,v_value in select key,value from jsonb_each(p_fields) loop
    if v_key not in ('brand','model','styleCode','finish','size','category','material','season','color','silhouette') or (v_value <> 'null'::jsonb and (jsonb_typeof(v_value) <> 'string' or length(v_value#>>'{}') > 100)) then raise exception 'Invalid target field'; end if;
  end loop;
  -- Source diagnostics are deliberately not stored until a separate validated evidence contract exists.
  insert into public.cf_saved_searches(owner_id,query,lane,target_fields,fingerprint)
  values(v_owner,trim(p_query),p_lane,p_fields,md5(lower(trim(p_query)) || ':' || p_lane || ':' || p_fields::text))
  on conflict(owner_id,fingerprint) do update set updated_at = greatest(public.cf_saved_searches.updated_at,now())
  returning id into v_search;
  select search_id into v_existing from public.cf_search_runs where id = p_run_id;
  if v_existing is not null and v_existing <> v_search then raise exception 'Run belongs to another search'; end if;
  insert into public.cf_search_runs(id,owner_id,search_id) values(p_run_id,v_owner,v_search) on conflict(id) do nothing;
  for v_snapshot in select value from jsonb_array_elements(p_snapshots) loop
    if not public.cf_valid_snapshot(v_snapshot) or v_snapshot#>>'{listing,lane}' <> p_lane then raise exception 'Invalid listing snapshot'; end if;
    insert into public.cf_listing_observations(owner_id,search_id,run_id,snapshot,observed_at)
    values(v_owner,v_search,p_run_id,v_snapshot,(v_snapshot#>>'{listing,observedAt}')::timestamptz)
    on conflict(owner_id,run_id,listing_key,fingerprint) do nothing;
    get diagnostics v_count = row_count;
    v_added := v_added + v_count;
  end loop;
  return jsonb_build_object('searchId',v_search,'saved',v_added);
end $$;

-- Filter after selecting the latest observation so an older cheaper record cannot masquerade as current.
create function public.cf_latest(p_search_id uuid,p_lane text,p_currency text,p_platform text,p_text text,p_before timestamptz)
returns setof public.cf_listing_observations language sql stable security invoker set search_path = '' as $$
  select * from (
    select distinct on (search_id,listing_key) o.* from public.cf_listing_observations o
    where owner_id = (select auth.uid()) and (p_search_id is null or search_id = p_search_id) and imported_at <= p_before
    order by search_id,listing_key,observed_at desc,imported_at desc,id desc
  ) latest where lane = p_lane and currency = p_currency and (p_platform = '' or platform = p_platform)
    and (p_text = '' or position(lower(p_text) in lower(coalesce(snapshot#>>'{listing,title}','') || ' ' || coalesce(snapshot#>>'{listing,seller}','') || ' ' || coalesce(snapshot#>>'{listing,size}',''))) > 0);
$$;

create function public.cf_library_page(p_search_id uuid default null,p_lane text default 'legit',p_currency text default 'USD',p_platform text default '',p_text text default '',p_offset integer default 0,p_limit integer default 50,p_before timestamptz default now())
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_result jsonb;
begin
  if auth.uid() is null or p_limit is null or p_offset is null or p_lane is null or p_currency is null or p_platform is null or p_text is null or p_before is null or p_limit not between 1 and 200 or p_offset < 0 or p_lane not in ('legit','reps') or length(p_currency) <> 3 or length(p_text) > 180 then raise exception 'Invalid library query'; end if;
  with rows as materialized (select * from public.cf_latest(p_search_id,p_lane,p_currency,p_platform,p_text,p_before)), page as (
    select id,search_id,listing_key,observed_at,imported_at,price,currency,platform,availability,trust_score,snapshot from rows
    order by observed_at desc,imported_at desc,id desc limit p_limit offset p_offset
  ) select jsonb_build_object('total',(select count(*) from rows),'rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb)) into v_result;
  return v_result;
end $$;

create function public.cf_library_stats(p_search_id uuid default null,p_lane text default 'legit',p_currency text default 'USD',p_platform text default '',p_text text default '',p_before timestamptz default now())
returns jsonb language sql stable security invoker set search_path = '' as $$
  with rows as materialized (select * from public.cf_latest(p_search_id,p_lane,p_currency,p_platform,p_text,p_before)),
  totals as (select count(*) total,count(price) priced,count(*) filter(where trust_score is null) unknown_trust,min(price) lo,max(price) hi,percentile_disc(0.5) within group(order by price) median from rows),
  markets as (select platform label,count(*) count from rows group by platform order by count(*) desc,platform),
  available as (select availability label,count(*) count from rows group by availability order by count(*) desc,availability),
  trust_labels as (select case when trust_score is null then 'Not enough evidence' when trust_score >= 80 then 'Strong history' when trust_score >= 60 then 'Some positive evidence' when trust_score >= 35 then 'Use caution' else 'High risk' end label from rows),
  trust as (select label,count(*) count from trust_labels group by label order by count(*) desc,label),
  buckets as (select case when lo = hi then 0 else least(7,floor((price-lo)/(hi-lo)*8)::integer) end bucket,count(*) count from rows cross join totals where price is not null group by 1),
  prices as (select case when lo=hi then lo::text else round(lo+(hi-lo)/8*bucket)::text || '–' || round(lo+(hi-lo)/8*(bucket+1))::text end label,count from buckets cross join totals order by bucket)
  select jsonb_build_object('total',total,'priced',priced,'missingPrice',total-priced,'unknownTrust',unknown_trust,'min',lo,'median',median,'max',hi,
    'marketplaces',coalesce((select jsonb_agg(to_jsonb(markets)) from markets),'[]'::jsonb),
    'availability',coalesce((select jsonb_agg(to_jsonb(available)) from available),'[]'::jsonb),
    'trust',coalesce((select jsonb_agg(to_jsonb(trust)) from trust),'[]'::jsonb),
    'prices',coalesce((select jsonb_agg(to_jsonb(prices)) from prices),'[]'::jsonb)) from totals;
$$;

create function public.cf_library_options() returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('cutoff',clock_timestamp(),'currencies',coalesce((select jsonb_agg(currency order by currency) from (select distinct currency from public.cf_listing_observations) c),'[]'::jsonb),
    'platforms',coalesce((select jsonb_agg(platform order by platform) from (select distinct platform from public.cf_listing_observations) p),'[]'::jsonb));
$$;

-- Functions default to PUBLIC execution in PostgreSQL; explicitly narrow every function here.
revoke all on function public.cf_valid_snapshot(jsonb), public.cf_save_search(uuid,text,text,jsonb,jsonb,jsonb), public.cf_latest(uuid,text,text,text,text,timestamptz), public.cf_library_page(uuid,text,text,text,text,integer,integer,timestamptz), public.cf_library_stats(uuid,text,text,text,text,timestamptz), public.cf_library_options() from public, anon;
grant execute on function public.cf_valid_snapshot(jsonb), public.cf_save_search(uuid,text,text,jsonb,jsonb,jsonb), public.cf_latest(uuid,text,text,text,text,timestamptz), public.cf_library_page(uuid,text,text,text,text,integer,integer,timestamptz), public.cf_library_stats(uuid,text,text,text,text,timestamptz), public.cf_library_options() to authenticated;
commit;
