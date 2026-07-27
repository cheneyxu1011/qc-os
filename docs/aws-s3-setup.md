# Amazon S3 Setup For QC OS

QC OS stores report records in Supabase and stores all photos/export files in Amazon S3.

## Required Vercel Environment Variables

```text
AWS_REGION="ap-east-1"
AWS_S3_BUCKET_QC_IMAGES="your-qc-os-bucket"
AWS_S3_PUBLIC_BASE_URL=""
AWS_ACCESS_KEY_ID=""
AWS_SECRET_ACCESS_KEY=""
```

`AWS_S3_PUBLIC_BASE_URL` is optional. Leave it empty while the bucket is private. Add a CloudFront URL later if direct previews should use a public CDN.

## Bucket CORS

Add this CORS rule to the S3 bucket:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["POST", "GET"],
    "AllowedOrigins": [
      "https://qc-os.vanwellgroup.com",
      "https://qc-os.vercel.app"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

## IAM Policy

Create a dedicated IAM user or role for QC OS. Replace `your-qc-os-bucket` before use:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::your-qc-os-bucket/qc-os/*"
    }
  ]
}
```

## Upload Flow

1. Browser calls `POST /api/uploads/presign`.
2. Server validates report number, file type, and upload type.
3. Server returns a presigned S3 POST form valid for 5 minutes.
4. Browser uploads the file directly to S3.
5. App saves the returned S3 key into Supabase metadata tables.

Allowed upload types:

- `problem-before`
- `action-after`
- `review-evidence`
- `archive`

Allowed file types:

- `image/jpeg`
- `image/png`
- `image/webp`
- `application/pdf`

Default max file size: 15MB.
