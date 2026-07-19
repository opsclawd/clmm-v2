import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RangeBar } from './RangeBar.js';

afterEach(() => {
  cleanup();
});

describe('RangeBar', () => {
  it('renders Price unavailable with accessible unavailable text and no authoritative elements', () => {
    render(
      <RangeBar
        displayState={{ kind: 'unavailable', reason: 'current_price_non_finite' }}
        lowerBoundLabel="USDC 100.00"
        upperBoundLabel="USDC 200.00"
        currentPriceLabel="∞"
        breachSide="above"
      />,
    );
    expect(screen.getByText('Price unavailable')).toBeTruthy();
    expect(screen.getByLabelText('Price range unavailable')).toBeTruthy();
    expect(screen.queryByTestId('range-bar-tick')).toBeNull();
    expect(screen.queryByTestId('range-bar-active-band')).toBeNull();
    expect(screen.queryByTestId('range-bar-breach-above')).toBeNull();
    expect(screen.queryByText('∞')).toBeNull();
  });

  it('renders a genuine midpoint with a tick and without unavailable copy', () => {
    render(
      <RangeBar
        displayState={{
          kind: 'available',
          bandLeftPercent: 25,
          bandRightPercent: 75,
          markerPercent: 50,
        }}
        lowerBoundLabel="USDC 100.00"
        upperBoundLabel="USDC 200.00"
        currentPriceLabel="USDC 150.00"
      />,
    );
    expect(screen.getByTestId('range-bar-tick')).toBeTruthy();
    expect(screen.queryByText('Price unavailable')).toBeNull();
  });

  it('renders directional breach decoration only for available states', () => {
    render(
      <RangeBar
        displayState={{
          kind: 'available',
          bandLeftPercent: 10,
          bandRightPercent: 90,
          markerPercent: 95,
        }}
        lowerBoundLabel="USDC 100.00"
        upperBoundLabel="USDC 200.00"
        currentPriceLabel="USDC 195.00"
        breachSide="above"
      />,
    );
    expect(screen.getByTestId('range-bar-breach-above')).toBeTruthy();
    expect(screen.queryByText('Price unavailable')).toBeNull();
  });

  it('renders provided numeric labels only for available states', () => {
    render(
      <RangeBar
        displayState={{
          kind: 'available',
          bandLeftPercent: 25,
          bandRightPercent: 75,
          markerPercent: 50,
        }}
        lowerBoundLabel="USDC 100.00"
        upperBoundLabel="USDC 200.00"
        currentPriceLabel="USDC 150.00"
      />,
    );
    expect(screen.getByText('USDC 100.00')).toBeTruthy();
    expect(screen.getByText('USDC 200.00')).toBeTruthy();
    expect(screen.getByText('USDC 150.00')).toBeTruthy();
  });

  it('renders below breach decoration for available state with breachSide below', () => {
    render(
      <RangeBar
        displayState={{
          kind: 'available',
          bandLeftPercent: 10,
          bandRightPercent: 90,
          markerPercent: 5,
        }}
        lowerBoundLabel="100"
        upperBoundLabel="200"
        currentPriceLabel="50"
        breachSide="below"
      />,
    );
    expect(screen.getByTestId('range-bar-breach-below')).toBeTruthy();
    expect(screen.queryByTestId('range-bar-breach-above')).toBeNull();
  });

  it('does not render breach decoration when breachSide is not provided', () => {
    render(
      <RangeBar
        displayState={{
          kind: 'available',
          bandLeftPercent: 25,
          bandRightPercent: 75,
          markerPercent: 50,
        }}
        lowerBoundLabel="100"
        upperBoundLabel="200"
        currentPriceLabel="150"
      />,
    );
    expect(screen.queryByTestId('range-bar-breach-above')).toBeNull();
    expect(screen.queryByTestId('range-bar-breach-below')).toBeNull();
  });
});
