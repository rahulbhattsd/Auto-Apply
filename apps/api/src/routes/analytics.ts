import { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '@autoapply/database';

const getUserId = (req: FastifyRequest) => {
  const headerId = req.headers['x-user-id'];
  return headerId ? parseInt(headerId as string, 10) : 1;
};

export default async function analyticsRoutes(fastify: FastifyInstance) {
  fastify.get('/api/analytics', async (request, reply) => {
    const userId = getUserId(request);

    const totalApps = await prisma.application.count({ where: { candidateId: userId } });
    const submittedApps = await prisma.application.count({ where: { candidateId: userId, status: { in: ['SUBMITTED', 'VERIFYING', 'VERIFIED'] } } });
    const failedApps = await prisma.application.count({ where: { candidateId: userId, status: 'FAILED' } });
    const humanApps = await prisma.application.count({ where: { candidateId: userId, status: 'NEEDS_HUMAN' } });

    const analysisAgg = await prisma.jobAnalysis.aggregate({
        _avg: { matchScore: true },
        where: { job: { applications: { some: { candidateId: userId } } } }
    });

    const sourcesRaw = await prisma.application.findMany({
        where: { candidateId: userId },
        include: { job: { include: { source: true } } }
    });

    const sourcesAgg: Record<string, number> = {};
    for (const app of sourcesRaw) {
        const sourceName = app.job.source?.name || 'Unknown';
        sourcesAgg[sourceName] = (sourcesAgg[sourceName] || 0) + 1;
    }
    const sources = Object.keys(sourcesAgg).map(name => ({ name, count: sourcesAgg[name] }));

    return reply.send({
        totalApplications: totalApps,
        successRate: totalApps > 0 ? Math.round((submittedApps / totalApps) * 100) : 0,
        failureRate: totalApps > 0 ? Math.round((failedApps / totalApps) * 100) : 0,
        humanInterventionRate: totalApps > 0 ? Math.round((humanApps / totalApps) * 100) : 0,
        averageMatchScore: Math.round(analysisAgg._avg.matchScore || 0),
        applicationsBySource: sources,
    });
  });
}
