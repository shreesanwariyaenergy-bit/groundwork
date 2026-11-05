import { useColorScheme } from 'react-native';
import { colors, fontSize, radius, space } from '@groundwork/shared/tokens';

export type Palette = { [K in keyof typeof colors.light]: string };

export function useTheme() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return { c: colors[scheme] as Palette, scheme, space, radius, fontSize };
}

export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;
