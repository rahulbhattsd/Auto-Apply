import { JobResult, JobSource } from './JobSource';
import crypto from 'crypto';
import { Job } from '@prisma/client';
import { prisma } from '@autoapply/database';

export class NormalizationService {
  /**
   * Generates a canonical fingerprint for a job to enable deduplication.
   * Canonical fingerprint = SHA256(normalized company + normalized title + normalized location + canonical URL)
   */
  generateFingerprint(job: JobResult): string {
    const normalizeStr = (str?: string) => str ? str.trim().toLowerCase() : '';
    const company = normalizeStr(job.company);
    const title = normalizeStr(job.title);
    const location = normalizeStr(job.location);
    const url = normalizeStr(job.url);

    const raw = `${company}|${title}|${location}|${url}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Normalizes a JobResult from a provider and persists it to the database,
   * handling deduplication via fingerprinting.
   */
  async normalizeAndPersist(jobResult: JobResult, sourceConfig: JobSource): Promise<Job> {
    const fingerprint = this.generateFingerprint(jobResult);

    // Check for existing fingerprint
    const existing = await prisma.job.findUnique({
      where: { canonicalFingerprint: fingerprint }
    });

    if (existing) {
      // If it exists, link/skip rather than duplicate. We return the existing job.
      return existing;
    }

    // Ensure JobSource exists
    let source = await prisma.jobSource.findUnique({
      where: { name: sourceConfig.name }
    });
    if (!source) {
      source = await prisma.jobSource.create({
        data: { name: sourceConfig.name }
      });
    }

    // Ensure Company exists
    let company = await prisma.company.findUnique({
      where: { name: jobResult.company }
    });
    if (!company) {
      company = await prisma.company.create({
        data: { name: jobResult.company }
      });
    }

    // Insert new normalized job
    const newJob = await prisma.job.create({
      data: {
        externalId: jobResult.externalId,
        sourceId: source.id,
        title: jobResult.title,
        companyId: company.id,
        location: jobResult.location || null,
        remoteType: jobResult.remoteType || null,
        description: jobResult.description,
        url: jobResult.url,
        employmentType: jobResult.employmentType || null,
        salaryMin: jobResult.salaryMin || null,
        salaryMax: jobResult.salaryMax || null,
        currency: jobResult.currency || null,
        postedAt: jobResult.postedAt,
        skills: jobResult.skills,
        canonicalFingerprint: fingerprint,
      }
    });

    return newJob;
  }
}
