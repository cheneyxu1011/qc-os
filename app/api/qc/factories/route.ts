import { NextResponse } from "next/server";
import { qcApiErrorMessage } from "@/lib/qc/reports";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function cleanText(value: unknown, maxLength = 100) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validateFactory(body: unknown) {
  if (!body || typeof body !== "object") throw new Error("工厂资料格式不正确");
  const input = body as Record<string, unknown>;
  const name = cleanText(input.name, 100);
  const code = cleanText(input.code, 20).toUpperCase();
  const reportPrefix = cleanText(input.reportPrefix, 4).toUpperCase();
  if (!name || !code || !reportPrefix) throw new Error("请完整填写工厂名称、代码和报告前缀");
  if (!/^[A-Z]{2,4}$/.test(reportPrefix)) throw new Error("报告前缀必须为 2 至 4 位大写英文字母");
  return { name, code, report_prefix: reportPrefix };
}

export async function GET(request: Request) {
  try {
    const yearValue = Number(new URL(request.url).searchParams.get("year"));
    const year = Number.isInteger(yearValue) && yearValue >= 2000 && yearValue <= 2100
      ? yearValue
      : new Date().getFullYear();
    const supabase = createAdminSupabaseClient();
    const [{ data: factories, error: factoriesError }, { data: sequences, error: sequencesError }] =
      await Promise.all([
        supabase
          .from("qc_factories")
          .select("id,code,name,report_prefix,is_active,sort_order,updated_at")
          .eq("is_active", true)
          .order("sort_order")
          .order("name"),
        supabase
          .from("qc_reports")
          .select("factory_id,report_sequence")
          .eq("report_year", year),
      ]);
    if (factoriesError) throw factoriesError;
    if (sequencesError) throw sequencesError;

    const maxByFactory = new Map<string, number>();
    for (const row of sequences || []) {
      maxByFactory.set(
        row.factory_id,
        Math.max(maxByFactory.get(row.factory_id) || 0, row.report_sequence || 0),
      );
    }
    return NextResponse.json(
      {
        factories: (factories || []).map((factory) => {
          const nextSequence = (maxByFactory.get(factory.id) || 0) + 1;
          return {
            ...factory,
            next_report_no:
              `${factory.report_prefix}${year}-${String(nextSequence).padStart(3, "0")}`,
          };
        }),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: qcApiErrorMessage(error, "读取工厂资料失败") },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = validateFactory(await request.json());
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("qc_factories")
      .insert(payload)
      .select("id,code,name,report_prefix,is_active,sort_order,updated_at")
      .single();
    if (error) throw error;
    return NextResponse.json({ factory: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: qcApiErrorMessage(error, "新增工厂失败") },
      { status: 400 },
    );
  }
}
