import { NextResponse } from "next/server";
import { qcApiErrorMessage } from "@/lib/qc/reports";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ actionId: string }>;
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
        typeof item.fileSizeBytes === "number" && item.fileSizeBytes >= 0 ? item.fileSizeBytes : undefined,
    }];
  });
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { actionId } = await context.params;
    const body = await request.json();
    const actorName = cleanText(body.actorName, 80);
    const executionNote = cleanText(body.executionNote, 5000);
    const attachments = cleanAttachments(body.attachments);

    if (!/^[0-9a-f-]{36}$/i.test(actionId)) throw new Error("措施编号格式不正确");
    if (!actorName) throw new Error("请选择实际完成人");
    if (!executionNote) throw new Error("请填写执行说明");
    if (!attachments.length) throw new Error("请至少上传一张改善照片");

    const supabase = createAdminSupabaseClient();
    const { data: action, error: actionError } = await supabase
      .from("qc_corrective_actions")
      .select("id,report_id,sequence_no,status")
      .eq("id", actionId)
      .maybeSingle();
    if (actionError) throw actionError;
    if (!action) return NextResponse.json({ error: "措施不存在" }, { status: 404 });

    const { data: report, error: reportError } = await supabase
      .from("qc_reports")
      .select("id,status,report_no")
      .eq("id", action.report_id)
      .maybeSingle();
    if (reportError) throw reportError;
    if (!report) return NextResponse.json({ error: "报告不存在" }, { status: 404 });
    if (report.status === "archived") return NextResponse.json({ error: "已归档报告不能执行任务" }, { status: 409 });

    const { data: actor, error: actorError } = await supabase
      .from("qc_people")
      .select("id,name")
      .eq("name", actorName)
      .eq("is_active", true)
      .maybeSingle();
    if (actorError) throw actorError;
    if (!actor) throw new Error("实际完成人不在人员库中");

    const { error: updateError } = await supabase
      .from("qc_corrective_actions")
      .update({
        status: "executed",
        executed_by_person_id: actor.id,
        executed_by_name: actor.name,
        execution_note: executionNote,
        completed_at: new Date().toISOString(),
      })
      .eq("id", action.id);
    if (updateError) throw updateError;

    const bucket = process.env.AWS_S3_BUCKET_QC_IMAGES;
    if (!bucket) throw new Error("S3 bucket environment variable is missing");
    const { error: attachmentError } = await supabase.from("qc_attachments").insert(
      attachments.map((attachment) => ({
        report_id: report.id,
        action_id: action.id,
        attachment_type: "action_after",
        s3_bucket: bucket,
        s3_key: attachment.s3Key,
        original_file_name: attachment.originalFileName || null,
        content_type: attachment.contentType || null,
        file_size_bytes: attachment.fileSizeBytes || null,
        uploaded_by_person_id: actor.id,
        uploaded_by_name: actor.name,
      })),
    );
    if (attachmentError) throw attachmentError;

    const { data: openActions, error: openActionsError } = await supabase
      .from("qc_corrective_actions")
      .select("id")
      .eq("report_id", report.id)
      .neq("status", "executed");
    if (openActionsError) throw openActionsError;

    const nextReportStatus = openActions?.length ? "executing" : "pending_review";
    const nextWorkflowStep = openActions?.length ? 2 : 3;
    const { error: reportUpdateError } = await supabase
      .from("qc_reports")
      .update({ status: nextReportStatus, workflow_step: nextWorkflowStep })
      .eq("id", report.id);
    if (reportUpdateError) throw reportUpdateError;

    await supabase.from("qc_audit_events").insert({
      report_id: report.id,
      action_id: action.id,
      event_type: "action_executed",
      actor_person_id: actor.id,
      actor_name: actor.name,
      event_data: { report_no: report.report_no, sequence_no: action.sequence_no, execution_note: executionNote },
    });

    return NextResponse.json({
      actionId: action.id,
      reportNo: report.report_no,
      status: "executed",
      reportStatus: nextReportStatus,
    });
  } catch (error) {
    return NextResponse.json(
      { error: qcApiErrorMessage(error, "保存执行结果失败") },
      { status: 400 },
    );
  }
}
