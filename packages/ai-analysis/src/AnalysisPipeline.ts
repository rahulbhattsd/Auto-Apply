import { AIProvider } from './AIProvider.js';
import { z } from 'zod';

export interface Job {
  id?: number;
  title: string;
  companyId?: number | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  description: string;
  location?: string | null;
  remoteType?: string | null;
  skills?: string[];
  employmentType?: string | null;
  company?: { name: string } | null;
}

export interface CandidateProfile {
  id?: number;
  userId?: number;
  minimumSalary?: number | null;
  preferredRoles?: string[];
  preferredLocations?: string[];
  employmentTypes?: string[];
  skills?: unknown;
  experience?: unknown;
  education?: unknown;
}

export interface ApplicationPolicy {
  excludedCompanies: string[];
  excludedKeywords: string[];
  minimumMatchScore?: number | null;
}

const candidateArraySchema = z.array(z.record(z.unknown())).nullable().optional();
const skillsSchema = z.array(z.string()).catch([]);

export class AnalysisPipeline {
  constructor(private aiProvider: AIProvider) {}

  /**
   * Run Stage 1 deterministic filter.
   * Returns a rejection reason string if rejected, or null if passed.
   */
  async runDeterministicFilter(job: Job, profile: CandidateProfile, policy: ApplicationPolicy | null): Promise<string | null> {
    if (policy) {
      if (job.company?.name) {
        if (policy.excludedCompanies.some((c: string) => c.toLowerCase() === job.company!.name.toLowerCase())) {
          return 'Excluded company';
        }
      }

      if (policy.excludedKeywords.length > 0) {
        const descLower = job.description.toLowerCase();
        for (const keyword of policy.excludedKeywords) {
          if (descLower.includes(keyword.toLowerCase())) {
            return `Contains excluded keyword: ${keyword}`;
          }
        }
      }
    }

    if (profile) {
      // Basic salary check
      if (profile.minimumSalary && job.salaryMax && job.salaryMax < profile.minimumSalary) {
        return 'Salary below minimum threshold';
      }

      // Employment type check
      if (profile.employmentTypes && profile.employmentTypes.length > 0 && job.employmentType) {
        if (!profile.employmentTypes.some((t: string) => t.toLowerCase() === job.employmentType!.toLowerCase())) {
          return `Employment type mismatch: ${job.employmentType}`;
        }
      }
    }

    return null; // Passed Stage 1
  }

  /**
   * Run the full pipeline for a job.
   */
  async processJob(job: Job, profile: CandidateProfile, policy: ApplicationPolicy | null) {
    // Stage 1: Deterministic Filter
    const rejectionReason = await this.runDeterministicFilter(job, profile, policy);

    if (rejectionReason) {
      return {
        matchScore: 0,
        recommendation: 'REJECT',
        skillsMatched: [],
        skillsMissing: [],
        reasoning: `Deterministic Filter: ${rejectionReason}`,
      };
    }

    if (!this.aiProvider.analyzeJob) {
      throw new Error('AI Provider does not implement analyzeJob');
    }

    // Stage 2: AI Analysis
    return this.aiProvider.analyzeJob(
      {
        skills: skillsSchema.parse(profile.skills),
        experience: candidateArraySchema.parse(profile.experience) ?? [],
        education: candidateArraySchema.parse(profile.education) ?? [],
        preferredRoles: profile.preferredRoles || [],
        preferredLocations: profile.preferredLocations || [],
      },
      {
        title: job.title,
        company: job.company?.name || 'Unknown',
        description: job.description,
        location: job.location || null,
        remoteType: job.remoteType || null,
        skills: job.skills || [],
      }
    );
  }
}
