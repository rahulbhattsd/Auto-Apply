import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/Layout';
import { fetchApi } from '../lib/api';

type MemoryType = 'PROFILE' | 'PREFERENCE' | 'PROJECT' | 'FACT' | 'INSTRUCTION' | 'CONTEXT';

interface MemoryItem {
  id: number;
  type: MemoryType;
  key: string;
  content: string;
  importance: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface MemoryListResponse {
  memories: MemoryItem[];
  total: number;
  limit: number;
  offset: number;
}

const MEMORY_TYPES: Array<{ value: MemoryType | 'ALL'; label: string; color: string }> = [
  { value: 'ALL', label: 'All Items', color: 'bg-gray-800 text-gray-200 border-gray-700' },
  { value: 'FACT', label: 'Facts', color: 'bg-purple-950 text-purple-300 border-purple-800' },
  { value: 'PREFERENCE', label: 'Preferences', color: 'bg-amber-950 text-amber-300 border-amber-800' },
  { value: 'PROJECT', label: 'Projects', color: 'bg-emerald-950 text-emerald-300 border-emerald-800' },
  { value: 'INSTRUCTION', label: 'Instructions', color: 'bg-rose-950 text-rose-300 border-rose-800' },
  { value: 'PROFILE', label: 'Profile', color: 'bg-blue-950 text-blue-300 border-blue-800' },
  { value: 'CONTEXT', label: 'Context', color: 'bg-cyan-950 text-cyan-300 border-cyan-800' },
];

export default function MemoryPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<MemoryType | 'ALL'>('ALL');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingMemory, setEditingMemory] = useState<MemoryItem | null>(null);

  // Form states
  const [formData, setFormData] = useState<{
    type: MemoryType;
    key: string;
    content: string;
    importance: number;
  }>({
    type: 'FACT',
    key: '',
    content: '',
    importance: 3,
  });

  const queryParams = new URLSearchParams();
  if (searchQuery.trim()) queryParams.set('q', searchQuery.trim());
  if (selectedType !== 'ALL') queryParams.set('type', selectedType);

  const { data, isLoading, error } = useQuery<MemoryListResponse>({
    queryKey: ['memories', searchQuery, selectedType],
    queryFn: () => fetchApi(`/memory?${queryParams.toString()}`),
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (newMemory: typeof formData) =>
      fetchApi('/memory', {
        method: 'POST',
        body: JSON.stringify(newMemory),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memories'] });
      setIsCreateModalOpen(false);
      setFormData({ type: 'FACT', key: '', content: '', importance: 3 });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, update }: { id: number; update: Partial<typeof formData> }) =>
      fetchApi(`/memory/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(update),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memories'] });
      setEditingMemory(null);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => fetchApi(`/memory/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memories'] });
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.key.trim() || !formData.content.trim()) return;
    createMutation.mutate(formData);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMemory || !editingMemory.key.trim() || !editingMemory.content.trim()) return;
    updateMutation.mutate({
      id: editingMemory.id,
      update: {
        type: editingMemory.type,
        key: editingMemory.key,
        content: editingMemory.content,
        importance: editingMemory.importance,
      },
    });
  };

  const getTypeStyle = (type: MemoryType) => {
    switch (type) {
      case 'FACT':
        return 'bg-purple-950/80 text-purple-300 border-purple-800';
      case 'PREFERENCE':
        return 'bg-amber-950/80 text-amber-300 border-amber-800';
      case 'PROJECT':
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-800';
      case 'INSTRUCTION':
        return 'bg-rose-950/80 text-rose-300 border-rose-800';
      case 'PROFILE':
        return 'bg-blue-950/80 text-blue-300 border-blue-800';
      case 'CONTEXT':
        return 'bg-cyan-950/80 text-cyan-300 border-cyan-800';
      default:
        return 'bg-gray-800 text-gray-300 border-gray-700';
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl flex items-center gap-2">
              <span>🧠</span> Memory Vault
            </h1>
            <p className="mt-1 text-sm text-gray-400">
              Facts, explicit preferences, guidelines, and project knowledge recalled during chats.
            </p>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors"
          >
            <span>+</span> Add Memory
          </button>
        </div>

        {/* Filter bar & Search */}
        <div className="flex flex-col gap-3 rounded-xl border border-gray-800 bg-gray-900 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search memories by keyword, key, or value..."
              className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3.5 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-xs text-gray-400 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>

          {/* Type pills */}
          <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {MEMORY_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setSelectedType(t.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
                  selectedType === t.value
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                    : 'bg-gray-950 text-gray-400 border-gray-800 hover:text-white hover:bg-gray-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Memories Grid */}
        {isLoading ? (
          <div className="flex h-48 items-center justify-center text-xs text-gray-500">
            Loading memory vault...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-800/40 bg-red-950/30 p-4 text-xs text-red-300">
            Failed to retrieve memories.
          </div>
        ) : data?.memories.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-800 bg-gray-900/40 p-12 text-center">
            <span className="text-4xl">🧠</span>
            <h3 className="mt-3 text-base font-semibold text-white">No memories found</h3>
            <p className="mt-1 text-xs text-gray-400">
              {searchQuery || selectedType !== 'ALL'
                ? 'Try clearing your search query or type filter.'
                : 'Click "Add Memory" to store facts, preferences, or project instructions.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data?.memories.map((mem) => (
              <div
                key={mem.id}
                className="flex flex-col justify-between rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-sm hover:border-gray-700 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${getTypeStyle(
                        mem.type
                      )}`}
                    >
                      {mem.type}
                    </span>
                    <div className="flex items-center gap-1 text-xs text-amber-400" title={`Importance: ${mem.importance}/5`}>
                      {'★'.repeat(mem.importance)}
                      <span className="text-gray-600">{'★'.repeat(Math.max(0, 5 - mem.importance))}</span>
                    </div>
                  </div>

                  <h3 className="mt-3 font-mono text-sm font-semibold text-white break-all">
                    {mem.key}
                  </h3>

                  <p className="mt-2 text-xs text-gray-300 whitespace-pre-wrap line-clamp-4 leading-relaxed">
                    {mem.content}
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-gray-800 pt-3">
                  <span className="text-[10px] text-gray-500">
                    {new Date(mem.updatedAt).toLocaleDateString()}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingMemory(mem)}
                      className="rounded p-1 text-xs text-gray-400 hover:bg-gray-800 hover:text-white"
                      title="Edit"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete memory "${mem.key}"?`)) {
                          deleteMutation.mutate(mem.id);
                        }
                      }}
                      className="rounded p-1 text-xs text-gray-400 hover:bg-red-900/60 hover:text-red-200"
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Memory Modal */}
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                <h3 className="text-base font-semibold text-white">Add to Memory Vault</h3>
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="rounded p-1 text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateSubmit} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-300">Memory Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as MemoryType })}
                    className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="FACT">FACT (Verified truth / personal knowledge)</option>
                    <option value="PREFERENCE">PREFERENCE (Formatting, style, habits)</option>
                    <option value="PROJECT">PROJECT (Project architecture, goals, stack)</option>
                    <option value="INSTRUCTION">INSTRUCTION (Persistent behavioral rule)</option>
                    <option value="PROFILE">PROFILE (Identity, role, location)</option>
                    <option value="CONTEXT">CONTEXT (General environment)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-300">Key / Identifier</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. preferred_frontend_framework"
                    value={formData.key}
                    onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-300">Content / Memory Details</label>
                  <textarea
                    rows={4}
                    required
                    placeholder="Enter the factual statement, preference rule, or project specification..."
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-300">Importance (1 to 5)</label>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    value={formData.importance}
                    onChange={(e) => setFormData({ ...formData, importance: parseInt(e.target.value, 10) })}
                    className="mt-2 w-full accent-indigo-500"
                  />
                  <div className="flex justify-between text-[10px] text-gray-400">
                    <span>1 (Low)</span>
                    <span>Current: {formData.importance}</span>
                    <span>5 (High)</span>
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-3 border-t border-gray-800 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="rounded-lg border border-gray-700 px-4 py-2 text-xs font-medium text-gray-300 hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isPending}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {createMutation.isPending ? 'Saving...' : 'Save Memory'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Memory Modal */}
        {editingMemory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                <h3 className="text-base font-semibold text-white">Edit Memory</h3>
                <button
                  onClick={() => setEditingMemory(null)}
                  className="rounded p-1 text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleEditSubmit} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-300">Type</label>
                  <select
                    value={editingMemory.type}
                    onChange={(e) => setEditingMemory({ ...editingMemory, type: e.target.value as MemoryType })}
                    className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="FACT">FACT</option>
                    <option value="PREFERENCE">PREFERENCE</option>
                    <option value="PROJECT">PROJECT</option>
                    <option value="INSTRUCTION">INSTRUCTION</option>
                    <option value="PROFILE">PROFILE</option>
                    <option value="CONTEXT">CONTEXT</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-300">Key</label>
                  <input
                    type="text"
                    required
                    value={editingMemory.key}
                    onChange={(e) => setEditingMemory({ ...editingMemory, key: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-300">Content</label>
                  <textarea
                    rows={4}
                    required
                    value={editingMemory.content}
                    onChange={(e) => setEditingMemory({ ...editingMemory, content: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-300">Importance (1 to 5)</label>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    value={editingMemory.importance}
                    onChange={(e) =>
                      setEditingMemory({ ...editingMemory, importance: parseInt(e.target.value, 10) })
                    }
                    className="mt-2 w-full accent-indigo-500"
                  />
                  <div className="flex justify-between text-[10px] text-gray-400">
                    <span>1</span>
                    <span>Current: {editingMemory.importance}</span>
                    <span>5</span>
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-3 border-t border-gray-800 pt-4">
                  <button
                    type="button"
                    onClick={() => setEditingMemory(null)}
                    className="rounded-lg border border-gray-700 px-4 py-2 text-xs font-medium text-gray-300 hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updateMutation.isPending}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {updateMutation.isPending ? 'Updating...' : 'Update Memory'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
