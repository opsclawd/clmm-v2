import type { CurrentSrLevelsPort, SrLevelsBlock, SrLevel } from './types.js';
import type { ObservabilityPort } from '@clmm/application';

export class CurrentSrLevelsAdapter implements CurrentSrLevelsPort {
  private hasLoggedDisabled = false;

  constructor(
    private readonly baseUrl: string | null,
    private readonly observability: ObservabilityPort,
  ) {}

  async fetchCurrent(symbol: string, source: string): Promise<SrLevelsBlock | null> {
    if (!this.baseUrl) {
      if (!this.hasLoggedDisabled) {
        this.observability.log('warn', 'SR levels disabled — no REGIME_ENGINE_BASE_URL configured');
        this.hasLoggedDisabled = true;
      }
      return null;
    }

    try {
      const url = `${this.baseUrl.replace(/\/+$/, '')}/v1/sr-levels/current?symbol=${encodeURIComponent(symbol)}&source=${encodeURIComponent(source)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);

      const res = await fetch(url, { signal: controller.signal });

      if (res.status === 404) { clearTimeout(timeout); return null; }

      if (!res.ok) {
        clearTimeout(timeout);
        this.observability.log('warn', `SR levels fetch failed: status ${res.status}`, { symbol, source, status: res.status });
        return null;
      }

      const data = await res.json() as Record<string, unknown>;
      clearTimeout(timeout);

      if (typeof data['capturedAtIso'] !== 'string' || !Array.isArray(data['supports']) || !Array.isArray(data['resistances'])) {
        this.observability.log('warn', 'SR levels response has unexpected shape', { symbol, source });
        return null;
      }

      const capturedAtUnixMs = Date.parse(String(data['capturedAtIso']));
      if (!Number.isFinite(capturedAtUnixMs)) {
        this.observability.log('warn', 'SR levels response has invalid capturedAtIso', { symbol, source });
        return null;
      }

      const validateLevels = (arr: unknown[]): SrLevel[] | null => {
        const levels: SrLevel[] = [];
        for (const item of arr) {
          if (typeof item !== 'object' || item === null) return null;
          const rec = item as Record<string, unknown>;
          if (typeof rec['price'] !== 'number' || !Number.isFinite(rec['price'])) return null;
          levels.push({
            price: rec['price'],
            ...(rec['rank'] != null ? { rank: String(rec['rank']) } : {}),
            ...(rec['timeframe'] != null ? { timeframe: String(rec['timeframe']) } : {}),
            ...(rec['invalidation'] != null && typeof rec['invalidation'] === 'number' ? { invalidation: rec['invalidation'] } : {}),
            ...(rec['notes'] != null ? { notes: String(rec['notes']) } : {}),
          });
        }
        return levels;
      };

      const supports = validateLevels(data['supports'] as unknown[]);
      const resistances = validateLevels(data['resistances'] as unknown[]);
      if (!supports || !resistances) {
        this.observability.log('warn', 'SR levels response has invalid level entries', { symbol, source });
        return null;
      }

      const sortByPrice = (a: SrLevel, b: SrLevel) => a.price - b.price;

      return {
        briefId: String(data['briefId'] ?? ''),
        sourceRecordedAtIso: data['sourceRecordedAtIso'] != null ? String(data['sourceRecordedAtIso']) : null,
        summary: data['summary'] != null ? String(data['summary']) : null,
        capturedAtUnixMs,
        supports: supports.sort(sortByPrice),
        resistances: resistances.sort(sortByPrice),
      };
    } catch (error: unknown) {
      this.observability.log('warn', 'SR levels fetch error', { symbol, source, error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }
}
