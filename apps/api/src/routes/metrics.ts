import { FastifyInstance } from 'fastify';
import { prisma } from '@autoapply/database';
export default async function metricsRoutes(fastify: FastifyInstance) {
  fastify.get('/api/metrics', async (_request, reply) => {
    try {
      const jobsDiscovered = await prisma.job.count();
      const jobsAnalyzed = await prisma.jobAnalysis.count();
      const applicationsCount = await prisma.application.count();
      const failedApplications = await prisma.application.count({ where: { status: 'FAILED' } });
      const queuedJobs = await prisma.workerJob.count({ where: { state: 'waiting' } });
      const activeJobs = await prisma.workerJob.count({ where: { state: 'active' } });
      return reply.send({ success: true, data: { jobsDiscovered, jobsAnalyzed, applicationsCount, failedApplications, queuedJobs, activeJobs } });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'ERROR', message: 'Failed to fetch metrics' } });
    }
  });
}
