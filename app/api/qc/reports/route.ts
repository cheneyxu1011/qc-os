import { NextResponse } from "next/server";
import { qcApiErrorMessage, readQcReportList } from "@/lib/qc/reports";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type NamedId = {
  id: string;
  name: string;
};

type ReportAction = {
  type: "temporary_correction" | "permanent_correction" | "preventive_action";
  content: string;
  people: string[];
  dueDate?: string;
  reminderNote?: string;
};

type ReportAttachment = {
  s3Key: string;
  attachmentType: "problem_before";
  originalFileName: string | undefined;
  contentType: string | undefined;
  fileSizeBytes: number | undefined;
};

type CreateReportPayload = {
  reportNo?: string;
  factoryId: string;
  styleCatalogId?: string;
  foundDate: string;
  brand?: string;
  styleNo?: string;
  color?: string;
  severity: "minor" | "general" | "serious" | "unacceptable" | "customer_complaint";
  sourceDepartment: string;
  responsibleDepartments: string[];
  responsiblePeople: string[];
  kpiEnabled: boolean;
  reporter: string;
  reviewer?: string;
  approver?: string;
  problemDescription: string;
  rootCause?: string;
  actions: ReportAction[];
  attachments?: ReportAttachment[];
};

function cleanText(value: unknown, maxLength = 1000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function uniqueNames(values: unknown) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => cleanText(value, 80)).filter(Boolean))];
}

function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validatePayload(body: unknown): CreateReportPayload {
  if (!body || typeof body !== "object") throw new Error("报告数据格式不正确");
  const input = body as Record<string, unknown>;
  const foundDate = cleanText(input.foundDate, 10);
  const sourceDepartment = cleanText(input.sourceDepartment, 80);
  const reporter = cleanText(input.reporter, 80);
  const problemDescription = cleanText(input.problemDescription, 5000);
  const factoryId = cleanText(input.factoryId, 80);
  const responsibleDepartments = uniqueNames(input.responsibleDepartments);
  const responsiblePeople = uniqueNames(input.responsiblePeople);
  const allowedSeverities = new Set([
    "minor",
    "general",
    "serious",
    "unacceptable",
    "customer_complaint",
  ]);
  const severity = cleanText(input.severity, 40);

  if (!isDate(foundDate)) throw new Error("发现日期不能为空");
  if (!factoryId) throw new Error("请选择所属工厂");
  if (!sourceDepartment) throw new Error("请选择问题来源部门");
  if (!responsibleDepartments.length) throw new Error("请至少选择一个责任部门");
  if (!responsiblePeople.length) throw new Error("请至少选择一名部门人员");
  if (!reporter) throw new Error("请选择报告人");
  if (!problemDescription) throw new Error("请填写问题描述");
  if (!allowedSeverities.has(severity)) throw new Error("严重程度不正确");
  if (!cleanText(input.styleCatalogId, 80)) throw new Error("请从 08 款式资料库选择款号和颜色");

  const actions = Array.isArray(input.actions)
    ? input.actions.map((raw, index) => {
        const action = (raw || {}) as Record<string, unknown>;
        const type = cleanText(action.type, 40) as ReportAction["type"];
        const content = cleanText(action.content, 5000);
        const people = uniqueNames(action.people);
        const dueDate = cleanText(action.dueDate, 10);
        if (!["temporary_correction", "permanent_correction", "preventive_action"].includes(type)) {
          throw new Error(`第 ${index + 1} 条措施类型不正确`);
        }
        if (!content) throw new Error(`第 ${index + 1} 条措施内容不能为空`);
        if (!people.length) throw new Error(`第 ${index + 1} 条措施请选择责任人`);
        if (dueDate && !isDate(dueDate)) throw new Error(`第 ${index + 1} 条计划日期不正确`);
        return {
          type,
          content,
          people,
          dueDate: dueDate || undefined,
          reminderNote: cleanText(action.reminderNote, 1000) || undefined,
        };
      })
    : [];

  if (!actions.length) throw new Error("请至少填写一条改善或预防措施");

  const attachments = Array.isArray(input.attachments)
    ? input.attachments
        .map((raw) => {
          const attachment = (raw || {}) as Record<string, unknown>;
          const s3Key = cleanText(attachment.s3Key, 1000);
          if (!s3Key.startsWith("qc-os/")) return null;
          return {
            s3Key,
            attachmentType: "problem_before" as const,
            originalFileName: cleanText(attachment.originalFileName, 255) || undefined,
            contentType: cleanText(attachment.contentType, 100) || undefined,
            fileSizeBytes:
              typeof attachment.fileSizeBytes === "number" && attachment.fileSizeBytes >= 0
                ? attachment.fileSizeBytes
                : undefined,
          };
        })
        .filter((value): value is ReportAttachment => Boolean(value))
    : [];

  return {
    reportNo: cleanText(input.reportNo, 30).toUpperCase() || undefined,
    factoryId,
    styleCatalogId: cleanText(input.styleCatalogId, 80) || undefined,
    foundDate,
    brand: cleanText(input.brand, 200) || undefined,
    styleNo: cleanText(input.styleNo, 200) || undefined,
    color: cleanText(input.color, 200) || undefined,
    severity: severity as CreateReportPayload["severity"],
    sourceDepartment,
    responsibleDepartments,
    responsiblePeople,
    kpiEnabled: input.kpiEnabled !== false,
    reporter,
    reviewer: cleanText(input.reviewer, 80) || undefined,
    approver: cleanText(input.approver, 80) || undefined,
    problemDescription,
    rootCause: cleanText(input.rootCause, 5000) || undefined,
    actions,
    attachments,
  };
}

