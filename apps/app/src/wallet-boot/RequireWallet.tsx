import { useEffect, type ReactNode } from 'react';
import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { navigateRoute } from '../platform/webNavigation';
import { BootScreen } from './BootScreen';
import { buildReturnToPath, type SearchParamRecord } from './buildReturnToPath';
import { useWalletBootStatus } from './walletBootContext';

export function RequireWallet({ children }: { children: ReactNode }) {
  const status = useWalletBootStatus();
  const router = useRouter();
  const pathname = usePathname();
  const search = useGlobalSearchParams() as SearchParamRecord;

  useEffect(() => {
    if (status !== 'disconnected') return;
    const fullPath = buildReturnToPath(pathname, search);
    const target = `/connect?returnTo=${encodeURIComponent(fullPath)}`;
    navigateRoute({ router, path: target, method: 'push' });
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === 'hydrating-storage' || status === 'checking-browser-wallet') {
    return <BootScreen status={status} />;
  }

  if (status === 'disconnected') {
    return null;
  }

  return <>{children}</>;
}