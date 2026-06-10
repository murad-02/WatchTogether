'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

export default function RegisterPage() {
  const router = useRouter();
  const register = useAuthStore((s) => s.register);
  const loading = useAuthStore((s) => s.loading);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await register(username, email, password);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-5"
      >
        <div>
          <h1 className="text-2xl font-bold">Create your account</h1>
          <p className="text-slate-400 text-sm mt-1">
            Pick a username and start a watch party.
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/40 text-red-300 text-sm rounded-lg px-4 py-2">
            {error}
          </div>
        )}

        <div className="space-y-1">
          <label className="text-sm text-slate-300">Username</label>
          <input
            type="text"
            required
            minLength={3}
            maxLength={24}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 outline-none focus:border-brand"
            placeholder="moviefan"
          />
        </div>

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
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 outline-none focus:border-brand"
            placeholder="At least 6 characters"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-brand hover:bg-brand-dark py-2.5 font-medium transition disabled:opacity-60"
        >
          {loading ? 'Creating…' : 'Create account'}
        </button>

        <p className="text-sm text-slate-400 text-center">
          Already have an account?{' '}
          <Link href="/auth/login" className="text-brand hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </main>
  );
}
