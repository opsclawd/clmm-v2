import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RangeBar } from './RangeBar.js';

afterEach(() => {
  cleanup();
});

describe('RangeBar', () => {
  it('renders the lower, current, and upper labels exactly as provided', () => {
    render(
      <RangeBar
        lowerBoundPrice={100}
        upperBoundPrice={200}
        currentPrice={150}
        lowerBoundLabel="USDC 100.00"
        upperBoundLabel="USDC 200.00"
        currentPriceLabel="USDC 150.00"
      />,
    );

    expect(screen.getByText('USDC 100.00')).toBeTruthy();
    expect(screen.getByText('USDC 200.00')).toBeTruthy();
    expect(screen.getByText('USDC 150.00')).toBeTruthy();
  });

  it('renders the tick element with testID when current price is well inside the visual domain', () => {
    render(
      <RangeBar
        lowerBoundPrice={100}
        upperBoundPrice={200}
        currentPrice={150}
        lowerBoundLabel="100"
        upperBoundLabel="200"
        currentPriceLabel="150"
      />,
    );

    expect(screen.getByTestId('range-bar-tick')).toBeTruthy();
  });

  it('still renders the tick when current price is far outside the visual domain (clamped)', () => {
    render(
      <RangeBar
        lowerBoundPrice={100}
        upperBoundPrice={200}
        currentPrice={1_000_000}
        lowerBoundLabel="100"
        upperBoundLabel="200"
        currentPriceLabel="1,000,000"
        breachSide="above"
      />,
    );

    expect(screen.getByTestId('range-bar-tick')).toBeTruthy();
    expect(screen.getByText('1,000,000')).toBeTruthy();
  });

  it('renders breach styling testID when breachSide is provided', () => {
    render(
      <RangeBar
        lowerBoundPrice={100}
        upperBoundPrice={200}
        currentPrice={250}
        lowerBoundLabel="100"
        upperBoundLabel="200"
        currentPriceLabel="250"
        breachSide="above"
      />,
    );

    expect(screen.getByTestId('range-bar-breach-above')).toBeTruthy();
  });

  it('does not render breach decoration when breachSide is undefined', () => {
    render(
      <RangeBar
        lowerBoundPrice={100}
        upperBoundPrice={200}
        currentPrice={150}
        lowerBoundLabel="100"
        upperBoundLabel="200"
        currentPriceLabel="150"
      />,
    );

    expect(screen.queryByTestId('range-bar-breach-above')).toBeNull();
    expect(screen.queryByTestId('range-bar-breach-below')).toBeNull();
  });

  it('renders labels without crashing when bounds collapse to a single point', () => {
    render(
      <RangeBar
        lowerBoundPrice={100}
        upperBoundPrice={100}
        currentPrice={100}
        lowerBoundLabel="100"
        upperBoundLabel="100"
        currentPriceLabel="100"
      />,
    );

    expect(screen.getAllByText('100').length).toBe(3);
  });
});
