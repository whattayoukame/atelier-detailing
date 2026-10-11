create extension if not exists btree_gist;

create table public.studios (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}$'),
  published boolean not null default false,
  name text not null, eyebrow text not null default '', tagline text not null default '', description text not null default '',
  address text not null, phone text not null, timezone text not null default 'Europe/Moscow', currency text not null default 'RUB',
  hero text not null default '', logo text not null default '', cancellation_hours integer not null default 24 check (cancellation_hours >= 0),
  info_cards jsonb not null default '[]', schedule jsonb not null default '{}', days_off text[] not null default '{}',
  created_at timestamptz not null default now()
);
create table public.owner_memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  studio_id uuid not null references public.studios(id) on delete cascade,
  primary key (user_id, studio_id)
);
create table public.services (
  id uuid primary key, studio_id uuid not null references public.studios(id) on delete cascade,
  title text not null, category text not null, description text not null default '',
  price numeric(12,2) not null check (price >= 0), duration_minutes integer not null check (duration_minutes between 30 and 10080),
  buffer_minutes integer not null default 0 check (buffer_minutes between 0 and 240), enabled boolean not null default true,
  unique (id, studio_id)
);
create table public.bays (
  id uuid primary key, studio_id uuid not null references public.studios(id) on delete cascade,
  title text not null, enabled boolean not null default true,
  unique (id, studio_id)
);
create table public.gallery (
  id uuid primary key default gen_random_uuid(), studio_id uuid not null references public.studios(id) on delete cascade,
  image text not null, caption text not null, sort_order integer not null default 0,
  unique (id, studio_id)
);
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id),
  service_id uuid not null, bay_id uuid not null,
  customer_name text not null, phone text not null, car text not null,
  starts_at timestamptz not null, ends_at timestamptz not null,
  status text not null default 'reserved' check (status in ('reserved','arrived','ready','completed','cancelled')),
  cancellation_token uuid not null default gen_random_uuid(),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (studio_id, idempotency_key),
  foreign key (service_id,studio_id) references public.services(id,studio_id),
  foreign key (bay_id,studio_id) references public.bays(id,studio_id),
  constraint no_double_booking exclude using gist (bay_id with =, tstzrange(starts_at,ends_at,'[)') with &&) where (status <> 'cancelled')
);
create index bookings_studio_start_idx on public.bookings(studio_id,starts_at);
create table public.payments (
  id uuid primary key default gen_random_uuid(), studio_id uuid not null references public.studios(id),
  booking_id uuid not null references public.bookings(id), amount numeric(12,2) not null check (amount > 0),
  type text not null check(type in ('payment','refund')), created_at timestamptz not null default now()
);
create index payments_studio_created_idx on public.payments(studio_id,created_at);
create table public.assistant_requests (
  id uuid primary key default gen_random_uuid(), studio_id uuid not null references public.studios(id),
  identity_hash text not null, input_tokens integer not null default 0, output_tokens integer not null default 0,
  created_at timestamptz not null default now()
);
create index assistant_limit_idx on public.assistant_requests(studio_id,identity_hash,created_at);

alter table public.studios enable row level security;
alter table public.owner_memberships enable row level security;
alter table public.services enable row level security;
alter table public.bays enable row level security;
alter table public.gallery enable row level security;
alter table public.bookings enable row level security;
alter table public.payments enable row level security;
alter table public.assistant_requests enable row level security;
-- No anon/authenticated table policies: all reads/writes are checked by Edge Function.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('studio-media','studio-media',true,5242880,array['image/png','image/jpeg','image/webp'])
on conflict(id) do nothing;

