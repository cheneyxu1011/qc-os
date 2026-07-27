create table if not exists public.qc_style_catalog (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  style_no text not null,
  color text not null,
  source text not null default 'manual'
    check (source in ('manual', 'factory_os')),
  factory_style_id uuid references public.styles(id) on delete set null,
  external_id text,
  is_active boolean not null default true,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(btrim(brand)) > 0),
  check (length(btrim(style_no)) > 0),
  check (length(btrim(color)) > 0)
);

create unique index if not exists qc_style_catalog_identity_idx
  on public.qc_style_catalog (
    lower(btrim(brand)),
    lower(btrim(style_no)),
    lower(btrim(color))
  );

create index if not exists qc_style_catalog_style_idx
  on public.qc_style_catalog (style_no, brand, color)
  where is_active;

alter table public.qc_reports
  add column if not exists style_catalog_id uuid
  references public.qc_style_catalog(id) on delete set null;

create index if not exists qc_reports_style_catalog_idx
  on public.qc_reports (style_catalog_id);

drop trigger if exists qc_style_catalog_set_updated_at on public.qc_style_catalog;
create trigger qc_style_catalog_set_updated_at
  before update on public.qc_style_catalog
  for each row execute function public.qc_set_updated_at();

alter table public.qc_style_catalog enable row level security;
revoke all on table public.qc_style_catalog from anon, authenticated;
grant select, insert, update, delete on table public.qc_style_catalog to service_role;

insert into public.qc_style_catalog (brand, style_no, color)
select '迪赛特', 'JK57', '深灰'
where not exists (
  select 1
  from public.qc_style_catalog
  where lower(btrim(brand)) = lower('迪赛特')
    and lower(btrim(style_no)) = lower('JK57')
    and lower(btrim(color)) = lower('深灰')
);
