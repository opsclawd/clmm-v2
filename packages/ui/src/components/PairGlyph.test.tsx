import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PairGlyph } from './PairGlyph.js';

afterEach(() => {
  cleanup();
});

describe('PairGlyph', () => {
  it('renders two populated token glyphs for a canonical pair label', () => {
    render(<PairGlyph label="SOL/USDC" />);

    expect(screen.getAllByTestId('token-glyph')).toHaveLength(2);
    expect(screen.getByText('SOL')).toBeTruthy();
    expect(screen.getByText('USD')).toBeTruthy();
  });

  it('renders one glyph with the original abbreviation for a non-pair label', () => {
    render(<PairGlyph label="SOL-USDC" />);

    expect(screen.getAllByTestId('token-glyph')).toHaveLength(1);
    expect(screen.getByText('SOL')).toBeTruthy();
    expect(screen.getByTestId('pair-glyph-single')).toBeTruthy();
  });

  it.each(['', '   ', 'SOL/', '/USDC', 'SOL//USDC', 'SOL/USDC/ETH'])(
    'renders one non-empty unknown glyph for blank and malformed slash labels: %j',
    (label) => {
      render(<PairGlyph label={label} />);

      expect(screen.getAllByTestId('token-glyph')).toHaveLength(1);
      expect(screen.getByText('?')).toBeTruthy();
      expect(screen.getByTestId('pair-glyph-single')).toBeTruthy();
      cleanup();
    },
  );

  it('uses the configured size for both pair and single container layouts', () => {
    const { rerender } = render(<PairGlyph label="SOL/USDC" size={30} />);
    const pair = screen.getByTestId('pair-glyph-pair');
    expect(pair.style.width).toBe('46.5px');
    expect(pair.style.height).toBe('30px');

    rerender(<PairGlyph label="BONK" size={30} />);
    const single = screen.getByTestId('pair-glyph-single');
    expect(single.style.width).toBe('30px');
    expect(single.style.height).toBe('30px');
  });
});
