'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

/**
 * Client-side route guard. Redirects to /auth/login once auth has been
 * hydrated and there is no authenticated user.
 */
export function useRequireAuth() {
  const router = useRouter();
  const { user, initialized } = useAuthStore();

  useEffect(() => {
    if (initialized && !user) {
      router.replace('/auth/login');
    }
  }, [initialized, user, router]);

  return { user, ready: initialized && !!user };
}
