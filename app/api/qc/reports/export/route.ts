import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { qcApiErrorMessage, readQcReportList } from "@/lib/qc/reports";

export const runtime = "nodejs";

const statusNames: Record<string, string> = {
  draft: "草稿",
  submitted: "待责任确认",
  executing: "执行中",
  pending_review: "待复核",
  review_rejected: "复核退回",
  pending_archive: "待归档",
  archived: "已归档",
};

const actionTypeNames: Record<string, string> = {
  temporary_correction: "临时改善",
  permanent_correction: "永久改善",
  preventive_action: "预防措施",
  notification_only: "仅通知",
};

function names(rows: Array<Record<string, unknown>>, key: string) {
  return rows.map((row) => String(row[key] || "")).filter(Boolean).join("、");
}

function formatSheet(sheet: ExcelJS.Worksheet, widths: number[]) {
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF176EAA" },
  };
  sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
    sheet.getColumn(index + 1).alignment = { vertical: "top", wrapText: true };
  });
  sheet.autoFilter = { from: "A1", to: sheet.getRow(1).getCell(widths.length).address };
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const reports = await readQcReportList({
      styleNo: params.get("styleNo") || undefined,
      factoryId: params.get("factoryId") || undefined,
      month: params.get("month") || undefined,
      limit: 5000,
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "QC OS";
    workbook.created = new Date();

    const reportSheet = workbook.addWorksheet("改善报告");
    reportSheet.addRow([
      "报告编号", "工厂", "发现日期", "品牌", "款号", "颜色", "严重程度",
      "问题来源", "责任部门", "部门人员", "报告人", "默认复核人", "预设审批人",
      "问题描述", "根本原因", "闭环状态", "是否计入KPI",
    ]);

    const actionSheet = workbook.addWorksheet("改善措施");
    actionSheet.addRow([
      "报告编号", "工厂", "序号", "措施类型", "措施内容", "责任人",
      "计划完成日期", "状态", "实际完成日期",
    ]);

    const imageSheet = workbook.addWorksheet("图片索引");
    imageSheet.addRow(["报告编号", "工厂", "图片类型", "原始文件名", "S3对象键"]);

    for (const report of reports as Array<Record<string, any>>) {
      reportSheet.addRow([
        report.report_no,
        report.factory_name,
        report.found_date,
        report.brand,
        report.style_no,
        report.color,
        report.severity,
        report.source_department_name,
        names(report.responsible_departments || [], "department_name"),
        names(report.responsible_people || [], "person_name"),
        report.reporter_name,
        report.default_reviewer_name,
        report.intended_approver_name,
        report.problem_description,
        report.root_cause,
        statusNames[report.status] || report.status,
        report.kpi_enabled ? "是" : "否",
      ]);

      for (const action of report.actions || []) {
        actionSheet.addRow([
          report.report_no,
          report.factory_name,
          action.sequence_no,
          actionTypeNames[action.action_type] || action.action_type,
          action.action_content,
          names(action.assignees || [], "person_name"),
          action.due_date,
          action.status,
          action.completed_at,
        ]);
      }

      for (const attachment of report.problem_attachments || []) {
        imageSheet.addRow([
          report.report_no,
          report.factory_name,
          "改善前问题照片",
          attachment.original_file_name,
          attachment.s3_key,
        ]);
      }
    }

    formatSheet(reportSheet, [20, 18, 14, 16, 16, 12, 16, 14, 24, 24, 14, 14, 14, 42, 42, 16, 14]);
    formatSheet(actionSheet, [20, 18, 8, 16, 44, 28, 16, 14, 18]);
    formatSheet(imageSheet, [20, 18, 18, 28, 70]);

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `qc-improvement-${params.get("month") || "all"}.xlsx`;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: qcApiErrorMessage(error, "导出改善历史失败") },
      { status: 400 },
    );
  }
}
