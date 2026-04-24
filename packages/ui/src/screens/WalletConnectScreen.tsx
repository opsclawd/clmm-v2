import { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Animated,
  StyleSheet,
} from 'react-native';
import { colors, typography } from '../design-system/index.js';
import { buildWalletConnectViewModel } from '../view-models/WalletConnectionViewModel.js';
import { Icon } from '../components/Icon.js';
import type { PlatformCapabilities } from '../components/DegradedCapabilityBannerUtils.js';
import type { ConnectionOutcome, WalletOptionKind } from '../components/WalletConnectionUtils.js';

type Props = {
  platformCapabilities?: PlatformCapabilities | null;
  connectionOutcome?: ConnectionOutcome | null;
  isConnecting?: boolean;
  onSelectWallet?: (kind: WalletOptionKind) => void;
  onGoBack?: () => void;
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
    description: "Ignores 30–60s wicks so you don't exit on noise.",
  },
  {
    title: 'Auditable receipts',
    description: 'Every action saved with tx hash and fills.',
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

export function WalletConnectScreen({
  platformCapabilities,
  connectionOutcome,
  isConnecting,
  onSelectWallet,
  onGoBack,
}: Props): JSX.Element {
  if (!platformCapabilities) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.safe} />
      </View>
    );
  }

  const vm = buildWalletConnectViewModel({
    capabilities: platformCapabilities,
    connectionOutcome: connectionOutcome ?? null,
    isConnecting: isConnecting ?? false,
  });

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
      >
        {onGoBack ? (
          <TouchableOpacity onPress={onGoBack} style={styles.backButton}>
            <Icon name="chevronLeft" size={20} color={colors.textBody} />
          </TouchableOpacity>
        ) : null}

        <HeroAnimation />

        <Text style={styles.title}>Protect your Orca positions</Text>
        <Text style={styles.subtitle}>
          We monitor your concentrated liquidity range and prepare a safe one-click exit the moment price breaches it.
        </Text>

        {vm.outcomeDisplay ? (
          <View
            style={[
              styles.outcomeBanner,
              {
                borderColor:
                  vm.outcomeDisplay.severity === 'error'
                    ? colors.breachAccent
                    : vm.outcomeDisplay.severity === 'warning'
                      ? colors.warn
                      : vm.outcomeDisplay.severity === 'success'
                        ? colors.safe
                        : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.outcomeTitle,
                {
                  color:
                    vm.outcomeDisplay.severity === 'error'
                      ? colors.breachAccent
                      : vm.outcomeDisplay.severity === 'warning'
                        ? colors.warn
                        : vm.outcomeDisplay.severity === 'success'
                          ? colors.safe
                          : colors.textPrimary,
                },
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
              {
                borderColor:
                  vm.platformNotice.severity === 'warning'
                    ? colors.warn
                    : colors.breachAccent,
              },
            ]}
          >
            <Text
              style={[
                styles.outcomeTitle,
                {
                  color:
                    vm.platformNotice.severity === 'warning'
                      ? colors.warn
                      : colors.breachAccent,
                },
              ]}
            >
              {vm.platformNotice.message}
            </Text>
          </View>
        ) : null}

        {vm.isConnecting ? (
          <View style={styles.connectingContainer}>
            <ActivityIndicator size="large" color={colors.safe} />
            <Text style={styles.connectingText}>Connecting...</Text>
          </View>
        ) : (
          <View style={styles.walletOptions}>
            {vm.walletOptions.map((option) => (
              <TouchableOpacity
                key={option.kind}
                onPress={() => onSelectWallet?.(option.kind)}
                style={styles.walletOptionButton}
              >
                <Icon name="wallet" size={20} color={colors.textPrimary} />
                <View style={styles.walletOptionText}>
                  <Text style={styles.walletOptionLabel}>{option.label}</Text>
                  <Text style={styles.walletOptionDescription}>
                    {option.description}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.featuresContainer}>
          {features.map((f) => (
            <FeatureRow key={f.title} title={f.title} description={f.description} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
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
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: -0.02 * 22,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textBody,
    fontSize: typography.fontSize.base,
    lineHeight: typography.fontSize.base * typography.lineHeight.normal,
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
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  outcomeDetail: {
    color: colors.textBody,
    fontSize: typography.fontSize.sm,
    marginTop: 4,
  },
  connectingContainer: {
    marginTop: 32,
    alignItems: 'center',
  },
  connectingText: {
    color: colors.textBody,
    marginTop: 12,
    fontSize: typography.fontSize.base,
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
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  walletOptionDescription: {
    color: colors.textBody,
    fontSize: typography.fontSize.sm,
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
});
