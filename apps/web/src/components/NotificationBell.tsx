import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
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

const formatTimeAgo = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
};

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'SUCCESS':
      return '✅';
    case 'WARNING':
      return '⚠️';
    case 'ERROR':
      return '❌';
    case 'TASK':
      return '⚡';
    case 'APPLICATION':
      return '📄';
    default:
      return 'ℹ️';
  }
};

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Poll unread count and latest 5 notifications every 20 seconds
  const { data } = useQuery<{ success: boolean; notifications: NotificationItem[]; unreadCount: number }>({
    queryKey: ['notifications', 'dropdown'],
    queryFn: () => fetchApi('/notifications?limit=5'),
    refetchInterval: 20000,
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

  const notifications = data?.notifications || [];
  const unreadCount = data?.unreadCount || 0;

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-gray-800 text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
        aria-label="Notifications"
        title="Notifications"
      >
        <span className="text-lg">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white shadow-sm ring-2 ring-gray-900">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-gray-800 bg-gray-900 shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3 bg-gray-950/60">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white text-sm">Notifications</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-indigo-900/60 px-2 py-0.5 text-xs font-medium text-indigo-300 border border-indigo-700/40">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50"
              >
                Mark all as read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-gray-800/60">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500 text-xs">
                <span className="block text-2xl mb-1">🎉</span>
                No notifications right now
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => !n.read && markReadMutation.mutate(n.id)}
                  className={`flex gap-3 px-4 py-3 text-left transition-colors cursor-pointer ${
                    n.read
                      ? 'bg-gray-900/40 text-gray-400 hover:bg-gray-800/40'
                      : 'bg-gray-800/50 text-gray-200 hover:bg-gray-800'
                  }`}
                >
                  <span className="text-base shrink-0 mt-0.5">{getTypeIcon(n.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className={`truncate text-xs font-semibold ${n.read ? 'text-gray-300' : 'text-white'}`}>
                        {n.title}
                      </p>
                      <span className="text-[10px] text-gray-500 shrink-0">{formatTimeAgo(n.createdAt)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-400 line-clamp-2">{n.message}</p>
                  </div>
                  {!n.read && (
                    <span className="h-2 w-2 rounded-full bg-indigo-500 self-center shrink-0" title="Unread" />
                  )}
                </div>
              ))
            )}
          </div>

          <div className="border-t border-gray-800 bg-gray-950/60 px-4 py-2.5 text-center">
            <Link
              to="/notifications"
              onClick={() => setIsOpen(false)}
              className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors block"
            >
              View all notifications →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
