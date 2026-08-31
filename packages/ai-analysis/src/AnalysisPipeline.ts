import { Job, CandidateProfile, ApplicationPolicy } from '@prisma/client';
import { AIProvider } from './AIProvider';
import { prisma } from '@autoapply/database';

export class AnalysisPipeline {
  constructor(private aiProvider: AIProvider) {}

  /**
   * Run Stage 1 deterministic filter.
   * Returns a rejection reason string if rejected, or null if passed.
   */
  async runDeterministicFilter(job: Job, profile: CandidateProfile, policy: ApplicationPolicy | null): Promise<string | null> {
    if (policy) {
      if (job.companyId) {
         const company = await prisma.company.findUnique({ where: { id: job.companyId } });
         if (company && policy.excludedCompanies.some(c => c.toLowerCase() === company.name.toLowerCase())) {
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
      if (profile.employmentTypes.length > 0 && job.employmentType) {
        if (!profile.employmentTypes.some(t => t.toLowerCase() === job.employmentType!.toLowerCase())) {
          return `Employment type mismatch: ${job.employmentType}`;
        }
      }
    }

    return null; // Passed Stage 1
  }

  /**
   * Run the full pipeline for a job.
   */
  async processJob(jobId: number, profileId: number): Promise<void> {
    const job = await prisma.job.findUnique({ where: { id: jobId }, include: { company: true } });
    if (!job) throw new Error('Job not found');

    const profile = await prisma.candidateProfile.findUnique({ where: { id: profileId }, include: { user: { include: { policy: true } } } });
    if (!profile) throw new Error('Profile not found');

    const policy = profile.user.policy;

    // Stage 1: Deterministic Filter
    const rejectionReason = await this.runDeterministicFilter(job, profile, policy);

    if (rejectionReason) {
      await prisma.jobAnalysis.create({
        data: {
          jobId: job.id,
          matchScore: 0,
          recommendation: 'REJECT',
          reasoning: `Deterministic Filter: ${rejectionReason}`,
        }
      });
      return; // Stop here, no LLM call
    }

    // Stage 2: AI Analysis
    try {
      const result = await this.aiProvider.analyzeJob(
        {
          skills: (profile.skills as string[]) || [],
          experience: profile.experience,
          education: profile.education,
          preferredRoles: profile.preferredRoles,
          preferredLocations: profile.preferredLocations,
        },
        {
          title: job.title,
          company: job.company?.name || 'Unknown',
          description: job.description,
          location: job.location,
          remoteType: job.remoteType,
          skills: job.skills,
        }
      );

      await prisma.jobAnalysis.create({
        data: {
          jobId: job.id,
          matchScore: result.matchScore,
          recommendation: result.recommendation,
          skillsMatched: result.skillsMatched,
          skillsMissing: result.skillsMissing,
          experienceMatch: result.experienceMatch,
          educationMatch: result.educationMatch,
          locationMatch: result.locationMatch,
          reasoning: result.reasoning,
        }
      });
    } catch (error) {
      await prisma.jobAnalysis.create({
        data: {
          jobId: job.id,
          matchScore: 0,
          recommendation: 'AI_ANALYSIS_FAILED',
          reasoning: error instanceof Error ? error.message : 'Unknown error during AI analysis',
        }
      });
    }
  }
}
