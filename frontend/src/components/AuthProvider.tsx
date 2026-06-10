'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';

/** Hydrates the auth session from localStorage on first mount. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return <>{children}</>;
}
