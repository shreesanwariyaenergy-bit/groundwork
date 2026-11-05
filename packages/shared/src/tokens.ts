/**
 * Design tokens shared by web (Tailwind CSS variables) and Android (StyleSheet).
 * Palette: black / white / neutral greys + one restrained accent (deep green).
 * Typeface: Inter (web via next/font, Android via @expo-google-fonts/inter).
 */
export const colors = {
  light: {
    bg: '#FFFFFF',
    surface: '#F7F7F5',
    surfaceRaised: '#FFFFFF',
    border: '#E5E5E2',
    borderStrong: '#CFCFCB',
    text: '#111111',
    textMuted: '#5C5C58',
    textSubtle: '#8A8A85',
    accent: '#0F6E4F',
    accentHover: '#0B5A40',
    accentSoft: '#E7F2EE',
    onAccent: '#FFFFFF',
    danger: '#B42318',
    dangerSoft: '#FDECEA',
    warning: '#8A5A00',
    warningSoft: '#FFF5E0',
    success: '#0F6E4F',
  },
  dark: {
    bg: '#0B0B0B',
    surface: '#141414',
    surfaceRaised: '#1A1A1A',
    border: '#2A2A2A',
    borderStrong: '#3A3A3A',
    text: '#F2F2F0',
    textMuted: '#A6A6A1',
    textSubtle: '#7A7A75',
    accent: '#3FB68B',
    accentHover: '#5CC79F',
    accentSoft: '#13261F',
    onAccent: '#06140F',
    danger: '#F97066',
    dangerSoft: '#2A1412',
    warning: '#F5B544',
    warningSoft: '#2A2110',
    success: '#3FB68B',
  },
} as const;

export type ColorScheme = keyof typeof colors;
export type ColorToken = keyof typeof colors.light;

export const space = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 } as const;

export const radius = { sm: 6, md: 8, lg: 12, full: 999 } as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 22,
  '2xl': 28,
  '3xl': 36,
  '4xl': 48,
} as const;

export const fontWeight = { regular: '400', medium: '500', semibold: '600', bold: '700' } as const;

export const lineHeight = { tight: 1.2, snug: 1.35, normal: 1.5 } as const;

/** Minimum interactive target (Android Material guidance is 48dp). */
export const touchTarget = 48;
