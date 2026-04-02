import { getBffBaseUrl } from './http.js';

export async function enrollWalletForMonitoring(walletId: string): Promise<{ enrolled: boolean; enrolledAt: number }> {
  const response = await fetch(`${getBffBaseUrl()}/wallets/${walletId}/monitor`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(`Enrollment failed: HTTP ${response.status}`);
  }
  return response.json() as Promise<{ enrolled: boolean; enrolledAt: number }>;
}
