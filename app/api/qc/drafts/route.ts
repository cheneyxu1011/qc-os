import { NextResponse } from "next/server";
import { addDraftAttachmentViewUrls } from "@/lib/qc/drafts";
import { qcApiErrorMessage } from "@/lib/qc/reports";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function cleanText(value: unknown, maxLength = 1000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanDraftData(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("草稿数据格式不正确");
  }
  return value as Record<string, unknown>;
}

export async function GET(request: Request) {
  try {
    const reporter = cleanText(new URL(request.url).searchParams.get("reporter"), 80);
    if (!reporter) throw new Error("请选择报告人");
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("qc_report_drafts")
      .select("id,reporter_person_id,reporter_name,factory_id,style_catalog_id,draft_data,created_at,updated_at")
      .eq("reporter_name", reporter)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    const drafts = await Promise.all(
      (data || []).map(async (draft) => ({
        ...draft,
        draft_data: await addDraftAttachmentViewUrls(draft.draft_data),
      })),
    );
    return NextResponse.json({ drafts, count: drafts.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: qcApiErrorMessage(error, "读取草稿失败") }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const input = await request.json();
    const reporter = cleanText(input.reporter, 80);
    const id = cleanText(input.id, 80);
    const draftData = cleanDraftData(input.draftData);
    if (!reporter) throw new Error("请选择报告人");

    const supabase = createAdminSupabaseClient();
    const { data: person, error: personError } = await supabase
      .from("qc_people")
      .select("id,name")
      .eq("name", reporter)
      .eq("is_active", true)
      .maybeSingle();
    if (personError) throw personError;
    if (!person) throw new Error("报告人不在人员库中");

    const row = {
      reporter_person_id: person.id,
      reporter_name: person.name,
      factory_id: cleanText(draftData.factoryId, 80) || null,
      style_catalog_id: cleanText(draftData.styleCatalogId, 80) || null,
      draft_data: draftData,
    };
    const query = id
      ? supabase.from("qc_report_drafts").update(row).eq("id", id).eq("reporter_name", reporter)
      : supabase.from("qc_report_drafts").insert(row);
    const { data: saved, error } = await query
      .select("id,reporter_name,factory_id,style_catalog_id,draft_data,created_at,updated_at")
      .single();
    if (error) throw error;
    return NextResponse.json({ draft: saved });
  } catch (error) {
    return NextResponse.json({ error: qcApiErrorMessage(error, "保存草稿失败") }, { status: 400 });
  }
}
