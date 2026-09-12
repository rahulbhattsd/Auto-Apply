import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { env } from '@autoapply/config';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

const s3Client = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: 'auto',
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
});

export async function downloadResumeFromS3(applicationId: number, fileUrl: string): Promise<string> {
  const uuid = Math.random().toString(36).substring(2, 15);
  const tempResumePath = path.join('/tmp', `${applicationId}-${uuid}.pdf`);

  try {
    const response = await s3Client.send(new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: fileUrl,
    }));

    if (!response.Body) {
      throw new Error(`Resume object not found in S3 for application ${applicationId}`);
    }

    // Node.js typings for AWS SDK v3 stream
    await pipeline(response.Body as unknown as NodeJS.ReadableStream, fs.createWriteStream(tempResumePath));
    return tempResumePath;
  } catch (err) {
    throw new Error(`Failed to download resume from S3: ${err instanceof Error ? err.message : String(err)}`);
  }
}
