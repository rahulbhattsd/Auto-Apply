import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function RegisterPage() {
  const { user, register, registerError, isRegisterPending, isLoading } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-th-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-th-accent border-r-transparent" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setClientError(null);

    if (password.length < 8) {
      setClientError('Password must be at least 8 characters long');
      return;
    }

    if (password !== confirmPassword) {
      setClientError('Passwords do not match');
      return;
    }

    register({ name, email, password, confirmPassword });
  };

  const errorMessage = clientError || (registerError instanceof Error ? registerError.message : null);

  return (
    <div className="flex min-h-screen items-center justify-center bg-th-bg px-4 py-12">
      {/* Subtle background grid */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 50%, var(--color-accent) 0%, transparent 70%)',
          opacity: 0.03,
        }}
      />

      <div className="relative w-full max-w-[400px] rounded-2xl border border-th-border bg-th-surface p-8 shadow-[0_8px_32px_rgba(0,0,0,0.25)] sm:p-10">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-th-accent text-sm font-bold text-white shadow-lg shadow-th-accent/25">
            AA
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-th-text">
            Request access
          </h1>
          <p className="mt-1.5 text-sm text-th-text-muted">
            This app is invite-only
          </p>
        </div>

        {/* Error banner */}
        {errorMessage && (
          <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-th-error/20 bg-th-error-bg p-3 transition-all duration-150 ease-in-out">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-th-error" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
            </svg>
            <p className="text-sm text-th-error">{errorMessage}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="register-name" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-th-text-muted">
              Your name
            </label>
            <input
              id="register-name"
              type="text"
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Rahul Bhatt"
              className="block w-full rounded-lg border border-th-input-border bg-th-input px-3.5 py-2.5 text-th-text placeholder-th-text-muted/50 shadow-sm transition-all duration-150 ease-in-out focus:border-th-accent focus:outline-none focus:ring-1 focus:ring-th-accent/20"
            />
          </div>

          <div>
            <label htmlFor="register-email" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-th-text-muted">
              Email address
            </label>
            <input
              id="register-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="block w-full rounded-lg border border-th-input-border bg-th-input px-3.5 py-2.5 text-th-text placeholder-th-text-muted/50 shadow-sm transition-all duration-150 ease-in-out focus:border-th-accent focus:outline-none focus:ring-1 focus:ring-th-accent/20"
            />
          </div>

          <div>
            <label htmlFor="register-password" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-th-text-muted">
              Password
            </label>
            <input
              id="register-password"
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              className="block w-full rounded-lg border border-th-input-border bg-th-input px-3.5 py-2.5 text-th-text placeholder-th-text-muted/50 shadow-sm transition-all duration-150 ease-in-out focus:border-th-accent focus:outline-none focus:ring-1 focus:ring-th-accent/20"
            />
          </div>

          <div>
            <label htmlFor="register-confirm" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-th-text-muted">
              Confirm password
            </label>
            <input
              id="register-confirm"
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat password"
              className="block w-full rounded-lg border border-th-input-border bg-th-input px-3.5 py-2.5 text-th-text placeholder-th-text-muted/50 shadow-sm transition-all duration-150 ease-in-out focus:border-th-accent focus:outline-none focus:ring-1 focus:ring-th-accent/20"
            />
          </div>

          <button
            type="submit"
            disabled={isRegisterPending}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-th-accent px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all duration-150 ease-in-out hover:bg-th-accent-hover hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-th-accent focus:ring-offset-2 focus:ring-offset-th-surface disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRegisterPending ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Creating account…
              </>
            ) : (
              'Create account'
            )}
          </button>
        </form>

        {/* Toggle link */}
        <p className="mt-6 text-center text-xs text-th-text-muted">
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-semibold text-th-accent transition-colors duration-150 hover:text-th-accent-hover"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
