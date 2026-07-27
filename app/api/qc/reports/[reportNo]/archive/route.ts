import { NextResponse } from "next/server";
import { qcApiErrorMessage } from "@/lib/qc/reports";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ reportNo: string }>;
};

function cleanText(value: unknown, maxLength = 1000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function severityDeduction(severity: string) {
  if (severity === "customer_complaint" || severity === "unacceptable") return 5;
  if (severity === "serious") return 3;
  if (severity === "minor") return 1;
  return 1;
}

function firstDayOfMonth(dateValue: string) {
  return `${dateValue.slice(0, 7)}-01`;
}

function localDateValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { reportNo } = await context.params;
    const cleanedReportNo = decodeURIComponent(reportNo).trim().toUpperCase();
    const body = await request.json();
    const action = cleanText(body.action, 20) || "archive";
    const approverName = cleanText(body.approver, 80);
    const archiveComment = cleanText(body.comment, 5000);

    if (!/^[A-Z]{2,4}\d{4}-\d{3,}$/.test(cleanedReportNo)) throw new Error("报告编号格式不正确");
    if (!["archive", "return"].includes(action)) throw new Error("归档操作不正确");
    if (!approverName) throw new Error("请选择审批人");
    if (action === "return" && !archiveComment) throw new Error("请填写需要补充的资料");

    const supabase = createAdminSupabaseClient();
    const { data: report, error: reportError } = await supabase
      .from("qc_reports")
      .select("id,status,found_date,severity,kpi_enabled,intended_approver_person_id,intended_approver_name")
      .eq("report_no", cleanedReportNo)
      .maybeSingle();
    if (reportError) throw reportError;
    if (!report) return NextResponse.json({ error: "报告不存在" }, { status: 404 });
    if (report.status === "archived") {
      return NextResponse.json({ reportNo: cleanedReportNo, status: "archived", alreadyArchived: true });
    }
    if (report.status !== "pending_archive") {
      throw new Error("报告还未完成部门复核，不能归档");
    }

    const { data: approver, error: approverError } = await supabase
      .from("qc_people")
      .select("id,name")
      .eq("name", approverName)
      .eq("is_active", true)
      .maybeSingle();
    if (approverError) throw approverError;
    if (!approver) throw new Error("审批人不在人员库中");

    if (action === "return") {
      const { error: returnError } = await supabase
        .from("qc_reports")
        .update({ status: "pending_review", workflow_step: 3 })
        .eq("id", report.id);
      if (returnError) throw returnError;

      await supabase.from("qc_audit_events").insert({
        report_id: report.id,
        event_type: "archive_returned_for_supplement",
        actor_person_id: approver.id,
        actor_name: approver.name,
        event_data: {
          report_no: cleanedReportNo,
          supplement_request: archiveComment,
        },
      });

      return NextResponse.json({
        reportNo: cleanedReportNo,
        status: "pending_review",
        returned: true,
      });
    }

    const [
      { data: responsiblePeople, error: peopleError },
      { data: actions, error: actionsError },
    ] = await Promise.all([
      supabase
        .from("qc_report_responsible_people")
        .select("person_id,person_name,department_id,department_name")
        .eq("report_id", report.id),
      supabase
        .from("qc_corrective_actions")
        .select("id,sequence_no,status,due_date")
        .eq("report_id", report.id),
    ]);
    if (peopleError) throw peopleError;
    if (actionsError) throw actionsError;

    const actionIds = (actions || []).map((action) => action.id);
    const { data: assignees, error: assigneesError } = actionIds.length
      ? await supabase
          .from("qc_action_assignees")
          .select("action_id,person_id,person_name,department_id,department_name")
          .in("action_id", actionIds)
      : { data: [], error: null };
    if (assigneesError) throw assigneesError;

    const now = new Date().toISOString();
    const kpiMonth = firstDayOfMonth(report.found_date);
    const today = localDateValue();
    const kpiRows: Array<Record<string, unknown>> = [];

    if (report.kpi_enabled) {
      for (const person of responsiblePeople || []) {
        kpiRows.push({
          report_id: report.id,
          person_id: person.person_id,
          person_name: person.person_name,
          department_id: person.department_id,
          department_name: person.department_name,
          kpi_month: kpiMonth,
          deduction_points: severityDeduction(report.severity),
          reason_code: "report_severity",
          reason: `${cleanedReportNo} 报告严重程度扣分`,
          locked: true,
        });
      }

      for (const action of actions || []) {
        const extraCode =
          action.status === "executed"
            ? ""
            : action.due_date && action.due_date < today
              ? "action_overdue"
              : "action_not_executed";
        if (!extraCode) continue;
        for (const assignee of (assignees || []).filter((item) => item.action_id === action.id)) {
          kpiRows.push({
            report_id: report.id,
            action_id: action.id,
            person_id: assignee.person_id,
            person_name: assignee.person_name,
            department_id: assignee.department_id,
            department_name: assignee.department_name,
            kpi_month: kpiMonth,
            deduction_points: 1,
            reason_code: extraCode,
            reason: `${cleanedReportNo} 第 ${action.sequence_no} 条措施${extraCode === "action_overdue" ? "逾期" : "未执行"}追加扣分`,
            locked: true,
          });
        }
      }
    }

    const { error: archiveError } = await supabase.from("qc_archives").insert({
      report_id: report.id,
      approved_by_person_id: approver.id,
      approved_by_name: approver.name,
      archive_comment: archiveComment || null,
      kpi_locked: true,
      archived_at: now,
    });
    if (archiveError) throw archiveError;

    if (kpiRows.length) {
      await supabase.from("qc_kpi_entries").delete().eq("report_id", report.id);
      const { error: kpiError } = await supabase.from("qc_kpi_entries").insert(kpiRows);
      if (kpiError) throw kpiError;
    }

    const { error: updateError } = await supabase
      .from("qc_reports")
      .update({ status: "archived", workflow_step: 5, archived_at: now, locked_at: now })
      .eq("id", report.id);
    if (updateError) throw updateError;

    await supabase.from("qc_audit_events").insert({
      report_id: report.id,
      event_type: "report_archived",
      actor_person_id: approver.id,
      actor_name: approver.name,
      event_data: { report_no: cleanedReportNo, kpi_entries: kpiRows.length },
    });

    return NextResponse.json({
      reportNo: cleanedReportNo,
      status: "archived",
      kpiEntries: kpiRows.length,
    });
  } catch (error) {
    const message = qcApiErrorMessage(error, "归档失败");
    const status = message.includes("duplicate key") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
