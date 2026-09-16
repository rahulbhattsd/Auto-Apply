import { JOBS, type MockJob } from './data/jobs.js';

export interface SubmittedApplication {
  id: string;
  jobId: string;
  ats: string;
  tenant: string;
  submittedAt: string;
  fields: Record<string, string>;
  resumeFilename?: string;
  coverLetter?: string;
  ip: string;
}

// ── In-memory state ──────────────────────────────────────────────────────────
const jobs: MockJob[] = [...JOBS];
const applications: SubmittedApplication[] = [];

/** Key: `${jobId}:${email}` */
const appliedSet = new Set<string>();

/** Rate limiting: key = IP, value = [timestamp, count] */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

// ── Job queries ───────────────────────────────────────────────────────────────
export function getAllJobs(): MockJob[] {
  return jobs;
}

export function getJobsByAts(ats: string, tenant?: string): MockJob[] {
  return jobs.filter(
    (j) => j.ats === ats && (tenant == null || j.tenant === tenant)
  );
}

export function getJobById(id: string): MockJob | undefined {
  return jobs.find((j) => j.id === id);
}

/** Admin: add a job at runtime */
export function addJob(job: MockJob): void {
  jobs.push(job);
}

// ── Application store ─────────────────────────────────────────────────────────
export function hasApplied(jobId: string, email: string): boolean {
  return appliedSet.has(`${jobId}:${email.toLowerCase()}`);
}

export function submitApplication(app: Omit<SubmittedApplication, 'id' | 'submittedAt'>): SubmittedApplication {
  const email = (app.fields['email'] ?? '').toLowerCase();
  const key = `${app.jobId}:${email}`;
  if (appliedSet.has(key)) {
    throw new DuplicateApplicationError(`Already applied to job ${app.jobId} with email ${email}`);
  }
  appliedSet.add(key);
  const record: SubmittedApplication = {
    ...app,
    id: `app-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    submittedAt: new Date().toISOString(),
  };
  applications.push(record);
  return record;
}

export function getApplications(): SubmittedApplication[] {
  return [...applications];
}

// ── Rate limiting ─────────────────────────────────────────────────────────────
const RATE_LIMIT = 40;        // requests per window
const RATE_WINDOW_MS = 60_000; // 1 minute

export function checkRateLimit(ip: string): { limited: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { limited: false, remaining: RATE_LIMIT - 1 };
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT) {
    return { limited: true, remaining: 0 };
  }
  return { limited: false, remaining: RATE_LIMIT - entry.count };
}

// ── CAPTCHA simulation ────────────────────────────────────────────────────────
/**
 * Returns true ~10% of the time — simulates bot-detection triggering a CAPTCHA.
 * Pass `jobId` to make it deterministic in tests (jobs ending with odd index → captcha).
 */
export function shouldShowCaptcha(jobId?: string): boolean {
  if (process.env.MOCK_ATS_CAPTCHA === 'always') return true;
  if (process.env.MOCK_ATS_CAPTCHA === 'never') return false;
  return Math.random() < 0.1;
}

// ── Errors ────────────────────────────────────────────────────────────────────
/** Test helper: clear all submitted applications and the applied set (called by admin panel) */
export function _clearApplications(): void {
  applications.length = 0;
  appliedSet.clear();
}

export class DuplicateApplicationError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'DuplicateApplicationError';
  }
}
