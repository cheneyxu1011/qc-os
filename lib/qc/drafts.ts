import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createQcS3Client, getQcS3Config } from "@/lib/s3/client";

type DraftAttachment = {
  s3Key?: unknown;
  originalFileName?: unknown;
  contentType?: unknown;
  fileSizeBytes?: unknown;
};

export async function addDraftAttachmentViewUrls(draftData: unknown) {
  if (!draftData || typeof draftData !== "object") return draftData;
  const data = structuredClone(draftData) as Record<string, unknown>;
  const attachments = Array.isArray(data.attachments)
    ? (data.attachments as DraftAttachment[])
    : [];
  if (!attachments.length) return data;

  const { bucket } = getQcS3Config();
  const s3 = createQcS3Client();
  data.attachments = await Promise.all(
    attachments.map(async (attachment) => {
      const s3Key = typeof attachment.s3Key === "string" ? attachment.s3Key : "";
      if (!s3Key.startsWith("qc-os/")) return attachment;
      const viewUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: bucket, Key: s3Key }),
        { expiresIn: 300 },
      );
      return { ...attachment, viewUrl };
    }),
  );
  return data;
}
