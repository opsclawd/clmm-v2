export const typography = {
  fontFamily: {
    ui: 'Inter, system-ui, sans-serif',
    mono: 'JetBrains Mono, monospace',
  },
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    md: 15,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    display: 22,
    body: 14,
    caption: 12,
    micro: 10,
  },
  fontWeight: {
    normal: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const;
