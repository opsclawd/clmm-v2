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
