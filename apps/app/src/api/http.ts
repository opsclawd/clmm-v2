export function getBffBaseUrl(): string {
  const configuredBaseUrl = process.env.EXPO_PUBLIC_BFF_BASE_URL;

  if (!configuredBaseUrl) {
    throw new Error('Missing EXPO_PUBLIC_BFF_BASE_URL');
  }

  return configuredBaseUrl;
}

export async function fetchJson(path: string, init?: RequestInit): Promise<unknown> {
  const headers = new Headers(init?.headers);

  if (typeof init?.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${getBffBaseUrl()}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const detail = await extractErrorDetail(response);
    throw new Error(detail);
  }

  try {
    const body: unknown = await response.json();
    return body;
  } catch {
    throw new Error('Response body was not valid JSON');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function extractErrorDetail(response: Response): Promise<string> {
  const fallback = `HTTP ${response.status}: ${response.statusText}`;
  const bodyText = await response.text().catch(() => '');

  try {
    if (bodyText.length === 0) {
      return fallback;
    }

    const body: unknown = JSON.parse(bodyText);

    if (isRecord(body)) {
      if (typeof body['message'] === 'string') {
        return body['message'];
      }

      if (Array.isArray(body['message']) && body['message'].every((entry) => typeof entry === 'string')) {
        return body['message'].join('; ');
      }
    }

    return bodyText;
  } catch {
    return bodyText.length > 0 ? bodyText : fallback;
  }
}
