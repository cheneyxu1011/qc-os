import { NextResponse } from "next/server";
import { qcApiErrorMessage, readQcReportDetail } from "@/lib/qc/reports";

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
