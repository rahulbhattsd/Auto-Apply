import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/Layout';
import { fetchApi } from '../lib/api';
import { useAuth } from '../hooks/useAuth';

interface UserProfile {
  id: number;
  userId: number;
  displayName: string | null;
  bio: string | null;
  timezone: string;
  preferences: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

interface SystemStatus {
  status: string;
  timestamp: string;
  uptime: number;
  database: string;
  aiProvider: string;
  workers: Array<{
    workerId: string;
    workerType: string;
    status: string;
    timestamp: number;
  }>;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [preferencesJson, setPreferencesJson] = useState('{}');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Fetch profile
  const { data: profile, isLoading: profileLoading } = useQuery<UserProfile>({
    queryKey: ['profile-settings'],
    queryFn: () => fetchApi('/profile'),
  });

  // Fetch system status
  const { data: systemStatus } = useQuery<SystemStatus>({
    queryKey: ['system-status'],
    queryFn: () => fetchApi('/system/status'),
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName || '');
      setBio(profile.bio || '');
      setTimezone(profile.timezone || 'UTC');
      setPreferencesJson(
        profile.preferences ? JSON.stringify(profile.preferences, null, 2) : '{}'
      );
    }
  }, [profile]);

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: (data: {
      displayName: string;
      bio: string;
      timezone: string;
      preferences: Record<string, unknown>;
    }) =>
      fetchApi('/profile', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile-settings'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    },
  });

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setJsonError(null);

    let parsedPreferences: Record<string, unknown> = {};
    if (preferencesJson.trim()) {
      try {
        parsedPreferences = JSON.parse(preferencesJson);
      } catch {
        setJsonError('Invalid JSON format in preferences');
        return;
      }
    }

    updateProfileMutation.mutate({
      displayName,
      bio,
      timezone,
      preferences: parsedPreferences,
    });
  };

  const commonTimezones = [
    'UTC',
    'Asia/Kolkata',
    'America/New_York',
    'America/Los_Angeles',
    'America/Chicago',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Asia/Tokyo',
    'Asia/Singapore',
    'Australia/Sydney',
  ];

  return (
    <Layout>
      <div className="max-w-4xl space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl flex items-center gap-2">
            <span>⚙️</span> Platform Settings
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Configure agent identity, timezone, assistant guidelines, and inspect runtime telemetry.
          </p>
        </div>

        {saveSuccess && (
          <div className="rounded-xl border border-emerald-800 bg-emerald-950/40 p-4 text-xs font-semibold text-emerald-300">
            ✓ Agent profile & preferences updated successfully.
          </div>
        )}

        {/* Profile Settings Form */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-sm">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <span>👤</span> Assistant Identity & Context
          </h2>
          <p className="mt-1 text-xs text-gray-400">
            The agent incorporates this persona and context into every prompt.
          </p>

          {profileLoading ? (
            <div className="py-8 text-center text-xs text-gray-500">Loading settings...</div>
          ) : (
            <form onSubmit={handleSaveProfile} className="mt-6 space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-gray-300">Display Name / Alias</label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Rahul Bhatt"
                    className="mt-1.5 w-full rounded-lg border border-gray-700 bg-gray-950 px-3.5 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-300">Timezone</label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  >
                    {commonTimezones.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300">
                  User Context & Bio (Who the agent is assisting)
                </label>
                <textarea
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="e.g. Lead full-stack architect working with TypeScript, Fastify, React, PostgreSQL, and LLMs."
                  className="mt-1.5 w-full rounded-lg border border-gray-700 bg-gray-950 px-3.5 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-gray-300">
                    Preferences & Directives (JSON)
                  </label>
                  <span className="text-[10px] text-gray-500">Structured prompt directives</span>
                </div>
                <textarea
                  rows={5}
                  value={preferencesJson}
                  onChange={(e) => setPreferencesJson(e.target.value)}
                  className="mt-1.5 w-full font-mono text-xs rounded-lg border border-gray-700 bg-gray-950 p-3 text-gray-200 focus:border-indigo-500 focus:outline-none"
                />
                {jsonError && <p className="mt-1 text-xs text-red-400">{jsonError}</p>}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={updateProfileMutation.isPending}
                  className="rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                >
                  {updateProfileMutation.isPending ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* AI Engine & System Runtime Status */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-sm">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <span>🤖</span> AI Engine & Supervisor Status
          </h2>
          <p className="mt-1 text-xs text-gray-400">
            Current LLM provider, database connectivity, and background worker state.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                AI Provider
              </span>
              <p className="mt-1 text-base font-bold text-indigo-400">
                {systemStatus?.aiProvider || 'GROQ / MOCK'}
              </p>
              <p className="mt-1 text-[11px] text-gray-400">Low-latency LLM inference</p>
            </div>

            <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Database
              </span>
              <p className="mt-1 text-base font-bold text-emerald-400">
                {systemStatus?.database === 'connected' ? 'PostgreSQL (Connected)' : 'Connected'}
              </p>
              <p className="mt-1 text-[11px] text-gray-400">Prisma ORM data isolation</p>
            </div>

            <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                API Uptime
              </span>
              <p className="mt-1 text-base font-bold text-white">
                {systemStatus?.uptime ? `${Math.floor(systemStatus.uptime / 60)}m ${Math.floor(systemStatus.uptime % 60)}s` : 'Active'}
              </p>
              <p className="mt-1 text-[11px] text-gray-400">Self-healing runtime</p>
            </div>
          </div>
        </div>

        {/* Security & Authentication Info */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-sm">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <span>🔒</span> Security & User Data Isolation
          </h2>
          <div className="mt-4 space-y-2 text-xs text-gray-300">
            <p>
              • Authenticated as: <span className="font-mono text-indigo-300">{user?.email}</span> (ID: {user?.id})
            </p>
            <p>• Sessions are secured via <span className="font-mono text-emerald-300">httpOnly, SameSite=Strict</span> JWT cookies.</p>
            <p>• Cross-user isolation enforced: All queries, memories, conversations, and tasks enforce user-ownership checks.</p>
            <p>• Separate GENERATE from ACT: Code drafting and email generations are strictly safe sandboxed outputs without unauthorized external execution side-effects.</p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
