import { NextResponse } from "next/server";
import { qcApiErrorMessage } from "@/lib/qc/reports";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function cleanText(value: unknown, maxLength = 100) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const input = (await request.json()) as Record<string, unknown>;
    const name = cleanText(input.name, 100);
    const code = cleanText(input.code, 20).toUpperCase();
    const reportPrefix = cleanText(input.reportPrefix, 4).toUpperCase();
    if (!name || !code || !/^[A-Z]{2,4}$/.test(reportPrefix)) {
      throw new Error("工厂名称、代码或报告前缀格式不正确");
    }
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("qc_factories")
      .update({ name, code, report_prefix: reportPrefix })
      .eq("id", id)
      .eq("is_active", true)
      .select("id,code,name,report_prefix,is_active,sort_order,updated_at")
      .single();
    if (error) throw error;
    return NextResponse.json({ factory: data });
  } catch (error) {
    return NextResponse.json(
      { error: qcApiErrorMessage(error, "更新工厂失败") },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = createAdminSupabaseClient();
    const { data: usedReports, error: reportsError } = await supabase
      .from("qc_reports")
      .select("id")
      .eq("factory_id", id)
      .limit(1);
    if (reportsError) throw reportsError;
    if (usedReports?.length) {
      throw new Error("该工厂已有改善报告，不能删除；可保留用于历史查询");
    }
    const { error } = await supabase
      .from("qc_factories")
      .update({ is_active: false })
      .eq("id", id);
    if (error) throw error;
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return NextResponse.json(
      { error: qcApiErrorMessage(error, "删除工厂失败") },
      { status: 400 },
    );
  }
}
