'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useRequireAuth } from '@/lib/useRequireAuth';

export default function DashboardPage() {
  const router = useRouter();
  const { user, ready } = useRequireAuth();
  const logout = useAuthStore((s) => s.logout);

  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ready) {
    return (
      <main className="min-h-screen flex items-center justify-center text-slate-400">
        Loading…
      </main>
    );
  }

  const onCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      const room = await api.createRoom();
      router.push(`/room/${room.roomCode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create room');
      setBusy(false);
    }
  };

  const onJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setBusy(true);
    setError(null);
    try {
      await api.joinRoom(code);
      router.push(`/room/${code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join room');
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
        <h1 className="text-xl font-bold">
          Watch<span className="text-brand">Together</span>
        </h1>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-400">
            Signed in as{' '}
            <span className="text-slate-100 font-medium">{user?.username}</span>
          </span>
          <button
            onClick={() => {
              logout();
              router.replace('/auth/login');
            }}
            className="text-slate-400 hover:text-slate-100 transition"
          >
            Log out
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-semibold">Start watching</h2>
        <p className="text-slate-400 mt-1">
          Create a room to host a movie, or join a friend with their code.
        </p>

        {error && (
          <div className="mt-6 bg-red-500/10 border border-red-500/40 text-red-300 text-sm rounded-lg px-4 py-2">
            {error}
          </div>
        )}

        <div className="mt-8 grid md:grid-cols-2 gap-6">
          {/* Create */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col">
            <h3 className="text-lg font-semibold">Host a movie</h3>
            <p className="text-slate-400 text-sm mt-1 flex-1">
              Create a room and stream a local video file from your computer to
              your guest. Nothing is uploaded.
            </p>
            <button
              onClick={onCreate}
              disabled={busy}
              className="mt-6 rounded-lg bg-brand hover:bg-brand-dark py-2.5 font-medium transition disabled:opacity-60"
            >
              Create room
            </button>
          </div>

          {/* Join */}
          <form
            onSubmit={onJoin}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col"
          >
            <h3 className="text-lg font-semibold">Join a room</h3>
            <p className="text-slate-400 text-sm mt-1">
              Enter the 6-character room code your friend shared.
            </p>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
              placeholder="ABC123"
              className="mt-4 rounded-lg bg-slate-800 border border-slate-700 px-3 py-2.5 tracking-[0.3em] text-center text-lg uppercase outline-none focus:border-brand"
            />
            <button
              type="submit"
              disabled={busy || joinCode.trim().length < 4}
              className="mt-4 rounded-lg border border-slate-700 hover:border-slate-500 py-2.5 font-medium transition disabled:opacity-60"
            >
              Join room
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
