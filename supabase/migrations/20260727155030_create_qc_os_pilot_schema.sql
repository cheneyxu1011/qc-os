-- QC OS pilot schema migration.
-- All tables are isolated with a qc_ prefix so they can coexist with Factory OS.

create extension if not exists pgcrypto;

create table if not exists public.qc_departments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  external_source text,
  external_id text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.qc_people (
  id uuid primary key default gen_random_uuid(),
  employee_no text unique,
  name text not null,
  role_name text,
  phone text,
  external_source text,
  external_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.qc_person_departments (
  person_id uuid not null references public.qc_people(id) on delete cascade,
  department_id uuid not null references public.qc_departments(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (person_id, department_id)
);

create table if not exists public.qc_reports (
  id uuid primary key default gen_random_uuid(),
  report_no text unique,
  report_year integer not null,
  report_sequence integer,
  found_date date not null,
  brand text,
  style_no text,
  color text,
  severity text not null
    check (severity in ('minor', 'general', 'serious', 'unacceptable', 'customer_complaint')),
  source_department_id uuid references public.qc_departments(id) on delete restrict,
  source_department_name text not null,
  reporter_person_id uuid references public.qc_people(id) on delete set null,
  reporter_name text not null,
  kpi_enabled boolean not null default true,
  problem_description text not null,
  root_cause text,
  workflow_step smallint not null default 1 check (workflow_step between 1 and 5),
  status text not null default 'draft'
    check (status in (
      'draft',
      'submitted',
      'executing',
      'pending_review',
      'review_rejected',
      'pending_archive',
      'archived'
    )),
  factory_style_id uuid references public.styles(id) on delete set null,
  factory_order_id text,
  factory_production_batch_id text,
  archived_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (report_year, report_sequence)
);

create table if not exists public.qc_report_responsible_departments (
  report_id uuid not null references public.qc_reports(id) on delete cascade,
  department_id uuid not null references public.qc_departments(id) on delete restrict,
  department_name text not null,
  created_at timestamptz not null default now(),
  primary key (report_id, department_id)
);

create table if not exists public.qc_report_responsible_people (
  report_id uuid not null references public.qc_reports(id) on delete cascade,
  person_id uuid not null references public.qc_people(id) on delete restrict,
  person_name text not null,
  department_id uuid references public.qc_departments(id) on delete set null,
  department_name text,
  created_at timestamptz not null default now(),
  primary key (report_id, person_id)
);

create table if not exists public.qc_corrective_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.qc_reports(id) on delete cascade,
  sequence_no integer not null check (sequence_no > 0),
  action_type text not null
    check (action_type in ('temporary_correction', 'permanent_correction', 'preventive_action')),
  action_content text not null,
  due_date date,
  status text not null default 'pending'
    check (status in ('pending', 'executed', 'overdue', 'cancelled')),
  reminder_note text,
  executed_by_person_id uuid references public.qc_people(id) on delete set null,
  executed_by_name text,
  execution_note text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (report_id, sequence_no)
);

create table if not exists public.qc_action_assignees (
  action_id uuid not null references public.qc_corrective_actions(id) on delete cascade,
  person_id uuid not null references public.qc_people(id) on delete restrict,
  person_name text not null,
  department_id uuid references public.qc_departments(id) on delete set null,
  department_name text,
  assigned_at timestamptz not null default now(),
  primary key (action_id, person_id)
);

create table if not exists public.qc_attachments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.qc_reports(id) on delete cascade,
  action_id uuid references public.qc_corrective_actions(id) on delete cascade,
  attachment_type text not null
    check (attachment_type in (
      'problem_before',
      'action_after',
      'review_evidence',
      'archive_pdf',
      'archive_image',
      'comment_attachment'
    )),
  s3_bucket text not null,
  s3_key text not null unique,
  original_file_name text,
  content_type text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  uploaded_by_person_id uuid references public.qc_people(id) on delete set null,
  uploaded_by_name text,
  uploaded_at timestamptz not null default now()
);

create table if not exists public.qc_reviews (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.qc_reports(id) on delete cascade,
  review_department_id uuid references public.qc_departments(id) on delete set null,
  review_department_name text not null,
  reviewer_person_id uuid references public.qc_people(id) on delete set null,
  reviewer_name text not null,
  review_result text not null check (review_result in ('approved', 'rejected')),
  review_comment text not null,
  reviewed_at timestamptz not null default now()
);

create table if not exists public.qc_archives (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null unique references public.qc_reports(id) on delete cascade,
  approved_by_person_id uuid references public.qc_people(id) on delete set null,
  approved_by_name text not null,
  archive_comment text,
  kpi_locked boolean not null default true,
  archived_at timestamptz not null default now()
);

