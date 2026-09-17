import type { BrowserContext } from 'playwright';

export type ProviderId = 'naukri' | 'glassdoor' | 'linkedin' | 'ats-generic';

export type ApplyType = 'INTERNAL' | 'EXTERNAL' | 'SKIPPED';

export interface Evidence {
  screenshotKey?: string | null | undefined;
  htmlSnapshotKey?: string | null | undefined;
  url: string;
  timestamp: string;
  [key: string]: unknown;
}

export type NeedsHumanReason =
  | 'CAPTCHA'
  | 'OTP_REQUIRED'
  | 'SESSION_EXPIRED'
  | 'UNANSWERABLE_QUESTION'
  | 'UNKNOWN_UI'
  | 'CONFIRMATION_NOT_FOUND';

export type ApplyOutcome =
  | { status: 'APPLIED'; evidence: Evidence }
  | { status: 'ALREADY_APPLIED' }
  | { status: 'HANDOFF_EXTERNAL'; url: string } // pass to ats-generic
  | { status: 'NEEDS_HUMAN'; reason: NeedsHumanReason; evidence: Evidence }
  | { status: 'FAILED'; reason: string; retryable: boolean };

export type VerifyOutcome =
  | { status: 'VERIFIED'; evidence?: Evidence | undefined }
  | { status: 'NOT_APPLIED' }
  | { status: 'NEEDS_HUMAN'; reason: NeedsHumanReason; evidence: Evidence }
  | { status: 'FAILED'; reason: string };

export interface Logger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  debug?(msg: string, ...args: unknown[]): void;
}

export interface RateBudget {
  userId: string;
  provider: string;
  windowDate: string; // YYYY-MM-DD, Asia/Kolkata
  appliesUsed: number;
  searchesUsed: number;
  maxAppliesPerDay?: number | undefined;
  maxSearchesPerHour?: number | undefined;
}

export interface ProviderCtx {
  userId: string;
  browser: BrowserContext; // already authenticated
  logger: Logger;
  budget: RateBudget;
  abortSignal: AbortSignal;
}

export interface SearchQuery {
  keywords?: string[] | undefined;
  query?: string | undefined;
  location?: string | undefined;
  experienceYears?: number | undefined;
  limit?: number | undefined;
  page?: number | undefined;
  filters?: Record<string, unknown> | undefined;
}

export interface RawJobRef {
  id: string;
  url: string;
  title?: string | undefined;
  company?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface CanonicalJob {
  providerJobId: string;
  provider: ProviderId;
  title: string;
  company: string;
  locations: string[];
  experienceMin?: number | null | undefined;
  experienceMax?: number | null | undefined;
  salaryText?: string | null | undefined;
  postedAt?: string | Date | null | undefined;
  jdText?: string | undefined;
  applyType: ApplyType;
  applyUrl: string;
  sourceUrl?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface ApplyProfile {
  name: string;
  email: string;
  phone?: string | null | undefined;
  linkedin?: string | null | undefined;
  resumePath?: string | null | undefined;
  answers?: Record<string, string> | undefined;
  customAnswers?: Record<string, string> | undefined;
  expectedCtc?: string | null | undefined;
  currentCtc?: string | null | undefined;
  noticePeriod?: string | null | undefined;
  totalExperienceYears?: number | string | null | undefined;
  [key: string]: unknown;
}

export interface ProviderCapabilities {
  search: boolean;
  recommendedFeed: boolean;
  internalApply: boolean; // apply without leaving the platform
  externalHandoff: boolean; // "Apply on company site"
  verifyApplied: boolean;
}

export interface JobProvider {
  id: ProviderId;
  capabilities: ProviderCapabilities;

  search(ctx: ProviderCtx, q: SearchQuery): Promise<RawJobRef[]>;
  fetchDetail(ctx: ProviderCtx, ref: RawJobRef): Promise<CanonicalJob>;
  apply(ctx: ProviderCtx, job: CanonicalJob, profile: ApplyProfile): Promise<ApplyOutcome>;
  verifyApplied(ctx: ProviderCtx, job: CanonicalJob): Promise<VerifyOutcome>;
}
