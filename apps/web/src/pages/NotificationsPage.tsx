import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/Layout';
import { fetchApi } from '../lib/api';

interface NotificationItem {
  id: number;
  userId: number;
  title: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: string;
}

const formatDateTime = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getTypeBadge = (type: string) => {
  switch (type) {
    case 'SUCCESS':
      return <span className="rounded bg-emerald-950/60 px-2 py-0.5 text-xs text-emerald-400 border border-emerald-800/40">Success</span>;
    case 'WARNING':
      return <span className="rounded bg-amber-950/60 px-2 py-0.5 text-xs text-amber-400 border border-amber-800/40">Warning</span>;
    case 'ERROR':
      return <span className="rounded bg-rose-950/60 px-2 py-0.5 text-xs text-rose-400 border border-rose-800/40">Error</span>;
    case 'TASK':
      return <span className="rounded bg-indigo-950/60 px-2 py-0.5 text-xs text-indigo-400 border border-indigo-800/40">Task</span>;
    case 'APPLICATION':
      return <span className="rounded bg-cyan-950/60 px-2 py-0.5 text-xs text-cyan-400 border border-cyan-800/40">Application</span>;
    default:
      return <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-300 border border-gray-700">Info</span>;
  }
};

export default function NotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{
    success: boolean;
    notifications: NotificationItem[];
    total: number;
    unreadCount: number;
  }>({
    queryKey: ['notifications', 'list', unreadOnly],
    queryFn: () => fetchApi(`/notifications?unreadOnly=${unreadOnly}&limit=50`),
    refetchInterval: 15000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: number) => fetchApi(`/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => fetchApi('/notifications/read-all', { method: 'PATCH' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => fetchApi(`/notifications/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const notifications = data?.notifications || [];
  const unreadCount = data?.unreadCount || 0;

  return (
    <Layout>
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-gray-800 pb-5">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white tracking-tight">Notifications</h1>
              {unreadCount > 0 && (
                <span className="rounded-full bg-indigo-600/30 px-2.5 py-0.5 text-xs font-semibold text-indigo-400 border border-indigo-500/40">
                  {unreadCount} unread
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-gray-400">
              In-app updates, task completions, and application alerts
            </p>
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                className="rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white shadow-sm hover:bg-indigo-500 transition-colors disabled:opacity-50"
              >
                Mark all as read
              </button>
            )}
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex gap-2">
          <button
            onClick={() => setUnreadOnly(false)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              !unreadOnly
                ? 'bg-gray-800 text-white shadow-sm'
                : 'text-gray-400 hover:bg-gray-800/60 hover:text-white'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setUnreadOnly(true)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              unreadOnly
                ? 'bg-gray-800 text-white shadow-sm'
                : 'text-gray-400 hover:bg-gray-800/60 hover:text-white'
            }`}
          >
            Unread Only
          </button>
        </div>

        {/* Notifications List */}
        {isLoading ? (
          <div className="flex h-48 items-center justify-center rounded-xl border border-gray-800 bg-gray-900/50">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-r-transparent" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-gray-800 bg-gray-900/40 py-16 text-center">
            <span className="text-4xl mb-3">📭</span>
            <h3 className="text-base font-semibold text-white">No notifications</h3>
            <p className="mt-1 text-xs text-gray-400 max-w-sm">
              {unreadOnly
                ? "You have caught up with all your notifications."
                : "You don't have any notifications yet. System events and background task alerts will appear here."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border p-4 transition-colors ${
                  n.read
                    ? 'border-gray-800/80 bg-gray-900/40 text-gray-300'
                    : 'border-indigo-900/50 bg-gray-900 shadow-sm text-white'
                }`}
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {!n.read && (
                      <span className="h-2 w-2 rounded-full bg-indigo-500 shrink-0" title="Unread" />
                    )}
                    {getTypeBadge(n.type)}
                    <h4 className="font-semibold text-sm">{n.title}</h4>
                    <span className="text-xs text-gray-500">
                      {formatDateTime(n.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed break-words">{n.message}</p>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  {!n.read && (
                    <button
                      onClick={() => markReadMutation.mutate(n.id)}
                      disabled={markReadMutation.isPending}
                      className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-50"
                    >
                      Mark read
                    </button>
                  )}
                  <button
                    onClick={() => deleteMutation.mutate(n.id)}
                    disabled={deleteMutation.isPending}
                    className="rounded-lg bg-gray-800/60 p-1.5 text-gray-400 hover:bg-rose-950/60 hover:text-rose-400 transition-colors disabled:opacity-50"
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
