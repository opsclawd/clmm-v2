import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));

function readText(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), 'utf8');
}

describe('positions route evidence navigation', () => {
  it('navigates to evidence without fetching it from positions', () => {
    const routeSource = readText('../app/(tabs)/positions.tsx');

    expect(routeSource).toContain('evidenceEnabled={policyInsightsEnabled}');
    expect(routeSource).toContain('onViewEvidence={() =>');
    expect(routeSource).toContain('navigateRoute({');
    expect(routeSource).toContain("path: '/evidence'");
    expect(routeSource).toContain("method: 'push'");

    expect(routeSource).not.toContain('fetchCurrentEvidence');
    expect(routeSource).not.toContain("queryKey: ['evidence-current'");
  });
});
