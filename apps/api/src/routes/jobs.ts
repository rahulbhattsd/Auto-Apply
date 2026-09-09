import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { verifyToken } from '../middleware/auth';
import { prisma } from '@autoapply/database';
import { Prisma } from '@prisma/client';
import { Queue, QUEUE_NAMES, connection, RETRY_POLICIES, DEFAULT_JOB_OPTIONS } from '@autoapply/queue';

const QuerySchema = z.object({
  score: z.string().optional(),
  company: z.string().optional(),
  location: z.string().optional(),
  source: z.string().optional(),
  status: z.string().optional(),
  date: z.string().optional(), // 'desc' | 'asc'
});

export async function jobRoutes(fastify: FastifyInstance) {
  // GET /api/jobs — list normalized jobs with filters
  fastify.get('/jobs', { preHandler: [verifyToken] }, async (request, reply) => {
    try {
      const query = QuerySchema.parse(request.query);


      // Construct where clause
      const where: Prisma.JobWhereInput = {};

      if (query.company) {
        where.company = { name: { contains: query.company, mode: 'insensitive' } };
      }
      if (query.location) {
        where.location = { contains: query.location, mode: 'insensitive' };
      }
      if (query.source) {
        where.source = { name: query.source };
      }

      if (query.status || query.score) {
         where.analysis = {};
         if (query.status) {
           where.analysis.recommendation = query.status;
         }
         if (query.score) {
           where.analysis.matchScore = { gte: parseInt(query.score, 10) };
         }
      }

      const orderBy: Prisma.JobOrderByWithRelationInput = {};
      if (query.date) {
        orderBy.postedAt = query.date === 'asc' ? 'asc' : 'desc';
      } else {
        orderBy.postedAt = 'desc';
      }

      const jobs = await prisma.job.findMany({
        where,
        orderBy,
        include: {
          company: true,
          source: true,
          analysis: true,
        },
        take: 50,
      });

      return reply.send({ jobs });
    } catch (error) {
      request.log.error(error);
      return reply.status(400).send({ success: false, error: { code: 'ERROR', message: 'Invalid query parameters' } });
    }
  });

  // GET /api/jobs/:id — job detail
  fastify.get('/jobs/:id', { preHandler: [verifyToken] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const job = await prisma.job.findUnique({
      where: { id: parseInt(id, 10) },
      include: {
        company: true,
        source: true,
        analysis: true,
      }
    });

    if (!job) {
      return reply.status(404).send({ success: false, error: { code: 'ERROR', message: 'Job not found' } });
    }

    return reply.send({ job });
  });

  // POST /api/jobs/discover — manually trigger discovery and analysis synchronously
  fastify.post('/jobs/discover', { preHandler: [verifyToken] }, async (request, reply) => {
    try {


      const profile = await prisma.candidateProfile.findUnique({
        where: { userId: request.user!.id }
      });

      if (!profile) {
        return reply.status(400).send({ success: false, error: { code: 'ERROR', message: 'Candidate profile required for job discovery' } });
      }

      const discoveryQueue = new Queue(QUEUE_NAMES.JOB_DISCOVERY, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
      await discoveryQueue.add('discover-jobs', { userId: request.user!.id }, {
        jobId: `manual-discovery-${request.user!.id}-${Date.now()}`,
        attempts: RETRY_POLICIES.NETWORK_ERROR.attempts,
        backoff: RETRY_POLICIES.NETWORK_ERROR.backoff,
      });

      return reply.send({ success: true, queued: true });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'ERROR', message: 'Internal server error during discovery' } });
    }
  });
}
