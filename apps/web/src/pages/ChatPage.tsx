import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/Layout';
import { fetchApi } from '../lib/api';

interface ConversationSummary {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  _count: { messages: number };
}

interface Message {
  id: number;
  conversationId: number;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

interface ConversationDetail {
  id: number;
  title: string;
  userId: number;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
}

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [inputMessage, setInputMessage] = useState('');
  const [editingTitleId, setEditingTitleId] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState('');

  // Fetch all conversations for sidebar
  const { data: conversations = [], isLoading: conversationsLoading } = useQuery<ConversationSummary[]>({
    queryKey: ['conversations'],
    queryFn: () => fetchApi('/chat/conversations'),
  });

  const activeConvId = id ? parseInt(id, 10) : null;

  // Fetch active conversation detail
  const {
    data: activeConversation,
    isLoading: conversationLoading,
    error: conversationError,
  } = useQuery<ConversationDetail>({
    queryKey: ['conversation', activeConvId],
    queryFn: () => fetchApi(`/chat/conversations/${activeConvId}`),
    enabled: activeConvId !== null && !isNaN(activeConvId),
  });

  // Create conversation mutation
  const createConversationMutation = useMutation({
    mutationFn: (title?: string) =>
      fetchApi('/chat/conversations', {
        method: 'POST',
        body: JSON.stringify({ title: title || 'New Conversation' }),
      }),
    onSuccess: (newConv: { id: number }) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      navigate(`/chat/${newConv.id}`);
    },
  });

  // Delete conversation mutation
  const deleteConversationMutation = useMutation({
    mutationFn: (convId: number) =>
      fetchApi(`/chat/conversations/${convId}`, { method: 'DELETE' }),
    onSuccess: (_data, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (activeConvId === deletedId) {
        navigate('/chat');
      }
    },
  });

  // Rename conversation mutation
  const renameConversationMutation = useMutation({
    mutationFn: ({ convId, title }: { convId: number; title: string }) =>
      fetchApi(`/chat/conversations/${convId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversation', activeConvId] });
      setEditingTitleId(null);
    },
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: ({ convId, content }: { convId: number; content: string }) =>
      fetchApi(`/chat/conversations/${convId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', activeConvId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setInputMessage('');
    },
  });

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation?.messages, sendMessageMutation.isPending]);

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputMessage.trim() || sendMessageMutation.isPending) return;

    if (!activeConvId) {
      // First create conversation, then message will be handled
      createConversationMutation.mutate(
        inputMessage.trim().slice(0, 30),
        {
          onSuccess: (newConv: { id: number }) => {
            sendMessageMutation.mutate({ convId: newConv.id, content: inputMessage.trim() });
          },
        }
      );
      return;
    }

    sendMessageMutation.mutate({ convId: activeConvId, content: inputMessage.trim() });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const startRename = (conv: ConversationSummary) => {
    setEditingTitleId(conv.id);
    setNewTitle(conv.title);
  };

  const submitRename = (convId: number) => {
    if (!newTitle.trim()) {
      setEditingTitleId(null);
      return;
    }
    renameConversationMutation.mutate({ convId, title: newTitle.trim() });
  };

  return (
    <Layout>
      <div className="flex h-[calc(100vh-7rem)] overflow-hidden rounded-2xl border border-gray-800 bg-gray-900 shadow-xl">
        {/* Left Sidebar: Conversations list */}
        <div className="flex w-72 flex-col border-r border-gray-800 bg-gray-950/80">
          <div className="p-3 border-b border-gray-800">
            <button
              onClick={() => createConversationMutation.mutate(undefined)}
              disabled={createConversationMutation.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              <span>+</span>
              <span>New Conversation</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {conversationsLoading ? (
              <div className="p-4 text-center text-xs text-gray-500">Loading chats...</div>
            ) : conversations.length === 0 ? (
              <div className="p-4 text-center text-xs text-gray-500">
                No conversations yet. Click "New Conversation" to start.
              </div>
            ) : (
              conversations.map((conv) => {
                const isActive = activeConvId === conv.id;
                return (
                  <div
                    key={conv.id}
                    className={`group relative flex items-center justify-between rounded-lg p-2.5 text-sm transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-indigo-600/20 text-indigo-200 border border-indigo-500/30'
                        : 'text-gray-300 hover:bg-gray-800/60'
                    }`}
                    onClick={() => {
                      if (editingTitleId !== conv.id) {
                        navigate(`/chat/${conv.id}`);
                      }
                    }}
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      {editingTitleId === conv.id ? (
                        <input
                          type="text"
                          value={newTitle}
                          onChange={(e) => setNewTitle(e.target.value)}
                          onBlur={() => submitRename(conv.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') submitRename(conv.id);
                            if (e.key === 'Escape') setEditingTitleId(null);
                          }}
                          autoFocus
                          className="w-full rounded bg-gray-800 px-1.5 py-0.5 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      ) : (
                        <div>
                          <p className="truncate text-xs font-semibold">{conv.title}</p>
                          <p className="text-[10px] text-gray-500">
                            {conv._count.messages} msgs • {new Date(conv.updatedAt).toLocaleDateString()}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="hidden items-center gap-1 group-hover:flex">
                      <button
                        title="Rename"
                        onClick={(e) => {
                          e.stopPropagation();
                          startRename(conv);
                        }}
                        className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-white"
                      >
                        ✏️
                      </button>
                      <button
                        title="Delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete conversation "${conv.title}"?`)) {
                            deleteConversationMutation.mutate(conv.id);
                          }
                        }}
                        className="rounded p-1 text-gray-400 hover:bg-red-900/60 hover:text-red-200"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Main Chat Area */}
        <div className="flex flex-1 flex-col overflow-hidden bg-gray-900">
          {/* Header */}
          <div className="flex h-14 items-center justify-between border-b border-gray-800 px-6 bg-gray-900/60 backdrop-blur">
            <div className="flex items-center gap-3">
              <span className="text-xl">🤖</span>
              <div>
                <h2 className="text-sm font-semibold text-white">
                  {activeConversation?.title || 'Personal AI Assistant'}
                </h2>
                <p className="text-[11px] text-gray-400">
                  Memory-grounded • Safe tool execution • Persistent
                </p>
              </div>
            </div>
            {activeConvId && (
              <button
                onClick={() => {
                  if (activeConversation && confirm(`Delete "${activeConversation.title}"?`)) {
                    deleteConversationMutation.mutate(activeConvId);
                  }
                }}
                className="rounded-lg border border-gray-700 px-2.5 py-1 text-xs text-gray-400 hover:border-red-800 hover:bg-red-950/40 hover:text-red-300 transition-colors"
              >
                Delete Chat
              </button>
            )}
          </div>

          {/* Messages Stream */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {!activeConvId ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="rounded-2xl bg-gray-800/60 p-8 max-w-md border border-gray-800">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600/20 text-2xl text-indigo-400 mb-4">
                    ✨
                  </div>
                  <h3 className="text-base font-semibold text-white">How can I assist you today?</h3>
                  <p className="mt-2 text-xs text-gray-400 leading-relaxed">
                    I recall your stored preferences, profile details, and notes. Ask me questions, perform calculations, format text, or schedule tasks.
                  </p>
                  <div className="mt-6 flex flex-col gap-2 text-left">
                    <button
                      onClick={() => setInputMessage('What do you remember about my profile and preferences?')}
                      className="rounded-lg border border-gray-700/60 bg-gray-900/60 p-2.5 text-xs text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                    >
                      💡 "What do you remember about my profile and preferences?"
                    </button>
                    <button
                      onClick={() => setInputMessage('Calculate (1500 * 12) - 4500 and explain')}
                      className="rounded-lg border border-gray-700/60 bg-gray-900/60 p-2.5 text-xs text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                    >
                      🧮 "Calculate (1500 * 12) - 4500 and explain"
                    </button>
                    <button
                      onClick={() => setInputMessage('Draft an email proposing a sprint retrospective for Friday.')}
                      className="rounded-lg border border-gray-700/60 bg-gray-900/60 p-2.5 text-xs text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                    >
                      ✉️ "Draft an email proposing a sprint retrospective for Friday."
                    </button>
                  </div>
                </div>
              </div>
            ) : conversationLoading ? (
              <div className="flex h-full items-center justify-center text-xs text-gray-500">
                Loading messages...
              </div>
            ) : conversationError ? (
              <div className="rounded-xl border border-red-800/40 bg-red-950/30 p-4 text-xs text-red-300">
                Failed to load conversation messages.
              </div>
            ) : (
              <>
                {activeConversation?.messages.map((msg) => {
                  const isUser = msg.role === 'user';
                  const metadata = msg.metadata as {
                    toolsUsed?: string[];
                    memoriesRetrieved?: string[];
                  } | undefined;

                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
                    >
                      {!isUser && (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 text-xs font-bold">
                          AI
                        </div>
                      )}

                      <div
                        className={`max-w-[75%] rounded-2xl p-4 text-sm leading-relaxed shadow-sm ${
                          isUser
                            ? 'bg-indigo-600 text-white rounded-br-sm'
                            : 'bg-gray-800 border border-gray-700/60 text-gray-100 rounded-bl-sm'
                        }`}
                      >
                        {/* Tool & Memory metadata badges */}
                        {!isUser && metadata && (
                          <div className="mb-2 flex flex-wrap gap-1.5 text-[10px]">
                            {metadata.toolsUsed && metadata.toolsUsed.length > 0 && (
                              <span className="inline-flex items-center gap-1 rounded bg-indigo-950/80 border border-indigo-700/50 px-2 py-0.5 text-indigo-300 font-mono">
                                🔧 Tools: {metadata.toolsUsed.join(', ')}
                              </span>
                            )}
                            {metadata.memoriesRetrieved && metadata.memoriesRetrieved.length > 0 && (
                              <span className="inline-flex items-center gap-1 rounded bg-purple-950/80 border border-purple-700/50 px-2 py-0.5 text-purple-300 font-mono">
                                🧠 Recalled {metadata.memoriesRetrieved.length} memory item(s)
                              </span>
                            )}
                          </div>
                        )}

                        <div className="whitespace-pre-wrap">{msg.content}</div>

                        <div
                          className={`mt-2 text-[10px] ${
                            isUser ? 'text-indigo-200' : 'text-gray-400'
                          }`}
                        >
                          {new Date(msg.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>

                      {isUser && (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-700 text-gray-300 text-xs font-semibold">
                          You
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Processing status */}
                {sendMessageMutation.isPending && (
                  <div className="flex gap-3 justify-start">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 text-xs font-bold animate-pulse">
                      AI
                    </div>
                    <div className="rounded-2xl bg-gray-800 border border-gray-700/60 p-4 text-sm text-gray-400 flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent"></div>
                      <span>Agent is retrieving context and generating response...</span>
                    </div>
                  </div>
                )}

                {sendMessageMutation.isError && (
                  <div className="rounded-xl border border-red-800/40 bg-red-950/30 p-3 text-xs text-red-300 flex items-center justify-between">
                    <span>
                      {sendMessageMutation.error instanceof Error
                        ? sendMessageMutation.error.message
                        : 'Failed to send message.'}
                    </span>
                    <button
                      onClick={() => handleSendMessage()}
                      className="ml-3 underline text-red-200 hover:text-white"
                    >
                      Retry
                    </button>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Bottom Input Area */}
          <div className="border-t border-gray-800 p-4 bg-gray-950/60">
            <form onSubmit={handleSendMessage} className="flex gap-3 items-end">
              <div className="relative flex-1">
                <textarea
                  rows={2}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask a question, execute tools, request drafting..."
                  className="w-full resize-none rounded-xl border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <span className="absolute bottom-2 right-3 text-[10px] text-gray-500 hidden sm:inline">
                  Enter to send • Shift+Enter for newline
                </span>
              </div>
              <button
                type="submit"
                disabled={!inputMessage.trim() || sendMessageMutation.isPending}
                className="flex h-11 items-center justify-center rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-40 transition-colors"
              >
                Send
              </button>
            </form>
          </div>
        </div>
      </div>
    </Layout>
  );
}
