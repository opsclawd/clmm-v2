import { useEffect, useMemo, type ReactNode } from 'react';
import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { navigateRoute } from '../platform/webNavigation';
import { BootScreen } from './BootScreen';
import { buildReturnToPath, type SearchParamRecord } from './buildReturnToPath';
import { useWalletBootStatus } from './walletBootContext';

function extractPathParamKeys(pathname: string, search: SearchParamRecord): Set<string> {
  const segments = pathname.split('/').filter(Boolean);
  const keys = new Set<string>();
  for (const [key, value] of Object.entries(search)) {
    if (typeof value === 'string' && segments.includes(value)) {
      keys.add(key);
    }
  }
  return keys;
}

export function RequireWallet({ children }: { children: ReactNode }) {
  const status = useWalletBootStatus();
  const router = useRouter();
  const pathname = usePathname();
  const search = useGlobalSearchParams() as SearchParamRecord;

  const pathParamKeys = useMemo(() => extractPathParamKeys(pathname, search), [pathname, search]);

  useEffect(() => {
    if (status !== 'disconnected') return;
    const fullPath = buildReturnToPath(pathname, search, pathParamKeys);
    const target = `/connect?returnTo=${encodeURIComponent(fullPath)}`;
    navigateRoute({ router, path: target, method: 'push' });
  }, [status, pathname, search, pathParamKeys, router]);

  if (status === 'hydrating-storage' || status === 'checking-browser-wallet') {
    return <BootScreen status={status} />;
  }

  if (status === 'disconnected') {
    return null;
  }

  return <>{children}</>;
}