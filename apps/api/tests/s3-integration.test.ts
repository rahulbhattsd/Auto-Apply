import test from 'node:test';
import assert from 'node:assert';
import { S3StorageProvider } from '../src/services/storage';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { env } from '@autoapply/config';
import fs from 'fs';
import path from 'path';

test('S3 Storage Provider - upload and download integration', async () => {
  // Uses the local minio instance
  const provider = new S3StorageProvider();

  const fileContent = 'mock resume content ' + Date.now();
  const fileBuffer = Buffer.from(fileContent);

  const filePath = path.resolve(__dirname, 'mock-resume.txt');
  fs.writeFileSync(filePath, fileContent);
  const file = {
    filename: 'test-resume.pdf',
    file: fs.createReadStream(filePath),
  } as any;

  try {
    const { url, fileName } = await provider.uploadFile(file, 123);
    assert.ok(url.startsWith('resumes/123/'), 'URL should be the S3 object key');

    // Import and test the actual logic application-worker uses to download the object
    // Since we're in the api workspace, we'll import from the relative path to application-worker
    const { downloadResumeFromS3 } = require('../../../workers/application-worker/src/utils/s3');

    const tempResumePath = await downloadResumeFromS3(123, url);

    const downloadedBytes = fs.readFileSync(tempResumePath, 'utf-8');
    assert.strictEqual(downloadedBytes, fileContent, 'Downloaded bytes should match uploaded bytes');

    fs.unlinkSync(tempResumePath);
  } finally {
    fs.unlinkSync(filePath);
  }
});
