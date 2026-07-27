import { NextResponse } from "next/server";
import { qcApiErrorMessage } from "@/lib/qc/reports";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const reporter = new URL(request.url).searchParams.get("reporter")?.trim() || "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("草稿编号格式不正确");
    if (!reporter) throw new Error("请选择报告人");
    const supabase = createAdminSupabaseClient();
    const { error } = await supabase
      .from("qc_report_drafts")
      .delete()
      .eq("id", id)
      .eq("reporter_name", reporter);
    if (error) throw error;
    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    return NextResponse.json({ error: qcApiErrorMessage(error, "删除草稿失败") }, { status: 400 });
  }
}