create table if not exists public.qc_kpi_entries (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.qc_reports(id) on delete cascade,
  action_id uuid references public.qc_corrective_actions(id) on delete cascade,
  person_id uuid references public.qc_people(id) on delete set null,
  person_name text not null,
  department_id uuid references public.qc_departments(id) on delete set null,
  department_name text,
  kpi_month date not null,
  base_score numeric(6, 2) not null default 100,
  deduction_points numeric(6, 2) not null check (deduction_points >= 0),
  reason_code text not null
    check (reason_code in ('report_severity', 'action_overdue', 'action_not_executed', 'repeat_issue')),
  reason text,
  locked boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.qc_comments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.qc_reports(id) on delete cascade,
  author_person_id uuid references public.qc_people(id) on delete set null,
  author_name text not null,
  author_department_name text,
  comment text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.qc_audit_events (
  id bigint generated always as identity primary key,
  report_id uuid references public.qc_reports(id) on delete cascade,
  action_id uuid references public.qc_corrective_actions(id) on delete cascade,
  event_type text not null,
  actor_person_id uuid references public.qc_people(id) on delete set null,
  actor_name text,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists qc_reports_status_idx
  on public.qc_reports (status, found_date desc);
create index if not exists qc_reports_style_idx
  on public.qc_reports (style_no, found_date desc);
create index if not exists qc_reports_factory_style_idx
  on public.qc_reports (factory_style_id);
create index if not exists qc_reports_source_department_idx
  on public.qc_reports (source_department_id);
create index if not exists qc_reports_reporter_idx
  on public.qc_reports (reporter_person_id);
create index if not exists qc_person_departments_department_idx
  on public.qc_person_departments (department_id, person_id);
create index if not exists qc_report_departments_department_idx
  on public.qc_report_responsible_departments (department_id, report_id);
create index if not exists qc_report_people_person_idx
  on public.qc_report_responsible_people (person_id, report_id);
create index if not exists qc_report_people_department_idx
  on public.qc_report_responsible_people (department_id, report_id);
create index if not exists qc_actions_report_status_idx
  on public.qc_corrective_actions (report_id, status, due_date);
create index if not exists qc_actions_executor_idx
  on public.qc_corrective_actions (executed_by_person_id);
create index if not exists qc_action_assignees_person_idx
  on public.qc_action_assignees (person_id, action_id);
create index if not exists qc_action_assignees_department_idx
  on public.qc_action_assignees (department_id, action_id);
create index if not exists qc_attachments_report_type_idx
  on public.qc_attachments (report_id, attachment_type, uploaded_at);
create index if not exists qc_attachments_action_idx
  on public.qc_attachments (action_id);
create index if not exists qc_attachments_uploader_idx
  on public.qc_attachments (uploaded_by_person_id);
create index if not exists qc_reviews_report_idx
  on public.qc_reviews (report_id, reviewed_at desc);
create index if not exists qc_reviews_department_idx
  on public.qc_reviews (review_department_id);
create index if not exists qc_reviews_reviewer_idx
  on public.qc_reviews (reviewer_person_id);
create index if not exists qc_archives_approver_idx
  on public.qc_archives (approved_by_person_id);
create index if not exists qc_kpi_person_month_idx
  on public.qc_kpi_entries (person_id, kpi_month);
create index if not exists qc_kpi_report_idx
  on public.qc_kpi_entries (report_id);
create index if not exists qc_kpi_action_idx
  on public.qc_kpi_entries (action_id);
create index if not exists qc_kpi_department_idx
  on public.qc_kpi_entries (department_id);
create index if not exists qc_comments_report_idx
  on public.qc_comments (report_id, created_at);
create index if not exists qc_comments_author_idx
  on public.qc_comments (author_person_id);
create index if not exists qc_audit_report_idx
  on public.qc_audit_events (report_id, created_at);
create index if not exists qc_audit_action_idx
  on public.qc_audit_events (action_id);
create index if not exists qc_audit_actor_idx
  on public.qc_audit_events (actor_person_id);

create or replace function public.qc_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.qc_assign_report_number()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  next_sequence integer;
begin
  if new.report_year is null then
    new.report_year := extract(year from new.found_date)::integer;
  end if;

  if new.report_no is null or new.report_sequence is null then
    perform pg_advisory_xact_lock(7167, new.report_year);

    select coalesce(max(report_sequence), 0) + 1
      into next_sequence
      from public.qc_reports
     where report_year = new.report_year;

    new.report_sequence := next_sequence;
    new.report_no := 'XCJ' || new.report_year::text || '-' || lpad(next_sequence::text, 3, '0');
  end if;

  return new;
end;
$$;

drop trigger if exists qc_departments_set_updated_at on public.qc_departments;
create trigger qc_departments_set_updated_at
before update on public.qc_departments
for each row execute function public.qc_set_updated_at();

drop trigger if exists qc_people_set_updated_at on public.qc_people;
create trigger qc_people_set_updated_at
before update on public.qc_people
for each row execute function public.qc_set_updated_at();

drop trigger if exists qc_reports_set_updated_at on public.qc_reports;
create trigger qc_reports_set_updated_at
before update on public.qc_reports
for each row execute function public.qc_set_updated_at();

drop trigger if exists qc_reports_assign_number on public.qc_reports;
create trigger qc_reports_assign_number
before insert on public.qc_reports
for each row execute function public.qc_assign_report_number();

drop trigger if exists qc_actions_set_updated_at on public.qc_corrective_actions;
create trigger qc_actions_set_updated_at
before update on public.qc_corrective_actions
for each row execute function public.qc_set_updated_at();

alter table public.qc_departments enable row level security;
alter table public.qc_people enable row level security;
alter table public.qc_person_departments enable row level security;
alter table public.qc_reports enable row level security;
alter table public.qc_report_responsible_departments enable row level security;
alter table public.qc_report_responsible_people enable row level security;
alter table public.qc_corrective_actions enable row level security;
alter table public.qc_action_assignees enable row level security;
alter table public.qc_attachments enable row level security;
alter table public.qc_reviews enable row level security;
alter table public.qc_archives enable row level security;
alter table public.qc_kpi_entries enable row level security;
alter table public.qc_comments enable row level security;
alter table public.qc_audit_events enable row level security;

revoke all on table public.qc_departments from anon, authenticated;
revoke all on table public.qc_people from anon, authenticated;
revoke all on table public.qc_person_departments from anon, authenticated;
revoke all on table public.qc_reports from anon, authenticated;
revoke all on table public.qc_report_responsible_departments from anon, authenticated;
revoke all on table public.qc_report_responsible_people from anon, authenticated;
revoke all on table public.qc_corrective_actions from anon, authenticated;
revoke all on table public.qc_action_assignees from anon, authenticated;
revoke all on table public.qc_attachments from anon, authenticated;
revoke all on table public.qc_reviews from anon, authenticated;
revoke all on table public.qc_archives from anon, authenticated;
revoke all on table public.qc_kpi_entries from anon, authenticated;
revoke all on table public.qc_comments from anon, authenticated;
revoke all on table public.qc_audit_events from anon, authenticated;

insert into public.qc_departments (code, name, sort_order)
values
  ('SEWING', '车缝部', 10),
  ('BONDING', '压胶部', 20),
  ('CUTTING', '裁剪部', 30),
  ('FACTORY_MANAGER', '厂长', 40),
  ('QC', 'QC部', 50),
  ('BUSINESS', '业务部', 60)
on conflict (code) do update
set name = excluded.name,
    sort_order = excluded.sort_order,
    is_active = true;

insert into public.qc_people (employee_no, name, role_name)
values
  ('QC-P001', '夏红霞', '车缝责任人'),
  ('QC-P002', '朱小丽', '车缝责任人'),
  ('QC-P003', '李小华', '压胶责任人'),
  ('QC-P004', '张亚琴', '厂长 / 裁剪主管'),
  ('QC-P005', '朱玲玲', 'QC'),
  ('QC-P006', '张吉云', 'QC'),
  ('QC-P007', '顾瑶', '业务'),
  ('QC-P008', '顾永宏', '业务')
on conflict (employee_no) do update
set name = excluded.name,
    role_name = excluded.role_name,
    is_active = true;

insert into public.qc_person_departments (person_id, department_id, is_primary)
select p.id, d.id, x.is_primary
from (
  values
    ('QC-P001', 'SEWING', true),
    ('QC-P002', 'SEWING', true),
    ('QC-P003', 'BONDING', true),
    ('QC-P004', 'CUTTING', true),
    ('QC-P004', 'FACTORY_MANAGER', false),
    ('QC-P005', 'QC', true),
    ('QC-P006', 'QC', true),
    ('QC-P007', 'BUSINESS', true),
    ('QC-P008', 'BUSINESS', true)
) as x(employee_no, department_code, is_primary)
join public.qc_people p on p.employee_no = x.employee_no
join public.qc_departments d on d.code = x.department_code
on conflict (person_id, department_id) do update
set is_primary = excluded.is_primary;