function indexByName(rows: NamedId[]) {
  return new Map(rows.map((row) => [row.name, row.id]));
}

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const limitValue = Number(searchParams.get("limit") || "50");
    const reports = await readQcReportList({
      status: searchParams.get("status") || undefined,
      styleNo: searchParams.get("styleNo") || undefined,
      department: searchParams.get("department") || undefined,
      factoryId: searchParams.get("factoryId") || undefined,
      month: searchParams.get("month") || undefined,
      limit: limitValue,
    });
    return NextResponse.json(
      { reports, count: reports.length },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: qcApiErrorMessage(error, "读取报告列表失败") },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  let createdReportId: string | null = null;
  try {
    const payload = validatePayload(await request.json());
    const supabase = createAdminSupabaseClient();

    const [
      { data: departments, error: departmentsError },
      { data: people, error: peopleError },
      { data: memberships, error: membershipsError },
    ] = await Promise.all([
        supabase.from("qc_departments").select("id,name").eq("is_active", true),
        supabase.from("qc_people").select("id,name").eq("is_active", true),
        supabase
          .from("qc_person_departments")
          .select("person_id,department_id,is_primary")
          .order("is_primary", { ascending: false }),
      ]);

    if (departmentsError) throw departmentsError;
    if (peopleError) throw peopleError;
    if (membershipsError) throw membershipsError;

    const departmentIds = indexByName(departments || []);
    const peopleIds = indexByName(people || []);
    const departmentNamesById = new Map((departments || []).map((row) => [row.id, row.name]));
    const membershipsByPersonId = new Map<string, Array<{ id: string; name: string }>>();
    for (const membership of memberships || []) {
      const departmentName = departmentNamesById.get(membership.department_id);
      if (!departmentName) continue;
      const current = membershipsByPersonId.get(membership.person_id) || [];
      current.push({ id: membership.department_id, name: departmentName });
      membershipsByPersonId.set(membership.person_id, current);
    }
    const departmentForPerson = (personName: string, allowedNames?: string[]) => {
      const personId = peopleIds.get(personName);
      const personMemberships = personId ? membershipsByPersonId.get(personId) || [] : [];
      return (
        personMemberships.find((membership) => !allowedNames || allowedNames.includes(membership.name)) ||
        personMemberships[0] ||
        null
      );
    };
    const sourceDepartmentId = departmentIds.get(payload.sourceDepartment);
    const reporterPersonId = peopleIds.get(payload.reporter);
    if (!sourceDepartmentId) throw new Error("问题来源部门不在人员库中");
    if (!reporterPersonId) throw new Error("报告人不在人员库中");
    const factoryManagerDepartmentId = departmentIds.get("厂长");
    const factoryManagerMembership = (memberships || []).find(
      (membership) => membership.department_id === factoryManagerDepartmentId,
    );
    const factoryManagerName = (people || []).find(
      (person) => person.id === factoryManagerMembership?.person_id,
    )?.name;
    const reviewerName = payload.reviewer || payload.reporter;
    const approverName = payload.approver || factoryManagerName || payload.reporter;
    const reviewerPersonId = peopleIds.get(reviewerName);
    const approverPersonId = peopleIds.get(approverName);
    if (!reviewerPersonId) throw new Error("复核人不在人员库中");
    if (!approverPersonId) throw new Error("审批人不在人员库中");

    const { data: selectedStyle, error: selectedStyleError } = payload.styleCatalogId
      ? await supabase
          .from("qc_style_catalog")
          .select("id,brand,style_no,color")
          .eq("id", payload.styleCatalogId)
          .eq("is_active", true)
          .maybeSingle()
      : { data: null, error: null };
    if (selectedStyleError) throw selectedStyleError;
    if (payload.styleCatalogId && !selectedStyle) {
      throw new Error("所选款式资料不存在或已停用");
    }

    const { data: selectedFactory, error: selectedFactoryError } = await supabase
      .from("qc_factories")
      .select("id,report_prefix")
      .eq("id", payload.factoryId)
      .eq("is_active", true)
      .maybeSingle();
    if (selectedFactoryError) throw selectedFactoryError;
    if (!selectedFactory) throw new Error("所选工厂不存在或已停用");

    const reportYear = Number(payload.foundDate.slice(0, 4));
    const requestedMatch = payload.reportNo
      ? new RegExp(`^${selectedFactory.report_prefix}${reportYear}-(\\d{3,})$`).exec(payload.reportNo)
      : null;
    if (payload.reportNo && !requestedMatch) {
      throw new Error("报告编号与所属工厂或发现年份不一致，请刷新后重试");
    }
    const reportInsert = {
      factory_id: selectedFactory.id,
      report_year: reportYear,
      ...(requestedMatch
        ? {
            report_no: payload.reportNo,
            report_sequence: Number(requestedMatch[1]),
          }
        : {}),
      style_catalog_id: selectedStyle?.id || null,
      found_date: payload.foundDate,
      brand: selectedStyle?.brand || payload.brand || null,
      style_no: selectedStyle?.style_no || payload.styleNo || null,
      color: selectedStyle?.color || payload.color || null,
      severity: payload.severity,
      source_department_id: sourceDepartmentId,
      source_department_name: payload.sourceDepartment,
      reporter_person_id: reporterPersonId,
      reporter_name: payload.reporter,
      default_reviewer_person_id: reviewerPersonId,
      default_reviewer_name: reviewerName,
      intended_approver_person_id: approverPersonId,
      intended_approver_name: approverName,
      kpi_enabled: payload.kpiEnabled,
      problem_description: payload.problemDescription,
      root_cause: payload.rootCause || null,
      workflow_step: 2,
      status: "submitted",
    };

    const { data: report, error: reportError } = await supabase
      .from("qc_reports")
      .insert(reportInsert)
      .select("id,report_no")
      .single();
    if (reportError) throw reportError;
    createdReportId = report.id;

    const departmentRows = payload.responsibleDepartments.map((name) => {
      const id = departmentIds.get(name);
      if (!id) throw new Error(`责任部门“${name}”不在人员库中`);
      return { report_id: report.id, department_id: id, department_name: name };
    });
    const peopleRows = payload.responsiblePeople.map((name) => {
      const id = peopleIds.get(name);
      if (!id) throw new Error(`部门人员“${name}”不在人员库中`);
      const department = departmentForPerson(name, payload.responsibleDepartments);
      return {
        report_id: report.id,
        person_id: id,
        person_name: name,
        department_id: department?.id || null,
        department_name: department?.name || null,
      };
    });

    const { error: departmentInsertError } = await supabase
      .from("qc_report_responsible_departments")
      .insert(departmentRows);
    if (departmentInsertError) throw departmentInsertError;

    const { error: peopleInsertError } = await supabase
      .from("qc_report_responsible_people")
      .insert(peopleRows);
    if (peopleInsertError) throw peopleInsertError;

    for (const [index, action] of payload.actions.entries()) {
      const { data: savedAction, error: actionError } = await supabase
        .from("qc_corrective_actions")
        .insert({
          report_id: report.id,
          sequence_no: index + 1,
          action_type: action.type,
          action_content: action.content,
          due_date: action.dueDate || null,
          reminder_note: action.reminderNote || null,
          status: "pending",
        })
        .select("id")
        .single();
      if (actionError) throw actionError;

      const assignees = action.people.map((name) => {
        const personId = peopleIds.get(name);
        if (!personId) throw new Error(`措施责任人“${name}”不在人员库中`);
        const department = departmentForPerson(name);
        return {
          action_id: savedAction.id,
          person_id: personId,
          person_name: name,
          department_id: department?.id || null,
          department_name: department?.name || null,
        };
      });
      const { error: assigneeError } = await supabase.from("qc_action_assignees").insert(assignees);
      if (assigneeError) throw assigneeError;
    }

    if (payload.attachments?.length) {
      const bucket = process.env.AWS_S3_BUCKET_QC_IMAGES;
      if (!bucket) throw new Error("S3 bucket environment variable is missing");
      const { error: attachmentError } = await supabase.from("qc_attachments").insert(
        payload.attachments.map((attachment) => ({
          report_id: report.id,
          attachment_type: attachment.attachmentType,
          s3_bucket: bucket,
          s3_key: attachment.s3Key,
          original_file_name: attachment.originalFileName || null,
          content_type: attachment.contentType || null,
          file_size_bytes: attachment.fileSizeBytes || null,
          uploaded_by_person_id: reporterPersonId,
          uploaded_by_name: payload.reporter,
        })),
      );
      if (attachmentError) throw attachmentError;
    }

    await supabase.from("qc_audit_events").insert({
      report_id: report.id,
      event_type: "report_submitted",
      actor_person_id: reporterPersonId,
      actor_name: payload.reporter,
      event_data: { report_no: report.report_no },
    });

    return NextResponse.json({
      id: report.id,
      reportNo: report.report_no,
      status: "submitted",
    });
  } catch (error) {
    if (createdReportId) {
      try {
        const supabase = createAdminSupabaseClient();
        await supabase.from("qc_reports").delete().eq("id", createdReportId);
      } catch {
        // Preserve the original error; the audit check will surface any orphaned draft.
      }
    }
    const message = qcApiErrorMessage(error, "保存报告失败");
    const status = message.includes("duplicate key") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
