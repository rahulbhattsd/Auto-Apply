import { FastifyInstance } from 'fastify';
import { prisma } from '@autoapply/database';
import { verifyToken } from '../middleware/auth';

export default async function dashboardRoutes(fastify: FastifyInstance) {
  fastify.addHook('preValidation', verifyToken);

  fastify.get('/api/dashboard', async (request) => {
    const userId = request.user!.id;
    const profile = await prisma.candidateProfile.findUnique({ where: { userId } });
    const candidateId = profile?.id ?? -1;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      jobsDiscoveredToday,
      jobsAnalyzed,
      jobsMatched,
      applicationsSubmitted,
      applicationsPending,
      humanActionsRequired,
      failedApplications,
      totalApplications,
      statusDistributionRaw,
    ] = await Promise.all([
      prisma.job.count({ where: { createdAt: { gte: today } } }),
      prisma.jobAnalysis.count(),
      prisma.application.count({
        where: {
          candidateId,
          status: { in: ['MATCHED', 'QUEUED', 'RESUME_GENERATING', 'READY_TO_APPLY', 'APPLYING', 'SUBMITTED', 'VERIFYING', 'VERIFIED', 'FAILED', 'RETRYING', 'NEEDS_HUMAN', 'CANCELLED'] }
        }
      }),
      prisma.application.count({
        where: { candidateId, status: { in: ['SUBMITTED', 'VERIFYING', 'VERIFIED'] } }
      }),
      prisma.application.count({
        where: { candidateId, status: { in: ['QUEUED', 'RESUME_GENERATING', 'READY_TO_APPLY', 'APPLYING', 'RETRYING'] } }
      }),
      prisma.application.count({
        where: { candidateId, status: 'NEEDS_HUMAN' }
      }),
      prisma.application.count({
        where: { candidateId, status: 'FAILED' }
      }),
      prisma.application.count({
        where: { candidateId }
      }),
      prisma.application.groupBy({
        by: ['status'],
        where: { candidateId },
        _count: { status: true },
      })
    ]);

    const successRate = totalApplications > 0
        ? Math.round((applicationsSubmitted / totalApplications) * 100)
        : 0;

    const statusDistribution = statusDistributionRaw.map((item: (typeof statusDistributionRaw)[number]) => ({
      name: item.status,
      value: item._count.status
    }));

    return {
      metrics: {
        jobsDiscoveredToday,
        jobsAnalyzed,
        jobsMatched,
        applicationsSubmitted,
        applicationsPending,
        humanActionsRequired,
        failedApplications,
        successRate,
      },
      charts: { statusDistribution }
    };
  });
}
