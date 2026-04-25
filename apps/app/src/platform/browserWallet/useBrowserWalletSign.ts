import { useCallback, useState } from 'react';
import { useConnectorKitAdapter } from './connectorKitAdapter';
import { base64ToBytes, bytesToBase64 } from './base64Bytes';

export function useBrowserWalletSign() {
  const adapter = useConnectorKitAdapter();
  const [signing, setSigning] = useState(false);

  const sign = useCallback(
    async (serializedPayloadBase64: string): Promise<string> => {
      if (!adapter.isConnected) {
        throw new Error('No wallet account is connected');
      }
      setSigning(true);
      try {
        const payloadBytes = base64ToBytes(serializedPayloadBase64);
        const signedBytes = await adapter.signTransactionBytes(payloadBytes);
        return bytesToBase64(signedBytes);
      } finally {
        setSigning(false);
      }
    },
    [adapter],
  );

  return {
    sign,
    signing,
  };
}