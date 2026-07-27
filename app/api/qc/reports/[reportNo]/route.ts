import { NextResponse } from "next/server";
import { DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { qcApiErrorMessage, readQcReportDetail } from "@/lib/qc/reports";
import { createQcS3Client, getQcS3Config } from "@/lib/s3/client";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ reportNo: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { reportNo } = await context.params;
    const report = await readQcReportDetail(decodeURIComponent(reportNo));
    if (!report) {
      return NextResponse.json({ error: "报告不存在" }, { status: 404 });
    }
    return NextResponse.json(
      { report },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: qcApiErrorMessage(error, "读取报告失败") },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { reportNo } = await context.params;
    const cleanedReportNo = decodeURIComponent(reportNo).trim().toUpperCase();
    if (!/^[A-Z]{2,4}\d{4}-\d{3,}$/.test(cleanedReportNo)) {
      throw new Error("报告编号格式不正确");
    }

    const supabase = createAdminSupabaseClient();
    const { data: report, error: reportError } = await supabase
      .from("qc_reports")
      .select("id,status,archived_at,locked_at")
      .eq("report_no", cleanedReportNo)
      .maybeSingle();
    if (reportError) throw reportError;
    if (!report) return NextResponse.json({ error: "报告不存在" }, { status: 404 });
    if (report.status === "archived" || report.archived_at || report.locked_at) {
      return NextResponse.json({ error: "已归档报告已锁定，不能删除" }, { status: 409 });
    }

    const { data: attachments, error: attachmentError } = await supabase
      .from("qc_attachments")
      .select("s3_key")
      .eq("report_id", report.id);
    if (attachmentError) throw attachmentError;

    const { error: deleteError } = await supabase
      .from("qc_reports")
      .delete()
      .eq("id", report.id);
    if (deleteError) throw deleteError;

    let attachmentCleanup = "not_needed";
    if (attachments?.length) {
      try {
        const { bucket } = getQcS3Config();
        await createQcS3Client().send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: attachments.map((item) => ({ Key: item.s3_key })) },
          }),
        );
        attachmentCleanup = "completed";
      } catch {
        attachmentCleanup = "pending";
      }
    }

    return NextResponse.json({
      deleted: true,
      reportNo: cleanedReportNo,
      attachmentCleanup,
    });
  } catch (error) {
    return NextResponse.json(
      { error: qcApiErrorMessage(error, "删除报告失败") },
      { status: 400 },
    );
  }
}
