// V2 S/R thesis DTOs — emitted by regime-engine GET /v2/sr-levels/current.
// `bias`, `setupType`, and `sourceReliability` are intentionally `string`
// (or `string | null`) — they MUST NOT be narrowed to enums anywhere in
// adapters, ports, BFF, app client, or UI. UI may map known strings to
// presentation tone but must not reject unknown values.
export type SrThesisDto = {
  asset: string;
  timeframe: string;
  bias: string | null;
  setupType: string | null;
  supportLevels: string[];
  resistanceLevels: string[];
  entryZone: string | null;
  targets: string[];
  invalidation: string | null;
  trigger: string | null;
  chartReference: string | null;
  sourceHandle: string;
  sourceChannel: string | null;
  sourceKind: string;
  sourceReliability: string | null;
  rawThesisText: string | null;
  collectedAt: string | null;
  publishedAt: string | null;
  sourceUrl: string | null;
  notes: string | null;
};

export type SrThesesBlock = {
  schemaVersion: '2.0';
  source: string;
  symbol: string;
  brief: {
    briefId: string;
    sourceRecordedAtIso: string | null;
    summary: string | null;
  };
  capturedAtIso: string;
  capturedAtUnixMs: number;
  theses: SrThesisDto[];
};
