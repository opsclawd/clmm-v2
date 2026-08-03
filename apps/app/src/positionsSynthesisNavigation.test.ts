import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));

function readText(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), 'utf8');
}

describe('positions synthesis navigation & route composition', () => {
  it('positions route navigates canonical recommendations to synthesis', () => {
    const positionsSource = readText('../app/(tabs)/positions.tsx');

    expect(positionsSource).toContain('onViewSynthesis={() =>');
    expect(positionsSource).toContain('navigateRoute({');
    expect(positionsSource).toContain("path: '/synthesis'");
    expect(positionsSource).toContain("method: 'push'");
  });

  it('synthesis route owns no duplicate client or navigation payload', () => {
    const synthesisSource = readText('../app/synthesis.tsx');
    const positionsSource = readText('../app/(tabs)/positions.tsx');

    expect(synthesisSource).toContain(
      "import { fetchCurrentPolicyInsight } from '../src/api/policyInsights'",
    );
    expect(synthesisSource).toContain("queryKey: ['policy-insights-current', 'SOL/USDC']");
    expect(positionsSource).not.toContain("path: '/synthesis?");
    expect(positionsSource).not.toContain('params:');
  });

  it('synthesis route maps query state without hiding cached data', () => {
    const synthesisSource = readText('../app/synthesis.tsx');

    expect(synthesisSource).toContain(
      'policyInsight={policyInsightsQuery.data?.policyInsight ?? null}',
    );
    expect(synthesisSource).toContain(
      'isLoading={policyInsightsQuery.isLoading || policyInsightsQuery.isFetching}',
    );
    expect(synthesisSource).toContain('isError={policyInsightsQuery.isError}');
    expect(synthesisSource).toContain(
      'unavailableReason={policyInsightsQuery.data?.unavailableReason ?? null}',
    );
  });

  it('synthesis route links back and to the current evidence route', () => {
    const synthesisSource = readText('../app/synthesis.tsx');

    expect(synthesisSource).toContain('onBack={() => router.back()}');
    expect(synthesisSource).toContain('onViewEvidence={() =>');
    expect(synthesisSource).toContain('navigateRoute({');
    expect(synthesisSource).toContain("path: '/evidence'");
    expect(synthesisSource).toContain("method: 'push'");
    expect(synthesisSource).not.toContain('bundleHash');
    expect(synthesisSource).not.toContain('referenceId');
  });

  it('synthesis route does not import adapters or Solana libraries', () => {
    const synthesisSource = readText('../app/synthesis.tsx');

    expect(synthesisSource).not.toContain('@solana');
    expect(synthesisSource).not.toContain('adapters');
    expect(synthesisSource).not.toContain('@orca-so');
  });
});
