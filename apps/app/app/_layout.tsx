import { QueryClientProvider } from '@tanstack/react-query';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { Stack } from 'expo-router';
import { useMemo } from 'react';
import { Platform } from 'react-native';
import { queryClient } from '../src/composition/queryClient';

const SOLANA_RPC_ENDPOINT = 'https://api.mainnet-beta.solana.com';

export default function RootLayout() {
  const wallets = useMemo(() => {
    if (Platform.OS !== 'web') {
      return [];
    }

    return [new PhantomWalletAdapter()];
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ConnectionProvider endpoint={SOLANA_RPC_ENDPOINT}>
        <WalletProvider wallets={wallets} autoConnect={false}>
          <Stack screenOptions={{ headerShown: false }} />
        </WalletProvider>
      </ConnectionProvider>
    </QueryClientProvider>
  );
}
