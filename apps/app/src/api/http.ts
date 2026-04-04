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

export async function fetchJson(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${getBffBaseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const detail = await extractErrorDetail(response);
    throw new Error(detail);
  }

  try {
    return await response.json();
  } catch {
    throw new Error('Response body was not valid JSON');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function extractErrorDetail(response: Response): Promise<string> {
  const fallback = `HTTP ${response.status}: ${response.statusText}`;

  try {
    const body: unknown = await response.json();

    if (isRecord(body) && typeof body['message'] === 'string') {
      return body['message'];
    }

    return fallback;
  } catch {
    return fallback;
  }
}
