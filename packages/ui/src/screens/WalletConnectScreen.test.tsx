import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WalletConnectScreen } from './WalletConnectScreen.js';
import type { WalletConnectViewModel } from '../view-models/WalletConnectionViewModel.js';
import type { WalletConnectActions } from '../components/WalletConnectionUtils.js';

vi.mock('@expo/vector-icons/Feather', () => ({
  default: function MockFeather({ name, size, color }: { name: string; size: number; color: string }) {
    return <span data-testid="feather-icon" data-name={name} data-size={size} data-color={color} />;
  },
  glyphMap: {},
}));

function makeVm(overrides: Partial<WalletConnectViewModel> = {}): WalletConnectViewModel {
  return {
    screenState: 'standard',
    nativeWalletAvailable: false,
    browserWalletAvailable: true,
    discovery: 'ready',
    discoveredWallets: [],
    fallback: 'none',
    socialEscapeAttempted: false,
    isConnecting: false,
    outcomeDisplay: null,
    platformNotice: null,
    ...overrides,
  };
}

function makeActions(overrides: Partial<WalletConnectActions> = {}): WalletConnectActions {
  return {
    onSelectNative: vi.fn(),
    onSelectDiscoveredWallet: vi.fn(),
    onConnectDefaultBrowser: vi.fn(),
    onOpenPhantom: vi.fn(),
    onOpenSolflare: vi.fn(),
    onOpenInBrowser: vi.fn(),
    onGoBack: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('WalletConnectScreen', () => {
  it('renders loading state', () => {
    render(<WalletConnectScreen vm={makeVm({ screenState: 'loading' })} actions={makeActions()} />);
    expect(screen.getByRole('progressbar')).toBeTruthy();
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('renders title and subtitle in standard state', () => {
    render(<WalletConnectScreen vm={makeVm()} actions={makeActions()} />);
    expect(screen.getByText('Protect your Orca positions')).toBeTruthy();
    expect(
      screen.getByText(
        'We monitor your concentrated liquidity range and prepare a safe one-click exit the moment price breaches it.',
      ),
    ).toBeTruthy();
  });

  it('renders feature bullets', () => {
    render(<WalletConnectScreen vm={makeVm()} actions={makeActions()} />);
    expect(screen.getByText('Read-only by default')).toBeTruthy();
    expect(screen.getByText('Debounced breach logic')).toBeTruthy();
    expect(screen.getByText('Action history')).toBeTruthy();
  });

  it('renders back button in standard state', () => {
    const actions = makeActions();
    render(<WalletConnectScreen vm={makeVm()} actions={actions} />);
    expect(screen.getByLabelText('Back')).toBeTruthy();
  });

  it('calls onGoBack when back button is pressed', () => {
    const onGoBack = vi.fn();
    render(<WalletConnectScreen vm={makeVm()} actions={makeActions({ onGoBack })} />);
    fireEvent.click(screen.getByLabelText('Back'));
    expect(onGoBack).toHaveBeenCalled();
  });

  it('renders connecting state', () => {
    render(<WalletConnectScreen vm={makeVm({ isConnecting: true })} actions={makeActions()} />);
    expect(screen.getByText('Connecting...')).toBeTruthy();
  });

  it('renders native wallet button when available', () => {
    render(
      <WalletConnectScreen
        vm={makeVm({ nativeWalletAvailable: true })}
        actions={makeActions()}
      />,
    );
    expect(screen.getByText('Connect Mobile Wallet')).toBeTruthy();
  });

  it('calls onSelectNative when native wallet button is pressed', () => {
    const onSelectNative = vi.fn();
    render(
      <WalletConnectScreen
        vm={makeVm({ nativeWalletAvailable: true })}
        actions={makeActions({ onSelectNative })}
      />,
    );
    fireEvent.click(screen.getByText('Connect Mobile Wallet'));
    expect(onSelectNative).toHaveBeenCalled();
  });

  it('renders discovery indicator when discovering', () => {
    render(
      <WalletConnectScreen
        vm={makeVm({ discovery: 'discovering' })}
        actions={makeActions()}
      />,
    );
    expect(screen.getByText('Detecting browser wallets...')).toBeTruthy();
  });

  it('renders discovered wallets', () => {
    render(
      <WalletConnectScreen
        vm={makeVm({
          discovery: 'ready',
          discoveredWallets: [
            { id: 'phantom', name: 'Phantom', icon: null },
          ],
        })}
        actions={makeActions()}
      />,
    );
    expect(screen.getByText('Phantom')).toBeTruthy();
  });

  it('calls onSelectDiscoveredWallet when a discovered wallet is pressed', () => {
    const onSelectDiscoveredWallet = vi.fn();
    render(
      <WalletConnectScreen
        vm={makeVm({
          discovery: 'ready',
          discoveredWallets: [
            { id: 'phantom', name: 'Phantom', icon: null },
          ],
        })}
        actions={makeActions({ onSelectDiscoveredWallet })}
      />,
    );
    fireEvent.click(screen.getByText('Phantom'));
    expect(onSelectDiscoveredWallet).toHaveBeenCalledWith('phantom');
  });

  it('renders fallback browser wallet button on discovery timeout', () => {
    render(
      <WalletConnectScreen
        vm={makeVm({ discovery: 'timed-out' })}
        actions={makeActions()}
      />,
    );
    expect(screen.getByText('Connect Browser Wallet')).toBeTruthy();
  });

  it('renders outcome banner on error', () => {
    render(
      <WalletConnectScreen
        vm={makeVm({
          outcomeDisplay: {
            title: 'Connection Failed',
            detail: 'Could not connect to wallet: timeout. Please try again.',
            severity: 'error',
          },
        })}
        actions={makeActions()}
      />,
    );
    expect(screen.getByText('Connection Failed')).toBeTruthy();
    expect(screen.getByText(/timeout/)).toBeTruthy();
  });

  it('renders outcome banner on success', () => {
    render(
      <WalletConnectScreen
        vm={makeVm({
          outcomeDisplay: {
            title: 'Wallet Connected',
            detail: 'Your wallet is connected.',
            severity: 'success',
          },
        })}
        actions={makeActions()}
      />,
    );
    expect(screen.getByText('Wallet Connected')).toBeTruthy();
  });

  it('renders platform notice when set', () => {
    render(
      <WalletConnectScreen
        vm={makeVm({
          platformNotice: {
            message: 'No supported wallet detected on this device.',
            severity: 'error',
          },
        })}
        actions={makeActions()}
      />,
    );
    expect(screen.getByText(/No supported wallet/)).toBeTruthy();
  });

  it('renders social webview state', () => {
    render(
      <WalletConnectScreen
        vm={makeVm({ screenState: 'social-webview', socialEscapeAttempted: false })}
        actions={makeActions()}
      />,
    );
    expect(screen.getByText('Social app browsers block wallet extensions.')).toBeTruthy();
    expect(screen.getByText('Open in Browser')).toBeTruthy();
    expect(screen.getByText('Open in Phantom')).toBeTruthy();
    expect(screen.getByText('Open in Solflare')).toBeTruthy();
  });

  it('shows outcome banner in social-webview state', () => {
    render(
      <WalletConnectScreen
        vm={makeVm({
          screenState: 'social-webview',
          outcomeDisplay: { title: 'Connection Failed', detail: 'Capability probe failed', severity: 'error' },
        })}
        actions={makeActions()}
      />,
    );
    expect(screen.getByText('Connection Failed')).toBeTruthy();
    expect(screen.getByText('Social app browsers block wallet extensions.')).toBeTruthy();
  });

  it('renders wallet fallback with deep links', () => {
    render(
      <WalletConnectScreen
        vm={makeVm({ fallback: 'wallet-fallback' })}
        actions={makeActions()}
      />,
    );
    expect(screen.getByText('No wallet extension detected in this browser.')).toBeTruthy();
  });

  it('renders desktop no-wallet fallback', () => {
    render(
      <WalletConnectScreen
        vm={makeVm({ fallback: 'desktop-no-wallet' })}
        actions={makeActions()}
      />,
    );
    expect(screen.getByText('No wallet extension detected.')).toBeTruthy();
  });

  it('renders Go Back button at bottom', () => {
    const onGoBack = vi.fn();
    render(<WalletConnectScreen vm={makeVm()} actions={makeActions({ onGoBack })} />);
    const goBackButtons = screen.getAllByText('Go Back');
    const lastButton = goBackButtons[goBackButtons.length - 1]!;
    fireEvent.click(lastButton);
    expect(onGoBack).toHaveBeenCalled();
  });

  it('hides browser wallet discovery when browserWalletAvailable is false', () => {
    render(
      <WalletConnectScreen
        vm={makeVm({ browserWalletAvailable: false, discovery: 'discovering' })}
        actions={makeActions()}
      />,
    );
    expect(screen.queryByText('Detecting browser wallets...')).toBeNull();
  });

  it('hides timed-out browser wallet CTA when browserWalletAvailable is false', () => {
    render(
      <WalletConnectScreen
        vm={makeVm({ browserWalletAvailable: false, discovery: 'timed-out' })}
        actions={makeActions()}
      />,
    );
    expect(screen.queryByText('Connect Browser Wallet')).toBeNull();
  });
});
