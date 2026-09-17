import { connection } from './index.js';

export interface WorkerHeartbeatData {
  workerName: string;
  workerId: string;
  status: 'HEALTHY' | 'UNHEALTHY' | 'BUSY' | 'IDLE';
  lastHeartbeat: string;
  currentJob?: string | null;
  uptime: number;
  version: string;
  pid: number;
  memoryUsageMb?: number;
}

const HEARTBEAT_KEY_PREFIX = 'worker:heartbeat:';
const HEARTBEAT_TTL_SECONDS = 60;

export async function reportWorkerHeartbeat(data: WorkerHeartbeatData): Promise<void> {
  const key = `${HEARTBEAT_KEY_PREFIX}${data.workerName}:${data.workerId}`;
  const payload = JSON.stringify(data);
  await connection.set(key, payload, 'EX', HEARTBEAT_TTL_SECONDS);
}

export async function getWorkerHeartbeats(staleThresholdMs = 45000): Promise<WorkerHeartbeatData[]> {
  const keys = await connection.keys(`${HEARTBEAT_KEY_PREFIX}*`);
  if (!keys || keys.length === 0) return [];

  const results: WorkerHeartbeatData[] = [];
  const now = Date.now();

  for (const key of keys) {
    const raw = await connection.get(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as WorkerHeartbeatData;
      const heartbeatTime = new Date(parsed.lastHeartbeat).getTime();
      const ageMs = now - heartbeatTime;
      if (ageMs > staleThresholdMs) {
        parsed.status = 'UNHEALTHY';
      }
      results.push(parsed);
    } catch {
      // Ignore corrupt heartbeat JSON
    }
  }

  return results;
}