create or replace function public.reserve_booking(
  p_studio uuid, p_service uuid, p_start timestamptz, p_name text, p_phone text, p_car text, p_key uuid
) returns public.bookings language plpgsql security definer set search_path=public,pg_temp as $$
declare v_studio public.studios; v_service public.services; v_existing public.bookings; v_booking public.bookings;
        v_bay public.bays; v_end timestamptz; v_day text; v_hours jsonb; v_local timestamp;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_studio::text, 117));
  select * into v_existing from public.bookings where studio_id=p_studio and idempotency_key=p_key;
  if found then return v_existing; end if;
  select * into v_studio from public.studios where id=p_studio and published=true;
  if not found then raise exception 'Студия пока не принимает онлайн-записи'; end if;
  select * into v_service from public.services where id=p_service and studio_id=p_studio and enabled=true;
  if not found then raise exception 'Услуга недоступна'; end if;
  if length(trim(p_name)) < 2 or length(trim(p_phone)) < 7 or length(trim(p_car)) < 2 then raise exception 'Проверьте контактные данные'; end if;
  if p_start < now() + interval '30 minutes' or p_start > now() + interval '90 days' then raise exception 'Дата вне доступного диапазона'; end if;
  v_local := p_start at time zone v_studio.timezone;
  if extract(minute from v_local)::int % 30 <> 0 or extract(second from v_local)::int <> 0 then raise exception 'Неверное время'; end if;
  v_day := to_char(v_local,'YYYY-MM-DD');
  if v_day=any(v_studio.days_off) then raise exception 'Студия закрыта в этот день'; end if;
  v_hours := v_studio.schedule -> extract(dow from v_local)::int::text;
  if v_hours is null or v_hours='null'::jsonb or v_local::time < (v_hours->>'open')::time or v_local::time >= (v_hours->>'close')::time then
    raise exception 'Студия закрыта в выбранное время';
  end if;
  if v_service.duration_minutes < 1440 and v_local::time + make_interval(mins => v_service.duration_minutes) > (v_hours->>'close')::time then
    raise exception 'Услуга не помещается в рабочий день';
  end if;
  v_end := p_start + make_interval(mins => v_service.duration_minutes + v_service.buffer_minutes);
  for v_bay in select * from public.bays where studio_id=p_studio and enabled=true order by title loop
    if not exists (select 1 from public.bookings b where b.bay_id=v_bay.id and b.status <> 'cancelled' and b.starts_at<v_end and b.ends_at>p_start) then
      insert into public.bookings(studio_id,service_id,bay_id,customer_name,phone,car,starts_at,ends_at,idempotency_key)
      values (p_studio,p_service,v_bay.id,trim(p_name),trim(p_phone),trim(p_car),p_start,v_end,p_key) returning * into v_booking;
      return v_booking;
    end if;
  end loop;
  raise exception 'Это время уже занято';
end $$;

create or replace function public.reschedule_booking(p_studio uuid,p_booking uuid,p_start timestamptz)
returns public.bookings language plpgsql security definer set search_path=public,pg_temp as $$
declare v_book public.bookings; v_bay public.bays; v_service public.services; v_studio public.studios;
        v_end timestamptz; v_local timestamp; v_hours jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_studio::text,117));
  select * into v_book from public.bookings where id=p_booking and studio_id=p_studio and status<>'cancelled';
  if not found then raise exception 'Запись не найдена'; end if;
  select * into v_service from public.services where id=v_book.service_id;
  select * into v_studio from public.studios where id=p_studio;
  v_local := p_start at time zone v_studio.timezone;
  v_hours := v_studio.schedule -> extract(dow from v_local)::int::text;
  if p_start < now() or to_char(v_local,'YYYY-MM-DD')=any(v_studio.days_off) or v_hours is null or v_hours='null'::jsonb
    or v_local::time < (v_hours->>'open')::time or v_local::time >= (v_hours->>'close')::time
    or (v_service.duration_minutes < 1440 and v_local::time + make_interval(mins => v_service.duration_minutes) > (v_hours->>'close')::time)
    or extract(minute from v_local)::int % 30 <> 0 then raise exception 'Неверное время'; end if;
  v_end := p_start + make_interval(mins => v_service.duration_minutes + v_service.buffer_minutes);
  for v_bay in select * from public.bays where studio_id=p_studio and enabled=true order by title loop
    if not exists(select 1 from public.bookings b where b.id<>p_booking and b.bay_id=v_bay.id and b.status<>'cancelled' and b.starts_at<v_end and b.ends_at>p_start) then
      update public.bookings set bay_id=v_bay.id,starts_at=p_start,ends_at=v_end where id=p_booking returning * into v_book;
      return v_book;
    end if;
  end loop;
  raise exception 'Новое время уже занято';
end $$;

create or replace function public.begin_ai_request(p_studio uuid,p_identity text,p_limit integer)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_studio::text || p_identity, 17));
  if (select count(*) from public.assistant_requests where studio_id=p_studio and identity_hash=p_identity and created_at>now()-interval '1 hour')>=10 then
    raise exception 'Слишком много запросов. Попробуйте через час';
  end if;
  if (select coalesce(sum(input_tokens+output_tokens),0) from public.assistant_requests where studio_id=p_studio and created_at>now()-interval '1 day')>=p_limit then
    raise exception 'Лимит помощника на сегодня исчерпан';
  end if;
  insert into public.assistant_requests(studio_id,identity_hash) values(p_studio,p_identity) returning id into v_id;
  return v_id;
end $$;

revoke all on function public.reserve_booking(uuid,uuid,timestamptz,text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.reschedule_booking(uuid,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.begin_ai_request(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.reserve_booking(uuid,uuid,timestamptz,text,text,text,uuid) to service_role;
grant execute on function public.reschedule_booking(uuid,uuid,timestamptz) to service_role;
grant execute on function public.begin_ai_request(uuid,text,integer) to service_role;
