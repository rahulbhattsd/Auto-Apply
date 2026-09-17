import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '@autoapply/database';
import { verifyToken } from '../middleware/auth.js';
import { TaskService } from '../services/task.js';

const QuerySchema = z.object({
  score: z.string().optional(),
  company: z.string().optional(),
  location: z.string().optional(),
  source: z.string().optional(),
  status: z.string().optional(),
  provider: z.string().optional(),
  q: z.string().optional(),
  date: z.enum(['desc', 'asc']).optional().default('desc'),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
});

const CreateJobSchema = z.object({
  title: z.string().min(1),
  company: z.string().optional(),
  url: z.string().url(),
  location: z.string().optional(),
  description: z.string().optional().default(''),
  provider: z.string().optional().default('ats-generic'),
  providerJobId: z.string().optional(),
  skills: z.array(z.string()).optional().default([]),
});

const taskService = new TaskService();

export default async function jobRoutes(fastify: FastifyInstance) {
  fastify.addHook('preValidation', verifyToken);

  // GET /api/jobs — list normalized jobs with filters
  fastify.get('/', async (request, reply) => {
    try {
      const query = QuerySchema.parse(request.query);

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
      if (query.provider) {
        where.provider = query.provider;
      }
      if (query.q) {
        where.OR = [
          { title: { contains: query.q, mode: 'insensitive' } },
          { description: { contains: query.q, mode: 'insensitive' } },
        ];
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

      const [jobs, total] = await Promise.all([
        prisma.job.findMany({
          where,
          orderBy: { postedAt: query.date },
          include: {
            company: true,
            source: true,
            analysis: true,
          },
          take: query.limit,
          skip: query.offset,
        }),
        prisma.job.count({ where }),
      ]);

      return reply.send({ success: true, jobs, total, limit: query.limit, offset: query.offset });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters', details: error.errors } });
      }
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch jobs' } });
    }
  });

  // GET /api/jobs/:id — job detail
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const numericId = parseInt(id, 10);

    if (isNaN(numericId)) {
      return reply.status(400).send({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid job ID' } });
    }

    try {
      const job = await prisma.job.findUnique({
        where: { id: numericId },
        include: {
          company: true,
          source: true,
          analysis: true,
        },
      });

      if (!job) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Job not found' } });
      }

      return reply.send({ success: true, job });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch job' } });
    }
  });

  // POST /api/jobs — manual job registration or import
  fastify.post('/', async (request, reply) => {
    try {
      const data = CreateJobSchema.parse(request.body);
      const canonicalFingerprint = `job-${data.provider}-${data.providerJobId || Buffer.from(data.url).toString('base64url').substring(0, 32)}`;

      let companyId: number | undefined = undefined;
      if (data.company) {
        const company = await prisma.company.upsert({
          where: { name: data.company },
          update: {},
          create: { name: data.company },
        });
        companyId = company.id;
      }

      const job = await prisma.job.upsert({
        where: { canonicalFingerprint },
        update: {
          title: data.title,
          url: data.url,
          location: data.location || null,
          description: data.description,
          skills: data.skills,
          ...(companyId ? { companyId } : {}),
        },
        create: {
          canonicalFingerprint,
          title: data.title,
          url: data.url,
          location: data.location || null,
          description: data.description,
          provider: data.provider,
          providerJobId: data.providerJobId || canonicalFingerprint,
          skills: data.skills,
          ...(companyId ? { companyId } : {}),
        },
        include: {
          company: true,
          source: true,
        },
      });

      return reply.status(201).send({ success: true, job });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: error.errors } });
      }
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create job' } });
    }
  });

  // POST /api/jobs/discover — trigger background discovery
  fastify.post('/discover', async (request, reply) => {
    const userId = request.user!.id;
    const body = (request.body as Record<string, unknown>) || {};
    const providerId = (body['providerId'] as string) || 'ats-generic';

    try {
      const task = await taskService.createTask(userId, {
        type: 'DISCOVERY_TASK',
        payload: {
          providerId,
          query: body['query'] || {},
          timestamp: new Date().toISOString(),
        },
      });

      return reply.status(202).send({ success: true, queued: true, taskId: task.id });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to queue job discovery' } });
    }
  });
}
