export function qcImageKey(params: {
  year: string;
  reportNo: string;
  type: "problem-before" | "action-after" | "review-evidence" | "archive";
  fileName: string;
  actionSequenceNo?: number;
}) {
  const actionPrefix = params.actionSequenceNo ? `action-${params.actionSequenceNo}-` : "";
  return `qc-os/${params.year}/${params.reportNo}/${params.type}/${actionPrefix}${safeS3FileName(params.fileName)}`;
}

export function safeS3FileName(fileName: string) {
  const parts = fileName.split(".");
  const extension = parts.length > 1 ? `.${parts.pop()}` : "";
  const baseName = parts.join(".") || "upload";
  const safeBaseName = baseName
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, 80);
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${timestamp}-${suffix}-${safeBaseName || "upload"}${extension.toLowerCase()}`;
}
