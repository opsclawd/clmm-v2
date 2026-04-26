import { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Animated,
  Image,
  StyleSheet,
} from 'react-native';
import { colors, typography } from '../design-system/index.js';
import type { WalletConnectViewModel } from '../view-models/WalletConnectionViewModel.js';
import type { WalletConnectActions } from '../components/WalletConnectionUtils.js';
import { Icon } from '../components/Icon.js';

type Props = {
  vm: WalletConnectViewModel;
  actions: WalletConnectActions;
};

function HeroAnimation() {
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  const scale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 3.3],
  });

  const opacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0],
  });

  return (
    <View style={styles.heroContainer}>
      <View style={[styles.ring, styles.ringOuter]} />
      <View style={[styles.ring, styles.ringMiddle]} />
      <View style={[styles.ring, styles.ringInner]} />
      <View style={styles.centerDot} />
      <Animated.View
        style={[
          styles.pulseRing,
          {
            transform: [{ scale }],
            opacity,
          },
        ]}
      />
    </View>
  );
}

const features = [
  {
    title: 'Read-only by default',
    description: 'We only request signatures when you approve an exit.',
  },
  {
    title: 'Debounced breach logic',
    description: 'Requires sustained breach before acting, not single wicks.',
  },
  {
    title: 'Action history',
    description: 'Every exit is logged with transaction details.',
  },
];

function FeatureRow({ title, description }: { title: string; description: string }) {
  return (
    <View style={styles.featureRow}>
      <View style={styles.featureIcon}>
        <Icon name="check" size={16} color={colors.safe} />
      </View>
      <View style={styles.featureText}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDescription}>{description}</Text>
      </View>
    </View>
  );
}

function severityBorderColor(severity: string) {
  switch (severity) {
    case 'error': return colors.breachAccent;
    case 'warning': return colors.warn;
    case 'success': return colors.safe;
    default: return colors.border;
  }
}

function severityTextColor(severity: string) {
  switch (severity) {
    case 'error': return colors.breachAccent;
    case 'warning': return colors.warn;
    case 'success': return colors.safe;
    default: return colors.textPrimary;
  }
}

