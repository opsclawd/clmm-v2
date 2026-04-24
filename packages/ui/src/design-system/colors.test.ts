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

  it('has new design system semantic tokens', () => {
    expect(colors.appBackground).toBe('#070A0F');
    expect(colors.card).toBe('#0C1118');
    expect(colors.cardRaised).toBe('#121923');
    expect(colors.safe).toBe('#9EECD1');
    expect(colors.safeMuted).toBe('rgba(158,236,209,0.12)');
    expect(colors.warn).toBe('#F4C97A');
    expect(colors.breachAccent).toBe('#F59484');
    expect(colors.accent).toBe('#8FB8F5');
    expect(colors.textPrimary).toBe('#F4F6F8');
    expect(colors.textBody).toBe('#B6C0CE');
    expect(colors.textTertiary).toBe('#7C8695');
    expect(colors.textFaint).toBe('#4F5866');
    expect(colors.borderLight).toBe('rgba(255,255,255,0.10)');
    expect(colors.borderMedium).toBe('rgba(255,255,255,0.16)');
  });

  it('preserves original color values for existing keys', () => {
    expect(colors.breach).toBe('#fb923c');
    expect(colors.textSecondary).toBe('#94a3b8');
    expect(colors.textMuted).toBe('#64748b');
  });
});
