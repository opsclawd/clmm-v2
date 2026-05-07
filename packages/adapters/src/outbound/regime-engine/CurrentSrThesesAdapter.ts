import type {
  ObservabilityPort,
  SrThesesReadPort,
  SrThesesReadResult,
  SrThesisDto,
  SrThesesBlock,
} from '@clmm/application';

const FETCH_TIMEOUT_MS = 2000;
const RETRY_DELAY_MS = 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  return null;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return null;
    out.push(item);
  }
  return out;
}

function parseThesis(raw: unknown): SrThesisDto | null {
  if (!isRecord(raw)) return null;
  const asset = raw['asset'];
  const timeframe = raw['timeframe'];
  const sourceHandle = raw['sourceHandle'];
  const sourceKind = raw['sourceKind'];
  if (typeof asset !== 'string') return null;
  if (typeof timeframe !== 'string') return null;
  if (typeof sourceHandle !== 'string') return null;
  if (typeof sourceKind !== 'string') return null;
  const supportLevels = stringArray(raw['supportLevels']);
  const resistanceLevels = stringArray(raw['resistanceLevels']);
  const targets = stringArray(raw['targets']);
  if (!supportLevels || !resistanceLevels || !targets) return null;
  return {
    asset,
    timeframe,
    bias: nullableString(raw['bias']),
    setupType: nullableString(raw['setupType']),
    supportLevels,
    resistanceLevels,
    entryZone: nullableString(raw['entryZone']),
    targets,
    invalidation: nullableString(raw['invalidation']),
    trigger: nullableString(raw['trigger']),
    chartReference: nullableString(raw['chartReference']),
    sourceHandle,
    sourceChannel: nullableString(raw['sourceChannel']),
    sourceKind,
    sourceReliability: nullableString(raw['sourceReliability']),
    rawThesisText: nullableString(raw['rawThesisText']),
    collectedAt: nullableString(raw['collectedAt']),
    publishedAt: nullableString(raw['publishedAt']),
    sourceUrl: nullableString(raw['sourceUrl']),
    notes: nullableString(raw['notes']),
  };
}

function parseBlock(data: unknown): SrThesesBlock | null {
  if (!isRecord(data)) return null;
  if (data['schemaVersion'] !== '2.0') return null;
  const source = data['source'];
  const symbol = data['symbol'];
  const capturedAtIso = data['capturedAtIso'];
  if (typeof source !== 'string') return null;
  if (typeof symbol !== 'string') return null;
  if (typeof capturedAtIso !== 'string') return null;
  const capturedAtUnixMs = Date.parse(capturedAtIso);
  if (!Number.isFinite(capturedAtUnixMs) || capturedAtUnixMs <= 0) return null;
  const briefRaw = data['brief'];
  if (!isRecord(briefRaw)) return null;
  const briefId = briefRaw['briefId'];
  if (typeof briefId !== 'string') return null;
  const brief = {
    briefId,
    sourceRecordedAtIso: nullableString(briefRaw['sourceRecordedAtIso']),
    summary: nullableString(briefRaw['summary']),
  };
  const thesesRaw = data['theses'];
  if (!Array.isArray(thesesRaw)) return null;
  const theses: SrThesisDto[] = [];
  for (const item of thesesRaw) {
    const thesis = parseThesis(item);
    if (!thesis) return null;
    theses.push(thesis);
  }
  return {
    schemaVersion: '2.0',
    source,
    symbol,
    brief,
    capturedAtIso,
    capturedAtUnixMs,
    theses,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type AttemptOutcome =
  | { kind: 'block'; block: SrThesesBlock }
  | { kind: 'not-found' }
  | { kind: 'config-error' }
  | { kind: 'retryable'; reason: string }
  | { kind: 'upstream-fatal'; reason: string };

export class CurrentSrThesesAdapter implements SrThesesReadPort {
  constructor(
    private readonly baseUrl: string | null,
    private readonly observability: ObservabilityPort,
  ) {}

  async fetchCurrent(symbol: string, source: string): Promise<SrThesesReadResult> {
    if (!this.baseUrl) {
      this.observability.log('warn', 'SR theses disabled — no REGIME_ENGINE_BASE_URL configured');
      return { kind: 'config-error' };
    }
    let url: URL;
    try {
      url = new URL(`${this.baseUrl.replace(/\/+$/, '')}/v2/sr-levels/current`);
    } catch {
      this.observability.log('warn', 'SR theses base URL is malformed', { baseUrl: this.baseUrl });
      return { kind: 'config-error' };
    }
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('source', source);

    const first = await this.attempt(url);
    if (first.kind !== 'retryable') {
      return this.toResult(first);
    }
    await delay(RETRY_DELAY_MS);
    const second = await this.attempt(url);
    if (second.kind === 'retryable') {
      return { kind: 'upstream-error' };
    }
    return this.toResult(second);
  }

  private toResult(outcome: AttemptOutcome): SrThesesReadResult {
    switch (outcome.kind) {
      case 'block':
        return { kind: 'block', block: outcome.block };
      case 'not-found':
        return { kind: 'not-found' };
      case 'config-error':
        return { kind: 'config-error' };
      case 'retryable':
      case 'upstream-fatal':
        return { kind: 'upstream-error' };
    }
  }

  private async attempt(url: URL): Promise<AttemptOutcome> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url.toString(), { signal: controller.signal });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.observability.log('warn', 'SR theses fetch network error', { message });
      return { kind: 'retryable', reason: 'network' };
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 200) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        this.observability.log('warn', 'SR theses response was not valid JSON');
        return { kind: 'retryable', reason: 'invalid-json' };
      }
      const block = parseBlock(body);
      if (!block) {
        this.observability.log('warn', 'SR theses response failed shape validation');
        return { kind: 'retryable', reason: 'invalid-shape' };
      }
      if (block.theses.length === 0) {
        return { kind: 'not-found' };
      }
      return { kind: 'block', block };
    }

    if (response.status === 404) {
      return { kind: 'not-found' };
    }

    if (response.status === 400) {
      this.observability.log('warn', 'SR theses upstream rejected request as 400', {});
      return { kind: 'config-error' };
    }

    if (
      response.status === 429 ||
      response.status === 408 ||
      response.status === 503 ||
      response.status >= 500
    ) {
      this.observability.log('warn', 'SR theses upstream non-2xx (retryable)', {
        status: response.status,
      });
      return { kind: 'retryable', reason: `status-${response.status}` };
    }

    this.observability.log('warn', 'SR theses upstream non-2xx (fatal)', {
      status: response.status,
    });
    return { kind: 'upstream-fatal', reason: `status-${response.status}` };
  }
}
