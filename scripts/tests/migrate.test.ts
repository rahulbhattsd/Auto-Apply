import test from 'node:test';
import assert from 'node:assert';
import { prisma } from '@autoapply/database';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { env } from '@autoapply/config';
import fs from 'fs';
import path from 'path';

test('migrate-to-s3 migrates local resumes to s3', async () => {
    // Setup a real local file and mock DB to test the real S3 upload
    let findManyCalled = false;
    let updateCalled = false;
    let newKey = '';

    const originalFindMany = prisma.resume.findMany;
    const originalUpdate = prisma.resume.update;

    const testFile = 'fake-resume-file.pdf';
    const uploadDir = env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    fs.writeFileSync(path.join(uploadDir, testFile), 'fake resume bytes');

    prisma.resume.findMany = async () => {
      findManyCalled = true;
      return [{ id: 1, userId: 123, fileName: testFile, fileUrl: `/uploads/${testFile}` }] as any;
    };

    prisma.resume.update = async (args: any) => {
      updateCalled = true;
      newKey = args.data.fileUrl;
      return args.data as any;
    };

    try {
      await import('../migrate-to-s3.ts');

      // Wait for async execution
      await new Promise(r => setTimeout(r, 2000));

      assert.ok(findManyCalled, 'findMany was called');
      assert.ok(updateCalled, 'prisma.resume.update was called');
      assert.ok(newKey.startsWith('resumes/123/'), 'Updated fileUrl correctly');

      const s3 = new S3Client({
        endpoint: env.S3_ENDPOINT,
        region: 'auto',
        forcePathStyle: true,
        credentials: {
          accessKeyId: env.S3_ACCESS_KEY_ID,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        },
      });

      const response = await s3.send(new GetObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: newKey,
      }));

      const content = await response.Body?.transformToString();
      assert.strictEqual(content, 'fake resume bytes', 'S3 object should contain original file content');
    } finally {
      prisma.resume.findMany = originalFindMany;
      prisma.resume.update = originalUpdate;
      fs.unlinkSync(path.join(env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads'), testFile));
    }
});
