'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

export default function HomePage() {
  const router = useRouter();
  const { user, initialized } = useAuthStore();

  useEffect(() => {
    if (initialized && user) router.replace('/dashboard');
  }, [initialized, user, router]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <div className="max-w-2xl">
        <h1 className="text-5xl font-bold tracking-tight">
          Watch<span className="text-brand">Together</span> 🎬
        </h1>
        <p className="mt-6 text-lg text-slate-300">
          Watch a movie from your own computer with a friend anywhere. The video
          streams <span className="text-brand font-medium">peer-to-peer</span> —
          it never gets uploaded to a server. Synchronized play, pause, seek and
          live chat included.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link
            href="/auth/register"
            className="px-6 py-3 rounded-lg bg-brand hover:bg-brand-dark font-medium transition"
          >
            Get started
          </Link>
          <Link
            href="/auth/login"
            className="px-6 py-3 rounded-lg border border-slate-700 hover:border-slate-500 transition"
          >
            Log in
          </Link>
        </div>
      </div>
    </main>
  );
}
