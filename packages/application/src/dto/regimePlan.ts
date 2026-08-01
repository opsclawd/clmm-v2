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

export type RegimePlanResponse = {
  schemaVersion: '1.0';
  planId: string;
  planHash: string;
  asOfUnixMs: number;
  expiresAtUnixMs: number;
  scope: RegimePlanScope;
  regime: 'UP' | 'DOWN' | 'CHOP';
  actions: RegimePlanAction[];
  constraints: RegimePlanConstraints;
  reasons: RegimePlanReason[];
};

export type RegimeExecutionResultStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED';

export type RegimeExecutionResultCosts = {
  txFeesUsd?: number;
  priorityFeesUsd?: number;
  slippageUsd?: number;
};

export type RegimeExecutionResult = {
  schemaVersion: 'execution-result.v1';
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
