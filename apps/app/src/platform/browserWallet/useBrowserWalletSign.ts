import { useCallback, useEffect, useRef, useState } from 'react';
import { useConnectorKitAdapter } from './connectorKitAdapter';
import { base64ToBytes, bytesToBase64 } from './base64Bytes';

export function useBrowserWalletSign() {
  const adapter = useConnectorKitAdapter();
  const [signing, setSigning] = useState(false);
  const adapterRef = useRef(adapter);
  useEffect(() => {
    adapterRef.current = adapter;
  }, [adapter]);

  const sign = useCallback(
    async (serializedPayloadBase64: string): Promise<string> => {
      const current = adapterRef.current;
      if (!current.isConnected) {
        throw new Error('No wallet account is connected');
      }
      setSigning(true);
      try {
        const payloadBytes = base64ToBytes(serializedPayloadBase64);
        const signedBytes = await current.signTransactionBytes(payloadBytes);
        return bytesToBase64(signedBytes);
      } finally {
        setSigning(false);
      }
    },
    [],
  );

  return {
    sign,
    signing,
  };
}