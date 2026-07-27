import { addQcAttachmentViewUrls, type QcAttachmentRow } from "@/lib/s3/view-url";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const REPORT_FIELDS =
  "id,report_no,report_year,report_sequence,factory_id,factory_name,factory_code,report_prefix,style_catalog_id,found_date,brand,style_no,color,severity,source_department_id,source_department_name,reporter_person_id,reporter_name,default_reviewer_person_id,default_reviewer_name,intended_approver_person_id,intended_approver_name,kpi_enabled,problem_description,root_cause,workflow_step,status,factory_style_id,factory_order_id,factory_production_batch_id,archived_at,locked_at,created_at,updated_at";

const ATTACHMENT_FIELDS =
  "id,report_id,action_id,attachment_type,s3_bucket,s3_key,original_file_name,content_type,file_size_bytes,uploaded_by_name,uploaded_at";

const REPORT_STATUSES = new Set([
  "draft",
  "submitted",
  "executing",
  "pending_review",
  "review_rejected",
  "pending_archive",
  "archived",
]);

type ReportListFilters = {
  status?: string;
  styleNo?: string;
  department?: string;
  factoryId?: string;
  month?: string;
  limit?: number;
};

type RowWithReportId = {
  report_id: string;
};

function groupByReportId<T extends RowWithReportId>(rows: T[]) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const current = grouped.get(row.report_id) || [];
    current.push(row);
    grouped.set(row.report_id, current);
  }
  return grouped;
}

function groupByActionId<T extends { action_id: string }>(rows: T[]) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const current = grouped.get(row.action_id) || [];
    current.push(row);
    grouped.set(row.action_id, current);
  }
  return grouped;
}

function cleanFilter(value: string | undefined, maxLength = 100) {
  return value?.trim().slice(0, maxLength) || "";
}

function clampLimit(value: number | undefined) {
  if (!Number.isFinite(value)) return 50;
  return Math.min(5000, Math.max(1, Math.trunc(value || 50)));
}

function throwIfError(error: unknown) {
  if (error) throw error;
}

export function qcApiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return fallback;
}

export async function readQcReportList(filters: ReportListFilters) {
  const supabase = createAdminSupabaseClient();
  const status = cleanFilter(filters.status, 40);
  const styleNo = cleanFilter(filters.styleNo, 200);
  const department = cleanFilter(filters.department, 80);
  const factoryId = cleanFilter(filters.factoryId, 80);
  const month = cleanFilter(filters.month, 7);
  const limit = clampLimit(filters.limit);

  if (status && !REPORT_STATUSES.has(status)) {
    throw new Error("报告状态筛选值不正确");
  }
  if (month && !/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("月份筛选值不正确");
  }

  let departmentReportIds: string[] | null = null;
  if (department) {
    const { data, error } = await supabase
      .from("qc_report_responsible_departments")
      .select("report_id")
      .eq("department_name", department);
    throwIfError(error);
    departmentReportIds = [...new Set((data || []).map((row) => row.report_id))];
    if (!departmentReportIds.length) return [];
  }

  let reportQuery = supabase
    .from("qc_reports")
    .select(REPORT_FIELDS)
    .order("found_date", { ascending: false })
    .order("report_sequence", { ascending: false })
    .limit(limit);

  if (status) reportQuery = reportQuery.eq("status", status);
  if (styleNo) reportQuery = reportQuery.ilike("style_no", `%${styleNo}%`);
  if (factoryId) reportQuery = reportQuery.eq("factory_id", factoryId);
  if (month) {
    const [year, monthNumber] = month.split("-").map(Number);
    const start = `${month}-01`;
    const next = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);
    reportQuery = reportQuery.gte("found_date", start).lt("found_date", next);
  }
  if (departmentReportIds) reportQuery = reportQuery.in("id", departmentReportIds);

  const { data: reports, error: reportsError } = await reportQuery;
  throwIfError(reportsError);
  if (!reports?.length) return [];

  const reportIds = reports.map((report) => report.id);
  const [
    { data: departments, error: departmentsError },
    { data: people, error: peopleError },
    { data: actions, error: actionsError },
    { data: attachments, error: attachmentsError },
  ] = await Promise.all([
    supabase
      .from("qc_report_responsible_departments")
      .select("report_id,department_id,department_name")
      .in("report_id", reportIds),
    supabase
      .from("qc_report_responsible_people")
      .select("report_id,person_id,person_name,department_id,department_name")
      .in("report_id", reportIds),
    supabase
      .from("qc_corrective_actions")
      .select(
        "id,report_id,sequence_no,action_type,action_content,due_date,status,completed_at",
      )
      .in("report_id", reportIds)
      .order("sequence_no", { ascending: true }),
    supabase
      .from("qc_attachments")
      .select(ATTACHMENT_FIELDS)
      .in("report_id", reportIds)
      .eq("attachment_type", "problem_before")
      .order("uploaded_at", { ascending: true }),
  ]);

  throwIfError(departmentsError);
  throwIfError(peopleError);
  throwIfError(actionsError);
  throwIfError(attachmentsError);

  const actionIds = (actions || []).map((action) => action.id);
  const { data: assignees, error: assigneesError } = actionIds.length
    ? await supabase
        .from("qc_action_assignees")
        .select("action_id,person_id,person_name,department_id,department_name,assigned_at")
        .in("action_id", actionIds)
    : { data: [], error: null };
  throwIfError(assigneesError);

  const signedAttachments = await addQcAttachmentViewUrls(
    (attachments || []) as QcAttachmentRow[],
  );
  const departmentsByReport = groupByReportId(departments || []);
  const peopleByReport = groupByReportId(people || []);
  const assigneesByAction = groupByActionId(assignees || []);
  const actionsByReport = groupByReportId(
    (actions || []).map((action) => ({
      ...action,
      assignees: assigneesByAction.get(action.id) || [],
    })),
  );
  const attachmentsByReport = groupByReportId(signedAttachments);

  return reports.map((report) => ({
    ...report,
    responsible_departments: departmentsByReport.get(report.id) || [],
    responsible_people: peopleByReport.get(report.id) || [],
    actions: actionsByReport.get(report.id) || [],
    problem_attachments: attachmentsByReport.get(report.id) || [],
  }));
}

