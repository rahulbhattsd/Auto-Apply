import { FastifyInstance } from 'fastify';
import { prisma } from '@autoapply/database';
import { verifyToken } from '../middleware/auth';

export default async function analyticsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preValidation', verifyToken);

  fastify.get('/api/analytics', async (request, reply) => {
    const userId = request.user!.id;
    const profile = await prisma.candidateProfile.findUnique({ where: { userId } });
    const candidateId = profile?.id ?? -1;

    const totalApps = await prisma.application.count({ where: { candidateId } });
    const submittedApps = await prisma.application.count({ where: { candidateId, status: { in: ['SUBMITTED', 'VERIFYING', 'VERIFIED'] } } });
    const failedApps = await prisma.application.count({ where: { candidateId, status: 'FAILED' } });
    const humanApps = await prisma.application.count({ where: { candidateId, status: 'NEEDS_HUMAN' } });

    const analysisAgg = await prisma.jobAnalysis.aggregate({
        _avg: { matchScore: true },
        where: { job: { applications: { some: { candidateId } } } }
    });

    const sourcesRaw = await prisma.application.findMany({
        where: { candidateId },
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
