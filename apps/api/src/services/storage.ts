import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import type { MultipartFile } from '@fastify/multipart';
import { env } from '@autoapply/config';

export interface StorageProvider {
  uploadFile(file: MultipartFile, userId: number): Promise<{ url: string; fileName: string }>;
}

export class LocalStorageProvider implements StorageProvider {
  private uploadDir: string;

  constructor() {
    this.uploadDir = env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads');
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async uploadFile(file: MultipartFile, userId: number): Promise<{ url: string; fileName: string }> {
    const fileName = `${userId}-${Date.now()}-${file.filename}`;
    const filePath = path.join(this.uploadDir, fileName);

    await pipeline(file.file, fs.createWriteStream(filePath));

    return {
      url: `/uploads/${fileName}`,
      fileName: file.filename,
    };
  }
}
