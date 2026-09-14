import { ApplicationExecutionCheckpoint } from '@autoapply/database';
import { ApplicationAdapter } from '@autoapply/shared';

export enum RecoveryAction {
  ALREADY_SUBMITTED = 'ALREADY_SUBMITTED',
  RESUME_FROM_CHECKPOINT = 'RESUME_FROM_CHECKPOINT',
  RESTART_FROM_SCRATCH = 'RESTART_FROM_SCRATCH',
  HUMAN_VERIFICATION = 'HUMAN_VERIFICATION',
  TERMINAL_FAILURE = 'TERMINAL_FAILURE'
}

export interface RecoveryDecision {
  action: RecoveryAction;
  reason: string;
}

export async function reconcileCheckpoint(
  page: import('playwright').Page,
  checkpoint: ApplicationExecutionCheckpoint,
  targetUrl: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _adapter?: ApplicationAdapter
): Promise<RecoveryDecision> {
  // First, explicitly check for already submitted states.
  const isAlreadyApplied = await checkIdempotency(page);
  if (isAlreadyApplied) {
    return { action: RecoveryAction.ALREADY_SUBMITTED, reason: 'Detected already applied state on page load' };
  }

  // If the checkpoint claims we've submitted, but we haven't detected it, we assume we need to restart/verify.
  // Wait, if checkpoint says submitted but we aren't submitted, maybe we shouldn't blindly trust it, but
  // actually in normal flow if checkpoint.hasSubmitted is true, we wouldn't even open the browser.

  const currentUrl = page.url();

  // If we are exactly where the checkpoint left us
  if (checkpoint.currentUrl && currentUrl === checkpoint.currentUrl) {
    return { action: RecoveryAction.RESUME_FROM_CHECKPOINT, reason: 'Page matches checkpoint URL' };
  }

  // If the checkpoint has a URL, but we are not there, and we are at the initial target URL
  if (checkpoint.currentUrl && currentUrl === targetUrl) {
     return { action: RecoveryAction.RESTART_FROM_SCRATCH, reason: 'Stale checkpoint, page reset to target URL' };
  }

  // If we are at an unsupported URL, restarting is safest
  return { action: RecoveryAction.RESTART_FROM_SCRATCH, reason: 'Unknown page state mismatching checkpoint' };
}

export async function checkIdempotency(page: import('playwright').Page): Promise<boolean> {
  const url = page.url().toLowerCase();
  if (url.includes('confirmation') || url.includes('success') || url.includes('submitted')) return true;
  return await page.evaluate(() => {
    const text = document.body.innerText.toLowerCase();
    return text.includes('you have already applied') ||
           text.includes('application has been submitted') ||
           text.includes('application successfully submitted') ||
           text.includes('thank you for applying');
  });
}
