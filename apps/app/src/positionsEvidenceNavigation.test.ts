import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));

function readText(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), 'utf8');
}

describe('positions route evidence navigation', () => {
  it('enables scoped evidence navigation for the supported position pool', () => {
    const positionDetailSource = readText('../app/position/[id].tsx');

    expect(positionDetailSource).toContain(
      "const SOL_USDC_SUPPORTED_POOL_ID = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';",
    );
    expect(positionDetailSource).toContain(
      'const evidenceEnabled = position?.poolId === SOL_USDC_SUPPORTED_POOL_ID;',
    );
    expect(positionDetailSource).toContain('evidenceEnabled={evidenceEnabled}');
  });

  it('does not enable evidence navigation for an unsupported position pool', () => {
    const positionDetailSource = readText('../app/position/[id].tsx');

    expect(positionDetailSource).toContain(
      'const evidenceEnabled = position?.poolId === SOL_USDC_SUPPORTED_POOL_ID;',
    );
    expect(positionDetailSource).toContain('evidenceEnabled={evidenceEnabled}');
  });

  it('navigates from position detail with only the encoded position identifier', () => {
    const positionDetailSource = readText('../app/position/[id].tsx');

    expect(positionDetailSource).toContain('onViewEvidence={() =>');
    expect(positionDetailSource).toContain(
      'path: `/evidence?positionId=${encodeURIComponent(positionId)}`',
    );
    expect(positionDetailSource).not.toContain('walletAddress=${');
  });

  it('keeps existing pair evidence navigation unscoped', () => {
    const positionsSource = readText('../app/(tabs)/positions.tsx');
    const positionDetailSource = readText('../app/position/[id].tsx');

    expect(positionsSource).toContain("path: '/evidence'");
    expect(positionsSource).not.toContain('fetchCurrentEvidence');
    expect(positionDetailSource).not.toContain('fetchCurrentEvidence');
  });
});
