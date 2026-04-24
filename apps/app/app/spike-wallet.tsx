// Spike route for ConnectorKit wallet integration testing.
// This file is NOT production code. It will be removed after the spike is complete.
// @ts-nocheck because spike code uses dynamic imports and cross-library types
// that don't need strict type checking for a test harness.

import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View, StyleSheet, Pressable } from 'react-native';
import {
  getDefaultConfig,
  getDefaultMobileConfig,
  AppProvider,
  useConnector,
  getWalletsRegistry,
} from '@solana/connector';
import type { ViewStyle, TextStyle } from 'react-native';

type SpikeState = {
  platform: string;
  userAgent: string;
  hasPhantomInjected: boolean;
  connectors: { id: string; name: string; ready: boolean; chains: readonly string[] }[];
  connectedAddress: string | null;
  connecting: boolean;
  signingInProgress: boolean;
  disconnecting: boolean;
  lastSignature: string | null;
  inputPayloadBase64: string | null;
  signedPayloadBase64: string | null;
  error: string | null;
  errorClass: string | null;
  errorCode: string | null;
  debugJson: string;
};

function SpikeWalletInner() {
  const [state, setState] = useState<SpikeState>({
    platform: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    hasPhantomInjected: false,
    connectors: [],
    connectedAddress: null,
    connecting: false,
    signingInProgress: false,
    disconnecting: false,
    lastSignature: null,
    inputPayloadBase64: null,
    signedPayloadBase64: null,
    error: null,
    errorClass: null,
    errorCode: null,
    debugJson: '{}',
  });

  const {
    connectors,
    connectWallet,
    disconnectWallet,
    isConnected,
    account,
    walletError,
  } = useConnector();

  useEffect(() => {
    const win = typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : {};
    const phantomObj = win['phantom'] as Record<string, unknown> | undefined;
    const hasPhantom = !!(phantomObj && typeof phantomObj['solana'] === 'object');

    setState((prev) => ({
      ...prev,
      hasPhantomInjected: hasPhantom,
      connectors: connectors.map((c) => ({ id: c.id, name: c.name, ready: c.ready, chains: c.chains })),
      connectedAddress: account ?? null,
      debugJson: JSON.stringify(
        {
          connectors: connectors.map((c) => ({ id: c.id, name: c.name, ready: c.ready, chains: c.chains })),
          connected: isConnected,
          account,
          hasPhantomInjected: hasPhantom,
        },
        null,
        2,
      ),
    }));
  }, [connectors, isConnected, account]);

  useEffect(() => {
    if (walletError) {
      setState((prev) => ({
        ...prev,
        error: walletError.message,
        errorClass: walletError.constructor.name,
        errorCode: (walletError as Error & { code?: string }).code ?? null,
      }));
    }
  }, [walletError]);

  const handleConnect = useCallback(
    async (connectorId?: string) => {
      setState((prev) => ({ ...prev, connecting: true, error: null, errorClass: null, errorCode: null }));
      try {
        const targetConnector = connectorId
          ? connectors.find((c) => c.id === connectorId)
          : connectors.find((c) => c.ready);

        if (!targetConnector) {
          throw new Error('No ready wallet connector found');
        }

        await connectWallet(targetConnector.id);
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        setState((prev) => ({
          ...prev,
          error: error.message,
          errorClass: error.constructor.name,
          errorCode: (error as Error & { code?: string }).code ?? null,
        }));
      } finally {
        setState((prev) => ({ ...prev, connecting: false }));
      }
    },
    [connectWallet, connectors],
  );

  const handleDisconnect = useCallback(async () => {
    setState((prev) => ({ ...prev, disconnecting: true, error: null }));
    try {
      await disconnectWallet();
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      setState((prev) => ({
        ...prev,
        error: error.message,
        errorClass: error.constructor.name,
        errorCode: (error as Error & { code?: string }).code ?? null,
      }));
    } finally {
      setState((prev) => ({ ...prev, disconnecting: false }));
    }
  }, [disconnectWallet]);

  const handleSignTest = useCallback(async () => {
    if (!account) {
      setState((prev) => ({ ...prev, error: 'No wallet connected' }));
      return;
    }

    setState((prev) => ({ ...prev, signingInProgress: true, error: null, lastSignature: null, inputPayloadBase64: null, signedPayloadBase64: null }));

    try {
      // Dynamic import @solana/kit to construct a devnet no-op v0 transaction
      const {
        createSolanaRpc,
        createTransactionMessage,
        setTransactionMessageFeePayer,
        setTransactionMessageLifetimeUsingBlockhash,
        appendTransactionMessageInstructions,
        compileTransaction,
        getBase64EncodedWireTransaction,
        getTransactionDecoder,
        getSignatureFromTransaction,
        pipe,
        address,
      } = await import('@solana/kit');
      const { getTransferSolInstruction } = await import('@solana-program/system');

      const rpc = createSolanaRpc('https://api.devnet.solana.com');
      const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
      const payerAddress = address(account as string);

      // Build devnet no-op: self-transfer 0 lamports
      const transactionMessage = pipe(
        createTransactionMessage({ version: 0 }),
        (m: any) => setTransactionMessageFeePayer(payerAddress, m),
        (m: any) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
        (m: any) =>
          appendTransactionMessageInstructions(
            [getTransferSolInstruction({ source: payerAddress, destination: payerAddress, amount: 0n })],
            m,
          ),
      );

      const compiledTransaction = compileTransaction(transactionMessage);
      const unsignedBase64 = getBase64EncodedWireTransaction(compiledTransaction);
      const unsignedBytes = Uint8Array.from(atob(unsignedBase64), (c) => c.charCodeAt(0));

      // Get the connected wallet from Wallet Standard registry
      // getWalletsRegistry is already imported at the top from @solana/connector
      const registry = getWalletsRegistry();
      const wallets = registry.get();
      const wallet = wallets.find((w: any) => {
        // Find a wallet matching the connected account
        const accounts = (w as any).accounts as { address: string }[] | undefined;
        return accounts?.some((a: { address: string }) => a.address === account);
      }) || wallets[0];

      if (!wallet) {
        throw new Error('No wallet found in Wallet Standard registry');
      }

      const features = wallet.features as Record<string, any>;
      const signFeature = features['solana:signTransaction'];

      if (!signFeature) {
        // Fallback: try signAndSendTransaction, then signMessage
        throw new Error('Wallet does not support solana:signTransaction. Available features: ' + Object.keys(features).join(', '));
      }

      // Sign via Wallet Standard: bytes in → bytes out
      const result = await signFeature.signTransaction({
        account: { address: account as string },
        transactions: [unsignedBytes],
      });

      const signedBytes = (result as any).signedTransactions?.[0] || (result as any).signedTransaction || result;
      let signedBase64: string;
      let signature: string;

      if (signedBytes instanceof Uint8Array) {
        signedBase64 = btoa(String.fromCharCode(...signedBytes));
        try {
          const decoded = getTransactionDecoder().decode(signedBytes);
          signature = getSignatureFromTransaction(decoded);
        } catch {
          signature = '(signature extraction failed — but bytes round-trip succeeded)';
        }
      } else {
        throw new Error('Unexpected signed transaction type: ' + typeof signedBytes);
      }

      setState((prev) => ({
        ...prev,
        signingInProgress: false,
        lastSignature: signature,
        inputPayloadBase64: unsignedBase64.slice(0, 80) + '...',
        signedPayloadBase64: signedBase64.slice(0, 100) + '...',
      }));
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      setState((prev) => ({
        ...prev,
        signingInProgress: false,
        error: error.message,
        errorClass: error.constructor.name,
        errorCode: (error as Error & { code?: string }).code ?? null,
      }));
    }
  }, [account]);

  const handleClearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null, errorClass: null, errorCode: null }));
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>ConnectorKit Wallet Spike</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Environment</Text>
        <Text style={styles.label}>Platform: <Text style={styles.value}>{state.platform}</Text></Text>
        <Text style={styles.label}>User Agent: <Text style={styles.value}>{state.userAgent.slice(0, 120)}</Text></Text>
        <Text style={styles.label}>Phantom Injected: <Text style={styles.value}>{String(state.hasPhantomInjected)}</Text></Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Wallet Discovery</Text>
        <Text style={styles.label}>Connectors ({state.connectors.length}):</Text>
        {state.connectors.length === 0 && <Text style={styles.value}>None found</Text>}
        {state.connectors.map((c) => (
          <Text key={c.id} style={styles.value}>
            {'\u2022'} {c.name} (ready={String(c.ready)}, chains={c.chains.join(',')})
          </Text>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Connection Status</Text>
        <Text style={styles.label}>Connected: <Text style={styles.value}>{String(!!account)}</Text></Text>
        {account && <Text style={styles.label}>Address: <Text style={styles.value}>{account}</Text></Text>}
        <Text style={styles.label}>Connecting: <Text style={styles.value}>{String(state.connecting)}</Text></Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Actions</Text>
        {state.connectors.map((c) => (
          <Pressable
            key={c.id}
            style={[styles.button, (!c.ready || state.connecting) && styles.buttonDisabled]}
            disabled={!c.ready || state.connecting}
            onPress={() => void handleConnect(c.id)}
          >
            <Text style={styles.buttonText}>Connect {c.name}</Text>
          </Pressable>
        ))}
        {state.connectors.length === 0 && (
          <Text style={styles.value}>No connectors available</Text>
        )}

        <Pressable
          style={[styles.button, !account && styles.buttonDisabled]}
          disabled={!account}
          onPress={() => void handleConnect()}
        >
          <Text style={styles.buttonText}>Connect First Ready Wallet</Text>
        </Pressable>

        <Pressable
          style={[styles.button, (!account || state.signingInProgress) && styles.buttonDisabled]}
          disabled={!account || state.signingInProgress}
          onPress={() => void handleSignTest()}
        >
          <Text style={styles.buttonText}>{state.signingInProgress ? 'Signing...' : 'Sign Devnet No-op Tx (bytes round-trip)'}</Text>
        </Pressable>

        <Pressable
          style={[styles.buttonDanger, !account && styles.buttonDisabled]}
          disabled={!account}
          onPress={() => void handleDisconnect()}
        >
          <Text style={styles.buttonText}>{state.disconnecting ? 'Disconnecting...' : 'Disconnect'}</Text>
        </Pressable>

        {state.error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Error</Text>
            <Text style={styles.errorText}>Class: {state.errorClass}</Text>
            <Text style={styles.errorText}>Code: {state.errorCode ?? 'none'}</Text>
            <Text style={styles.errorText}>Message: {state.error}</Text>
            <Pressable onPress={handleClearError}>
              <Text style={styles.errorClear}>Clear Error</Text>
            </Pressable>
          </View>
        )}
      </View>

      {(state.lastSignature || state.signedPayloadBase64) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Signing Results</Text>
          {state.lastSignature && (
            <Text style={styles.label}>Signature: <Text style={styles.value}>{state.lastSignature}</Text></Text>
          )}
          {state.inputPayloadBase64 && (
            <Text style={styles.label}>Unsigned base64: <Text style={styles.value}>{state.inputPayloadBase64}</Text></Text>
          )}
          {state.signedPayloadBase64 && (
            <Text style={styles.label}>Signed base64: <Text style={styles.value}>{state.signedPayloadBase64}</Text></Text>
          )}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Debug JSON</Text>
        <Text style={styles.debugJson}>{state.debugJson}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Reject/Cancel Test Instructions</Text>
        <Text style={styles.value}>1. Click &quot;Connect&quot; then reject/deny in wallet</Text>
        <Text style={styles.value}>2. Click &quot;Sign&quot; then reject/deny in wallet</Text>
        <Text style={styles.value}>3. Note the error class/code/message above</Text>
      </View>
    </ScrollView>
  );
}

const connectorConfig = getDefaultConfig({
  appName: 'CLMM V2 Spike',
  appUrl: typeof window !== 'undefined' ? window.location.origin : 'https://clmm.v2.app',
  autoConnect: false,
  enableMobile: true,
  network: 'devnet',
});

const mobileConfig = getDefaultMobileConfig({
  appName: 'CLMM V2',
  appUrl: typeof window !== 'undefined' ? window.location.origin : 'https://clmm.v2.app',
  network: 'devnet',
});

export default function SpikeWalletRoute() {
  return (
    <AppProvider connectorConfig={connectorConfig} mobile={mobileConfig}>
      <SpikeWalletInner />
    </AppProvider>
  );
}

const styles = StyleSheet.create<{
  container: ViewStyle;
  contentContainer: ViewStyle;
  title: TextStyle;
  section: ViewStyle;
  sectionTitle: TextStyle;
  label: TextStyle;
  value: TextStyle;
  button: ViewStyle;
  buttonDisabled: ViewStyle;
  buttonDanger: ViewStyle;
  buttonText: TextStyle;
  errorBox: ViewStyle;
  errorTitle: TextStyle;
  errorText: TextStyle;
  errorClear: TextStyle;
  debugJson: TextStyle;
}>({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  contentContainer: { padding: 16, paddingBottom: 48 },
  title: { color: '#ffffff', fontSize: 20, fontWeight: '700', marginBottom: 16 },
  section: { marginTop: 12, padding: 12, backgroundColor: '#1a1a1a', borderRadius: 8 },
  sectionTitle: { color: '#627eea', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  label: { color: '#a0a0a0', fontSize: 12, marginTop: 4 },
  value: { color: '#ffffff', fontSize: 12 },
  button: { backgroundColor: '#627eea', padding: 12, borderRadius: 8, marginTop: 8 },
  buttonDisabled: { backgroundColor: '#333333' },
  buttonDanger: { backgroundColor: '#ef4444', padding: 12, borderRadius: 8, marginTop: 8 },
  buttonText: { color: '#ffffff', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  errorBox: { marginTop: 8, padding: 8, backgroundColor: '#2d1515', borderRadius: 4, borderWidth: 1, borderColor: '#ef4444' },
  errorTitle: { color: '#ef4444', fontSize: 14, fontWeight: '600' },
  errorText: { color: '#ff8888', fontSize: 11 },
  errorClear: { color: '#627eea', fontSize: 12, marginTop: 4 },
  debugJson: { color: '#888888', fontSize: 10, fontFamily: 'monospace' },
});