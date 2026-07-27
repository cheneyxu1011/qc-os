import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createQcS3Client, getQcS3Config } from "@/lib/s3/client";

const VIEW_URL_EXPIRES_IN_SECONDS = 300;

export type QcAttachmentRow = {
  id: string;
  report_id: string;
  action_id: string | null;
  attachment_type: string;
  s3_bucket: string;
  s3_key: string;
  original_file_name: string | null;
  content_type: string | null;
  file_size_bytes: number | null;
  uploaded_by_name: string | null;
  uploaded_at: string;
};

export type QcAttachmentWithViewUrl = QcAttachmentRow & {
  view_url: string;
  view_url_expires_in: number;
};

export async function addQcAttachmentViewUrls(
  attachments: QcAttachmentRow[],
): Promise<QcAttachmentWithViewUrl[]> {
  if (!attachments.length) return [];

  const { bucket } = getQcS3Config();
  const s3 = createQcS3Client();

  return Promise.all(
    attachments.map(async (attachment) => {
      if (attachment.s3_bucket !== bucket || !attachment.s3_key.startsWith("qc-os/")) {
        throw new Error(`附件 ${attachment.id} 的 S3 位置不符合 QC OS 规则`);
      }

      const viewUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: attachment.s3_bucket,
          Key: attachment.s3_key,
        }),
        { expiresIn: VIEW_URL_EXPIRES_IN_SECONDS },
      );

      return {
        ...attachment,
        view_url: viewUrl,
        view_url_expires_in: VIEW_URL_EXPIRES_IN_SECONDS,
      };
    }),
  );
}

