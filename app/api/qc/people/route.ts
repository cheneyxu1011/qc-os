import { NextResponse } from "next/server";
import { qcApiErrorMessage } from "@/lib/qc/reports";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type PeopleDepartmentRow = {
  id: string;
  code: string | null;
  name: string;
  sort_order: number | null;
  updated_at: string | null;
};

type PeopleRow = {
  id: string;
  employee_no: string | null;
  name: string;
  role_name: string | null;
  updated_at: string | null;
};

type MembershipRow = {
  person_id: string;
  department_id: string;
  is_primary: boolean | null;
};

function cleanText(value: unknown, maxLength = 100) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function manualDepartmentCode(name: string) {
  const seed = name
    .normalize("NFKD")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase()
    .slice(0, 24);
  return `MANUAL_${seed || "DEPT"}_${Date.now().toString(36).toUpperCase()}`;
}

async function readPeopleLibrary() {
  const supabase = createAdminSupabaseClient();
  const [
    { data: departments, error: departmentsError },
    { data: people, error: peopleError },
    { data: memberships, error: membershipsError },
  ] = await Promise.all([
    supabase
      .from("qc_departments")
      .select("id,code,name,sort_order,updated_at")
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
    supabase
      .from("qc_people")
      .select("id,employee_no,name,role_name,updated_at")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("qc_person_departments")
      .select("person_id,department_id,is_primary"),
  ]);
  if (departmentsError) throw departmentsError;
  if (peopleError) throw peopleError;
  if (membershipsError) throw membershipsError;

  const activeDepartmentIds = new Set((departments || []).map((row: PeopleDepartmentRow) => row.id));
  const peopleById = new Map((people || []).map((row: PeopleRow) => [row.id, row]));
  const peopleByDepartment = new Map<string, PeopleRow[]>();

  for (const membership of (memberships || []) as MembershipRow[]) {
    if (!activeDepartmentIds.has(membership.department_id)) continue;
    const person = peopleById.get(membership.person_id);
    if (!person) continue;
    const list = peopleByDepartment.get(membership.department_id) || [];
    list.push(person);
    peopleByDepartment.set(membership.department_id, list);
  }

  return {
    departments: ((departments || []) as PeopleDepartmentRow[]).map((department) => ({
      ...department,
      people: (peopleByDepartment.get(department.id) || []).map((person) => ({
        ...person,
        department_id: department.id,
        department_name: department.name,
      })),
    })),
  };
}

export async function GET() {
  try {
    const payload = await readPeopleLibrary();
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: qcApiErrorMessage(error, "读取人员库失败") },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as Record<string, unknown>;
    const departmentName = cleanText(input.departmentName, 100);
    const personName = cleanText(input.personName, 100);
    if (!departmentName || !personName) throw new Error("请完整填写部门和人员姓名");

    const supabase = createAdminSupabaseClient();
    let { data: department, error: departmentError } = await supabase
      .from("qc_departments")
      .select("id,name")
      .eq("name", departmentName)
      .maybeSingle();
    if (departmentError) throw departmentError;
    if (!department) {
      const { data, error } = await supabase
        .from("qc_departments")
        .insert({
          code: manualDepartmentCode(departmentName),
          name: departmentName,
          sort_order: 999,
          is_active: true,
        })
        .select("id,name")
        .single();
      if (error) throw error;
      department = data;
    } else {
      const { error } = await supabase
        .from("qc_departments")
        .update({ is_active: true })
        .eq("id", department.id);
      if (error) throw error;
    }

    let { data: person, error: personError } = await supabase
      .from("qc_people")
      .select("id,name")
      .eq("name", personName)
      .maybeSingle();
    if (personError) throw personError;
    if (!person) {
      const { data, error } = await supabase
        .from("qc_people")
        .insert({ name: personName, role_name: "手动维护", is_active: true })
        .select("id,name")
        .single();
      if (error) throw error;
      person = data;
    } else {
      const { error } = await supabase
        .from("qc_people")
        .update({ is_active: true })
        .eq("id", person.id);
      if (error) throw error;
    }

    const { error: membershipError } = await supabase
      .from("qc_person_departments")
      .upsert({
        department_id: department.id,
        person_id: person.id,
        is_primary: true,
      });
    if (membershipError) throw membershipError;

    const payload = await readPeopleLibrary();
    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: qcApiErrorMessage(error, "新增人员库资料失败") },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const input = (await request.json()) as Record<string, unknown>;
    const type = cleanText(input.type, 20);
    const id = cleanText(input.id, 80);
    const name = cleanText(input.name, 100);
    if (!id || !name) throw new Error("资料 ID 或名称不能为空");

    const supabase = createAdminSupabaseClient();
    if (type === "department") {
      const { error } = await supabase
        .from("qc_departments")
        .update({ name })
        .eq("id", id)
        .eq("is_active", true);
      if (error) throw error;
    } else if (type === "person") {
      const { error } = await supabase
        .from("qc_people")
        .update({ name })
        .eq("id", id)
        .eq("is_active", true);
      if (error) throw error;
    } else {
      throw new Error("未知的人员库更新类型");
    }

    const payload = await readPeopleLibrary();
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: qcApiErrorMessage(error, "更新人员库失败") },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const input = (await request.json()) as Record<string, unknown>;
    const type = cleanText(input.type, 20);
    const id = cleanText(input.id, 80);
    const departmentId = cleanText(input.departmentId, 80);
    if (!id) throw new Error("资料 ID 不能为空");

    const supabase = createAdminSupabaseClient();
    if (type === "department") {
      const { error } = await supabase
        .from("qc_departments")
        .update({ is_active: false })
        .eq("id", id);
      if (error) throw error;
    } else if (type === "person") {
      if (departmentId) {
        const { error } = await supabase
          .from("qc_person_departments")
          .delete()
          .eq("person_id", id)
          .eq("department_id", departmentId);
        if (error) throw error;
      }

      const { data: memberships, error: membershipsError } = await supabase
        .from("qc_person_departments")
        .select("department_id")
        .eq("person_id", id)
        .limit(1);
      if (membershipsError) throw membershipsError;
      if (!memberships?.length) {
        const { error } = await supabase
          .from("qc_people")
          .update({ is_active: false })
          .eq("id", id);
        if (error) throw error;
      }
    } else {
      throw new Error("未知的人员库删除类型");
    }

    const payload = await readPeopleLibrary();
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: qcApiErrorMessage(error, "删除人员库资料失败") },
      { status: 400 },
    );
  }
}
