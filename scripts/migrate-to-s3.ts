import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { prisma } from '@autoapply/database';
import { env } from '@autoapply/config';
import fs from 'fs';
import path from 'path';

const s3Client = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: 'auto',
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
});

async function main() {
  const resumes = await prisma.resume.findMany({
    where: {
      fileUrl: {
        startsWith: '/uploads/'
      }
    }
  });

  console.log(`Found ${resumes.length} resumes to migrate.`);

  // Fallback to local process.cwd()/uploads if UPLOAD_DIR is not present
  const uploadDir = env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads');

  for (const resume of resumes) {
    const localFileName = resume.fileUrl.replace('/uploads/', '');
    const localFilePath = path.join(uploadDir, localFileName);

    if (!fs.existsSync(localFilePath)) {
      console.warn(`File not found locally for resume ${resume.id}: ${localFilePath}`);
      continue;
    }

    const objectKey = `resumes/${resume.userId}/${Date.now()}-${resume.fileName}`;
    const fileBuffer = fs.readFileSync(localFilePath);

    console.log(`Uploading ${localFileName} to S3 as ${objectKey}...`);

    try {
      await s3Client.send(new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: objectKey,
        Body: fileBuffer,
      }));

      await prisma.resume.update({
        where: { id: resume.id },
        data: { fileUrl: objectKey }
      });
      console.log(`Successfully migrated resume ${resume.id}`);
    } catch (e) {
      console.error(`Failed to migrate resume ${resume.id}`, e);
    }
  }

  console.log('Migration complete.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
