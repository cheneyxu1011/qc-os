import { NextResponse } from "next/server";
import { qcApiErrorMessage } from "@/lib/qc/reports";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ reportNo: string }>;
};

type Attachment = {
  s3Key: string;
  originalFileName?: string;
  contentType?: string;
  fileSizeBytes?: number;
};

function cleanText(value: unknown, maxLength = 1000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanAttachments(value: unknown): Attachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    const item = (raw || {}) as Record<string, unknown>;
    const s3Key = cleanText(item.s3Key, 1000);
    if (!s3Key.startsWith("qc-os/")) return [];
    return [{
      s3Key,
      originalFileName: cleanText(item.originalFileName, 255) || undefined,
      contentType: cleanText(item.contentType, 100) || undefined,
      fileSizeBytes:
        typeof item.fileSizeBytes === "number" && item.fileSizeBytes >= 0
          ? item.fileSizeBytes
          : undefined,
    }];
  });
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { reportNo } = await context.params;
    const cleanedReportNo = decodeURIComponent(reportNo).trim().toUpperCase();
    const body = await request.json();
    const result = cleanText(body.result, 20) || "approved";
    const reviewComment = cleanText(body.comment, 5000);
    const reviewerName = cleanText(body.reviewer, 80);
    const attachments = cleanAttachments(body.attachments);

    if (!/^[A-Z]{2,4}\d{4}-\d{3,}$/.test(cleanedReportNo)) throw new Error("报告编号格式不正确");
    if (!["approved", "rejected"].includes(result)) throw new Error("复核结果不正确");
    if (!reviewComment) throw new Error("请填写复核意见");

    const supabase = createAdminSupabaseClient();
    const { data: report, error: reportError } = await supabase
      .from("qc_reports")
      .select("id,report_year,status,source_department_id,source_department_name,default_reviewer_person_id,default_reviewer_name")
      .eq("report_no", cleanedReportNo)
      .maybeSingle();
    if (reportError) throw reportError;
    if (!report) return NextResponse.json({ error: "报告不存在" }, { status: 404 });
    if (report.status === "archived") return NextResponse.json({ error: "已归档报告不能复核" }, { status: 409 });
    if (!["pending_review", "review_rejected"].includes(report.status)) {
      throw new Error("报告尚未进入部门复核阶段");
    }
    const expectedAttachmentPrefix = `qc-os/${report.report_year}/${cleanedReportNo}/review-evidence/`;
    if (attachments.some((attachment) => !attachment.s3Key.startsWith(expectedAttachmentPrefix))) {
      throw new Error("复核照片与当前报告不匹配");
    }

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
    if (!reviewer) throw new Error("请选择复核人");

    const { data: review, error: reviewError } = await supabase
      .from("qc_reviews")
      .insert({
        report_id: report.id,
        review_department_id: report.source_department_id,
        review_department_name: report.source_department_name,
        reviewer_person_id: reviewerPersonId,
        reviewer_name: reviewer,
        review_result: result,
        review_comment: reviewComment,
      })
      .select("id")
      .single();
    if (reviewError) throw reviewError;

    if (attachments.length) {
      const bucket = process.env.AWS_S3_BUCKET_QC_IMAGES;
      if (!bucket) {
        await supabase.from("qc_reviews").delete().eq("id", review.id);
        throw new Error("S3 bucket environment variable is missing");
      }
      const { error: attachmentError } = await supabase
        .from("qc_attachments")
        .upsert(
          attachments.map((attachment) => ({
            report_id: report.id,
            attachment_type: "review_evidence",
            s3_bucket: bucket,
            s3_key: attachment.s3Key,
            original_file_name: attachment.originalFileName || null,
            content_type: attachment.contentType || null,
            file_size_bytes: attachment.fileSizeBytes || null,
            uploaded_by_person_id: reviewerPersonId,
            uploaded_by_name: reviewer,
          })),
          { onConflict: "s3_key", ignoreDuplicates: true },
        );
      if (attachmentError) {
        await supabase.from("qc_reviews").delete().eq("id", review.id);
        throw attachmentError;
      }
    }

    const nextStatus = result === "approved" ? "pending_archive" : "executing";
    const nextStep = result === "approved" ? 4 : 2;
    if (result === "rejected") {
      const { error: reopenError } = await supabase
        .from("qc_corrective_actions")
        .update({ status: "pending" })
        .eq("report_id", report.id)
        .neq("action_type", "notification_only");
      if (reopenError) throw reopenError;
    }
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
      event_data: {
        report_no: cleanedReportNo,
        review_comment: reviewComment,
        review_evidence_count: attachments.length,
        reopened_reviewable_actions: result === "rejected",
      },
    });

    return NextResponse.json({
      reportNo: cleanedReportNo,
      status: nextStatus,
      reviewEvidenceCount: attachments.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: qcApiErrorMessage(error, "提交复核失败") },
      { status: 400 },
    );
  }
}