function renderSocialWebview(vm: WalletConnectViewModel, actions: WalletConnectActions) {
  return (
    <View style={styles.container}>
      <View style={styles.contentContainer}>
        {vm.outcomeDisplay ? (
          <View
            style={[
              styles.outcomeBanner,
              { borderColor: severityBorderColor(vm.outcomeDisplay.severity) },
            ]}
          >
            <Text
              style={[
                styles.outcomeTitle,
                { color: severityTextColor(vm.outcomeDisplay.severity) },
              ]}
            >
              {vm.outcomeDisplay.title}
            </Text>
            {vm.outcomeDisplay.detail ? (
              <Text style={styles.outcomeDetail}>{vm.outcomeDisplay.detail}</Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.socialWarningBanner}>
          <Text style={styles.socialWarningTitle}>
            Social app browsers block wallet extensions.
          </Text>
          <Text style={styles.socialWarningText}>
            Open this page in Safari or Chrome to connect your wallet.
          </Text>
        </View>

        <TouchableOpacity
          onPress={actions.onOpenInBrowser}
          disabled={vm.socialEscapeAttempted}
          style={[
            styles.walletOptionButton,
            { maxWidth: 320, width: '100%' },
            vm.socialEscapeAttempted && { opacity: 0.4 },
          ]}
        >
          <Text style={styles.walletOptionLabel}>Open in Browser</Text>
        </TouchableOpacity>

        <Text style={styles.deepLinkLabel}>Or open in a wallet browser:</Text>

        <TouchableOpacity
          onPress={actions.onOpenPhantom}
          style={styles.deepLinkButton}
        >
          <Text style={{ color: '#ab9ff2', fontSize: 14, fontWeight: '600' }}>
            Open in Phantom
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={actions.onOpenSolflare}
          style={styles.deepLinkButton}
        >
          <Text style={{ color: '#fc8748', fontSize: 14, fontWeight: '600' }}>
            Open in Solflare
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function renderStandard(vm: WalletConnectViewModel, actions: WalletConnectActions) {
  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
      >
        <TouchableOpacity onPress={actions.onGoBack} style={styles.backButton} accessibilityLabel="Back">
          <Icon name="chevronLeft" size={20} color={colors.textBody} />
        </TouchableOpacity>

        <HeroAnimation />

        <Text style={styles.title}>Protect your Orca positions</Text>
        <Text style={styles.subtitle}>
          We monitor your concentrated liquidity range and prepare a safe one-click exit the moment price breaches it.
        </Text>

        {vm.outcomeDisplay ? (
          <View
            style={[
              styles.outcomeBanner,
              { borderColor: severityBorderColor(vm.outcomeDisplay.severity) },
            ]}
          >
            <Text
              style={[
                styles.outcomeTitle,
                { color: severityTextColor(vm.outcomeDisplay.severity) },
              ]}
            >
              {vm.outcomeDisplay.title}
            </Text>
            {vm.outcomeDisplay.detail ? (
              <Text style={styles.outcomeDetail}>{vm.outcomeDisplay.detail}</Text>
            ) : null}
          </View>
        ) : null}

        {vm.platformNotice ? (
          <View
            style={[
              styles.outcomeBanner,
              { borderColor: vm.platformNotice.severity === 'warning' ? colors.warn : colors.breachAccent },
            ]}
          >
            <Text
              style={[
                styles.outcomeTitle,
                { color: vm.platformNotice.severity === 'warning' ? colors.warn : colors.breachAccent },
              ]}
            >
              {vm.platformNotice.message}
            </Text>
          </View>
        ) : null}

        {vm.nativeWalletAvailable && !vm.isConnecting ? (
          <TouchableOpacity
            onPress={actions.onSelectNative}
            style={styles.walletOptionButton}
          >
            <Icon name="wallet" size={20} color={colors.textPrimary} />
            <View style={styles.walletOptionText}>
              <Text style={styles.walletOptionLabel}>Connect Mobile Wallet</Text>
              <Text style={styles.walletOptionDescription}>
                Sign transactions with your mobile wallet app.
              </Text>
            </View>
          </TouchableOpacity>
        ) : null}

        {!vm.isConnecting && vm.browserWalletAvailable && vm.discovery === 'discovering' ? (
          <View style={styles.discoveryContainer}>
            <ActivityIndicator size="small" color={colors.safe} />
            <Text style={styles.discoveryText}>Detecting browser wallets...</Text>
          </View>
        ) : null}

        {!vm.isConnecting && vm.browserWalletAvailable && vm.discovery === 'ready' && vm.discoveredWallets.length > 0
          ? vm.discoveredWallets.map((wallet) => (
              <TouchableOpacity
                key={wallet.id}
                onPress={() => actions.onSelectDiscoveredWallet(wallet.id)}
                style={styles.discoveredWalletButton}
              >
                {wallet.icon ? (
                  <Image source={{ uri: wallet.icon }} style={styles.walletIcon} />
                ) : (
                  <Icon name="wallet" size={20} color={colors.textPrimary} />
                )}
                <Text style={styles.walletOptionLabel}>{wallet.name}</Text>
              </TouchableOpacity>
            ))
          : null}

        {!vm.isConnecting && vm.browserWalletAvailable && vm.discovery === 'timed-out' ? (
          <TouchableOpacity
            onPress={actions.onConnectDefaultBrowser}
            style={styles.walletOptionButton}
          >
            <Icon name="wallet" size={20} color={colors.textPrimary} />
            <View style={styles.walletOptionText}>
              <Text style={styles.walletOptionLabel}>Connect Browser Wallet</Text>
              <Text style={styles.walletOptionDescription}>
                Sign transactions with your browser wallet extension.
              </Text>
            </View>
          </TouchableOpacity>
        ) : null}

        {!vm.isConnecting && vm.fallback === 'wallet-fallback' ? (
          <View style={styles.fallbackContainer}>
            <View style={[styles.outcomeBanner, { borderColor: colors.warn }]}>
              <Text style={[styles.outcomeTitle, { color: colors.warn }]}>
                No wallet extension detected in this browser.
              </Text>
            </View>
            <TouchableOpacity onPress={actions.onOpenPhantom} style={styles.deepLinkButton}>
              <Text style={{ color: '#ab9ff2', fontSize: 14, fontWeight: '600' }}>
                Open in Phantom
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={actions.onOpenSolflare} style={styles.deepLinkButton}>
              <Text style={{ color: '#fc8748', fontSize: 14, fontWeight: '600' }}>
                Open in Solflare
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!vm.isConnecting && vm.fallback === 'desktop-no-wallet' ? (
          <View style={styles.fallbackContainer}>
            <View style={[styles.outcomeBanner, { borderColor: colors.warn }]}>
              <Text style={[styles.outcomeTitle, { color: colors.warn }]}>
                No wallet extension detected.
              </Text>
              <Text style={styles.outcomeDetail}>
                Install a Solana wallet extension like Phantom or Solflare, then refresh this page.
              </Text>
            </View>
          </View>
        ) : null}

        {vm.isConnecting ? (
          <View style={styles.connectingContainer}>
            <ActivityIndicator size="large" color={colors.safe} />
            <Text style={styles.connectingText}>Connecting...</Text>
          </View>
        ) : null}

        <View style={styles.featuresContainer}>
          {features.map((f) => (
            <FeatureRow key={f.title} title={f.title} description={f.description} />
          ))}
        </View>

        <TouchableOpacity onPress={actions.onGoBack} style={{ marginTop: 16, padding: 12 }}>
          <Text style={styles.goBackText}>Go Back</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

export function WalletConnectScreen({ vm, actions }: Props): JSX.Element {
  switch (vm.screenState) {
    case 'loading':
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.safe} />
          <Text style={{ color: colors.textBody }}>Loading...</Text>
        </View>
      );
    case 'social-webview':
      return renderSocialWebview(vm, actions);
    case 'standard':
      return renderStandard(vm, actions);
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.appBackground,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.appBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingVertical: 40,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    padding: 8,
    zIndex: 10,
  },
  heroContainer: {
    width: 120,
    height: 120,
    marginTop: 20,
    marginBottom: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ring: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1,
  },
  ringOuter: {
    width: 116,
    height: 116,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  ringMiddle: {
    width: 88,
    height: 88,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  ringInner: {
    width: 60,
    height: 60,
    borderColor: colors.safe,
    borderStyle: 'dashed',
    borderWidth: 1,
  },
  centerDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: colors.textPrimary,
  },
  pulseRing: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: colors.textPrimary,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.display,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: -0.02 * 22,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textBody,
    fontSize: typography.fontSize.body,
    lineHeight: typography.fontSize.body * typography.lineHeight.normal,
    textAlign: 'center',
    maxWidth: 300,
    marginBottom: 28,
  },
  outcomeBanner: {
    width: '100%',
    maxWidth: 320,
    padding: 12,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  outcomeTitle: {
    fontSize: typography.fontSize.body,
    fontWeight: typography.fontWeight.semibold,
  },
  outcomeDetail: {
    color: colors.textBody,
    fontSize: typography.fontSize.caption,
    marginTop: 4,
  },
  connectingContainer: {
    marginTop: 32,
    alignItems: 'center',
  },
  connectingText: {
    color: colors.textBody,
    marginTop: 12,
    fontSize: typography.fontSize.body,
  },
  walletOptions: {
    width: '100%',
    maxWidth: 320,
    marginTop: 24,
  },
  walletOptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  walletOptionText: {
    flex: 1,
  },
  walletOptionLabel: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.body,
    fontWeight: typography.fontWeight.semibold,
  },
  walletOptionDescription: {
    color: colors.textBody,
    fontSize: typography.fontSize.caption,
    marginTop: 4,
  },
  featuresContainer: {
    width: '100%',
    maxWidth: 320,
    marginTop: 28,
    gap: 10,
  },
  featureRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 2,
  },
  featureIcon: {
    marginTop: 2,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 13,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
  },
  featureDescription: {
    fontSize: 12,
    color: colors.textFaint,
  },
  socialWarningBanner: {
    width: '100%',
    maxWidth: 320,
    padding: 12,
    backgroundColor: '#422006',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.warn,
    marginBottom: 16,
  },
  socialWarningTitle: {
    color: colors.warn,
    fontSize: 14,
    fontWeight: '600',
  },
  socialWarningText: {
    color: colors.textBody,
    fontSize: 13,
    marginTop: 4,
  },
  deepLinkButton: {
    padding: 12,
    backgroundColor: colors.card,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  deepLinkLabel: {
    color: colors.textFaint,
    fontSize: 13,
    marginBottom: 8,
  },
  discoveryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    maxWidth: 320,
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  discoveryText: {
    color: colors.textBody,
    fontSize: 14,
  },
  discoveredWalletButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    maxWidth: 320,
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  walletIcon: {
    width: 24,
    height: 24,
  },
  fallbackContainer: {
    width: '100%',
    maxWidth: 320,
    marginTop: 16,
  },
  goBackText: {
    color: colors.textFaint,
    fontSize: 14,
  },
});
