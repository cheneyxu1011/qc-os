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

export async function POST(request: Request, context: RouteContext) {
  try {
    const { reportNo } = await context.params;
    const cleanedReportNo = decodeURIComponent(reportNo).trim().toUpperCase();
    const body = await request.json();
    const result = cleanText(body.result, 20) || "approved";
    const reviewComment = cleanText(body.comment, 5000);
    const reviewerName = cleanText(body.reviewer, 80);

    if (!/^[A-Z]{2,4}\d{4}-\d{3,}$/.test(cleanedReportNo)) throw new Error("报告编号格式不正确");
    if (!["approved", "rejected"].includes(result)) throw new Error("复核结果不正确");
    if (!reviewComment) throw new Error("请填写复核意见");

    const supabase = createAdminSupabaseClient();
    const { data: report, error: reportError } = await supabase
      .from("qc_reports")
      .select("id,status,source_department_id,source_department_name,default_reviewer_person_id,default_reviewer_name")
      .eq("report_no", cleanedReportNo)
      .maybeSingle();
    if (reportError) throw reportError;
    if (!report) return NextResponse.json({ error: "报告不存在" }, { status: 404 });
    if (report.status === "archived") return NextResponse.json({ error: "已归档报告不能复核" }, { status: 409 });

    let reviewerPersonId = report.default_reviewer_person_id;
    let reviewer = reviewerName || report.default_reviewer_name;
    if (reviewerName) {
      const { data: person, error: personError } = await supabase
        .from("qc_people")
        .select("id,name")
        .eq("name", reviewerName)
        .eq("is_active", true)
        .maybeSingle();
      if (personError) throw personError;
      if (!person) throw new Error("复核人不在人员库中");
      reviewerPersonId = person.id;
      reviewer = person.name;
    }

    const { error: reviewError } = await supabase.from("qc_reviews").insert({
      report_id: report.id,
      review_department_id: report.source_department_id,
      review_department_name: report.source_department_name,
      reviewer_person_id: reviewerPersonId,
      reviewer_name: reviewer,
      review_result: result,
      review_comment: reviewComment,
    });
    if (reviewError) throw reviewError;

    const nextStatus = result === "approved" ? "pending_archive" : "review_rejected";
    const nextStep = result === "approved" ? 4 : 2;
    const { error: updateError } = await supabase
      .from("qc_reports")
      .update({ status: nextStatus, workflow_step: nextStep })
      .eq("id", report.id);
    if (updateError) throw updateError;

    await supabase.from("qc_audit_events").insert({
      report_id: report.id,
      event_type: result === "approved" ? "review_approved" : "review_rejected",
      actor_person_id: reviewerPersonId,
      actor_name: reviewer,
      event_data: { report_no: cleanedReportNo, review_comment: reviewComment },
    });

    return NextResponse.json({ reportNo: cleanedReportNo, status: nextStatus });
  } catch (error) {
    return NextResponse.json(
      { error: qcApiErrorMessage(error, "提交复核失败") },
      { status: 400 },
    );
  }
}
