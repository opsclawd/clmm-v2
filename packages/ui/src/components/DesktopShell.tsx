import { View, Text, Platform } from 'react-native';
import { colors } from '../design-system/index.js';
import { typography } from '../design-system/index.js';
import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  title?: string;
};

/**
 * DesktopShell — responsive wrapper for PWA desktop layout.
 * On web with wide viewports, constrains content to a narrow center column
 * matching the mobile-first IA. NOT a dashboard shell — just a responsive container.
 * On native, renders children directly without wrapping.
 */
export function DesktopShell({ children, title }: Props): JSX.Element {
  if (Platform.OS !== 'web') {
    return <>{children}</>;
  }

  return (
    <View style={{
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
    }}>
      <View style={{
        width: '100%',
        maxWidth: 480,
        flex: 1,
      }}>
        {title ? (
          <View style={{
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}>
            <Text style={{
              color: colors.text,
              fontSize: typography.fontSize.lg,
              fontWeight: typography.fontWeight.bold,
            }}>
              {title}
            </Text>
          </View>
        ) : null}
        {children}
      </View>
    </View>
  );
}
