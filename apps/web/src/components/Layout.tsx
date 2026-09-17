import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout, isLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-indigo-500 border-r-transparent"></div>
          <p className="mt-3 text-sm text-gray-400">Loading Personal AI Agent...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    navigate('/login');
    return null;
  }

  const navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: '📊' },
    { label: 'Chat Assistant', path: '/chat', icon: '💬' },
    { label: 'Memory Vault', path: '/memory', icon: '🧠' },
    { label: 'Background Tasks', path: '/tasks', icon: '⚡' },
    { label: 'Settings', path: '/settings', icon: '⚙️' },
  ];

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 antialiased">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 transform bg-gray-900 border-r border-gray-800 transition-transform duration-200 ease-in-out md:static md:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-full flex-col justify-between">
          <div>
            {/* Logo */}
            <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-800">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 font-bold text-white shadow-lg shadow-indigo-500/30">
                AI
              </div>
              <div>
                <h1 className="text-base font-semibold leading-tight text-white">Personal Agent</h1>
                <p className="text-xs text-gray-400">Autonomous Assistant</p>
              </div>
            </div>

            {/* Nav links */}
            <nav className="space-y-1 px-3 py-4">
              {navItems.map((item) => {
                const isActive = location.pathname.startsWith(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    }`}
                  >
                    <span className="text-lg">{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* User Profile & Logout */}
          <div className="border-t border-gray-800 p-4">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-800 text-sm font-semibold text-white">
                {user.name ? user.name[0]?.toUpperCase() : 'U'}
              </div>
              <div className="overflow-hidden">
                <p className="truncate text-sm font-medium text-white">{user.name || user.email}</p>
                <p className="truncate text-xs text-gray-400">{user.email}</p>
              </div>
            </div>
            <button
              onClick={() => logout()}
              className="w-full rounded-lg bg-gray-800 px-3 py-2 text-center text-xs font-medium text-gray-300 transition-colors hover:bg-red-900/60 hover:text-red-200"
            >
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile Header */}
        <header className="flex h-14 items-center justify-between border-b border-gray-800 bg-gray-900 px-4 md:hidden">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
          >
            ☰
          </button>
          <span className="font-semibold text-white">Personal Agent</span>
          <div className="h-4 w-4 rounded-full bg-emerald-500"></div>
        </header>

        {/* Content Body */}
        <main className="flex-1 overflow-y-auto bg-gray-950 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
