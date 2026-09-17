import { env } from '@autoapply/config';

export interface AlertPayload {
  level: 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';
  service: string;
  event: string;
  message: string;
  details?: Record<string, unknown>;
}

export class AlertService {
  private lastAlertTimestamps = new Map<string, number>();
  private readonly defaultCooldownMs = 60000; // 1-minute debounce per alert key

  async sendAlert(payload: AlertPayload, cooldownMs?: number): Promise<boolean> {
    const key = `${payload.service}:${payload.event}`;
    const now = Date.now();
    const lastTime = this.lastAlertTimestamps.get(key) || 0;
    const cooldown = cooldownMs ?? this.defaultCooldownMs;

    if (now - lastTime < cooldown) {
      // Suppress alert within debounce cooldown window
      return false;
    }

    this.lastAlertTimestamps.set(key, now);

    // Structured log alert
    console.error(
      `[ALERT][${payload.level}] [${payload.service}] ${payload.event}: ${payload.message}`,
      payload.details ? JSON.stringify(payload.details) : ''
    );

    // If webhook configured, dispatch HTTP POST
    if (env.ALERT_WEBHOOK_URL) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        await fetch(env.ALERT_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            timestamp: new Date().toISOString(),
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
      } catch (err) {
        console.warn(`[AlertService] Failed to dispatch webhook alert:`, err);
      }
    }

    return true;
  }
}

export const alertService = new AlertService();
