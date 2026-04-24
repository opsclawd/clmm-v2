import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WalletConnectScreen } from './WalletConnectScreen.js';
import type { PlatformCapabilities } from '../components/DegradedCapabilityBannerUtils.js';

vi.mock('@expo/vector-icons/Feather', () => ({
  default: function MockFeather({ name, size, color }: { name: string; size: number; color: string }) {
    return <span data-testid="feather-icon" data-name={name} data-size={size} data-color={color} />;
  },
  glyphMap: {},
}));

function makeCaps(overrides: Partial<PlatformCapabilities> = {}) {
  return {
    nativePushAvailable: false,
    browserNotificationAvailable: false,
    nativeWalletAvailable: false,
    browserWalletAvailable: false,
    isMobileWeb: false,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('WalletConnectScreen', () => {
  it('renders loading spinner when platformCapabilities is null', () => {
    render(<WalletConnectScreen />);
    expect(screen.getByRole('progressbar')).toBeTruthy();
  });

  it('renders title and subtitle', () => {
    render(<WalletConnectScreen platformCapabilities={makeCaps()} />);
    expect(screen.getByText('Protect your Orca positions')).toBeTruthy();
    expect(
      screen.getByText(
        'We monitor your concentrated liquidity range and prepare a safe one-click exit the moment price breaches it.',
      ),
    ).toBeTruthy();
  });

  it('renders feature bullets', () => {
    render(<WalletConnectScreen platformCapabilities={makeCaps()} />);
    expect(screen.getByText('Read-only by default')).toBeTruthy();
    expect(screen.getByText('Debounced breach logic')).toBeTruthy();
    expect(screen.getByText('Action history')).toBeTruthy();
  });

  it('renders back button when onGoBack is provided', () => {
    const onGoBack = vi.fn();
    render(
      <WalletConnectScreen
        platformCapabilities={makeCaps()}
        onGoBack={onGoBack}
      />,
    );
    expect(screen.getByLabelText('Back')).toBeTruthy();
  });

  it('does not render back button when onGoBack is omitted', () => {
    render(<WalletConnectScreen platformCapabilities={makeCaps()} />);
    expect(screen.queryByLabelText('Back')).toBeNull();
  });

  it('calls onGoBack when back button is pressed', () => {
    const onGoBack = vi.fn();
    render(
      <WalletConnectScreen
        platformCapabilities={makeCaps()}
        onGoBack={onGoBack}
      />,
    );
    fireEvent.click(screen.getByLabelText('Back'));
    expect(onGoBack).toHaveBeenCalled();
  });

  it('renders connecting state', () => {
    render(
      <WalletConnectScreen
        platformCapabilities={makeCaps()}
        isConnecting
      />,
    );
    expect(screen.getByText('Connecting...')).toBeTruthy();
  });

  it('renders wallet options when capabilities allow', () => {
    render(
      <WalletConnectScreen
        platformCapabilities={makeCaps({ browserWalletAvailable: true })}
      />,
    );
    expect(screen.getByText('Connect Browser Wallet')).toBeTruthy();
  });

  it('calls onSelectWallet when a wallet option is pressed', () => {
    const onSelectWallet = vi.fn();
    render(
      <WalletConnectScreen
        platformCapabilities={makeCaps({
          browserWalletAvailable: true,
          nativeWalletAvailable: true,
        })}
        onSelectWallet={onSelectWallet}
      />,
    );
    fireEvent.click(screen.getByText('Connect Browser Wallet'));
    expect(onSelectWallet).toHaveBeenCalledWith('browser');
  });

  it('renders outcome banner on error', () => {
    render(
      <WalletConnectScreen
        platformCapabilities={makeCaps()}
        connectionOutcome={{ kind: 'failed', reason: 'timeout' }}
      />,
    );
    expect(screen.getByText('Connection Failed')).toBeTruthy();
    expect(screen.getByText(/timeout/)).toBeTruthy();
  });

  it('renders outcome banner on success', () => {
    render(
      <WalletConnectScreen
        platformCapabilities={makeCaps()}
        connectionOutcome={{ kind: 'connected' }}
      />,
    );
    expect(screen.getByText('Wallet Connected')).toBeTruthy();
  });

  it('renders outcome banner for cancelled connection', () => {
    render(
      <WalletConnectScreen
        platformCapabilities={makeCaps()}
        connectionOutcome={{ kind: 'cancelled' }}
      />,
    );
    expect(screen.getByText('Connection Cancelled')).toBeTruthy();
  });

  it('renders outcome banner for interrupted connection', () => {
    render(
      <WalletConnectScreen
        platformCapabilities={makeCaps()}
        connectionOutcome={{ kind: 'interrupted' }}
      />,
    );
    expect(screen.getByText('Connection Interrupted')).toBeTruthy();
  });

  it('renders platform notice when no wallet is available', () => {
    render(
      <WalletConnectScreen
        platformCapabilities={makeCaps()}
      />,
    );
    expect(screen.getByText(/No supported wallet/)).toBeTruthy();
  });
});
