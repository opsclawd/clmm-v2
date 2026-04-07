import { describe, it, expect } from 'vitest';
import { colors } from './colors.js';

describe('colors', () => {
  it('has deep slate background instead of pure black', () => {
    expect(colors.background).not.toBe('#000000');
    expect(colors.background).toBe('#0f1219');
  });

  it('has layered surface tokens', () => {
    expect(colors.surface).toBeDefined();
    expect(colors.surfaceElevated).toBeDefined();
    expect(colors.surfaceRecessed).toBeDefined();
  });

  it('has semantic state colors', () => {
    expect(colors.success).toBeDefined();
    expect(colors.pending).toBeDefined();
    expect(colors.terminal).toBeDefined();
  });

  it('has all required color keys', () => {
    const requiredKeys = [
      'background', 'surface', 'surfaceElevated', 'surfaceRecessed',
      'primary', 'warning', 'danger', 'breach',
      'success', 'pending', 'terminal',
      'text', 'textSecondary', 'textMuted',
      'border', 'borderSubtle',
      'downsideArrow', 'upsideArrow',
    ];
    for (const key of requiredKeys) {
      expect(colors).toHaveProperty(key);
    }
  });
});
