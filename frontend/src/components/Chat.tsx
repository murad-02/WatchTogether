'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/lib/types';

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function Chat({
  messages,
  currentUserId,
  onSend,
}: {
  messages: ChatMessage[];
  currentUserId?: string;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-2">
        Chat
      </h3>

      <div className="flex-1 min-h-0 overflow-y-auto scroll-thin space-y-3 pr-1">
        {messages.length === 0 && (
          <p className="text-slate-500 text-sm">
            No messages yet. Say hello! 👋
          </p>
        )}
        {messages.map((m) => {
          const mine = m.userId === currentUserId;
          return (
            <div
              key={m.id}
              className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-baseline gap-2 text-xs text-slate-500">
                <span className="font-medium text-slate-300">
                  {mine ? 'You' : m.username}
                </span>
                <span>{formatTime(m.timestamp)}</span>
              </div>
              <div
                className={`mt-0.5 max-w-[85%] rounded-2xl px-3 py-1.5 text-sm break-words ${
                  mine
                    ? 'bg-brand text-white rounded-br-sm'
                    : 'bg-slate-800 text-slate-100 rounded-bl-sm'
                }`}
              >
                {m.text}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          placeholder="Type a message…"
          className="flex-1 rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <button
          type="submit"
          className="rounded-lg bg-brand hover:bg-brand-dark px-4 py-2 text-sm font-medium transition"
        >
          Send
        </button>
      </form>
    </div>
  );
}
