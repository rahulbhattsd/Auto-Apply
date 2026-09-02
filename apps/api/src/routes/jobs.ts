import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { verifyToken } from '../middleware/auth';
import { prisma } from '@autoapply/database';
import { Prisma } from '@prisma/client';
import { MockJobSource, NormalizationService } from '@autoapply/job-discovery';
import { GroqProvider, AnalysisPipeline } from '@autoapply/ai-analysis';

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

      // Initialize our mock source and services
      const source = new MockJobSource();
      const normalizationSvc = new NormalizationService();

      const groqProvider = new GroqProvider();
      const pipeline = new AnalysisPipeline(groqProvider);

      // 1. Fetch from source
      const rawJobs = await source.searchJobs({ limit: 10 });

      const processedIds = [];

      for (const rawJob of rawJobs) {
        // 2. Normalize & Deduplicate
        const normalizedJob = await normalizationSvc.normalizeAndPersist(rawJob, source);

        // 3. Analysis Pipeline (only run if not already analyzed)
        const existingAnalysis = await prisma.jobAnalysis.findUnique({
          where: { jobId: normalizedJob.id }
        });

        if (!existingAnalysis) {
          await pipeline.processJob(normalizedJob.id, profile.id);
        }

        processedIds.push(normalizedJob.id);
      }

      return reply.send({ success: true, processedJobIds: processedIds });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'ERROR', message: 'Internal server error during discovery' } });
    }
  });
}
