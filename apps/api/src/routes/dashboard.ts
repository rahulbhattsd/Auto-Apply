import { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '@autoapply/database';

const getUserId = (req: FastifyRequest) => {
  const headerId = req.headers['x-user-id'];
  return headerId ? parseInt(headerId as string, 10) : 1;
};

export default async function dashboardRoutes(fastify: FastifyInstance) {
  fastify.get('/api/dashboard', async (request) => {
    const userId = getUserId(request);

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
          candidateId: userId,
          status: { in: ['MATCHED', 'QUEUED', 'RESUME_GENERATING', 'READY_TO_APPLY', 'APPLYING', 'SUBMITTED', 'VERIFYING', 'VERIFIED', 'FAILED', 'RETRYING', 'NEEDS_HUMAN', 'CANCELLED'] }
        }
      }),
      prisma.application.count({
        where: { candidateId: userId, status: { in: ['SUBMITTED', 'VERIFYING', 'VERIFIED'] } }
      }),
      prisma.application.count({
        where: { candidateId: userId, status: { in: ['QUEUED', 'RESUME_GENERATING', 'READY_TO_APPLY', 'APPLYING', 'RETRYING'] } }
      }),
      prisma.application.count({
        where: { candidateId: userId, status: 'NEEDS_HUMAN' }
      }),
      prisma.application.count({
        where: { candidateId: userId, status: 'FAILED' }
      }),
      prisma.application.count({
        where: { candidateId: userId }
      }),
      prisma.application.groupBy({
        by: ['status'],
        where: { candidateId: userId },
        _count: { status: true },
      })
    ]);

    const successRate = totalApplications > 0
        ? Math.round((applicationsSubmitted / totalApplications) * 100)
        : 0;

    const statusDistribution = statusDistributionRaw.map((item: any) => ({
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
