import type {
  ObservabilityPort,
  PolicyInsightsReadResult,
  PolicyInsightsReadPort,
} from '@clmm/application';
import { parsePolicyInsightBlock } from '@clmm/application';

const FETCH_TIMEOUT_MS = 2000;

export class CurrentPolicyInsightsAdapter implements PolicyInsightsReadPort {
  constructor(
    private readonly baseUrl: string | null,
    private readonly observability: ObservabilityPort,
  ) {}

  async fetchCurrent(): Promise<PolicyInsightsReadResult> {
    if (!this.baseUrl) {
      this.observability.log(
        'warn',
        'PolicyInsights read disabled — no REGIME_ENGINE_BASE_URL configured',
      );
      return { kind: 'config-error' };
    }

    let url: URL;
    try {
      url = new URL(`${this.baseUrl.replace(/\/+$/, '')}/v1/insights/sol-usdc/current`);
    } catch {
      this.observability.log('warn', 'PolicyInsights base URL is malformed', {
        baseUrl: this.baseUrl,
      });
      return { kind: 'config-error' };
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      this.observability.log('warn', 'PolicyInsights base URL uses disallowed protocol', {
        protocol: url.protocol,
      });
      return { kind: 'config-error' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      let response: Response;
      try {
        response = await fetch(url.toString(), { signal: controller.signal });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.observability.log('warn', 'PolicyInsights fetch network error', { message });
        return { kind: 'upstream-error' };
      }

      if (response.status === 200) {
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          this.observability.log('warn', 'PolicyInsights response was not valid JSON');
          return { kind: 'upstream-error' };
        }
        const block = parsePolicyInsightBlock(body);
        if (!block) {
          this.observability.log('warn', 'PolicyInsights response failed shape validation');
          return { kind: 'upstream-error' };
        }
        return { kind: 'block', block };
      }

      if (response.status === 404) {
        const envelope = await this.readErrorEnvelope(response);
        if (!envelope || envelope.code === 'INSIGHT_NOT_FOUND' || envelope.code == null) {
          return { kind: 'not-found' };
        }
        this.observability.log('warn', 'PolicyInsights upstream 404 with unexpected code', {
          envelope,
        });
        return { kind: 'not-found' };
      }

      if (response.status === 503) {
        this.observability.log('warn', 'PolicyInsights upstream 503 store unavailable');
        return { kind: 'store-unavailable' };
      }

      this.observability.log('warn', 'PolicyInsights upstream non-2xx', {
        status: response.status,
      });
      return { kind: 'upstream-error' };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async readErrorEnvelope(
    response: Response,
  ): Promise<{ code?: string; message?: string } | null> {
    try {
      const body: unknown = await response.json();
      if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
      const err = (body as Record<string, unknown>)['error'];
      const out: { code?: string; message?: string } = {};
      if (typeof err === 'object' && err !== null && !Array.isArray(err)) {
        if (typeof (err as Record<string, unknown>)['code'] === 'string') {
          out.code = (err as Record<string, unknown>)['code'] as string;
        }
        if (typeof (err as Record<string, unknown>)['message'] === 'string') {
          out.message = (err as Record<string, unknown>)['message'] as string;
        }
      }
      return out;
    } catch {
      return null;
    }
  }
}
