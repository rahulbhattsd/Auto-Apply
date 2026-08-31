import { FastifyInstance } from 'fastify';
import { prisma } from '@autoapply/database';
import { verifyToken } from '../middleware/auth';
import { LocalStorageProvider } from '../services/storage';

const storageProvider = new LocalStorageProvider();

export default async function resumesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preValidation', verifyToken);

  fastify.post('/', async (request, reply) => {
    const userId = request.user!.id;
    try {
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }

      const { url, fileName } = await storageProvider.uploadFile(data, userId);

      const resume = await prisma.resume.create({
        data: {
          userId,
          fileName,
          fileUrl: url,
          isMaster: true,
        },
      });

      return reply.status(201).send(resume);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  fastify.get('/', async (request, reply) => {
    const userId = request.user!.id;
    try {
      const resumes = await prisma.resume.findMany({ where: { userId } });
      return reply.send(resumes);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  fastify.get('/:id', async (request, reply) => {
    const userId = request.user!.id;
    const { id } = request.params as { id: string };

    try {
      const resume = await prisma.resume.findFirst({
        where: { id: parseInt(id, 10), userId },
        include: {
            derivedVersions: {
                include: {
                    job: true,
                    application: true,
                }
            }
        }
      });

      if (!resume) {
        return reply.status(404).send({ error: 'Resume not found' });
      }

      return reply.send(resume);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  fastify.get('/application/:applicationId/versions', async (request, reply) => {
    const userId = request.user!.id;
    const { applicationId } = request.params as { applicationId: string };

    try {
      const app = await prisma.application.findFirst({
        where: { id: parseInt(applicationId, 10), candidate: { userId } }
      });

      if (!app) {
         return reply.status(404).send({ error: 'Application not found' });
      }

      const versions = await prisma.resumeVersion.findMany({
        where: { applicationId: parseInt(applicationId, 10) },
        orderBy: { version: 'desc' }
      });

      return reply.send({ versions });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  fastify.get('/diff/:versionId', async (request, reply) => {
    const userId = request.user!.id;
    const { versionId } = request.params as { versionId: string };

    try {
       const tailoredResume = await prisma.resumeVersion.findFirst({
           where: { id: parseInt(versionId, 10), candidate: { userId } },
           include: { basedOnMasterResume: true }
       });

       if (!tailoredResume) {
           return reply.status(404).send({ error: 'Tailored resume version not found' });
       }

       return reply.send({
           tailored: tailoredResume,
           master: tailoredResume.basedOnMasterResume
       });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
}
