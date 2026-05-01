export type ClmmExecutionEventRequest = {
  schemaVersion: "1.0";
  correlationId: string;
  positionId: string;
  breachDirection: "LowerBoundBreach" | "UpperBoundBreach";
  reconciledAtIso: string;
  txSignature: string;
  tokenOut: "SOL" | "USDC";
  status: "confirmed" | "failed";
  episodeId?: string;
  previewId?: string;
  detectedAtIso?: string;
  amountOutRaw?: string;
  txFeesUsd?: number;
  priorityFeesUsd?: number;
  slippageUsd?: number;
};

// Drift guard: SrLevel and SrLevelsBlock are structurally duplicated in
// packages/application/src/dto/index.ts. Any field change here MUST be
// mirrored there. The duplication is intentional — application must not
// import from adapters (boundaries rule).
export type SrLevel = {
  price: number;
  rank?: string;
  timeframe?: string;
  invalidation?: number;
  notes?: string;
};

export type SrLevelsBlock = {
  briefId: string;
  sourceRecordedAtIso: string | null;
  summary: string | null;
  capturedAtUnixMs: number;
  supports: SrLevel[];
  resistances: SrLevel[];
};

export interface RegimeEngineEventPort {
  notifyExecutionEvent(event: ClmmExecutionEventRequest): Promise<void>;
}

/**
 * @deprecated Use SrLevelsReadPort from @clmm/application instead.
 * CurrentSrLevelsPort exists only for the existing SrLevelsController.
 * Once SrLevelsController migrates to the application port, this interface
 * and its DI token (CURRENT_SR_LEVELS_PORT) can be removed.
 */
export interface CurrentSrLevelsPort {
  fetchCurrent(symbol: string, source: string): Promise<SrLevelsBlock | null>;
}
