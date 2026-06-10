'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const loading = useAuthStore((s) => s.loading);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-5"
      >
        <div>
          <h1 className="text-2xl font-bold">Welcome back</h1>
          <p className="text-slate-400 text-sm mt-1">
            Log in to your WatchTogether account.
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/40 text-red-300 text-sm rounded-lg px-4 py-2">
            {error}
          </div>
        )}

        <div className="space-y-1">
          <label className="text-sm text-slate-300">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 outline-none focus:border-brand"
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-slate-300">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 outline-none focus:border-brand"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-brand hover:bg-brand-dark py-2.5 font-medium transition disabled:opacity-60"
        >
          {loading ? 'Logging in…' : 'Log in'}
        </button>

        <p className="text-sm text-slate-400 text-center">
          No account?{' '}
          <Link href="/auth/register" className="text-brand hover:underline">
            Create one
          </Link>
        </p>
      </form>
    </main>
  );
}
