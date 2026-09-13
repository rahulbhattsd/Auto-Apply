import { ApplicationOutcome } from './ApplicationOutcome.js';

export interface SubmissionResult {
  confirmed: boolean;
  evidence?: {
    confirmationUrl?: string;
    confirmationText?: string;
    referenceId?: string;
  };
}

export interface ApplicationAdapter {
  canHandle(url: string): boolean;
  inspect(page: unknown, url: string): Promise<Record<string, unknown>>;
  fill(page: unknown, profile: unknown, resumePath: string): Promise<ApplicationOutcome>;
  submit(page: unknown, submitLocator?: string): Promise<SubmissionResult>;
}
