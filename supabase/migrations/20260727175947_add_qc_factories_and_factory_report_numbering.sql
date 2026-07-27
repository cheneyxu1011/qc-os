create table if not exists public.qc_factories (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  report_prefix text not null,
  external_source text,
  external_id text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(btrim(code)) > 0),
  check (length(btrim(name)) > 0),
  check (report_prefix ~ '^[A-Z]{2,4}$')
);

create unique index if not exists qc_factories_code_idx
  on public.qc_factories (lower(btrim(code)));
create unique index if not exists qc_factories_name_idx
  on public.qc_factories (lower(btrim(name)));
create unique index if not exists qc_factories_report_prefix_idx
  on public.qc_factories (upper(btrim(report_prefix)));

insert into public.qc_factories (code, name, report_prefix, sort_order)
values
  ('XCJ', '新长江工厂', 'XCJ', 10),
  ('RD', '如东万誉工厂', 'RD', 20),
  ('WH', '万航芜湖工厂', 'WH', 30),
  ('CC', '越南古芝工厂', 'CC', 40),
  ('LA', '越南隆安工厂', 'LA', 50),
  ('JG', '掘港工厂', 'JG', 60)
on conflict do nothing;

alter table public.qc_reports
  add column if not exists factory_id uuid references public.qc_factories(id) on delete restrict,
  add column if not exists factory_name text,
  add column if not exists factory_code text,
  add column if not exists report_prefix text;

update public.qc_reports
set
  factory_id = factory.id,
  factory_name = factory.name,
  factory_code = factory.code,
  report_prefix = factory.report_prefix
from public.qc_factories as factory
where factory.code = 'XCJ'
  and public.qc_reports.factory_id is null;

alter table public.qc_reports
  alter column factory_id set not null,
  alter column factory_name set not null,
  alter column factory_code set not null,
  alter column report_prefix set not null;

alter table public.qc_reports
  drop constraint if exists qc_reports_report_year_report_sequence_key;

create unique index if not exists qc_reports_factory_year_sequence_idx
  on public.qc_reports (factory_id, report_year, report_sequence);
create index if not exists qc_reports_factory_found_date_idx
  on public.qc_reports (factory_id, found_date desc);

create or replace function public.qc_assign_report_number()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  next_sequence integer;
  selected_factory public.qc_factories%rowtype;
begin
  if new.report_year is null then
    new.report_year := extract(year from new.found_date)::integer;
  end if;

  select *
    into selected_factory
    from public.qc_factories
   where id = new.factory_id
     and is_active = true;

  if selected_factory.id is null then
    raise exception '工厂不存在或已停用';
  end if;

  new.factory_name := selected_factory.name;
  new.factory_code := selected_factory.code;
  new.report_prefix := upper(btrim(selected_factory.report_prefix));

  if new.report_no is null or new.report_sequence is null then
    perform pg_advisory_xact_lock(
      hashtextextended(new.factory_id::text || ':' || new.report_year::text, 7167)
    );

    select coalesce(max(report_sequence), 0) + 1
      into next_sequence
      from public.qc_reports
     where factory_id = new.factory_id
       and report_year = new.report_year;

    new.report_sequence := next_sequence;
    new.report_no :=
      new.report_prefix || new.report_year::text || '-' ||
      lpad(next_sequence::text, 3, '0');
  end if;

  return new;
end;
$$;

drop trigger if exists qc_factories_set_updated_at on public.qc_factories;
create trigger qc_factories_set_updated_at
before update on public.qc_factories
for each row execute function public.qc_set_updated_at();

alter table public.qc_factories enable row level security;
revoke all on table public.qc_factories from anon, authenticated;
grant select, insert, update, delete on table public.qc_factories to service_role;
