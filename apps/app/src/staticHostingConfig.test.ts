import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type WranglerConfig = {
  assets?: {
    directory?: string;
    not_found_handling?: string;
  };
};

function readWranglerConfig(): WranglerConfig {
  const configPath = path.resolve(process.cwd(), '../../wrangler.jsonc');
  const source = readFileSync(configPath, 'utf8');
  return JSON.parse(source) as WranglerConfig;
}

describe('static hosting config', () => {
  it('serves app routes through SPA fallback when assets miss concrete files', () => {
    const config = readWranglerConfig();

    expect(config.assets?.directory).toBe('./apps/app/dist');
    expect(config.assets?.not_found_handling).toBe('single-page-application');
  });
});
