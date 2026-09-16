export enum ErrorCategory {
  TRANSIENT_BROWSER_ERROR = 'TRANSIENT_BROWSER_ERROR',
  TRANSIENT_NETWORK_ERROR = 'TRANSIENT_NETWORK_ERROR',
  NAVIGATION_FAILURE = 'NAVIGATION_FAILURE',
  PAGE_STATE_MISMATCH = 'PAGE_STATE_MISMATCH',
  ADAPTER_FAILURE = 'ADAPTER_FAILURE',
  INVALID_APPLICATION_STATE = 'INVALID_APPLICATION_STATE',
  HUMAN_VERIFICATION_REQUIRED = 'HUMAN_VERIFICATION_REQUIRED',
  SUBMISSION_FAILURE = 'SUBMISSION_FAILURE',
  UNKNOWN_FATAL_ERROR = 'UNKNOWN_FATAL_ERROR'
}

export interface ErrorClassification {
  category: ErrorCategory;
  retryable: boolean;
  resumable: boolean;
  needsHuman: boolean;
  terminal: boolean;
}

export class ApplicationExecutionError extends Error {
  public readonly category: ErrorCategory;
  public readonly retryable: boolean;
  public readonly resumable: boolean;
  public readonly needsHuman: boolean;
  public readonly terminal: boolean;
  public override readonly name = 'ApplicationExecutionError';
  public override readonly cause?: Error;
  public readonly metadata?: Record<string, unknown>;

  constructor(message: string, classification: ErrorClassification, options?: { cause?: Error, metadata?: Record<string, unknown> }) {
    super(message);
    this.category = classification.category;
    this.retryable = classification.retryable;
    this.resumable = classification.resumable;
    this.needsHuman = classification.needsHuman;
    this.terminal = classification.terminal;
    if (options?.cause) {
      this.cause = options.cause;
    }
    if (options?.metadata) {
      this.metadata = options.metadata;
    }
  }
}

export function classifyError(error: unknown): ErrorClassification {
  if (error instanceof ApplicationExecutionError) {
    return {
      category: error.category,
      retryable: error.retryable,
      resumable: error.resumable,
      needsHuman: error.needsHuman,
      terminal: error.terminal,
    };
  }

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (message.includes('captcha') || message.includes('cloudflare') || message.includes('mfa') || message.includes('human') || message.includes('otp') || message.includes('2fa')) {
    return { category: ErrorCategory.HUMAN_VERIFICATION_REQUIRED, retryable: false, resumable: true, needsHuman: true, terminal: false };
  }

  if (message.includes('timeout') || message.includes('net::err') || message.includes('disconnected')) {
    return { category: ErrorCategory.TRANSIENT_NETWORK_ERROR, retryable: true, resumable: true, needsHuman: false, terminal: false };
  }

  if (message.includes('target closed') || message.includes('browser') || message.includes('context')) {
    return { category: ErrorCategory.TRANSIENT_BROWSER_ERROR, retryable: true, resumable: true, needsHuman: false, terminal: false };
  }

  if (message.includes('not ready') || message.includes('missing_selector')) {
     return { category: ErrorCategory.PAGE_STATE_MISMATCH, retryable: true, resumable: true, needsHuman: false, terminal: false };
  }

  if (message.includes('unknown_required_field') || message.includes('missing_submit_locator')) {
      return { category: ErrorCategory.ADAPTER_FAILURE, retryable: false, resumable: false, needsHuman: false, terminal: true };
  }

  if (message.includes('submission_not_confirmed')) {
      return { category: ErrorCategory.SUBMISSION_FAILURE, retryable: true, resumable: true, needsHuman: false, terminal: false };
  }

  if (message.includes('invalid')) {
     return { category: ErrorCategory.INVALID_APPLICATION_STATE, retryable: false, resumable: false, needsHuman: false, terminal: true };
  }

  return { category: ErrorCategory.UNKNOWN_FATAL_ERROR, retryable: false, resumable: false, needsHuman: false, terminal: true };
}
