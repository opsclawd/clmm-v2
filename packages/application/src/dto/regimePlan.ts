export type RegimePlanActionType = 'HOLD' | 'STAND_DOWN' | 'REQUEST_EXIT_CLMM';

export type RegimePlanExitPosture = 'ExitToUSDC' | 'ExitToSOL';

export type RegimePlanExitIntent = {
  posture: RegimePlanExitPosture;
};

export type RegimePlanAction = {
  type: RegimePlanActionType;
  reasonCode: string;
  exitIntent?: RegimePlanExitIntent;
};

export type RegimePlanScope = {
  kind: 'position';
  positionId: string;
  poolAddress: string;
  symbol: string;
};

export type RegimePlanConstraints = {
  cooldownUntilUnixMs: number;
  standDownUntilUnixMs: number;
  notes: string[];
};

export type RegimePlanReason = {
  code: string;
  severity: 'INFO' | 'WARN' | 'ERROR';
  message: string;
};

export type RegimePlanRequestConfig = {
  regime: {
    confirmBars: number;
    minHoldBars: number;
    enterUpTrend: number;
    exitUpTrend: number;
    enterDownTrend: number;
    exitDownTrend: number;
    chopVolRatioMax: number;
  };
  allocation: {
    upSolBps: number;
    downSolBps: number;
    chopSolBps: number;
    maxDeltaExposureBpsPerDay: number;
    maxTurnoverPerDayBps: number;
  };
  churn: {
    maxStopouts24h: number;
    maxRedeploys24h: number;
    cooldownMsAfterStopout: number;
    standDownTriggerStrikes: number;
  };
  baselines: {
    dcaIntervalDays: number;
    dcaAmountUsd: number;
    usdcCarryApr: number;
  };
};

export type ResolveRegimePlanRequestConfigResult =
  | { kind: 'configured'; config: RegimePlanRequestConfig }
  | { kind: 'missing' }
  | { kind: 'invalid'; error: string };

export type RegimePlanRequest = {
  schemaVersion: '1.0';
  asOfUnixMs: number;
  market: {
    symbol: string;
    source: string;
    network: string;
    poolAddress: string;
    timeframe: '15m' | '1h';
  };
  position: {
    positionId: string;
    walletId?: string;
    observedAtUnixMs: number;
    breachQualifiedAtUnixMs?: number;
    lowerBoundPrice: number;
    upperBoundPrice: number;
    currentPrice: number;
    rangeState: 'in-range' | 'below-range' | 'above-range';
    breachQualified: boolean;
    distanceToLowerPct?: number;
    distanceToUpperPct?: number;
    liquidityUsd?: number;
    unclaimedFeesUsd?: number;
    inventorySkewSolPct?: number;
    inventorySkewUsdcPct?: number;
  };
  portfolio: {
    navUsd: number;
    solUnits: number;
    usdcUnits: number;
  };
  autopilotState: {
    activeClmm: boolean;
    stopouts24h: number;
    redeploys24h: number;
    cooldownUntilUnixMs: number;
    standDownUntilUnixMs: number;
    strikeCount: number;
  };
  regimeState?: {
    current: 'UP' | 'DOWN' | 'CHOP';
    barsInRegime: number;
    pending: 'UP' | 'DOWN' | 'CHOP' | null;
    pendingBars: number;
  };
  config: RegimePlanRequestConfig;
};

export type RegimePlanTargets = {
  solBps: number;
  usdcBps: number;
  allowClmm: boolean;
};

export type RegimePlanNextRegimeState = {
  current: 'UP' | 'DOWN' | 'CHOP';
  barsInRegime: number;
  pending: 'UP' | 'DOWN' | 'CHOP' | null;
  pendingBars: number;
};

export type RegimePlanTelemetry = Record<string, number | string | boolean>;

export type RegimeCurrentFreshness = {
  generatedAtIso: string;
  lastCandleOpenUnixMs: number;
  lastCandleOpenIso: string;
  lastCandleCloseUnixMs: number;
  lastCandleCloseIso: string;
  ageSeconds: number;
  softStale: boolean;
  hardStale: boolean;
  softStaleSeconds: number;
  hardStaleSeconds: number;
};

export type RegimePlanMarketData = {
  source: string;
  network: string;
  poolAddress: string;
  requestedTimeframe: '15m' | '1h';
  sourceTimeframe: string;
  candleCount: number;
  sourceCandleCount: number;
  freshness: RegimeCurrentFreshness;
  derivedTimeframe?: string;
  aggregationVersion?: string;
};

export type RegimePlanResponse = {
  schemaVersion: '1.0';
  planId: string;
  planHash: string;
  asOfUnixMs: number;
  scope: RegimePlanScope;
  regime: 'UP' | 'DOWN' | 'CHOP';
  targets: RegimePlanTargets;
  actions: RegimePlanAction[];
  constraints: RegimePlanConstraints;
  nextRegimeState: RegimePlanNextRegimeState;
  reasons: RegimePlanReason[];
  telemetry: RegimePlanTelemetry;
  marketData: RegimePlanMarketData;
};

export type RegimeExecutionResultStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED';

export type RegimeExecutionResultCosts = {
  txFeesUsd?: number;
  priorityFeesUsd?: number;
  slippageUsd?: number;
};

export type RegimeExecutionResult = {
  schemaVersion: '1.0';
  planId: string;
  planHash: string;
  positionId: string;
  requestedAction: RegimePlanActionType;
  status: RegimeExecutionResultStatus;
  reasonCode: string;
  completedAtUnixMs: number;
  idempotencyKey: string;
  attemptId?: string;
  txSignature?: string;
  costs?: RegimeExecutionResultCosts;
};