export async function readQcReportDetail(reportNo: string) {
  const cleanedReportNo = cleanFilter(reportNo, 30);
  if (!/^[A-Z]{2,4}\d{4}-\d{3,}$/.test(cleanedReportNo)) {
    throw new Error("报告编号格式不正确");
  }

  const supabase = createAdminSupabaseClient();
  const { data: report, error: reportError } = await supabase
    .from("qc_reports")
    .select(REPORT_FIELDS)
    .eq("report_no", cleanedReportNo)
    .maybeSingle();
  throwIfError(reportError);
  if (!report) return null;

  const [
    { data: departments, error: departmentsError },
    { data: people, error: peopleError },
    { data: actions, error: actionsError },
    { data: attachments, error: attachmentsError },
    { data: reviews, error: reviewsError },
    { data: archive, error: archiveError },
    { data: kpiEntries, error: kpiError },
    { data: comments, error: commentsError },
    { data: auditEvents, error: auditError },
  ] = await Promise.all([
    supabase
      .from("qc_report_responsible_departments")
      .select("department_id,department_name,created_at")
      .eq("report_id", report.id),
    supabase
      .from("qc_report_responsible_people")
      .select("person_id,person_name,department_id,department_name,created_at")
      .eq("report_id", report.id),
    supabase
      .from("qc_corrective_actions")
      .select("*")
      .eq("report_id", report.id)
      .order("sequence_no", { ascending: true }),
    supabase
      .from("qc_attachments")
      .select(ATTACHMENT_FIELDS)
      .eq("report_id", report.id)
      .order("uploaded_at", { ascending: true }),
    supabase
      .from("qc_reviews")
      .select("*")
      .eq("report_id", report.id)
      .order("reviewed_at", { ascending: false }),
    supabase.from("qc_archives").select("*").eq("report_id", report.id).maybeSingle(),
    supabase
      .from("qc_kpi_entries")
      .select("*")
      .eq("report_id", report.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("qc_comments")
      .select("*")
      .eq("report_id", report.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("qc_audit_events")
      .select("*")
      .eq("report_id", report.id)
      .order("created_at", { ascending: true }),
  ]);

  throwIfError(departmentsError);
  throwIfError(peopleError);
  throwIfError(actionsError);
  throwIfError(attachmentsError);
  throwIfError(reviewsError);
  throwIfError(archiveError);
  throwIfError(kpiError);
  throwIfError(commentsError);
  throwIfError(auditError);

  const actionIds = (actions || []).map((action) => action.id);
  const { data: assignees, error: assigneesError } = actionIds.length
    ? await supabase
        .from("qc_action_assignees")
        .select("action_id,person_id,person_name,department_id,department_name,assigned_at")
        .in("action_id", actionIds)
    : { data: [], error: null };
  throwIfError(assigneesError);

  const signedAttachments = await addQcAttachmentViewUrls(
    (attachments || []) as QcAttachmentRow[],
  );
  const assigneesByAction = groupByActionId(assignees || []);
  const attachmentsByAction = groupByActionId(
    signedAttachments.filter(
      (attachment): attachment is typeof attachment & { action_id: string } =>
        Boolean(attachment.action_id),
    ),
  );

  return {
    ...report,
    responsible_departments: departments || [],
    responsible_people: people || [],
    actions: (actions || []).map((action) => ({
      ...action,
      assignees: assigneesByAction.get(action.id) || [],
      attachments: attachmentsByAction.get(action.id) || [],
    })),
    attachments: signedAttachments,
    reviews: reviews || [],
    archive,
    kpi_entries: kpiEntries || [],
    comments: comments || [],
    audit_events: auditEvents || [],
  };
}
