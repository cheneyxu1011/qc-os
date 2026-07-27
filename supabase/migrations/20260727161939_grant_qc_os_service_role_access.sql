grant select, insert, update, delete on table
  public.qc_departments,
  public.qc_people,
  public.qc_person_departments,
  public.qc_reports,
  public.qc_report_responsible_departments,
  public.qc_report_responsible_people,
  public.qc_corrective_actions,
  public.qc_action_assignees,
  public.qc_attachments,
  public.qc_reviews,
  public.qc_archives,
  public.qc_kpi_entries,
  public.qc_comments,
  public.qc_audit_events
to service_role;

grant usage, select on sequence public.qc_audit_events_id_seq to service_role;
