import type { ObservabilityPort, EvidenceReadPort, EvidenceReadResult } from '@clmm/application';
import { parseEvidenceBundle } from '@clmm/application';

const FETCH_TIMEOUT_MS = 2000;

export class CurrentEvidenceAdapter implements EvidenceReadPort {
  constructor(
    private readonly baseUrl: string | null,
    private readonly internalToken: string | null,
    private readonly observability: ObservabilityPort,
  ) {}

  async fetchCurrent(): Promise<EvidenceReadResult> {
    if (!this.baseUrl || !this.internalToken) {
      this.observability.log('warn', 'Evidence read disabled — missing baseUrl or internalToken');
      return { kind: 'config-error' };
    }

    let url: URL;
    try {
      url = new URL(`${this.baseUrl.replace(/\/+$/, '')}/v1/evidence/sol-usdc/current`);
    } catch {
      this.observability.log('warn', 'Evidence base URL is malformed', {
        baseUrl: this.baseUrl,
      });
      return { kind: 'config-error' };
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      this.observability.log('warn', 'Evidence base URL uses disallowed protocol', {
        protocol: url.protocol,
      });
      return { kind: 'config-error' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      let response: Response;
      try {
        response = await fetch(url.toString(), {
          signal: controller.signal,
          headers: {
            'X-CLMM-Internal-Token': this.internalToken,
          },
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.observability.log('warn', 'Evidence fetch network error', { message });
        return { kind: 'upstream-error' };
      }

      if (response.status === 200) {
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          this.observability.log('warn', 'Evidence response was not valid JSON');
          return { kind: 'upstream-error' };
        }

        if (
          typeof body !== 'object' ||
          body === null ||
          !('items' in body) ||
          !Array.isArray((body as Record<string, unknown>)['items']) ||
          ((body as Record<string, unknown>)['items'] as unknown[]).length === 0
        ) {
          this.observability.log('warn', 'Evidence response missing envelope items');
          return { kind: 'malformed' };
        }

        const items = (body as Record<string, unknown>)['items'] as Record<string, unknown>[];
        const item = items[0];
        if (
          !item ||
          !('bundle' in item) ||
          typeof item['bundle'] !== 'object' ||
          item['bundle'] === null
        ) {
          this.observability.log('warn', 'Evidence response missing envelope item bundle');
          return { kind: 'malformed' };
        }

        const block = parseEvidenceBundle(item['bundle']);
        if (!block) {
          this.observability.log('warn', 'Evidence response failed shape validation');
          return { kind: 'malformed' };
        }
        return { kind: 'block', block };
      }

      if (response.status === 404) {
        this.observability.log('warn', 'Evidence upstream 404 not found');
        return { kind: 'not-found' };
      }

      if (response.status === 503) {
        this.observability.log('warn', 'Evidence upstream 503 store unavailable');
        return { kind: 'store-unavailable' };
      }

      this.observability.log('warn', 'Evidence upstream non-2xx', {
        status: response.status,
      });
      return { kind: 'upstream-error' };
    } finally {
      clearTimeout(timeout);
    }
  }
}
