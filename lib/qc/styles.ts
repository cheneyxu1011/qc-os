import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { qcApiErrorMessage } from "@/lib/qc/reports";

export type QcStyleInput = {
  brand: string;
  styleNo: string;
  color: string;
};

function cleanText(value: unknown, maxLength = 200) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function validateQcStyleInput(body: unknown): QcStyleInput {
  if (!body || typeof body !== "object") throw new Error("款式资料格式不正确");
  const input = body as Record<string, unknown>;
  const brand = cleanText(input.brand);
  const styleNo = cleanText(input.styleNo);
  const color = cleanText(input.color);

  if (!brand) throw new Error("品牌不能为空");
  if (!styleNo) throw new Error("款号不能为空");
  if (!color) throw new Error("颜色不能为空");

  return { brand, styleNo, color };
}

export async function listQcStyles(params: {
  search?: string;
  includeInactive?: boolean;
} = {}) {
  const supabase = createAdminSupabaseClient();
  const search = cleanText(params.search, 200);
  let query = supabase
    .from("qc_style_catalog")
    .select(
      "id,brand,style_no,color,source,factory_style_id,external_id,is_active,synced_at,created_at,updated_at",
    )
    .order("brand", { ascending: true })
    .order("style_no", { ascending: true })
    .order("color", { ascending: true });

  if (!params.includeInactive) query = query.eq("is_active", true);
  if (search) {
    const escaped = search.replace(/[%_,]/g, "");
    query = query.or(
      `brand.ilike.%${escaped}%,style_no.ilike.%${escaped}%,color.ilike.%${escaped}%`,
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createQcStyle(input: QcStyleInput) {
  const supabase = createAdminSupabaseClient();
  const { data: inactive, error: inactiveError } = await supabase
    .from("qc_style_catalog")
    .select("id,source")
    .ilike("brand", input.brand)
    .ilike("style_no", input.styleNo)
    .ilike("color", input.color)
    .eq("is_active", false)
    .maybeSingle();
  if (inactiveError) throw inactiveError;
  if (inactive) {
    if (inactive.source === "factory_os") {
      throw new Error("该款式资料由 Factory OS 管理，不能在 QC OS 恢复");
    }
    const { data, error } = await supabase
      .from("qc_style_catalog")
      .update({
        brand: input.brand,
        style_no: input.styleNo,
        color: input.color,
        is_active: true,
      })
      .eq("id", inactive.id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("qc_style_catalog")
    .insert({
      brand: input.brand,
      style_no: input.styleNo,
      color: input.color,
      source: "manual",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateQcStyle(id: string, input: QcStyleInput) {
  const supabase = createAdminSupabaseClient();
  const { data: existing, error: existingError } = await supabase
    .from("qc_style_catalog")
    .select("source")
    .eq("id", id)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) throw new Error("款式资料不存在");
  if (existing.source === "factory_os") {
    throw new Error("Factory OS 同步资料不能在 QC OS 直接修改");
  }

  const { data, error } = await supabase
    .from("qc_style_catalog")
    .update({
      brand: input.brand,
      style_no: input.styleNo,
      color: input.color,
      is_active: true,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deactivateQcStyle(id: string) {
  const supabase = createAdminSupabaseClient();
  const { data: existing, error: existingError } = await supabase
    .from("qc_style_catalog")
    .select("source")
    .eq("id", id)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) throw new Error("款式资料不存在");
  if (existing.source === "factory_os") {
    throw new Error("Factory OS 同步资料不能在 QC OS 直接删除");
  }

  const { error } = await supabase
    .from("qc_style_catalog")
    .update({ is_active: false })
    .eq("id", id);
  if (error) throw error;
}

export function qcStyleApiError(error: unknown, fallback: string) {
  const message = qcApiErrorMessage(error, fallback);
  const duplicate =
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505";
  return {
    message: duplicate ? "该品牌、款号和颜色组合已经存在" : message,
    status: duplicate ? 409 : 400,
  };
}
