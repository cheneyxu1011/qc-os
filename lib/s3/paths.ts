export function qcImageKey(params: {
  year: string;
  reportNo: string;
  type: "problem-before" | "action-after" | "review-evidence" | "archive";
  fileName: string;
  actionSequenceNo?: number;
}) {
  const actionPrefix = params.actionSequenceNo ? `action-${params.actionSequenceNo}-` : "";
  return `qc-os/${params.year}/${params.reportNo}/${params.type}/${actionPrefix}${params.fileName}`;
}

