import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SigningStatusScreen } from './SigningStatusScreen.js';

afterEach(() => {
  cleanup();
});

describe('SigningStatusScreen', () => {
  it('allows retry when the wallet is connected and the attempt is still awaiting signature', () => {
    const onSignAndExecute = vi.fn();

    render(
      <SigningStatusScreen
        lifecycleState={{ kind: 'awaiting-signature' }}
        breachDirection={{ kind: 'lower-bound-breach' }}
        retryEligible={false}
        signingState="error"
        signingError="Signature expired"
        onSignAndExecute={onSignAndExecute}
        walletConnected
      />,
    );

    fireEvent.click(screen.getByText('Try Again'));

    expect(onSignAndExecute).toHaveBeenCalledTimes(1);
  });

  it('disables retry once the attempt has moved beyond awaiting signature', () => {
    const onSignAndExecute = vi.fn();

    render(
      <SigningStatusScreen
        lifecycleState={{ kind: 'failed' }}
        breachDirection={{ kind: 'lower-bound-breach' }}
        retryEligible={false}
        signingState="error"
        signingError="Submit failed"
        onSignAndExecute={onSignAndExecute}
        walletConnected
      />,
    );

    fireEvent.click(screen.getByText('Try Again'));

    expect(onSignAndExecute).not.toHaveBeenCalled();
  });

  it('disables retry when no wallet is connected even if the attempt is awaiting signature', () => {
    const onSignAndExecute = vi.fn();

    render(
      <SigningStatusScreen
        lifecycleState={{ kind: 'awaiting-signature' }}
        breachDirection={{ kind: 'lower-bound-breach' }}
        retryEligible={false}
        signingState="error"
        signingError="Wallet disconnected"
        onSignAndExecute={onSignAndExecute}
        walletConnected={false}
      />,
    );

    fireEvent.click(screen.getByText('Try Again'));

    expect(onSignAndExecute).not.toHaveBeenCalled();
  });
});
