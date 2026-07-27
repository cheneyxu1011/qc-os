alter table public.qc_corrective_actions
  drop constraint if exists qc_corrective_actions_action_type_check;

alter table public.qc_corrective_actions
  add constraint qc_corrective_actions_action_type_check
  check (
    action_type in (
      'temporary_correction',
      'permanent_correction',
      'preventive_action',
      'notification_only'
    )
  );

create table if not exists public.qc_report_drafts (
  id uuid primary key default gen_random_uuid(),
  reporter_person_id uuid references public.qc_people(id) on delete set null,
  reporter_name text not null,
  factory_id uuid references public.qc_factories(id) on delete set null,
  style_catalog_id uuid references public.qc_style_catalog(id) on delete set null,
  draft_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists qc_report_drafts_reporter_updated_idx
  on public.qc_report_drafts (reporter_name, updated_at desc);

alter table public.qc_report_drafts enable row level security;
revoke all on table public.qc_report_drafts from anon, authenticated;
grant all on table public.qc_report_drafts to service_role;

drop trigger if exists qc_report_drafts_set_updated_at on public.qc_report_drafts;
create trigger qc_report_drafts_set_updated_at
before update on public.qc_report_drafts
for each row execute function public.qc_set_updated_at();
