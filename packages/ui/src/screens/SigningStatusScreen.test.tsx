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

  it('renders statusError as a banner when lifecycleState is present', () => {
    render(
      <SigningStatusScreen
        lifecycleState={{ kind: 'awaiting-signature' }}
        signingState="idle"
        statusError="Could not load signing payload"
        onSignAndExecute={vi.fn()}
        walletConnected
      />,
    );

    expect(screen.getByText('Could not load signing payload')).toBeDefined();
  });

  it('does not render statusError content when statusError is null', () => {
    render(
      <SigningStatusScreen
        lifecycleState={{ kind: 'awaiting-signature' }}
        signingState="idle"
        statusError={null}
        onSignAndExecute={vi.fn()}
        walletConnected
      />,
    );

    expect(screen.queryByText('Could not load signing payload')).toBeNull();
  });

  it('renders statusError exactly once even when signingState is error', () => {
    render(
      <SigningStatusScreen
        lifecycleState={{ kind: 'awaiting-signature' }}
        signingState="error"
        signingError="Submit failed"
        statusError="Submit failed"
        onSignAndExecute={vi.fn()}
        walletConnected
      />,
    );

    const errorTexts = screen.getAllByText('Submit failed');
    expect(errorTexts).toHaveLength(1);
  });

  it('does not render the inline statusError banner when signingState is error', () => {
    render(
      <SigningStatusScreen
        lifecycleState={{ kind: 'awaiting-signature' }}
        signingState="error"
        signingError="Submit failed"
        statusError="Submit failed"
        onSignAndExecute={vi.fn()}
        walletConnected
      />,
    );

    expect(screen.getByText('Signing error')).toBeDefined();
    expect(screen.getByText('Try Again')).toBeDefined();
  });

  it('suppresses statusError banner once lifecycleState advances past awaiting-signature', () => {
    render(
      <SigningStatusScreen
        lifecycleState={{ kind: 'submitted' }}
        signingState="idle"
        statusError="Submit failed"
        onSignAndExecute={vi.fn()}
        walletConnected
      />,
    );

    expect(screen.queryByText('Submit failed')).toBeNull();
  });
});
