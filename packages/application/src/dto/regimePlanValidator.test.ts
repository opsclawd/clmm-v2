import { describe, expect, it } from 'vitest';
import {
  parseRegimePlanResponse,
  parseRegimeExecutionResult,
  parseRegimePlanRequest,
} from './regimePlanValidator.js';
import holdFixture from '../../../../schemas/regime-engine/position-plan.v1/fixtures/valid/hold.json' with { type: 'json' };
import requestExitFixture from '../../../../schemas/regime-engine/position-plan.v1/fixtures/valid/request-exit.json' with { type: 'json' };
import productionRedactedFixture from '../../../../schemas/regime-engine/position-plan.v1/fixtures/valid/production-response-redacted.json' with { type: 'json' };
import successFixture from '../../../../schemas/regime-engine/execution-result.v1/fixtures/valid/success.json' with { type: 'json' };
import inRangeRequestFixture from '../../../../schemas/regime-engine/plan-request.v1/fixtures/valid/in-range.json' with { type: 'json' };
import breachQualifiedRequestFixture from '../../../../schemas/regime-engine/plan-request.v1/fixtures/valid/breach-qualified.json' with { type: 'json' };

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

type MutableFixture = Record<string, unknown>;

describe('regimePlanValidator', () => {
  it('accepts the redacted production response without modification', () => {
    expect(parseRegimePlanResponse(productionRedactedFixture)).not.toBeNull();
  });

  it('rejects a response missing a required production sub-shape', () => {
    const missingTargets = deepClone(productionRedactedFixture) as MutableFixture;
    delete missingTargets['targets'];
    expect(parseRegimePlanResponse(missingTargets)).toBeNull();

    const missingNextRegime = deepClone(productionRedactedFixture) as MutableFixture;
    delete missingNextRegime['nextRegimeState'];
    expect(parseRegimePlanResponse(missingNextRegime)).toBeNull();

    const missingTelemetry = deepClone(productionRedactedFixture) as MutableFixture;
    delete missingTelemetry['telemetry'];
    expect(parseRegimePlanResponse(missingTelemetry)).toBeNull();

    const missingMarketData = deepClone(productionRedactedFixture) as MutableFixture;
    delete missingMarketData['marketData'];
    expect(parseRegimePlanResponse(missingMarketData)).toBeNull();
  });

  it('rejects malformed nested production sub-shapes', () => {
    const malformedTargets = deepClone(productionRedactedFixture) as MutableFixture;
    malformedTargets['targets'] = { solBps: 'invalid-type' };
    expect(parseRegimePlanResponse(malformedTargets)).toBeNull();

    const malformedNextRegime = deepClone(productionRedactedFixture) as MutableFixture;
    malformedNextRegime['nextRegimeState'] = { current: 'INVALID_REGIME' };
    expect(parseRegimePlanResponse(malformedNextRegime)).toBeNull();

    const malformedMarketData = deepClone(productionRedactedFixture) as MutableFixture;
    malformedMarketData['marketData'] = { source: '' };
    expect(parseRegimePlanResponse(malformedMarketData)).toBeNull();
  });

  it('rejects the legacy expiresAtUnixMs response shape', () => {
    const legacyResponse = deepClone(holdFixture) as MutableFixture;
    legacyResponse['expiresAtUnixMs'] = 1700003600000;
    expect(parseRegimePlanResponse(legacyResponse)).toBeNull();
  });

  it('accepts the shared schemaVersion 1.0 for plan-request and position-plan contracts', () => {
    expect(parseRegimePlanResponse(holdFixture)).not.toBeNull();
    expect(parseRegimePlanRequest(inRangeRequestFixture)).not.toBeNull();
  });

  it('rejects the old endpoint-named schema versions for plan-request and position-plan contracts', () => {
    const legacyPlan = deepClone(holdFixture) as MutableFixture;
    legacyPlan['schemaVersion'] = 'position-plan.v1';
    expect(parseRegimePlanResponse(legacyPlan)).toBeNull();

    const legacyRequest = deepClone(inRangeRequestFixture) as MutableFixture;
    legacyRequest['schemaVersion'] = 'plan-request.v1';
    expect(parseRegimePlanRequest(legacyRequest)).toBeNull();
  });

  it('accepts the shared schemaVersion 1.0 for execution-result contract', () => {
    expect(parseRegimeExecutionResult(successFixture)).not.toBeNull();
  });

  it('rejects the old endpoint-named schema version for execution-result contract', () => {
    const legacyResult = deepClone(successFixture) as MutableFixture;
    legacyResult['schemaVersion'] = 'execution-result.v1';
    expect(parseRegimeExecutionResult(legacyResult)).toBeNull();
  });

  it('rejects unsupported plan actions and schema versions', () => {
    const invalidAction = deepClone(holdFixture) as MutableFixture;
    const actions = invalidAction['actions'] as Array<Record<string, unknown>>;
    actions[0]!['type'] = 'REQUEST_ENTER_CLMM';
    expect(parseRegimePlanResponse(invalidAction)).toBeNull();

    const invalidVersion = deepClone(holdFixture) as MutableFixture;
    invalidVersion['schemaVersion'] = 'position-plan.v999';
    expect(parseRegimePlanResponse(invalidVersion)).toBeNull();

    const invalidExecStatus = deepClone(successFixture) as MutableFixture;
    invalidExecStatus['status'] = 'UNKNOWN_STATUS';
    expect(parseRegimeExecutionResult(invalidExecStatus)).toBeNull();

    const invalidExecVersion = deepClone(successFixture) as MutableFixture;
    invalidExecVersion['schemaVersion'] = 'execution-result.v999';
    expect(parseRegimeExecutionResult(invalidExecVersion)).toBeNull();

    const invalidExecHash = deepClone(successFixture) as MutableFixture;
    invalidExecHash['planHash'] = 'invalid-hash-string';
    expect(parseRegimeExecutionResult(invalidExecHash)).toBeNull();

    const missingExecField = deepClone(successFixture) as MutableFixture;
    delete missingExecField['positionId'];
    expect(parseRegimeExecutionResult(missingExecField)).toBeNull();
  });

  it('rejects a request-exit plan without canonical exit intent', () => {
    const noExitIntent = deepClone(requestExitFixture) as MutableFixture;
    const actions1 = noExitIntent['actions'] as Array<Record<string, unknown>>;
    delete actions1[0]!['exitIntent'];
    expect(parseRegimePlanResponse(noExitIntent)).toBeNull();

    const invalidExitIntent = deepClone(requestExitFixture) as MutableFixture;
    const actions2 = invalidExitIntent['actions'] as Array<Record<string, unknown>>;
    actions2[0]!['exitIntent'] = { posture: 'InvalidPosture' };
    expect(parseRegimePlanResponse(invalidExitIntent)).toBeNull();
  });

  it('does not admit inline candles regime state or portfolio allocations', () => {
    const withCandles = deepClone(holdFixture) as MutableFixture;
    withCandles['candles'] = [{ open: 100, close: 105 }];
    expect(parseRegimePlanResponse(withCandles)).toBeNull();

    const withRegimeState = deepClone(holdFixture) as MutableFixture;
    withRegimeState['regimeState'] = { current: 'UP', barsInRegime: 5 };
    expect(parseRegimePlanResponse(withRegimeState)).toBeNull();

    const withPortfolioAllocations = deepClone(holdFixture) as MutableFixture;
    withPortfolioAllocations['portfolioAllocations'] = { solBps: 5000, usdcBps: 5000 };
    expect(parseRegimePlanResponse(withPortfolioAllocations)).toBeNull();
  });

  it('parses valid plan response fixtures cleanly', () => {
    expect(parseRegimePlanResponse(holdFixture)).not.toBeNull();
    expect(parseRegimePlanResponse(requestExitFixture)).not.toBeNull();
  });

  it('parses valid execution result fixtures cleanly', () => {
    expect(parseRegimeExecutionResult(successFixture)).not.toBeNull();
  });

  it('parses valid plan request fixtures cleanly', () => {
    expect(parseRegimePlanRequest(inRangeRequestFixture)).not.toBeNull();
    expect(parseRegimePlanRequest(breachQualifiedRequestFixture)).not.toBeNull();
  });

  it('rejects invalid plan requests missing required fields', () => {
    const missingPortfolio = deepClone(inRangeRequestFixture) as MutableFixture;
    delete missingPortfolio['portfolio'];
    expect(parseRegimePlanRequest(missingPortfolio)).toBeNull();
  });

  it('rejects invalid hashes', () => {
    const invalidHash = deepClone(holdFixture) as MutableFixture;
    invalidHash['planHash'] = 'not-a-valid-sha256-hash';
    expect(parseRegimePlanResponse(invalidHash)).toBeNull();
  });
});
