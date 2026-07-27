import { NextResponse } from "next/server";
import {
  deactivateQcStyle,
  qcStyleApiError,
  updateQcStyle,
  validateQcStyleInput,
} from "@/lib/qc/styles";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const style = await updateQcStyle(id, validateQcStyleInput(await request.json()));
    return NextResponse.json({ style });
  } catch (error) {
    const result = qcStyleApiError(error, "更新款式资料失败");
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await deactivateQcStyle(id);
    return NextResponse.json({ status: "deactivated" });
  } catch (error) {
    const result = qcStyleApiError(error, "删除款式资料失败");
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}

