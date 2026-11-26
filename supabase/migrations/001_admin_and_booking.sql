-- =====================================================================
-- GK Beauty Salon · 001 · Owner dashboard + online booking
-- Paste the WHOLE file into Supabase → SQL Editor → Run.
-- Safe to run again (it does not delete data).
-- Time zone: Europe/Athens (daylight saving handled by Postgres).
-- =====================================================================

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------
-- 1. Admin (only the owner)
-- ---------------------------------------------------------------------
create table if not exists public.admin_allowlist (
  email text primary key check (email = lower(email))
);

create table if not exists public.salon_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  created_at timestamptz not null default now()
);

insert into public.admin_allowlist (email)
values ('katerinagiannouka62@gmail.com')
on conflict do nothing;

create or replace function public.is_salon_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.salon_admins where user_id = auth.uid());
$$;

-- When the owner's login is created in Supabase, make her admin automatically.
create or replace function public._sync_salon_admin()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if lower(new.email) in (select email from public.admin_allowlist) then
    insert into public.salon_admins (user_id, email)
    values (new.id, lower(new.email))
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists gk_sync_salon_admin on auth.users;
create trigger gk_sync_salon_admin
after insert or update of email on auth.users
for each row execute function public._sync_salon_admin();

-- If the login already exists, add it now.
insert into public.salon_admins (user_id, email)
select u.id, lower(u.email)
from auth.users u
where lower(u.email) in (select email from public.admin_allowlist)
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------
-- 2. Catalogue: services, options, technicians
-- ---------------------------------------------------------------------
create table if not exists public.services (
  id           bigint generated always as identity primary key,
  name         text not null check (length(trim(name)) between 1 and 120),
  name_en      text,
  description  text,
  duration_min int  not null default 60 check (duration_min between 5 and 720),
  buffer_min   int  not null default 0  check (buffer_min between 0 and 240),
  price        numeric(8,2),
  deposit      numeric(8,2) not null default 0,
  active       boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists public.service_options (
  id           bigint generated always as identity primary key,
  service_id   bigint not null references public.services (id) on delete cascade,
  name         text not null check (length(trim(name)) between 1 and 80),
  duration_min int  not null default 60 check (duration_min between 5 and 720),
  price        numeric(8,2),
  active       boolean not null default true,
  sort_order   int not null default 0
);
create index if not exists service_options_service_idx on public.service_options (service_id);

create table if not exists public.staff (
  id         bigint generated always as identity primary key,
  name       text not null check (length(trim(name)) between 1 and 80),
  role       text,
  photo_url  text,
  active     boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.staff_services (
  staff_id   bigint not null references public.staff (id) on delete cascade,
  service_id bigint not null references public.services (id) on delete cascade,
  primary key (staff_id, service_id)
);

-- ---------------------------------------------------------------------
-- 3. Hours and closures
--    weekday: 1 = Δευτέρα … 7 = Κυριακή (ISO). Several rows = split shift.
-- ---------------------------------------------------------------------
create table if not exists public.business_hours (
  id         bigint generated always as identity primary key,
  weekday    smallint not null check (weekday between 1 and 7),
  open_time  time not null,
  close_time time not null,
  check (close_time > open_time)
);

create table if not exists public.staff_hours (
  id         bigint generated always as identity primary key,
  staff_id   bigint not null references public.staff (id) on delete cascade,
  weekday    smallint not null check (weekday between 1 and 7),
  start_time time not null,
  end_time   time not null,
  check (end_time > start_time)
);
create index if not exists staff_hours_staff_idx on public.staff_hours (staff_id, weekday);

-- Hours for one specific date (override the weekly hours).
-- A row with empty times = day off (Ρεπό).
create table if not exists public.staff_day_hours (
  id         bigint generated always as identity primary key,
  staff_id   bigint not null references public.staff (id) on delete cascade,
  day        date not null,
  start_time time,
  end_time   time,
  check ((start_time is null and end_time is null)
      or (start_time is not null and end_time is not null and end_time > start_time))
);
create index if not exists staff_day_hours_idx on public.staff_day_hours (staff_id, day);

-- Closures / holidays / breaks. staff_id empty = whole salon.
create table if not exists public.time_off (
  id        bigint generated always as identity primary key,
  staff_id  bigint references public.staff (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at   timestamptz not null,
  reason    text,
  check (ends_at > starts_at)
);
create index if not exists time_off_range_idx on public.time_off (starts_at, ends_at);

-- ---------------------------------------------------------------------
-- 4. Settings (one row)
-- ---------------------------------------------------------------------
create table if not exists public.booking_settings (
  id                   int primary key default 1 check (id = 1),
  salon_name           text not null default 'GK Beauty Salon',
  salon_phone          text not null default '2241132997',
  slot_step_min        int  not null default 15  check (slot_step_min between 5 and 120),
  min_notice_min       int  not null default 120 check (min_notice_min between 0 and 10080),
  max_days_ahead       int  not null default 60  check (max_days_ahead between 1 and 365),
  max_active_per_phone int  not null default 3   check (max_active_per_phone between 1 and 50),
  online_booking_open  boolean not null default true,
  require_confirmation boolean not null default false,
  sms_confirmation     text not null default 'Γεια σου {όνομα}! Το ραντεβού σου στο GK Beauty Salon επιβεβαιώθηκε: {ημέρα} στις {ώρα}, {υπηρεσία} με την {τεχνίτρια}. Για αλλαγές: 2241132997',
  sms_reminder         text not null default 'Γεια σου {όνομα}! Υπενθύμιση για το ραντεβού σου στο GK Beauty Salon: {ημέρα} στις {ώρα}, {υπηρεσία}. Σε περιμένουμε! Για αλλαγές: 2241132997',
  updated_at           timestamptz not null default now()
);
insert into public.booking_settings (id) values (1) on conflict do nothing;

-- ---------------------------------------------------------------------
-- 5. Appointments
-- ---------------------------------------------------------------------
create or replace function public._norm_phone(p text)
returns text
language sql immutable
set search_path = ''
as $$
  select case
    when d like '0030%' then substr(d, 5)
    when d like '30%' and length(d) = 12 then substr(d, 3)
    else d end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x;
$$;

create table if not exists public.appointments (
  id                   bigint generated always as identity primary key,
  service_id           bigint references public.services (id) on delete set null,
  option_id            bigint references public.service_options (id) on delete set null,
  staff_id             bigint not null references public.staff (id) on delete restrict,
  customer_name        text not null check (length(trim(customer_name)) between 1 and 120),
  phone                text not null check (length(phone) between 3 and 40),
  phone_norm           text,
  email                text,
  notes                text check (notes is null or length(notes) <= 1000),
  starts_at            timestamptz not null,
  ends_at              timestamptz not null,
  buffer_min           int not null default 0,
  block_range          tstzrange,
  status               text not null default 'confirmed'
                       check (status in ('pending','confirmed','completed','no_show','cancelled')),
  source               text not null default 'phone' check (source in ('online','phone')),
  service_name         text,
  option_name          text,
  price                numeric(8,2),
  deposit              numeric(8,2) not null default 0,
  payment_status       text not null default 'unpaid'
                       check (payment_status in ('unpaid','deposit_paid','paid','refunded')),
  confirmation_sent_at timestamptz,
  reminder_sent_at     timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists appointments_start_idx on public.appointments (starts_at);
create index if not exists appointments_phone_idx on public.appointments (phone_norm);

create or replace function public._appointments_before()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.phone_norm  := public._norm_phone(new.phone);
  new.block_range := tstzrange(new.starts_at, new.ends_at + make_interval(mins => new.buffer_min), '[)');
  new.updated_at  := now();
  if new.service_name is null and new.service_id is not null then
    select s.name into new.service_name from public.services s where s.id = new.service_id;
  end if;
  if new.option_name is null and new.option_id is not null then
    select o.name into new.option_name from public.service_options o where o.id = new.option_id;
  end if;
  return new;
end;
$$;

drop trigger if exists gk_appointments_before on public.appointments;
create trigger gk_appointments_before
before insert or update on public.appointments
for each row execute function public._appointments_before();

-- No double bookings: one technician can never have two active
-- appointments whose time (start → end + preparation buffer) overlaps.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'appointments_no_overlap') then
    alter table public.appointments
      add constraint appointments_no_overlap
      exclude using gist (staff_id with =, block_range with &&)
      where (status in ('pending','confirmed','completed'));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 6. Working hours helper
--    Day override → weekly hours → (if she has no weekly hours) salon hours.
-- ---------------------------------------------------------------------
create or replace function public._staff_intervals(p_staff_id bigint, p_day date)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable
set search_path = ''
as $$
  with f as (
    select
      exists (select 1 from public.staff_day_hours where staff_id = p_staff_id and day = p_day) as has_day,
      exists (select 1 from public.staff_hours where staff_id = p_staff_id) as has_week
  )
  select (p_day + h.start_time) at time zone 'Europe/Athens',
         (p_day + h.end_time)   at time zone 'Europe/Athens'
  from public.staff_day_hours h, f
  where f.has_day and h.staff_id = p_staff_id and h.day = p_day and h.start_time is not null
  union all
  select (p_day + h.start_time) at time zone 'Europe/Athens',
         (p_day + h.end_time)   at time zone 'Europe/Athens'
  from public.staff_hours h, f
  where not f.has_day and f.has_week and h.staff_id = p_staff_id
    and h.weekday = extract(isodow from p_day)
  union all
  select (p_day + h.open_time)  at time zone 'Europe/Athens',
         (p_day + h.close_time) at time zone 'Europe/Athens'
  from public.business_hours h, f
  where not f.has_day and not f.has_week
    and h.weekday = extract(isodow from p_day)
  order by 1;
$$;

-- Dashboard: working intervals of every active technician for a date range.
create or replace function public.get_schedule(p_from date, p_to date)
returns table (staff_id bigint, day date, starts_at timestamptz, ends_at timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_salon_admin() then
    raise exception 'Δεν έχεις πρόσβαση' using errcode = '42501';
  end if;
  if p_to - p_from > 62 then
    raise exception 'Μέγιστο διάστημα 62 ημέρες';
  end if;
  return query
    select s.id, d::date, i.starts_at, i.ends_at
    from public.staff s
    cross join generate_series(p_from, p_to, interval '1 day') d
    cross join lateral public._staff_intervals(s.id, d::date) i
    order by s.sort_order, s.id, 2, 3;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Public booking functions (the only way visitors touch bookings)
-- ---------------------------------------------------------------------
create or replace function public.get_available_slots(
  p_service_id bigint,
  p_date       date,
  p_staff_id   bigint default null,
  p_option_id  bigint default null
)
returns table (slot_start timestamptz, staff_id bigint)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_set   public.booking_settings;
  v_svc   public.services;
  v_dur   int;
  v_today date := (now() at time zone 'Europe/Athens')::date;
begin
  select * into v_set from public.booking_settings where id = 1;
  if not v_set.online_booking_open then return; end if;
  if p_date is null or p_date < v_today or p_date > v_today + v_set.max_days_ahead then return; end if;

  select * into v_svc from public.services where id = p_service_id and active;
  if not found then return; end if;

  if exists (select 1 from public.service_options where service_id = p_service_id and active) then
    select o.duration_min into v_dur
    from public.service_options o
    where o.id = p_option_id and o.service_id = p_service_id and o.active;
    if v_dur is null then return; end if;
  else
    v_dur := v_svc.duration_min;
  end if;

  return query
  with st as (
    select s.id
    from public.staff s
    where s.active
      and (p_staff_id is null or s.id = p_staff_id)
      and (exists (select 1 from public.staff_services ss where ss.staff_id = s.id and ss.service_id = p_service_id)
           or not exists (select 1 from public.staff_services ss where ss.service_id = p_service_id))
  ),
  iv as (
    select st.id as sid, i.starts_at as s, i.ends_at as e
    from st cross join lateral public._staff_intervals(st.id, p_date) i
  ),
  cand as (
    select iv.sid, g as t
    from iv
    cross join lateral generate_series(iv.s, iv.e - make_interval(mins => v_dur),
                                       make_interval(mins => v_set.slot_step_min)) g
  )
  select c.t, c.sid
  from cand c
  where c.t >= now() + make_interval(mins => v_set.min_notice_min)
    and not exists (
      select 1 from public.appointments a
      where a.staff_id = c.sid
        and a.status in ('pending','confirmed','completed')
        and a.block_range && tstzrange(c.t, c.t + make_interval(mins => v_dur + v_svc.buffer_min), '[)'))
    and not exists (
      select 1 from public.time_off o
      where (o.staff_id is null or o.staff_id = c.sid)
        and tstzrange(o.starts_at, o.ends_at, '[)') && tstzrange(c.t, c.t + make_interval(mins => v_dur), '[)'))
  order by c.t, c.sid;
end;
$$;

create or replace function public.request_appointment(
  p_service_id bigint,
  p_start      timestamptz,
  p_name       text,
  p_phone      text,
  p_email      text   default null,
  p_notes      text   default null,
  p_staff_id   bigint default null,
  p_option_id  bigint default null,
  p_honeypot   text   default null
)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_set    public.booking_settings;
  v_svc    public.services;
  v_opt    public.service_options;
  v_dur    int;
  v_price  numeric(8,2);
  v_staff  bigint;
  v_day    date := (p_start at time zone 'Europe/Athens')::date;
  v_phone  text := public._norm_phone(p_phone);
  v_id     bigint;
  v_status text;
begin
  -- Spam bots fill the hidden field: pretend success, save nothing.
  if coalesce(p_honeypot, '') <> '' then
    return jsonb_build_object('ok', true);
  end if;

  perform pg_advisory_xact_lock(hashtext('gk_booking'));

  select * into v_set from public.booking_settings where id = 1;
  if not v_set.online_booking_open then
    raise exception 'Οι online κρατήσεις είναι κλειστές. Καλέστε μας στο %.', v_set.salon_phone;
  end if;

  if length(trim(coalesce(p_name, ''))) < 2 or length(p_name) > 80 then
    raise exception 'Γράψτε το ονοματεπώνυμό σας.';
  end if;
  if length(v_phone) < 10 or length(v_phone) > 15 then
    raise exception 'Γράψτε ένα σωστό τηλέφωνο.';
  end if;
  if p_email is not null and p_email <> '' and p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Το email δεν είναι σωστό.';
  end if;
  if length(coalesce(p_notes, '')) > 500 then
    raise exception 'Οι σημειώσεις είναι πολύ μεγάλες.';
  end if;

  select * into v_svc from public.services where id = p_service_id and active;
  if not found then raise exception 'Η υπηρεσία δεν βρέθηκε.'; end if;

  if exists (select 1 from public.service_options where service_id = p_service_id and active) then
    select * into v_opt from public.service_options
    where id = p_option_id and service_id = p_service_id and active;
    if not found then raise exception 'Διαλέξτε επιλογή για την υπηρεσία.'; end if;
    v_dur := v_opt.duration_min; v_price := v_opt.price;
  else
    v_dur := v_svc.duration_min; v_price := v_svc.price;
  end if;

  -- The time must be one of the free slots (same rules as the website).
  select g.staff_id into v_staff
  from public.get_available_slots(p_service_id, v_day, p_staff_id, v_opt.id) g
  where g.slot_start = p_start
  order by (select count(*) from public.appointments a
            where a.staff_id = g.staff_id
              and a.status in ('pending','confirmed')
              and (a.starts_at at time zone 'Europe/Athens')::date = v_day),
           g.staff_id
  limit 1;
  if v_staff is null then
    raise exception 'Η ώρα αυτή δεν είναι πια διαθέσιμη. Διαλέξτε άλλη ώρα.';
  end if;

  if (select count(*) from public.appointments
      where phone_norm = v_phone and starts_at > now()
        and status in ('pending','confirmed')) >= v_set.max_active_per_phone then
    raise exception 'Έχετε ήδη αρκετά ενεργά ραντεβού. Καλέστε μας στο %.', v_set.salon_phone;
  end if;

  v_status := case when v_set.require_confirmation then 'pending' else 'confirmed' end;

  begin
    insert into public.appointments
      (service_id, option_id, staff_id, customer_name, phone, email, notes,
       starts_at, ends_at, buffer_min, status, source, price, deposit)
    values
      (p_service_id, v_opt.id, v_staff, trim(p_name), trim(p_phone), nullif(trim(p_email), ''),
       nullif(trim(p_notes), ''), p_start, p_start + make_interval(mins => v_dur),
       v_svc.buffer_min, v_status, 'online', v_price, v_svc.deposit)
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'Η ώρα αυτή μόλις κλείστηκε. Διαλέξτε άλλη ώρα.';
  end;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'status', v_status,
    'starts_at', p_start,
    'staff_name', (select name from public.staff where id = v_staff)
  );
end;
$$;

-- Website: public settings only (never customer data).
create or replace function public.get_public_settings()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'online_booking_open', online_booking_open,
    'max_days_ahead', max_days_ahead,
    'salon_name', salon_name,
    'salon_phone', salon_phone)
  from public.booking_settings where id = 1;
$$;

-- ---------------------------------------------------------------------
-- 8. Row Level Security
-- ---------------------------------------------------------------------
alter table public.admin_allowlist  enable row level security;
alter table public.salon_admins     enable row level security;
alter table public.services         enable row level security;
alter table public.service_options  enable row level security;
alter table public.staff            enable row level security;
alter table public.staff_services   enable row level security;
alter table public.business_hours   enable row level security;
alter table public.staff_hours      enable row level security;
alter table public.staff_day_hours  enable row level security;
alter table public.time_off         enable row level security;
alter table public.booking_settings enable row level security;
alter table public.appointments     enable row level security;

do $$
declare t text;
begin
  -- Owner: full access to the salon tables.
  foreach t in array array['services','service_options','staff','staff_services','business_hours',
                           'staff_hours','staff_day_hours','time_off','booking_settings','appointments']
  loop
    execute format('drop policy if exists admin_all on public.%I', t);
    execute format('create policy admin_all on public.%I for all to authenticated
                    using (public.is_salon_admin()) with check (public.is_salon_admin())', t);
  end loop;

  -- Owner can only READ the admin tables (changes only from the SQL Editor).
  foreach t in array array['admin_allowlist','salon_admins'] loop
    execute format('drop policy if exists admin_read on public.%I', t);
    execute format('create policy admin_read on public.%I for select to authenticated
                    using (public.is_salon_admin())', t);
  end loop;
end $$;

-- Website visitors: read the public catalogue and hours (no customer data).
drop policy if exists public_read on public.services;
create policy public_read on public.services for select to anon, authenticated using (active);
drop policy if exists public_read on public.service_options;
create policy public_read on public.service_options for select to anon, authenticated using (active);
drop policy if exists public_read on public.staff;
create policy public_read on public.staff for select to anon, authenticated using (active);
drop policy if exists public_read on public.staff_services;
create policy public_read on public.staff_services for select to anon, authenticated using (true);
drop policy if exists public_read on public.business_hours;
create policy public_read on public.business_hours for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------
-- 9. Permissions
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

revoke all on all tables in schema public from anon;
grant select on public.services, public.service_options, public.staff,
                public.staff_services, public.business_hours to anon;

grant select, insert, update, delete on
  public.services, public.service_options, public.staff, public.staff_services,
  public.business_hours, public.staff_hours, public.staff_day_hours, public.time_off,
  public.booking_settings, public.appointments
  to authenticated;
grant select on public.admin_allowlist, public.salon_admins to authenticated;
grant usage, select on all sequences in schema public to authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.get_available_slots(bigint, date, bigint, bigint) to anon, authenticated;
grant execute on function public.request_appointment(bigint, timestamptz, text, text, text, text, bigint, bigint, text) to anon, authenticated;
grant execute on function public.get_public_settings() to anon, authenticated;
grant execute on function public.is_salon_admin() to authenticated;
grant execute on function public._norm_phone(text) to authenticated;
grant execute on function public.get_schedule(date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 10. Photos (technician photos uploaded from the dashboard)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do update set public = true;

drop policy if exists "gk photos insert" on storage.objects;
create policy "gk photos insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.is_salon_admin());
drop policy if exists "gk photos update" on storage.objects;
create policy "gk photos update" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and public.is_salon_admin());
drop policy if exists "gk photos delete" on storage.objects;
create policy "gk photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.is_salon_admin());

-- ---------------------------------------------------------------------
-- 11. Starter data (placeholders — edit them in the dashboard).
--     Only added when the tables are empty.
-- ---------------------------------------------------------------------
do $$
declare v_acr bigint;
begin
  if not exists (select 1 from public.business_hours) then
    insert into public.business_hours (weekday, open_time, close_time) values
      (1,'09:00','21:00'),(2,'09:00','21:00'),(3,'09:00','21:00'),
      (4,'09:00','21:00'),(5,'09:00','21:00'),(6,'09:00','17:00');
  end if;

  if not exists (select 1 from public.staff) then
    insert into public.staff (name, role, sort_order) values
      ('Τεχνίτρια 1', 'Nail artist', 1),
      ('Τεχνίτρια 2', 'Nail artist', 2);
  end if;

  if not exists (select 1 from public.services) then
    insert into public.services (name, name_en, duration_min, price, sort_order) values
      ('Μανικιούρ ημιμόνιμο', 'Gel polish manicure', 60, 20, 1),
      ('Πεντικιούρ ημιμόνιμο', 'Gel polish pedicure', 60, 25, 3),
      ('Nail art (ανά νύχι)', 'Nail art (per nail)', 15, 2, 4);
    insert into public.services (name, name_en, duration_min, price, sort_order)
      values ('Τεχνητά νύχια', 'Nail extensions', 120, 35, 2)
      returning id into v_acr;
    insert into public.service_options (service_id, name, duration_min, price, sort_order) values
      (v_acr, 'Νούμερο 1', 120, 35, 1),
      (v_acr, 'Νούμερο 2', 120, 40, 2),
      (v_acr, 'Νούμερο 3', 120, 45, 3);
  end if;
end $$;
