alter table public.qc_reports
  add column if not exists default_reviewer_person_id uuid
    references public.qc_people(id) on delete set null,
  add column if not exists default_reviewer_name text,
  add column if not exists intended_approver_person_id uuid
    references public.qc_people(id) on delete set null,
  add column if not exists intended_approver_name text;

create index if not exists qc_reports_default_reviewer_idx
  on public.qc_reports (default_reviewer_person_id);

create index if not exists qc_reports_intended_approver_idx
  on public.qc_reports (intended_approver_person_id);
