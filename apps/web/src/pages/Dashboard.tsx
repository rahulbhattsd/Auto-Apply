import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { fetchApi } from '../lib/api';

interface DashboardResponse {
  success: boolean;
  user: {
    name: string;
    email: string;
    timezone: string;
  };
  stats: {
    totalConversations: number;
    totalMemories: number;
    tasks: {
      QUEUED: number;
      RUNNING: number;
      COMPLETED: number;
      FAILED: number;
      CANCELLED: number;
    };
    activeWorkers: number;
  };
  recentConversations: Array<{
    id: number;
    title: string;
    updatedAt: string;
    _count: { messages: number };
  }>;
  recentTasks: Array<{
    id: number;
    type: string;
    status: string;
    createdAt: string;
  }>;
  workers: Array<{
    workerId: string;
    workerType: string;
    status: string;
    timestamp: number;
  }>;
  systemHealth: {
    status: string;
    database: string;
    workersHealthy: boolean;
  };
}

export default function Dashboard() {
  const { data, isLoading, error } = useQuery<DashboardResponse>({
    queryKey: ['dashboard'],
    queryFn: () => fetchApi('/dashboard'),
    refetchInterval: 15000,
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="flex h-64 items-center justify-center">
          <div className="flex items-center gap-3 text-gray-400">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent"></div>
            <span>Loading dashboard overview...</span>
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !data) {
    return (
      <Layout>
        <div className="rounded-xl border border-red-800/50 bg-red-950/40 p-6 text-center text-red-200">
          <p className="text-base font-semibold">Unable to load dashboard</p>
          <p className="mt-1 text-sm text-red-300">
            {error instanceof Error ? error.message : 'Please ensure the API service is online.'}
          </p>
        </div>
      </Layout>
    );
  }

  const { user, stats, recentConversations, recentTasks, workers, systemHealth } = data;

  const totalTasks =
    (stats?.tasks?.QUEUED || 0) +
    (stats?.tasks?.RUNNING || 0) +
    (stats?.tasks?.COMPLETED || 0) +
    (stats?.tasks?.FAILED || 0) +
    (stats?.tasks?.CANCELLED || 0);

  return (
    <Layout>
      <div className="space-y-6">
        {/* Welcome Header */}
        <div className="flex flex-col justify-between gap-4 rounded-2xl border border-gray-800 bg-gradient-to-r from-gray-900 via-indigo-950/40 to-gray-900 p-6 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Autonomous Assistant Ready</span>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Welcome back, {user?.name || 'Agent User'}
            </h1>
            <p className="mt-1 text-sm text-gray-400">
              Personal AI assistant is active, persistent memory synced, background workers operational.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/chat"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 transition-colors"
            >
              <span>💬</span> New Chat
            </Link>
            <Link
              to="/tasks"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-medium text-gray-200 hover:bg-gray-700 transition-colors"
            >
              <span>⚡</span> Run Task
            </Link>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Conversations */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-gray-400">Conversations</span>
              <span className="rounded-md bg-indigo-900/50 p-2 text-indigo-300">💬</span>
            </div>
            <div className="mt-4 flex items-baseline justify-between">
              <p className="text-3xl font-bold text-white">{stats?.totalConversations || 0}</p>
              <Link to="/chat" className="text-xs font-medium text-indigo-400 hover:text-indigo-300">
                View chats &rarr;
              </Link>
            </div>
            <p className="mt-2 text-xs text-gray-400">Persistent multi-turn interactions</p>
          </div>

          {/* Card 2: Memories */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-gray-400">Memory Vault</span>
              <span className="rounded-md bg-purple-900/50 p-2 text-purple-300">🧠</span>
            </div>
            <div className="mt-4 flex items-baseline justify-between">
              <p className="text-3xl font-bold text-white">{stats?.totalMemories || 0}</p>
              <Link to="/memory" className="text-xs font-medium text-purple-400 hover:text-purple-300">
                Manage memory &rarr;
              </Link>
            </div>
            <p className="mt-2 text-xs text-gray-400">Facts, preferences & project notes</p>
          </div>

          {/* Card 3: Background Tasks */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-gray-400">Tasks Processed</span>
              <span className="rounded-md bg-amber-900/50 p-2 text-amber-300">⚡</span>
            </div>
            <div className="mt-4 flex items-baseline justify-between">
              <p className="text-3xl font-bold text-white">{totalTasks}</p>
              <Link to="/tasks" className="text-xs font-medium text-amber-400 hover:text-amber-300">
                Inspect queue &rarr;
              </Link>
            </div>
            <div className="mt-2 flex gap-2 text-xs">
              <span className="text-emerald-400">{stats?.tasks?.COMPLETED || 0} done</span>
              <span className="text-gray-500">•</span>
              <span className="text-blue-400">{stats?.tasks?.RUNNING || 0} running</span>
              <span className="text-gray-500">•</span>
              <span className="text-red-400">{stats?.tasks?.FAILED || 0} failed</span>
            </div>
          </div>

          {/* Card 4: Worker Engine */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-gray-400">Active Workers</span>
              <span className="rounded-md bg-emerald-900/50 p-2 text-emerald-300">🤖</span>
            </div>
            <div className="mt-4 flex items-baseline justify-between">
              <p className="text-3xl font-bold text-white">{stats?.activeWorkers || 0}</p>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  systemHealth?.workersHealthy
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    : 'bg-yellow-950 text-yellow-400 border border-yellow-800'
                }`}
              >
                {systemHealth?.workersHealthy ? 'ONLINE' : 'STANDBY'}
              </span>
            </div>
            <p className="mt-2 text-xs text-gray-400">Redis heartbeat monitored</p>
          </div>
        </div>

        {/* Two-column Recent Activity */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Recent Conversations */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-200 flex items-center gap-2">
                <span>💬</span> Recent Conversations
              </h2>
              <Link to="/chat" className="text-xs text-indigo-400 hover:text-indigo-300">
                View All
              </Link>
            </div>

            <div className="mt-4 divide-y divide-gray-800">
              {recentConversations && recentConversations.length > 0 ? (
                recentConversations.map((conv) => (
                  <Link
                    key={conv.id}
                    to={`/chat/${conv.id}`}
                    className="flex items-center justify-between py-3 hover:bg-gray-800/50 px-2 rounded-lg transition-colors"
                  >
                    <div className="min-w-0 flex-1 pr-4">
                      <p className="truncate text-sm font-medium text-white">{conv.title}</p>
                      <p className="text-xs text-gray-400">
                        {conv._count.messages} messages • {new Date(conv.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="text-gray-500 text-sm">&rarr;</span>
                  </Link>
                ))
              ) : (
                <div className="py-8 text-center text-sm text-gray-500">
                  No conversations yet. Click "New Chat" to begin.
                </div>
              )}
            </div>
          </div>

          {/* Recent Background Tasks */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-200 flex items-center gap-2">
                <span>⚡</span> Background Tasks
              </h2>
              <Link to="/tasks" className="text-xs text-amber-400 hover:text-amber-300">
                Manage Queue
              </Link>
            </div>

            <div className="mt-4 divide-y divide-gray-800">
              {recentTasks && recentTasks.length > 0 ? (
                recentTasks.map((t) => {
                  const statusColors: Record<string, string> = {
                    COMPLETED: 'bg-emerald-950 text-emerald-400 border-emerald-800',
                    RUNNING: 'bg-blue-950 text-blue-400 border-blue-800',
                    QUEUED: 'bg-amber-950 text-amber-400 border-amber-800',
                    FAILED: 'bg-red-950 text-red-400 border-red-800',
                    CANCELLED: 'bg-gray-800 text-gray-400 border-gray-700',
                  };
                  return (
                    <div key={t.id} className="flex items-center justify-between py-3 px-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-gray-300">Task #{t.id}</span>
                          <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-300 font-medium">
                            {t.type}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-gray-400">{new Date(t.createdAt).toLocaleTimeString()}</p>
                      </div>
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                          statusColors[t.status] || 'bg-gray-800 text-gray-300'
                        }`}
                      >
                        {t.status}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="py-8 text-center text-sm text-gray-500">
                  No background tasks recorded yet.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Worker Telemetry Card */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <div className="flex items-center justify-between border-b border-gray-800 pb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-200 flex items-center gap-2">
              <span>🤖</span> Worker Heartbeats & Health
            </h2>
            <span className="text-xs text-gray-400">Auto-refreshed via Redis</span>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-300">
              <thead className="bg-gray-950/60 uppercase text-gray-400 border-b border-gray-800">
                <tr>
                  <th className="px-4 py-2">Worker ID</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Heartbeat Status</th>
                  <th className="px-4 py-2">Last Seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {workers && workers.length > 0 ? (
                  workers.map((w) => (
                    <tr key={w.workerId} className="hover:bg-gray-800/40">
                      <td className="px-4 py-2.5 font-mono text-gray-200">{w.workerId}</td>
                      <td className="px-4 py-2.5">{w.workerType}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                            w.status === 'HEALTHY'
                              ? 'bg-emerald-950 text-emerald-400'
                              : w.status === 'BUSY'
                              ? 'bg-blue-950 text-blue-400'
                              : 'bg-yellow-950 text-yellow-400'
                          }`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current"></span>
                          {w.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-400">
                        {new Date(w.timestamp).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                      No worker heartbeats registered in Redis currently. Run <code className="text-indigo-400">pnpm worker:all</code> to launch workers.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}
