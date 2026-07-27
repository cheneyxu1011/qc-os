import { S3Client } from "@aws-sdk/client-s3";

export function getQcS3Config() {
  const region = process.env.AWS_REGION;
  const bucket = process.env.AWS_S3_BUCKET_QC_IMAGES;

  if (!region || !bucket) {
    throw new Error("Missing AWS_REGION or AWS_S3_BUCKET_QC_IMAGES");
  }

  return {
    bucket,
    publicBaseUrl: process.env.AWS_S3_PUBLIC_BASE_URL,
    region,
  };
}

export function createQcS3Client() {
  const { region } = getQcS3Config();

  return new S3Client({
    region,
    credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
  });
}
