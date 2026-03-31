type ExpoPublicEnv = {
  EXPO_PUBLIC_BFF_BASE_URL?: string;
};

export function getBffBaseUrl(): string {
  const configuredBaseUrl = (process.env as ExpoPublicEnv).EXPO_PUBLIC_BFF_BASE_URL;

  if (configuredBaseUrl != null && configuredBaseUrl.length > 0) {
    return configuredBaseUrl;
  }

  const origin = globalThis.location?.origin;

  if (origin != null && origin.length > 0) {
    const currentOrigin = new URL(origin);

    return `${currentOrigin.protocol}//${currentOrigin.hostname}:3001`;
  }

  throw new Error(
    'EXPO_PUBLIC_BFF_BASE_URL must be configured when no web origin is available',
  );
}

export async function fetchJson(path: string): Promise<unknown> {
  const response = await fetch(`${getBffBaseUrl()}${path}`, { method: 'GET' });

  if (!response.ok) {
    const responseText = await response.text().catch(() => '');
    const statusDetail = responseText.length > 0 ? `: ${responseText}` : '';

    throw new Error(`HTTP ${response.status}${statusDetail}`);
  }

  return response.json();
}
