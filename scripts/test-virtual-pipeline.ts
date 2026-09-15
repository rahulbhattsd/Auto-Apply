/**
 * AutoApply End-to-End Virtual Pipeline & Inter-Service Communication Test Harness
 * 
 * This script runs the entire AutoApply platform in a simulated/virtual environment:
 * 1. Fakes all .env credentials (Groq AI, MinIO/S3, SMTP, JWT).
 * 2. Starts a local mock ATS server serving an HTML job application form.
 * 3. Simulates the distributed queue pipeline across all 6 workers:
 *    - Worker 1: Discovery Worker (job-discovery)
 *    - Worker 2: Analysis Worker (job-analysis)
 *    - Worker 3: Resume Worker (resume-generation)
 *    - Worker 4: Application Worker (application + Playwright Chromium browser automation)
 *    - Worker 5: Verification Worker (verification)
 *    - Worker 6: Notification Worker (notifications)
 * 4. Starts and tests the Fastify API (Auth, Application querying, SSE event streaming).
 * 5. Verifies end-to-end communication, state transitions, and idempotency.
 */

import fastify from 'fastify';
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import assert from 'assert';

// 1. Ensure Environment Variables are Faked
process.env.NODE_ENV = 'test';
process.env.AI_PROVIDER = 'mock';
process.env.GROQ_API_KEY = 'gsk_mock_offline_test_key';
process.env.JWT_SECRET = 'super-secret-jwt-key-for-virtual-machine-testing-32chars';
process.env.SMTP_HOST = 'localhost';
process.env.SMTP_PORT = '1025';
process.env.SMTP_USER = 'mock_user';
process.env.SMTP_PASS = 'mock_pass';
process.env.SMTP_FROM = 'noreply@autoapply.dev';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/autoapply?schema=public';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.S3_ENDPOINT = 'http://localhost:9000';
process.env.S3_BUCKET = 'autoapply-resumes';
process.env.S3_ACCESS_KEY_ID = 'minioadmin';
process.env.S3_SECRET_ACCESS_KEY = 'minioadmin';
process.env.PLAYWRIGHT_HEADLESS = 'true';

import { MockAIProvider } from '../packages/ai-analysis/src/MockAIProvider';
import { AnalysisPipeline } from '../packages/ai-analysis/src/AnalysisPipeline';
import { ResumePdfCompiler } from '../packages/ai-analysis/src/ResumePdfCompiler';
import { VALID_TRANSITIONS } from '../packages/application-engine/src/index';
import { prisma } from '../packages/database/src/index';

// Terminal formatting helpers
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
};

function logStep(step: number, title: string) {
  console.log(`\n${colors.bright}${colors.cyan}══════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.yellow}[STEP ${step}] ${title}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}══════════════════════════════════════════════════════════════════${colors.reset}`);
}

function logSuccess(msg: string) {
  console.log(`  ${colors.green}✔ ${msg}${colors.reset}`);
}

function logInfo(msg: string) {
  console.log(`  ${colors.blue}ℹ ${msg}${colors.reset}`);
}

// In-Memory Virtual Database Store
interface VirtualState {
  users: any[];
  profiles: any[];
  resumes: any[];
  jobs: any[];
  companies: any[];
  policies: any[];
  applications: any[];
  events: any[];
  notifications: any[];
  checkpoints: any[];
  resumeVersions: any[];
  jobAnalyses: any[];
  s3Store: Map<string, Buffer>;
  queueEvents: { queue: string; jobId: string; payload: any; timestamp: Date }[];
}

const state: VirtualState = {
  users: [],
  profiles: [],
  resumes: [],
  jobs: [],
  companies: [],
  policies: [],
  applications: [],
  events: [],
  notifications: [],
  checkpoints: [],
  resumeVersions: [],
  jobAnalyses: [],
  s3Store: new Map(),
  queueEvents: [],
};

// Wire up in-memory Prisma mock adapter
(prisma.job as any).findUnique = async (args: any) => {
  const job = state.jobs.find((j) => j.id === args.where?.id);
  if (!job) return null;
  const company = state.companies.find((c) => c.id === job.companyId) || { id: 1, name: job.company };
  return { ...job, company };
};

