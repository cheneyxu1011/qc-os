import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { NextResponse } from "next/server";
import { createQcS3Client, getQcS3Config } from "@/lib/s3/client";
import { qcImageKey } from "@/lib/s3/paths";

export const runtime = "nodejs";

const allowedContentTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

type UploadType = "problem-before" | "action-after" | "review-evidence" | "archive";

function isUploadType(value: unknown): value is UploadType {
  return value === "problem-before" || value === "action-after" || value === "review-evidence" || value === "archive";
}

function cleanReportNo(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const reportNo = cleanReportNo(body.reportNo);
    const uploadType = body.type;
    const fileName = typeof body.fileName === "string" ? body.fileName : "";
    const contentType = typeof body.contentType === "string" ? body.contentType : "";
    const year = typeof body.year === "string" ? body.year.replace(/\D/g, "").slice(0, 4) : new Date().getFullYear().toString();
    const actionSequenceNo = Number.isInteger(body.actionSequenceNo) ? body.actionSequenceNo : undefined;

    if (!reportNo || !isUploadType(uploadType) || !fileName || !allowedContentTypes.has(contentType)) {
      return NextResponse.json({ error: "Invalid upload request" }, { status: 400 });
    }

    const { bucket, publicBaseUrl } = getQcS3Config();
    const key = qcImageKey({
      actionSequenceNo,
      fileName,
      reportNo,
      type: uploadType,
      year,
    });

    const presignedPost = await createPresignedPost(createQcS3Client(), {
      Bucket: bucket,
      Conditions: [
        ["content-length-range", 1, 15 * 1024 * 1024],
        ["eq", "$Content-Type", contentType],
      ],
      Expires: 300,
      Fields: {
        "Content-Type": contentType,
        key,
      },
      Key: key,
    });

    return NextResponse.json({
      ...presignedPost,
      expiresIn: 300,
      key,
      publicUrl: publicBaseUrl ? `${publicBaseUrl.replace(/\/$/, "")}/${key}` : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload signing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
