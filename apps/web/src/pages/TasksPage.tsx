import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/Layout';
import { fetchApi } from '../lib/api';

type TaskType = 'AI_TASK' | 'RESEARCH_TASK' | 'MEMORY_TASK' | 'NOTIFICATION_TASK' | 'MAINTENANCE_TASK';
type TaskStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

interface TaskItem {
  id: number;
  type: TaskType;
  status: TaskStatus;
  payload: Record<string, unknown>;
  result?: Record<string, unknown> | null;
  error?: string | null;
  attempts: number;
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
}

interface TasksResponse {
  tasks: TaskItem[];
  total: number;
  limit: number;
  offset: number;
}

export default function TasksPage() {
  const queryClient = useQueryClient();
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [inspectingTask, setInspectingTask] = useState<TaskItem | null>(null);

  // Form states
  const [taskType, setTaskType] = useState<TaskType>('AI_TASK');
  const [taskPayloadJson, setTaskPayloadJson] = useState('{\n  "prompt": "Analyze repository architecture and suggest improvements",\n  "format": "markdown"\n}');
  const [payloadError, setPayloadError] = useState<string | null>(null);

  const queryParams = new URLSearchParams();
  if (selectedStatus !== 'ALL') queryParams.set('status', selectedStatus);

  const { data, isLoading, error, refetch } = useQuery<TasksResponse>({
    queryKey: ['tasks', selectedStatus],
    queryFn: () => fetchApi(`/tasks?${queryParams.toString()}`),
    refetchInterval: 10000,
  });

  // Submit task mutation
  const submitTaskMutation = useMutation({
    mutationFn: (body: { type: TaskType; payload: Record<string, unknown> }) =>
      fetchApi('/tasks', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setIsSubmitModalOpen(false);
      setPayloadError(null);
    },
    onError: (err: Error) => {
      setPayloadError(err.message);
    },
  });

  // Cancel task mutation
  const cancelTaskMutation = useMutation({
    mutationFn: (taskId: number) => fetchApi(`/tasks/${taskId}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  // Retry task mutation
  const retryTaskMutation = useMutation({
    mutationFn: (taskId: number) => fetchApi(`/tasks/${taskId}/retry`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const handleSubmitTask = (e: React.FormEvent) => {
    e.preventDefault();
    setPayloadError(null);

    let parsedPayload: Record<string, unknown> = {};
    if (taskPayloadJson.trim()) {
      try {
        parsedPayload = JSON.parse(taskPayloadJson);
      } catch {
        setPayloadError('Invalid JSON format in task payload');
        return;
      }
    }

    submitTaskMutation.mutate({ type: taskType, payload: parsedPayload });
  };

  const getStatusBadge = (status: TaskStatus) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-emerald-950/80 text-emerald-400 border-emerald-800';
      case 'RUNNING':
        return 'bg-blue-950/80 text-blue-400 border-blue-800';
      case 'QUEUED':
        return 'bg-amber-950/80 text-amber-400 border-amber-800';
      case 'FAILED':
        return 'bg-red-950/80 text-red-400 border-red-800';
      case 'CANCELLED':
        return 'bg-gray-800 text-gray-400 border-gray-700';
      default:
        return 'bg-gray-800 text-gray-300 border-gray-700';
    }
  };

  const statuses = ['ALL', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'];

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl flex items-center gap-2">
              <span>⚡</span> Background Tasks
            </h1>
            <p className="mt-1 text-sm text-gray-400">
              Asynchronous agent tasks, background research, maintenance routines, and queue telemetry.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm font-medium text-gray-200 hover:bg-gray-700 transition-colors"
              title="Refresh tasks"
            >
              🔄 Refresh
            </button>
            <button
              onClick={() => setIsSubmitModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors"
            >
              <span>+</span> Submit Task
            </button>
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-gray-800 pb-3">
          {statuses.map((st) => (
            <button
              key={st}
              onClick={() => setSelectedStatus(st)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                selectedStatus === st
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        {/* Task List Table */}
        {isLoading ? (
          <div className="flex h-48 items-center justify-center text-xs text-gray-500">
            Loading background tasks...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-800/40 bg-red-950/30 p-4 text-xs text-red-300">
            Failed to retrieve tasks.
          </div>
        ) : data?.tasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-800 bg-gray-900/40 p-12 text-center">
            <span className="text-4xl">⚡</span>
            <h3 className="mt-3 text-base font-semibold text-white">No tasks found</h3>
            <p className="mt-1 text-xs text-gray-400">
              {selectedStatus !== 'ALL'
                ? `No tasks with status "${selectedStatus}".`
                : 'Click "Submit Task" to queue an asynchronous AI execution or maintenance job.'}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-300">
                <thead className="border-b border-gray-800 bg-gray-950/60 uppercase text-gray-400">
                  <tr>
                    <th className="px-4 py-3">Task ID</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Attempts</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3">Completed</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {data?.tasks.map((task) => (
                    <tr key={task.id} className="hover:bg-gray-800/40">
                      <td className="px-4 py-3 font-mono text-gray-200">#{task.id}</td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-gray-800 px-2 py-0.5 font-mono text-[11px] text-gray-200">
                          {task.type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${getStatusBadge(
                            task.status
                          )}`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current"></span>
                          {task.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-400">
                        {task.attempts} / {task.maxRetries}
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {new Date(task.createdAt).toLocaleTimeString()}
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {task.completedAt ? new Date(task.completedAt).toLocaleTimeString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setInspectingTask(task)}
                            className="rounded border border-gray-700 px-2 py-1 text-[11px] text-indigo-400 hover:bg-gray-800 hover:text-indigo-300"
                          >
                            Inspect
                          </button>
                          {(task.status === 'QUEUED' || task.status === 'RUNNING') && (
                            <button
                              onClick={() => {
                                if (confirm(`Cancel task #${task.id}?`)) {
                                  cancelTaskMutation.mutate(task.id);
                                }
                              }}
                              className="rounded border border-red-900/60 px-2 py-1 text-[11px] text-red-400 hover:bg-red-950/40"
                            >
                              Cancel
                            </button>
                          )}
                          {(task.status === 'FAILED' || task.status === 'CANCELLED') && (
                            <button
                              onClick={() => retryTaskMutation.mutate(task.id)}
                              className="rounded border border-amber-900/60 px-2 py-1 text-[11px] text-amber-400 hover:bg-amber-950/40"
                            >
                              Retry
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Submit Task Modal */}
        {isSubmitModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                <h3 className="text-base font-semibold text-white">Queue Background Task</h3>
                <button
                  onClick={() => setIsSubmitModalOpen(false)}
                  className="rounded p-1 text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSubmitTask} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-300">Task Type</label>
                  <select
                    value={taskType}
                    onChange={(e) => setTaskType(e.target.value as TaskType)}
                    className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="AI_TASK">AI_TASK (Asynchronous LLM reasoning & generation)</option>
                    <option value="RESEARCH_TASK">RESEARCH_TASK (Deep context research & synthesis)</option>
                    <option value="MEMORY_TASK">MEMORY_TASK (Memory indexing, pruning, consolidation)</option>
                    <option value="NOTIFICATION_TASK">NOTIFICATION_TASK (Alert / digest processing)</option>
                    <option value="MAINTENANCE_TASK">MAINTENANCE_TASK (System health check & cleanup)</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-medium text-gray-300">Payload (JSON)</label>
                    <span className="text-[10px] text-gray-500">Valid JSON required</span>
                  </div>
                  <textarea
                    rows={6}
                    value={taskPayloadJson}
                    onChange={(e) => setTaskPayloadJson(e.target.value)}
                    className="mt-1 w-full font-mono text-xs rounded-lg border border-gray-700 bg-gray-950 p-3 text-gray-200 focus:border-indigo-500 focus:outline-none"
                  />
                  {payloadError && (
                    <p className="mt-1 text-xs text-red-400">{payloadError}</p>
                  )}
                </div>

                <div className="mt-6 flex justify-end gap-3 border-t border-gray-800 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsSubmitModalOpen(false)}
                    className="rounded-lg border border-gray-700 px-4 py-2 text-xs font-medium text-gray-300 hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitTaskMutation.isPending}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {submitTaskMutation.isPending ? 'Submitting...' : 'Queue Task'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Inspect Task Modal */}
        {inspectingTask && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-white">
                    Task #{inspectingTask.id} Telemetry
                  </h3>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getStatusBadge(
                      inspectingTask.status
                    )}`}
                  >
                    {inspectingTask.status}
                  </span>
                </div>
                <button
                  onClick={() => setInspectingTask(null)}
                  className="rounded p-1 text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="mt-4 max-h-[70vh] overflow-y-auto space-y-4 text-xs">
                <div>
                  <span className="font-semibold text-gray-400 uppercase tracking-wider text-[10px]">
                    Task Type:
                  </span>{' '}
                  <span className="font-mono text-gray-200">{inspectingTask.type}</span>
                </div>

                <div>
                  <span className="font-semibold text-gray-400 uppercase tracking-wider text-[10px]">
                    Attempts / Max Retries:
                  </span>{' '}
                  <span className="font-mono text-gray-200">
                    {inspectingTask.attempts} / {inspectingTask.maxRetries}
                  </span>
                </div>

                {inspectingTask.error && (
                  <div>
                    <span className="font-semibold text-red-400 uppercase tracking-wider text-[10px]">
                      Error Information:
                    </span>
                    <pre className="mt-1 rounded-lg bg-red-950/40 border border-red-800 p-3 text-red-200 whitespace-pre-wrap font-mono">
                      {inspectingTask.error}
                    </pre>
                  </div>
                )}

                <div>
                  <span className="font-semibold text-gray-400 uppercase tracking-wider text-[10px]">
                    Task Payload:
                  </span>
                  <pre className="mt-1 rounded-lg bg-gray-950 border border-gray-800 p-3 text-gray-300 whitespace-pre-wrap font-mono">
                    {JSON.stringify(inspectingTask.payload, null, 2)}
                  </pre>
                </div>

                {inspectingTask.result && (
                  <div>
                    <span className="font-semibold text-emerald-400 uppercase tracking-wider text-[10px]">
                      Execution Result:
                    </span>
                    <pre className="mt-1 rounded-lg bg-gray-950 border border-gray-800 p-3 text-emerald-300 whitespace-pre-wrap font-mono">
                      {JSON.stringify(inspectingTask.result, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end border-t border-gray-800 pt-4">
                <button
                  onClick={() => setInspectingTask(null)}
                  className="rounded-lg bg-gray-800 px-4 py-2 text-xs font-medium text-gray-300 hover:bg-gray-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