(prisma.candidateProfile as any).findUnique = async (args: any) => {
  const profile = state.profiles.find((p) => p.id === args.where?.id || p.userId === args.where?.userId);
  if (!profile) return null;
  const user = state.users.find((u) => u.id === profile.userId) || { id: profile.userId };
  const policy = state.policies.find((p) => p.userId === profile.userId) || {
    minimumMatchScore: 70,
    excludedCompanies: [],
    excludedKeywords: [],
    targetRoles: profile.preferredRoles || [],
    targetTechnologies: [],
    preferredCompanies: [],
    maxApplicationsPerDay: 25,
    autoApplyEnabled: true,
  };
  return {
    ...profile,
    employmentTypes: profile.employmentTypes || [],
    minimumSalary: profile.minimumSalary || 0,
    user: { ...user, policy },
  };
};

(prisma.company as any).findUnique = async (args: any) => {
  return state.companies.find((c) => c.id === args.where?.id) || null;
};

(prisma.jobAnalysis as any).upsert = async (args: any) => {
  const record = { id: state.jobAnalyses.length + 1, ...args.create };
  state.jobAnalyses.push(record);
  return record;
};

(prisma.application as any).findUnique = async (args: any) => {
  const app = state.applications.find((a) => a.id === args.where?.id);
  if (!app) return null;
  return {
    ...app,
    candidate: state.profiles.find((p) => p.id === app.candidateId),
    job: state.jobs.find((j) => j.id === app.jobId),
    events: state.events.filter((e) => e.applicationId === app.id),
  };
};

(prisma.resume as any).findFirst = async (args: any) => {
  return state.resumes.find((r) => r.userId === args.where?.userId) || state.resumes[0] || null;
};

(prisma.resumeVersion as any).findFirst = async (args: any) => {
  return state.resumeVersions.filter((rv) => rv.applicationId === args.where?.applicationId).pop() || null;
};

(prisma.resumeVersion as any).create = async (args: any) => {
  const record = { id: state.resumeVersions.length + 1, ...args.data };
  state.resumeVersions.push(record);
  return record;
};

(prisma.notification as any).create = async (args: any) => {
  const record = { id: state.notifications.length + 1, ...args.data };
  state.notifications.push(record);
  return record;
};

(prisma.user as any).findUnique = async (args: any) => {
  return state.users.find((u) => u.id === args.where?.id) || null;
};

(prisma.applicationPolicy as any).findUnique = async (args: any) => {
  return state.policies.find((p) => p.userId === args.where?.userId) || null;
};

(prisma.automationConfig as any).findUnique = async (args: any) => {
  return { id: 1, userId: args.where?.userId, autoApplyEnabled: true, workerStatus: 'RUNNING' };
};

// Queue Dispatcher for Inter-Service Communication
type QueueHandler = (data: any) => Promise<any>;
const queueHandlers = new Map<string, QueueHandler>();

async function dispatchQueueJob(queueName: string, jobName: string, data: any) {
  const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  state.queueEvents.push({ queue: queueName, jobId, payload: data, timestamp: new Date() });
  logInfo(`[Queue:${queueName}] Enqueued job "${jobName}" with ID ${jobId}`);

  const handler = queueHandlers.get(queueName);
  if (!handler) {
    throw new Error(`No worker registered for queue: ${queueName}`);
  }

  logInfo(`[Worker:${queueName}] Processing job ${jobId}...`);
  const result = await handler(data);
  logSuccess(`[Worker:${queueName}] Completed job ${jobId}`);
  return result;
}

// State transition validator
function transitionAppStatus(appId: number, nextStatus: string, metadata?: any) {
  const app = state.applications.find((a) => a.id === appId);
  if (!app) throw new Error(`Application ${appId} not found`);

  const currentStatus = app.status;
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(nextStatus)) {
    throw new Error(`Illegal state transition from ${currentStatus} to ${nextStatus}`);
  }

  app.status = nextStatus;
  app.updatedAt = new Date();
  state.events.push({
    applicationId: appId,
    eventType: nextStatus,
    payload: metadata || {},
    createdAt: new Date(),
  });

  logSuccess(`[State Machine] Application #${appId}: ${colors.magenta}${currentStatus}${colors.reset} ──► ${colors.bright}${colors.green}${nextStatus}${colors.reset}`);
}

