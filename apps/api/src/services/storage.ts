import type { MultipartFile } from '@fastify/multipart';
import { env } from '@autoapply/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export interface StorageProvider {
  uploadFile(file: MultipartFile, userId: number): Promise<{ url: string; fileName: string }>;
}

export class S3StorageProvider implements StorageProvider {
  private s3: S3Client;
  private bucket: string;

  constructor() {
    this.s3 = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: 'auto',
      forcePathStyle: true, // Crucial for Minio and local testing
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    });
    this.bucket = env.S3_BUCKET;
  }

  async uploadFile(file: MultipartFile, userId: number): Promise<{ url: string; fileName: string }> {
    const objectKey = `resumes/${userId}/${Date.now()}-${file.filename}`;

    const chunks = [];
    for await (const chunk of file.file) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      Body: buffer,
    }));

    return {
      url: objectKey,
      fileName: file.filename,
    };
  }
}

export const storageProvider = new S3StorageProvider();
