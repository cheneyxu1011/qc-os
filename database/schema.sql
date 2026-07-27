create table if not exists qc_reports (
  id uuid primary key default gen_random_uuid(),
  report_no text not null unique,
  found_date date not null,
  brand text,
  style_no text,
  color text,
  severity text not null,
  source_department_id text,
  source_department_name text,
  kpi_enabled boolean default true,
  reporter_person_id text,
  reporter_name text,
  problem_description text,
  root_cause text,
  status text not null default 'draft',
  archive_status text default 'unlocked',
  factory_style_id text,
  factory_order_id text,
  factory_production_batch_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists qc_report_responsible_departments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references qc_reports(id) on delete cascade,
  department_id text,
  department_name text
);

create table if not exists qc_corrective_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references qc_reports(id) on delete cascade,
  sequence_no int not null,
  action_type text not null,
  action_content text not null,
  due_date date,
  status text not null default 'pending',
  reminder_note text,
  completed_at timestamptz,
  completed_by_person_id text,
  completed_by_name text,
  execution_note text,
  created_at timestamptz default now()
);

create table if not exists qc_action_assignees (
  id uuid primary key default gen_random_uuid(),
  action_id uuid references qc_corrective_actions(id) on delete cascade,
  person_id text,
  person_name text,
  department_id text,
  department_name text
);

create table if not exists qc_attachments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references qc_reports(id) on delete cascade,
  action_id uuid references qc_corrective_actions(id) on delete set null,
  file_type text not null,
  s3_bucket text not null,
  s3_key text not null,
  public_url text,
  uploaded_by_person_id text,
  uploaded_by_name text,
  uploaded_at timestamptz default now()
);

create table if not exists qc_reviews (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references qc_reports(id) on delete cascade,
  review_department_id text,
  review_department_name text,
  reviewer_person_id text,
  reviewer_name text,
  review_result text not null,
  review_comment text,
  reviewed_at timestamptz default now()
);

create table if not exists qc_archives (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references qc_reports(id) on delete cascade,
  approved_by_person_id text,
  approved_by_name text,
  archive_comment text,
  kpi_locked boolean default true,
  archived_at timestamptz default now()
);

create table if not exists qc_kpi_entries (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references qc_reports(id) on delete cascade,
  person_id text,
  person_name text,
  department_id text,
  department_name text,
  month text not null,
  base_score int default 100,
  deduction_points int not null,
  reason text,
  locked boolean default false,
  created_at timestamptz default now()
);

alter table qc_reports enable row level security;
alter table qc_report_responsible_departments enable row level security;
alter table qc_corrective_actions enable row level security;
alter table qc_action_assignees enable row level security;
alter table qc_attachments enable row level security;
alter table qc_reviews enable row level security;
alter table qc_archives enable row level security;
alter table qc_kpi_entries enable row level security;