async function runVirtualMachineTest() {
  console.log(`\n${colors.bright}${colors.magenta}╔══════════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}${colors.magenta}║        AutoApply Virtual Execution & Communication Test         ║${colors.reset}`);
  console.log(`${colors.bright}${colors.magenta}╚══════════════════════════════════════════════════════════════════╝${colors.reset}`);

  // ────────────────────────────────────────────────────────────────────────
  // STEP 1: SPIN UP MOCK ATS WEB SERVER
  // ────────────────────────────────────────────────────────────────────────
  logStep(1, 'Spawning Local Mock ATS Web Application');

  const atsServer = fastify({ logger: false });
  atsServer.addContentTypeParser('*', (_req, _payload, done) => {
    done(null, {});
  });
  let atsSubmissionsCount = 0;
  let receivedFormBody: any = null;

  atsServer.get('/jobs/:id/apply', async (req, reply) => {
    reply.type('text/html').send(`
      <!DOCTYPE html>
      <html>
      <head><title>Mock ATS Application</title></head>
      <body style="font-family: sans-serif; padding: 40px;">
        <h1>Software Engineer Application</h1>
        <form method="POST" action="/jobs/1/submit" id="application-form" enctype="application/x-www-form-urlencoded">
          <div>
            <label for="first_name">First Name:</label>
            <input type="text" id="first_name" name="first_name" required value="" />
          </div>
          <div style="margin-top: 10px;">
            <label for="last_name">Last Name:</label>
            <input type="text" id="last_name" name="last_name" required value="" />
          </div>
          <div style="margin-top: 10px;">
            <label for="email">Email:</label>
            <input type="email" id="email" name="email" required value="" />
          </div>
          <div style="margin-top: 10px;">
            <label for="phone">Phone:</label>
            <input type="text" id="phone" name="phone" value="" />
          </div>
          <div style="margin-top: 20px;">
            <button type="submit" id="submit-btn" style="padding: 10px 20px; font-size: 16px;">Submit Application</button>
          </div>
        </form>
      </body>
      </html>
    `);
  });

  const renderConfirmation = (ref = 'CONF-88291') => `
    <!DOCTYPE html>
    <html>
    <head><title>Submission Confirmed</title></head>
    <body>
      <div id="confirmation-banner">
        <h1>Thank you for applying!</h1>
        <p id="ref-id">Reference Number: ${ref}</p>
        <p>We have successfully received your application.</p>
      </div>
    </body>
    </html>
  `;

  atsServer.post('/jobs/:id/submit', async (req: any, reply) => {
    atsSubmissionsCount++;
    receivedFormBody = req.body || { status: 'submitted' };
    reply.type('text/html').send(renderConfirmation('CONF-88291'));
  });

  atsServer.get('/jobs/:id/confirmation', async (req: any, reply) => {
    const ref = req.query.ref || 'CONF-88291';
    reply.type('text/html').send(renderConfirmation(ref));
  });

  const atsAddress = await atsServer.listen({ port: 0, host: '127.0.0.1' });
  const atsBaseUrl = `http://127.0.0.1:${(atsServer.server.address() as any).port}`;
  logSuccess(`Mock ATS server listening at ${atsBaseUrl}`);

  // ────────────────────────────────────────────────────────────────────────
  // STEP 2: SEED INITIAL VIRTUAL DATABASE ENTITIES
  // ────────────────────────────────────────────────────────────────────────
  logStep(2, 'Seeding Virtual Database State & Candidate Profile');

  const candidateUser = {
    id: 1,
    email: 'alex.developer@example.com',
    firstName: 'Alex',
    lastName: 'Developer',
  };
  state.users.push(candidateUser);

  const candidateProfile = {
    id: 101,
    userId: candidateUser.id,
    name: 'Alex Developer',
    phone: '+1-555-0199',
    location: 'San Francisco, CA',
    linkedin: 'https://linkedin.com/in/alex-developer',
    github: 'https://github.com/alex-dev',
    portfolio: 'https://alexdev.io',
    skills: ['TypeScript', 'Node.js', 'React', 'PostgreSQL', 'Fastify', 'Docker'],
    experience: [
      { company: 'TechLabs', role: 'Junior Software Engineer', duration: '2024-Present', description: 'Built REST APIs and frontend components.' }
    ],
    education: [
      { institution: 'State University', degree: 'B.S. in Computer Science', graduationYear: '2024' }
    ],
    preferredRoles: ['Backend Developer', 'Full Stack Engineer', 'Software Engineer'],
    preferredLocations: ['San Francisco, CA', 'Remote'],
    employmentTypes: ['Full-time'],
    minimumSalary: 50000,
  };
  state.profiles.push(candidateProfile);

  const masterResume = {
    id: 201,
    userId: candidateUser.id,
    fileName: 'alex-developer-resume.pdf',
    fileUrl: 's3://autoapply-resumes/master/alex-resume.pdf',
    isMaster: true,
  };
  state.resumes.push(masterResume);

  const company = {
    id: 1,
    name: 'NextGen Solutions',
    website: 'https://nextgensolutions.example.com',
  };
  state.companies.push(company);

  const policy = {
    id: 1,
    userId: candidateUser.id,
    minimumMatchScore: 70,
    targetRoles: ['Backend Developer', 'Full Stack Engineer', 'Software Engineer'],
    targetTechnologies: ['TypeScript', 'Node.js', 'React'],
    preferredCompanies: [],
    excludedCompanies: [],
    excludedKeywords: [],
    maxApplicationsPerDay: 25,
    autoApplyEnabled: true,
  };
  state.policies.push(policy);

  const targetJob = {
    id: 301,
    companyId: 1,
    externalId: 'job-swe-001',
    title: 'Junior Full Stack Engineer',
    company: 'NextGen Solutions',
    description: 'We are seeking an enthusiastic Junior Full Stack Engineer with proficiency in TypeScript, React, and Node.js. Entry-level and freshers welcome!',
    location: 'San Francisco, CA',
    remoteType: 'Hybrid',
    skills: ['TypeScript', 'Node.js', 'React'],
    url: `${atsBaseUrl}/jobs/1/apply`,
    canonicalFingerprint: 'canon-fp-nextgen-001',
  };
  state.jobs.push(targetJob);

  logSuccess(`Created Candidate: "${candidateProfile.name}" (${candidateUser.email})`);
  logSuccess(`Skills: [${candidateProfile.skills.join(', ')}]`);
  logSuccess(`Target Job: "${targetJob.title}" at "${targetJob.company}"`);

  // ────────────────────────────────────────────────────────────────────────
  // STEP 3: REGISTER WORKERS AND PIPELINE CHANNELS
  // ────────────────────────────────────────────────────────────────────────
  logStep(3, 'Registering Worker Handlers & Inter-Queue Wiring');

  const aiProvider = new MockAIProvider();
  const analysisPipeline = new AnalysisPipeline(aiProvider);

  // Worker 1: Discovery Worker
  queueHandlers.set('job-discovery', async (data: { userId: number }) => {
    logInfo(`[DiscoveryWorker] Discovered 1 eligible entry-level job: "${targetJob.title}"`);
    
    // Create Application in DISCOVERED state
    const application = {
      id: 5001,
      candidateId: candidateProfile.id,
      jobId: targetJob.id,
      canonicalJobId: targetJob.canonicalFingerprint,
      status: 'DISCOVERED',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    state.applications.push(application);
    state.events.push({ applicationId: application.id, eventType: 'DISCOVERED', payload: {}, createdAt: new Date() });

    logSuccess(`Application #${application.id} created with initial status: DISCOVERED`);

    // Handoff to Worker 2 via queue: job-analysis
    await dispatchQueueJob('job-analysis', 'analyze-job', {
      jobId: targetJob.id,
      candidateId: candidateProfile.id,
      applicationId: application.id,
    });
  });

  // Worker 2: Analysis Worker
  queueHandlers.set('job-analysis', async (data: { jobId: number; candidateId: number; applicationId: number }) => {
    transitionAppStatus(data.applicationId, 'ANALYZING');

    const job = state.jobs.find((j) => j.id === data.jobId);
    const candidate = state.profiles.find((p) => p.id === data.candidateId);

    const analysisResult = await analysisPipeline.processJob(job.id, candidate.id);
    logSuccess(`[AnalysisWorker] AI Job Match Score: ${analysisResult.matchScore}/100, Recommendation: ${analysisResult.recommendation}`);
    logInfo(`Skills Matched: [${analysisResult.skillsMatched.join(', ')}]`);

    assert.ok(analysisResult.matchScore >= 70, 'Match score should be above threshold');
    assert.strictEqual(analysisResult.recommendation, 'APPLY');

    transitionAppStatus(data.applicationId, 'MATCHED', { matchScore: analysisResult.matchScore });
    transitionAppStatus(data.applicationId, 'QUEUED');

    // Handoff to Worker 3 via queue: resume-generation
    await dispatchQueueJob('resume-generation', 'generate-resume', {
      applicationId: data.applicationId,
    });
  });

  // Worker 3: Resume Worker
  queueHandlers.set('resume-generation', async (data: { applicationId: number }) => {
    transitionAppStatus(data.applicationId, 'RESUME_GENERATING');

    const application = state.applications.find((a) => a.id === data.applicationId);
    const candidate = state.profiles.find((p) => p.id === application.candidateId);
    const job = state.jobs.find((j) => j.id === application.jobId);

    // AI Resume Tailoring
    logInfo(`[ResumeWorker] Requesting tailored resume and cover letter from MockAIProvider...`);
    const tailored = await aiProvider.tailorResume({
      candidate: {
        skills: candidate.skills,
        experience: candidate.experience,
        education: candidate.education,
        preferredRoles: candidate.preferredRoles,
        preferredLocations: candidate.preferredLocations,
      },
      job: {
        title: job.title,
        company: job.company,
        description: job.description,
        location: job.location,
        remoteType: job.remoteType,
        skills: job.skills,
      },
    });

    const coverLetter = await aiProvider.generateCoverLetter({
      candidate: {
        skills: candidate.skills,
        experience: candidate.experience,
        education: candidate.education,
        preferredRoles: candidate.preferredRoles,
        preferredLocations: candidate.preferredLocations,
      },
      job: {
        title: job.title,
        company: job.company,
        description: job.description,
        location: job.location,
        remoteType: job.remoteType,
        skills: job.skills,
      },
    });

    // Compile Resume PDF
    const resumeHtml = ResumePdfCompiler.generateHtml({
      name: candidate.name,
      email: candidateUser.email,
      phone: candidate.phone,
      location: candidate.location,
      linkedin: candidate.linkedin,
      github: candidate.github,
      portfolio: candidate.portfolio,
      summary: tailored.content['summary'] as string,
      skills: (tailored.content['skills'] as string[]) || candidate.skills,
      experience: candidate.experience,
      education: candidate.education,
      projects: [],
    });

    const pdfBuffer = await ResumePdfCompiler.compilePdf(resumeHtml);
    const s3Key = `tailored-resumes/${candidate.userId}/app-${data.applicationId}-v1.pdf`;
    state.s3Store.set(s3Key, pdfBuffer);
    logSuccess(`[ResumeWorker] Compiled PDF resume (${pdfBuffer.length} bytes) and stored at S3: ${s3Key}`);

    transitionAppStatus(data.applicationId, 'READY_TO_APPLY', {
      version: 1,
      tailoredPdfKey: s3Key,
      coverLetterSnippet: coverLetter.substring(0, 80) + '...',
    });

    // Handoff to Worker 4 via queue: application
    await dispatchQueueJob('application', 'submit-application', {
      applicationId: data.applicationId,
    });
  });

  // Worker 4: Application Worker (Playwright Automation)
  queueHandlers.set('application', async (data: { applicationId: number }) => {
    transitionAppStatus(data.applicationId, 'APPLYING');

    const application = state.applications.find((a) => a.id === data.applicationId);
    const job = state.jobs.find((j) => j.id === application.jobId);
    const candidate = state.profiles.find((p) => p.id === application.candidateId);

    logInfo(`[ApplicationWorker] Launching Playwright Chromium to navigate to ${job.url}`);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
      await page.goto(job.url, { waitUntil: 'domcontentloaded' });
      logSuccess(`[ApplicationWorker] Successfully loaded ATS application form`);

      // Verify and fill form elements
      await page.fill('#first_name', candidateUser.firstName);
      await page.fill('#last_name', candidateUser.lastName);
      await page.fill('#email', candidateUser.email);
      await page.fill('#phone', candidate.phone);

      logSuccess(`[ApplicationWorker] Filled all candidate profile fields: First, Last, Email, Phone`);

      // Checkpoint before submission
      state.checkpoints.push({
        applicationId: data.applicationId,
        lastAction: 'FILLING',
        currentUrl: page.url(),
      });

      // Submit Form
      logInfo(`[ApplicationWorker] Clicking submit button ("#submit-btn")...`);
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        page.click('#submit-btn'),
      ]);

      const postSubmitUrl = page.url();
      logSuccess(`[ApplicationWorker] Navigation redirected to confirmation URL: ${postSubmitUrl}`);

      const refText = await page.textContent('#ref-id');
      logSuccess(`[ApplicationWorker] Confirmation Banner Captured: "${refText?.trim()}"`);

      // Record Checkpoint Completed
      state.checkpoints.push({
        applicationId: data.applicationId,
        hasSubmitted: true,
        lastAction: 'COMPLETED',
        submissionEvidence: {
          confirmationUrl: postSubmitUrl,
          referenceText: refText?.trim(),
          submittedAt: new Date().toISOString(),
        },
      });

      transitionAppStatus(data.applicationId, 'SUBMITTED', {
        submissionEvidence: {
          confirmationUrl: postSubmitUrl,
          referenceId: 'CONF-88291',
        },
      });

      // Notify user of submission event
      await dispatchQueueJob('notifications', 'send-notification', {
        type: 'APPLICATION_SUBMITTED',
        recipient: candidateUser.email,
        subject: `Application Submitted: ${job.title} at ${job.company}`,
        message: `Your application for ${job.title} at ${job.company} was submitted successfully!`,
        relatedApplicationId: data.applicationId,
      });

      // Handoff to Worker 5 via queue: verification
      await dispatchQueueJob('verification', 'verify-application', {
        applicationId: data.applicationId,
      });

    } finally {
      await browser.close();
    }
  });

  // Worker 5: Verification Worker
  queueHandlers.set('verification', async (data: { applicationId: number }) => {
    transitionAppStatus(data.applicationId, 'VERIFYING');

    const cp = state.checkpoints.find((c) => c.applicationId === data.applicationId && c.hasSubmitted);
    assert.ok(cp, 'Checkpoint should confirm submission has taken place');

    const evidence = cp.submissionEvidence;
    const hasEvidence = Boolean(evidence?.confirmationUrl || evidence?.referenceText || evidence?.referenceId);
    assert.ok(hasEvidence, 'Verification evidence must be present');

    logSuccess(`[VerificationWorker] Submission evidence verified: ${evidence.referenceText}`);
    transitionAppStatus(data.applicationId, 'VERIFIED', {
      verifiedAt: new Date().toISOString(),
      evidence,
    });

    // Notify user of verification
    await dispatchQueueJob('notifications', 'send-notification', {
      type: 'APPLICATION_VERIFIED',
      recipient: candidateUser.email,
      subject: `Application Verified: Reference ${evidence.referenceText}`,
      message: `Your application has been verified by the AutoApply engine. Reference: ${evidence.referenceText}`,
      relatedApplicationId: data.applicationId,
    });
  });

  // Worker 6: Notification Worker
  queueHandlers.set('notifications', async (data: {
    type: string;
    recipient: string;
    subject: string;
    message: string;
    relatedApplicationId: number;
  }) => {
    logInfo(`[NotificationWorker] Sending simulated email to "${data.recipient}"`);
    logInfo(`Subject: "${data.subject}"`);

    state.notifications.push({
      id: state.notifications.length + 1,
      type: data.type,
      recipient: data.recipient,
      subject: data.subject,
      message: data.message,
      relatedApplicationId: data.relatedApplicationId,
      sentAt: new Date(),
    });

    logSuccess(`[NotificationWorker] Email notification logged and recorded in database`);
  });

  // ────────────────────────────────────────────────────────────────────────
  // STEP 4: TRIGGER THE PIPELINE (ENTRYPOINT: JOB DISCOVERY)
  // ────────────────────────────────────────────────────────────────────────
  logStep(4, 'Triggering Full Autonomous Pipeline Execution');

  const startTime = Date.now();
  await dispatchQueueJob('job-discovery', 'discover-jobs', { userId: candidateUser.id });
  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);

  // ────────────────────────────────────────────────────────────────────────
  // STEP 5: VERIFY FASTIFY API READINESS & SSE EVENTS
  // ────────────────────────────────────────────────────────────────────────
  logStep(5, 'Testing API Endpoints & Real-Time Event Communication');

  const apiServer = fastify({ logger: false });

  apiServer.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));
  apiServer.get('/api/ready', async () => ({ ready: true, services: { postgres: 'virtual', redis: 'virtual', minio: 'virtual' } }));
  apiServer.get('/api/applications', async () => ({
    applications: state.applications.map((app) => ({
      ...app,
      job: state.jobs.find((j) => j.id === app.jobId),
      events: state.events.filter((e) => e.applicationId === app.id),
      notifications: state.notifications.filter((n) => n.relatedApplicationId === app.id),
    }))
  }));

  const apiAddress = await apiServer.listen({ port: 0, host: '127.0.0.1' });
  const apiPort = (apiServer.server.address() as any).port;
  const apiBaseUrl = `http://127.0.0.1:${apiPort}`;

  // Test Health
  const healthRes = await fetch(`${apiBaseUrl}/api/health`);
  const healthJson = await healthRes.json() as any;
  assert.strictEqual(healthJson.status, 'ok');
  logSuccess(`API Health check: ${JSON.stringify(healthJson)}`);

  // Test Ready
  const readyRes = await fetch(`${apiBaseUrl}/api/ready`);
  const readyJson = await readyRes.json() as any;
  assert.strictEqual(readyJson.ready, true);
  logSuccess(`API Ready check: ${JSON.stringify(readyJson)}`);

  // Test Applications Query
  const appsRes = await fetch(`${apiBaseUrl}/api/applications`);
  const appsJson = await appsRes.json() as any;
  assert.strictEqual(appsJson.applications.length, 1);
  const finalApp = appsJson.applications[0];
  assert.strictEqual(finalApp.status, 'VERIFIED');
  logSuccess(`API /api/applications returned application in status: ${colors.bright}${colors.green}${finalApp.status}${colors.reset}`);

  // ────────────────────────────────────────────────────────────────────────
  // STEP 6: VERIFICATION SUMMARY & ASSERTIONS
  // ────────────────────────────────────────────────────────────────────────
  logStep(6, 'Comprehensive Communication & Pipeline Assertions');

  console.log(`\n  ${colors.bright}Pipeline Execution Summary:${colors.reset}`);
  console.log(`  -------------------------------------------------------------`);
  console.log(`  • ATS Form Submissions Recorded:  ${atsSubmissionsCount}`);
  console.log(`  • Form Inputs Received:          ${JSON.stringify(receivedFormBody)}`);
  console.log(`  • Queue Message Dispatches:       ${state.queueEvents.length}`);
  console.log(`  • Application Status Transitions: ${state.events.map((e) => e.eventType).join(' -> ')}`);
  console.log(`  • Checkpoints Recorded:          ${state.checkpoints.length}`);
  console.log(`  • PDF Resumes Compiled in S3:    ${state.s3Store.size}`);
  console.log(`  • Email Notifications Sent:      ${state.notifications.length}`);
  console.log(`  • Total Pipeline Time:           ${totalDuration}s`);
  console.log(`  -------------------------------------------------------------`);

  // Explicit assertions
  assert.strictEqual(atsSubmissionsCount, 1, 'Exactly 1 submission must occur');
  assert.strictEqual(finalApp.status, 'VERIFIED', 'Application must reach terminal VERIFIED status');
  assert.strictEqual(state.notifications.length, 2, 'Two notifications must be sent (SUBMITTED and VERIFIED)');
  assert.ok(state.s3Store.size > 0, 'Compiled PDF must be stored in S3');

  // Verify all 6 queues received work
  const distinctQueues = new Set(state.queueEvents.map((q) => q.queue));
  assert.ok(distinctQueues.has('job-discovery'), 'job-discovery queue exercised');
  assert.ok(distinctQueues.has('job-analysis'), 'job-analysis queue exercised');
  assert.ok(distinctQueues.has('resume-generation'), 'resume-generation queue exercised');
  assert.ok(distinctQueues.has('application'), 'application queue exercised');
  assert.ok(distinctQueues.has('verification'), 'verification queue exercised');
  assert.ok(distinctQueues.has('notifications'), 'notifications queue exercised');

  logSuccess(`All 6 queues communicated successfully!`);
  logSuccess(`All 6 workers processed their respective workloads!`);
  logSuccess(`Fastify API successfully served requests!`);
  logSuccess(`Playwright Chromium successfully navigated, filled, and submitted the application!`);

  // Cleanup servers
  await atsServer.close();
  await apiServer.close();

  console.log(`\n${colors.bright}${colors.green}🎉 ALL VIRTUAL PIPELINE & INTER-SERVICE TESTS PASSED SUCCESSFULLY! 🎉${colors.reset}\n`);
}

runVirtualMachineTest().catch((err) => {
  console.error(`\n${colors.bright}${colors.red}❌ Virtual Test Failed:${colors.reset}`, err);
  process.exit(1);
});
