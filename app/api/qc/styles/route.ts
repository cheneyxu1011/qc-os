import { NextResponse } from "next/server";
import {
  createQcStyle,
  listQcStyles,
  qcStyleApiError,
  validateQcStyleInput,
} from "@/lib/qc/styles";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const styles = await listQcStyles({
      search: searchParams.get("search") || undefined,
      includeInactive: searchParams.get("includeInactive") === "true",
    });
    return NextResponse.json(
      { styles, count: styles.length },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const result = qcStyleApiError(error, "读取款式资料失败");
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}

export async function POST(request: Request) {
  try {
    const style = await createQcStyle(validateQcStyleInput(await request.json()));
    return NextResponse.json({ style }, { status: 201 });
  } catch (error) {
    const result = qcStyleApiError(error, "新增款式资料失败");
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}

