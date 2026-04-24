import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type AppPackageJson = {
  dependencies?: Record<string, string>;
};

function readText(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

function readAppPackageJson(): AppPackageJson {
  return JSON.parse(readText('../package.json')) as AppPackageJson;
}

describe('app shell wallet dependency guard', () => {
  it('does not wire legacy wallet-adapter providers into the root layout', () => {
    const layoutSource = readText('../app/_layout.tsx');

    expect(layoutSource).not.toContain('@solana/wallet-adapter-react');
    expect(layoutSource).not.toContain('@solana/wallet-adapter-wallets');
    expect(layoutSource).not.toContain('ConnectionProvider');
    expect(layoutSource).not.toContain('<WalletProvider');
    expect(layoutSource).not.toContain('PhantomWalletAdapter');
  });

  it('does not depend on legacy wallet-adapter packages for wallet connect', () => {
    const packageJson = readAppPackageJson();

    expect(packageJson.dependencies).not.toHaveProperty('@solana/wallet-adapter-base');
    expect(packageJson.dependencies).not.toHaveProperty('@solana/wallet-adapter-react');
    expect(packageJson.dependencies).not.toHaveProperty('@solana/wallet-adapter-wallets');
  });

  it('does not import the adapters root barrel from app composition', () => {
    const compositionSource = readText('./composition/index.ts');

    expect(compositionSource).not.toContain("from '@clmm/adapters'");
  });

  it('wires the positions route to the supported positions BFF client', () => {
    const routeSource = readText('../app/(tabs)/positions.tsx');

    expect(routeSource).toContain('useQuery');
    expect(routeSource).toContain('fetchSupportedPositions');
    expect(routeSource).toContain("queryKey: ['supported-positions', walletAddress]");
    expect(routeSource).toContain('enabled: walletAddress != null && walletAddress.length > 0');
    expect(routeSource).toContain('positions={positionsQuery.data}');
  });

  it('wires position tap navigation to the position detail route', () => {
    const routeSource = readText('../app/(tabs)/positions.tsx');

    expect(routeSource).toContain('onSelectPosition');
    expect(routeSource).toContain('navigateRoute');
    expect(routeSource).toContain("path: `/position/");
  });
});
